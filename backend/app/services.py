import re
import base64
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from .papers import fetch_metadata
from .url_scraper import fetch_url_metadata
from .schemas import CaptureAudioRequest, CaptureTextRequest, EntryOut, ProposalOut, RecapOut, WeeklyReviewOut
from .store import ProposalRecord, store
from .transcription import transcribe_audio


MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def _title(text: str) -> str:
    compact = re.sub(r"\s+", " ", text.strip()).rstrip(".?!")
    return compact[:1].upper() + compact[1:]


def _guided_title(text: str, intent: str) -> str | None:
    prefixes = {
        "TRACK_PAPER": ("research paper:", "track research paper:", "paper to read:", "paper:"),
        "TRACK_SCHOLARSHIP": ("scholarship application:", "scholarship:", "fellowship:", "grant application:"),
        "LOG_HABIT": ("daily habit:", "habit:", "repeat habit:"),
    }.get(intent, ())
    lowered = text.lower().strip()
    for prefix in prefixes:
        if lowered.startswith(prefix):
            clean = text.strip()[len(prefix):].strip()
            return _title(clean) if clean else None
    return None


def _make_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _parse_datetime(text: str, now: datetime, timezone: str = "Africa/Lagos") -> datetime | None:
    """Deliberately conservative fallback parser. Production delegates to validated AI structured output."""
    lowered = text.lower()
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(timezone)
    except Exception:
        tz = UTC

    local_now = now.astimezone(tz) if now.tzinfo else now.replace(tzinfo=UTC).astimezone(tz)

    hour_match = re.search(r"\b(?:at\s+|by\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", lowered)
    parsed_hour, parsed_minute = 23, 59
    has_time = False
    if hour_match:
        h, m, meridiem = int(hour_match.group(1)), int(hour_match.group(2) or 0), hour_match.group(3)
        if meridiem == "pm" and h < 12:
            h += 12
        if meridiem == "am" and h == 12:
            h = 0
        if 0 <= h <= 23 and 0 <= m <= 59:
            parsed_hour, parsed_minute = h, m
            has_time = True

    month_match = re.search(r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})\b", lowered)
    if month_match:
        month = MONTHS[month_match.group(1).rstrip(".")]
        day = int(month_match.group(2))
        try:
            target_local = local_now.replace(month=month, day=day, hour=parsed_hour, minute=parsed_minute, second=0, microsecond=0)
            if target_local < local_now and not has_time:
                target_local = target_local.replace(year=target_local.year + 1)
            return target_local.astimezone(UTC)
        except ValueError:
            return None

    if not has_time:
        return None
    if not any(token in lowered for token in ("today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", " at ", " by ")):
        return None

    target_local = local_now.replace(hour=parsed_hour, minute=parsed_minute, second=0, microsecond=0)
    if "tomorrow" in lowered:
        target_local += timedelta(days=1)
    else:
        days = {name: i for i, name in enumerate(("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"))}
        for name, weekday in days.items():
            if name in lowered:
                delta = (weekday - local_now.weekday()) % 7 or 7
                target_local += timedelta(days=delta)
                break
    return target_local.astimezone(UTC)


def make_proposal(user_id: str, payload: CaptureTextRequest, extra_metadata: dict | None = None, user_profile: dict | None = None) -> ProposalOut:
    text = payload.text.strip()
    memories = store.related(user_id, text)
    lowered = text.lower()
    is_question = "?" in text or lowered.startswith(("what ", "when ", "where ", "do i ", "did i ", "show "))
    resolved = next((entry for entry in memories if entry.status == "open"), None) if any(token in lowered for token in ("sorted", "resolved", "handled", "done with", "finished")) else None
    scheduled_at = _parse_datetime(text, payload.local_datetime, payload.timezone)

    specialist_intent = None
    if re.search(r"https?://|doi\.org|arxiv\.org", lowered) or any(token in lowered for token in ("research paper", "track paper", "paper to read", "this paper", "paper on", "paper about", "new paper", "paper:")):
        specialist_intent = "TRACK_PAPER"
    elif any(token in lowered for token in ("scholarship", "fellowship", "grant application")):
        specialist_intent = "TRACK_SCHOLARSHIP"
    elif any(token in lowered for token in ("habit", "every day", "daily", "each morning", "each evening")):
        specialist_intent = "LOG_HABIT"

    if is_question:
        answer = f"You mentioned \"{memories[0].title}\" on {memories[0].created_at.strftime('%b %d')}." if memories else "I do not have a matching saved thought yet."
        intent, answer_value = "QUERY", answer
    elif lowered.startswith(("i have been thinking about ", "thought:", "open thought:", "idea:")):
        intent, answer_value = "OPEN_THOUGHT", None
    elif specialist_intent:
        intent, answer_value = specialist_intent, None
    elif resolved:
        intent, answer_value = "OPEN_THOUGHT", None
    elif scheduled_at:
        intent, answer_value = "CREATE", None

    elif scheduled_at and any(token in lowered for token in ("class", "lecture", "meeting", "appointment", "session", "seminar", "interview", "exam", "test", "presentation", "dinner", "lunch", "breakfast", "event", "have ")):
        intent, answer_value = "CREATE", None
    elif any(token in lowered for token in ("remind", "todo", "to-do", "need to", "should send", "call ")):
        intent, answer_value = "REMINDER_ONLY", None
    else:
        intent, answer_value = "OPEN_THOUGHT", None

    if intent == "TRACK_PAPER":
        metadata = fetch_metadata(text)
    elif intent == "TRACK_SCHOLARSHIP":
        url_meta = fetch_url_metadata(text)
        metadata = {"deadline": scheduled_at.isoformat()} if scheduled_at else {}
        if url_meta.get("title"):
            metadata["title"] = url_meta["title"]
        if url_meta.get("description"):
            metadata["description"] = url_meta["description"]
        if url_meta.get("url"):
            metadata["url"] = url_meta["url"]
    else:
        metadata = {}
    if extra_metadata:
        metadata = {**metadata, **extra_metadata}
    if user_profile:
        metadata["_user_profile"] = user_profile

    title = metadata.get("title") or _guided_title(text, intent) or _title(text)
    notes = metadata.get("description") or metadata.get("abstract") or None
    if intent == "TRACK_SCHOLARSHIP" and scheduled_at:
        notes = f"Deadline: {scheduled_at.strftime('%b %d, %Y')}" + (f" — {notes}" if notes else "")

    record = store.save_proposal(
        ProposalRecord(
            id=uuid4(),
            user_id=user_id,
            intent=intent,
            title=str(title),
            notes=str(notes) if notes else None,
            scheduled_at=scheduled_at,
            related_ids=[entry.id for entry in memories],
            resolves_entry_id=resolved.id if resolved else None,
            answer=answer_value,
            metadata=metadata,
        )
    )
    note = None
    if resolved:
        note = f"This sounds like an update to your open thought: {resolved.title}"
    return ProposalOut(id=record.id, intent=intent, title=record.title, notes=record.notes, datetime=record.scheduled_at, related_entries=memories, resolves_entry_id=record.resolves_entry_id, memory_note=note, answer=record.answer)


def make_audio_proposal(user_id: str, payload: CaptureAudioRequest) -> ProposalOut:
    metadata = {"source": "voice", "mime_type": payload.mime_type}
    transcript = None
    try:
        content = base64.b64decode(payload.audio_base64)
        transcript = transcribe_audio(content, "pinapeg-voice.webm", payload.mime_type)
    except Exception:
        transcript = None

    if transcript:
        return make_proposal(user_id, CaptureTextRequest(text=transcript, local_datetime=payload.local_datetime, timezone=payload.timezone), extra_metadata={**metadata, "transcript": transcript}, user_profile=payload.user_profile if hasattr(payload, "user_profile") else None)

    record = store.save_proposal(
        ProposalRecord(
            id=uuid4(),
            user_id=user_id,
            intent="OPEN_THOUGHT",
            title="Voice note awaiting transcription",
            notes="Add OpenAI transcription credentials to turn voice notes into full Pinapeg proposals automatically.",
            scheduled_at=None,
            metadata=metadata,
        )
    )
    return ProposalOut(id=record.id, intent=record.intent, title=record.title, notes=record.notes, datetime=None, related_entries=[], answer=None)


def create_recap(user_id: str, timeframe: str) -> RecapOut:
    entries = store.list_entries(user_id)
    now = datetime.now(entries[0].created_at.tzinfo) if entries else datetime.now().astimezone()
    cutoff = now - timedelta(days=7 if timeframe == "week" else 31 if timeframe == "month" else 36500)
    selected = [entry for entry in entries if entry.created_at >= cutoff]
    completed = [entry.title for entry in selected if entry.status in ("done", "resolved")]
    open_items = [entry.title for entry in selected if entry.status == "open" and entry.type != "thought"]
    stale = [entry for entry in selected if entry.status == "open" and entry.type == "thought" and (not entry.last_referenced_at or entry.last_referenced_at <= entry.created_at)]
    if not selected:
        narration = "No captures in this window yet. When a thought arrives, you can leave it here without having to turn it into a task."
    elif stale:
        narration = f"You have {len(stale)} thought{'s' if len(stale) != 1 else ''} worth returning to, starting with \"{stale[0].title}\"."
    else:
        narration = "You have been keeping your threads in view. Nothing is quietly slipping through right now."
    return RecapOut(timeframe=timeframe, completed=completed, still_open=open_items, worth_revisiting=stale, narration=narration)


def create_weekly_review(user_id: str, timeframe: str) -> WeeklyReviewOut:
    entries = store.list_entries(user_id)
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=7 if timeframe == "week" else 31 if timeframe == "month" else 36500)
    selected = [entry for entry in entries if entry.created_at >= cutoff]
    completed_milestones = [entry for entry in selected if entry.status in ("done", "resolved") and entry.type in {"task", "project_milestone", "scholarship_app"}]
    papers_read = [entry for entry in selected if entry.status in ("done", "resolved") and entry.type == "research_paper"]
    upcoming_deadlines = sorted(
        [entry for entry in entries if entry.status == "open" and entry.scheduled_at and entry.scheduled_at >= now and entry.type in {"event", "task", "scholarship_app", "project_milestone"}],
        key=lambda entry: entry.scheduled_at or entry.created_at,
    )[:5]
    slipping_habits = [metric.title for metric in store.habit_analytics(user_id) if metric.completion_rate < 0.5]
    if not entries:
        coach_narration = "No data yet. Capture one concrete thing today so the review has something to hold you to."
    elif slipping_habits or upcoming_deadlines:
        coach_narration = f"{len(upcoming_deadlines)} deadline(s) need attention and {len(slipping_habits)} habit(s) are slipping. Pick one next action before adding more plans."
    else:
        coach_narration = "Good rhythm this cycle. Keep closing the loop: capture, confirm, finish, then review."
    return WeeklyReviewOut(timeframe=timeframe, completed_milestones=completed_milestones, slipping_habits=slipping_habits, papers_read=papers_read, upcoming_deadlines=upcoming_deadlines, coach_narration=coach_narration)
