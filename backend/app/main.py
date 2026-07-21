from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from .config import settings
from .essence import create_daily_essence
from .google_oauth import PROVIDERS, authorization_url, calendar_event_count, decode_state, exchange_code, gmail_message_count, refresh_access_token, userinfo
from .paper_intelligence import answer_paper_question, enrich_paper
from .prompting import build_prompt_plan
from .schemas import CaptureAudioRequest, CaptureTextRequest, ConfigStatusOut, DailyEssenceOut, DecompositionOut, EntryOut, EntryUpdateRequest, HabitAnalyticsOut, HabitLogOut, IntegrationConnectOut, IntegrationSyncOut, IntegrationsOut, MeOut, OAuthConnectionOut, PaperEnrichmentOut, PaperQuestionOut, PaperQuestionRequest, PromptPlanOut, ProposalOut, RecapOut, RecapRequest, WeeklyReviewOut
from .services import create_recap, create_weekly_review, make_audio_proposal, make_proposal
from .store import store


def current_user(x_pinapeg_user_id: str | None = Header(default=None)) -> str:
    config = settings()
    if x_pinapeg_user_id and config.allow_dev_identity:
        return x_pinapeg_user_id
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="A Pinapeg identity is required")


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="Pinapeg API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings().cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.exception_handler(KeyError)
async def not_found(_: Request, __: KeyError): return JSONResponse(status_code=404, content={"code": "not_found", "message": "That item no longer exists.", "request_id": "local"})

@app.get('/health')
def health(): return {"status": "ok", "service": "pinapeg-api"}

@app.get('/v1/config/status', response_model=ConfigStatusOut)
def config_status():
    config = settings()
    return ConfigStatusOut(
        storage_mode=config.storage_mode,
        database_configured=bool(config.database_url),
        postgres_active=config.storage_mode == "postgres" and bool(config.database_url),
        openai_configured=bool(config.openai_api_key),
        google_oauth_configured=bool(config.google_client_id and config.google_client_secret and config.google_oauth_state_secret),
        token_encryption_configured=bool(config.token_encryption_key),
        vapid_configured=bool(config.vapid_public_key and config.vapid_private_key),
        frontend_app_url=config.frontend_app_url,
    )

@app.get('/v1/me', response_model=MeOut)
def me(user_id: str = Depends(current_user)):
    connections = store.oauth_connections_for_user(user_id)
    return MeOut(display_name="You", timezone="Africa/Lagos", calendar_connected=bool(connections.get("google_calendar") and connections["google_calendar"].connected))

def _empty_connection(provider: Literal["google_calendar", "google_gmail"]) -> OAuthConnectionOut:
    return OAuthConnectionOut(provider=provider, connected=False)

@app.get('/v1/integrations', response_model=IntegrationsOut)
def integrations(user_id: str = Depends(current_user)):
    connections = store.oauth_connections_for_user(user_id)
    return IntegrationsOut(
        google_calendar=connections.get("google_calendar") or _empty_connection("google_calendar"),
        google_gmail=connections.get("google_gmail") or _empty_connection("google_gmail"),
    )

@app.get('/v1/integrations/google/{provider}/connect', response_model=IntegrationConnectOut)
def google_connect(provider: Literal["calendar", "gmail"], user_id: str = Depends(current_user)):
    try:
        return IntegrationConnectOut(authorization_url=authorization_url(user_id, provider))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@app.get('/v1/integrations/google/callback')
def google_callback(code: str, state: str):
    try:
        user_id, provider = decode_state(state)
        token_payload = exchange_code(code)
        access_token = token_payload["access_token"]
        refresh_token = token_payload.get("refresh_token")
        if not refresh_token:
            raise RuntimeError("Google did not return a refresh token. Reconnect with consent.")
        profile = userinfo(access_token)
        expires_in = int(token_payload.get("expires_in") or 0)
        expires_at = datetime.now(UTC) + timedelta(seconds=expires_in) if expires_in else None
        provider_key = PROVIDERS[provider]["storage_key"]
        scopes = str(token_payload.get("scope") or "").split()
        store.save_oauth_connection(user_id, provider_key, profile.get("email") or "unknown-google-account", refresh_token, scopes, expires_at)
    except (RuntimeError, ValueError, KeyError, httpx.HTTPError) as exc:
        return RedirectResponse(f"{settings().frontend_app_url.rstrip('/')}/settings?google=error&message={str(exc)}")
    return RedirectResponse(f"{settings().frontend_app_url.rstrip('/')}/settings?google=connected&provider={provider}")

@app.get('/v1/integrations/google/{provider}/callback')
def google_legacy_callback(provider: Literal["calendar", "gmail"], code: str, state: str):
    return google_callback(code=code, state=state)

@app.delete('/v1/integrations/google/{provider}', status_code=204)
def google_disconnect(provider: Literal["calendar", "gmail"], user_id: str = Depends(current_user)):
    store.delete_oauth_connection(user_id, PROVIDERS[provider]["storage_key"])

@app.post('/v1/integrations/google/{provider}/sync', response_model=IntegrationSyncOut)
def google_sync(provider: Literal["calendar", "gmail"], user_id: str = Depends(current_user)):
    storage_key = PROVIDERS[provider]["storage_key"]
    credentials = store.oauth_refresh_token(user_id, storage_key)
    if credentials is None:
        raise HTTPException(status_code=400, detail=f"Connect Google {provider} before syncing.")
    refresh_token, _ = credentials
    try:
        access_token = refresh_access_token(refresh_token)
        scanned = calendar_event_count(access_token) if provider == "calendar" else gmail_message_count(access_token)
        connection = store.record_oauth_sync(user_id, storage_key)
    except (RuntimeError, KeyError, httpx.HTTPError) as exc:
        store.record_oauth_sync(user_id, storage_key, str(exc))
        raise HTTPException(status_code=400, detail=f"Google {provider} sync failed: {exc}") from exc
    label = "upcoming calendar events" if provider == "calendar" else "recent Gmail messages"
    return IntegrationSyncOut(
        provider=provider,
        connected=True,
        scanned_count=scanned,
        imported_count=0,
        message=f"Sync check scanned {scanned} {label}. Auto-import review comes next.",
        last_synced_at=connection.last_synced_at if connection else None,
    )

@app.post('/v1/capture/text', response_model=ProposalOut)
def capture_text(payload: CaptureTextRequest, user_id: str = Depends(current_user)): return make_proposal(user_id, payload)

@app.post('/v1/capture/audio', response_model=ProposalOut)
def capture_audio(payload: CaptureAudioRequest, user_id: str = Depends(current_user)):
    return make_audio_proposal(user_id, payload)

@app.post('/v1/capture/{proposal_id}/confirm', response_model=EntryOut)
def confirm(proposal_id: UUID, user_id: str = Depends(current_user)): 
    try: return store.confirm(user_id, proposal_id)
    except ValueError as exc: raise HTTPException(status_code=422, detail=str(exc)) from exc

@app.post('/v1/capture/{proposal_id}/discard', status_code=204)
def discard(proposal_id: UUID, user_id: str = Depends(current_user)): store.discard(user_id, proposal_id)

@app.get('/v1/entries', response_model=list[EntryOut])
def entries(type: str | None = None, status: str | None = None, q: str | None = None, user_id: str = Depends(current_user)): return store.list_entries(user_id, entry_type=type, status=status, query=q)

@app.patch('/v1/entries/{entry_id}', response_model=EntryOut)
def update_entry(entry_id: UUID, payload: EntryUpdateRequest, user_id: str = Depends(current_user)): return store.update_entry(user_id, entry_id, payload.model_dump(exclude_unset=True))

@app.get('/v1/entries/{entry_id}/children', response_model=list[EntryOut])
def entry_children(entry_id: UUID, user_id: str = Depends(current_user)): return store.children(user_id, entry_id)

@app.get('/v1/schedule', response_model=list[EntryOut])
def schedule(user_id: str = Depends(current_user)): return [entry for entry in store.list_entries(user_id) if entry.scheduled_at]

@app.post('/v1/entries/{entry_id}/complete', response_model=EntryOut)
def complete(entry_id: UUID, user_id: str = Depends(current_user)): return store.transition(user_id, entry_id, 'done')

@app.post('/v1/entries/{entry_id}/resolve', response_model=EntryOut)
def resolve(entry_id: UUID, user_id: str = Depends(current_user)): return store.transition(user_id, entry_id, 'resolved')

@app.post('/v1/entries/{entry_id}/reopen', response_model=EntryOut)
def reopen(entry_id: UUID, user_id: str = Depends(current_user)): return store.transition(user_id, entry_id, 'open')

@app.post('/v1/habits/{entry_id}/log', response_model=HabitLogOut)
def log_habit(entry_id: UUID, user_id: str = Depends(current_user)): return store.log_habit(user_id, entry_id)

@app.post('/v1/entries/{entry_id}/decompose', response_model=DecompositionOut)
def decompose(entry_id: UUID, user_id: str = Depends(current_user)): return DecompositionOut(parent_entry_id=entry_id, tasks=store.decompose(user_id, entry_id))

def _paper_entry(user_id: str, entry_id: UUID) -> EntryOut:
    entry = next((item for item in store.list_entries(user_id, entry_type="research_paper") if item.id == entry_id), None)
    if entry is None:
        raise HTTPException(status_code=404, detail="Paper not found.")
    return entry

@app.post('/v1/papers/{entry_id}/enrich', response_model=PaperEnrichmentOut)
def enrich_paper_entry(entry_id: UUID, user_id: str = Depends(current_user)):
    entry = _paper_entry(user_id, entry_id)
    metadata, message, full_text_available = enrich_paper(entry)
    updated = store.update_entry(user_id, entry_id, {"metadata": metadata})
    return PaperEnrichmentOut(
        entry=updated,
        full_text_available=full_text_available,
        used_ai_summary=bool(metadata.get("paper_summary_used_ai")),
        summary=metadata.get("paper_summary"),
        bibtex=metadata.get("bibtex"),
        message=message,
    )

@app.post('/v1/papers/{entry_id}/ask', response_model=PaperQuestionOut)
def ask_paper(entry_id: UUID, payload: PaperQuestionRequest, user_id: str = Depends(current_user)):
    entry = _paper_entry(user_id, entry_id)
    answer, citations, used_ai = answer_paper_question(entry, payload.question)
    return PaperQuestionOut(answer=answer, citations=citations, used_ai=used_ai)

@app.post('/v1/recaps', response_model=RecapOut)
def recap(payload: RecapRequest, user_id: str = Depends(current_user)): return create_recap(user_id, payload.timeframe)

@app.post('/v1/ai-weekly-review', response_model=WeeklyReviewOut)
def weekly_review(payload: RecapRequest, user_id: str = Depends(current_user)): return create_weekly_review(user_id, payload.timeframe)

@app.get('/v1/daily-essence', response_model=DailyEssenceOut)
def daily_essence(user_id: str = Depends(current_user)): return create_daily_essence(user_id)

@app.get('/v1/prompt-plan', response_model=PromptPlanOut)
def prompt_plan(user_id: str = Depends(current_user), timezone: str = "Africa/Lagos"): return build_prompt_plan(user_id, timezone)

@app.get('/v1/analytics/habits', response_model=HabitAnalyticsOut)
def habit_analytics(user_id: str = Depends(current_user)): return HabitAnalyticsOut(habits=store.habit_analytics(user_id))

@app.get('/v1/analytics/cv-timeline', response_model=list[EntryOut])
def cv_timeline(user_id: str = Depends(current_user)): return store.cv_timeline(user_id)
