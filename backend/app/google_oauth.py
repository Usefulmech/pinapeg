import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import urlencode

import httpx

from .config import settings

Provider = Literal["calendar", "gmail"]

PROVIDERS = {
    "calendar": {
        "storage_key": "google_calendar",
        "scopes": ["openid", "email", "https://www.googleapis.com/auth/calendar.events"],
    },
    "gmail": {
        "storage_key": "google_gmail",
        "scopes": ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"],
    },
}


def _state_secret() -> bytes:
    config = settings()
    raw = config.google_oauth_state_secret or config.token_encryption_key or "pinapeg-development-oauth-state"
    return raw.encode("utf-8")


def _sign(payload: str) -> str:
    return hmac.new(_state_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def encode_state(user_id: str, provider: Provider) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"user_id": user_id, "provider": provider, "exp": (datetime.now(UTC) + timedelta(minutes=15)).timestamp()}).encode("utf-8")).decode("utf-8")
    return f"{payload}.{_sign(payload)}"


def decode_state(state: str) -> tuple[str, Provider]:
    payload, signature = state.split(".", 1)
    if not hmac.compare_digest(_sign(payload), signature):
        raise ValueError("Invalid OAuth state")
    data = json.loads(base64.urlsafe_b64decode(payload.encode("utf-8")).decode("utf-8"))
    if datetime.now(UTC).timestamp() > float(data["exp"]):
        raise ValueError("Expired OAuth state")
    provider = data["provider"]
    if provider not in PROVIDERS:
        raise ValueError("Invalid OAuth provider")
    return str(data["user_id"]), provider


def authorization_url(user_id: str, provider: Provider) -> str:
    config = settings()
    if not config.google_client_id:
        raise RuntimeError("GOOGLE_CLIENT_ID is required")
    provider_config = PROVIDERS[provider]
    params = {
        "client_id": config.google_client_id,
        "redirect_uri": config.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(provider_config["scopes"]),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": encode_state(user_id, provider),
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    config = settings()
    if not config.google_client_id or not config.google_client_secret:
        raise RuntimeError("Google OAuth client credentials are required")
    response = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": config.google_client_id,
            "client_secret": config.google_client_secret,
            "redirect_uri": config.google_redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def userinfo(access_token: str) -> dict:
    response = httpx.get("https://openidconnect.googleapis.com/v1/userinfo", headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
    response.raise_for_status()
    return response.json()


def refresh_access_token(refresh_token: str) -> str:
    config = settings()
    if not config.google_client_id or not config.google_client_secret:
        raise RuntimeError("Google OAuth client credentials are required")
    response = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": config.google_client_id,
            "client_secret": config.google_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=15,
    )
    response.raise_for_status()
    return str(response.json()["access_token"])


def calendar_event_count(access_token: str, max_results: int = 10) -> int:
    response = httpx.get(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "timeMin": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": max_results,
        },
        timeout=15,
    )
    response.raise_for_status()
    return len(response.json().get("items", []))


def gmail_message_count(access_token: str, max_results: int = 10) -> int:
    response = httpx.get(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"maxResults": max_results, "q": "newer_than:30d"},
        timeout=15,
    )
    response.raise_for_status()
    return len(response.json().get("messages", []))


def fetch_gmail_messages(access_token: str, max_results: int = 15) -> list[dict]:
    """Fetch recent Gmail message summaries with subjects, snippets, dates, and senders."""
    response = httpx.get(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"maxResults": max_results, "q": "newer_than:30d"},
        timeout=15,
    )
    response.raise_for_status()
    messages_list = response.json().get("messages", [])
    results = []
    headers_to_get = {"Subject", "From", "Date"}
    for msg in messages_list:
        msg_id = msg.get("id")
        if not msg_id:
            continue
        try:
            detail_res = httpx.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"format": "full"},
                timeout=10,
            )
            detail_res.raise_for_status()
            detail = detail_res.json()
            payload = detail.get("payload", {})
            headers = {h.get("name"): h.get("value") for h in payload.get("headers", []) if h.get("name") in headers_to_get}
            results.append({
                "id": msg_id,
                "subject": headers.get("Subject") or "Email update",
                "from": headers.get("From") or "",
                "date": headers.get("Date") or "",
                "snippet": detail.get("snippet") or "",
            })
        except Exception:
            continue
    return results


def fetch_calendar_events(access_token: str, max_results: int = 25) -> list[dict]:
    """Fetch upcoming calendar events (next 30 days) and return structured event data."""
    response = httpx.get(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "timeMin": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "timeMax": (datetime.now(UTC) + timedelta(days=30)).isoformat().replace("+00:00", "Z"),
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": max_results,
        },
        timeout=15,
    )
    response.raise_for_status()
    events = []
    for item in response.json().get("items", []):
        start = item.get("start", {})
        start_dt = start.get("dateTime") or start.get("date") or ""
        events.append({
            "id": item.get("id", ""),
            "summary": item.get("summary") or "Calendar event",
            "description": item.get("description") or "",
            "start": start_dt,
        })
    return events


def push_calendar_events(access_token: str, events_to_push: list[dict]) -> list[tuple[str, str]]:
    """Push new events to Google Calendar. Returns list of (entry_id, calendar_event_id)."""
    created_ids = []
    for event in events_to_push:
        dt_val = event.get("scheduled_at")
        if not dt_val:
            continue
        try:
            if isinstance(dt_val, datetime):
                start_dt_obj = dt_val
            elif isinstance(dt_val, str):
                start_dt_obj = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
            else:
                continue
            if start_dt_obj.tzinfo is None:
                start_dt_obj = start_dt_obj.replace(tzinfo=UTC)
            start_iso = start_dt_obj.isoformat()
            end_iso = (start_dt_obj + timedelta(hours=1)).isoformat()

            response = httpx.post(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "summary": event.get("title") or "Pinapeg Event",
                    "description": event.get("notes") or "",
                    "start": {"dateTime": start_iso},
                    "end": {"dateTime": end_iso}
                },
                timeout=15,
            )
            response.raise_for_status()
            created_ids.append((str(event["id"]), response.json().get("id")))
        except Exception:
            continue
    return created_ids

