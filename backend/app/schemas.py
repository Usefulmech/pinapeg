from datetime import date, datetime as DateTime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

Intent = Literal["CREATE", "REMINDER_ONLY", "OPEN_THOUGHT", "QUERY", "TRACK_PAPER", "TRACK_SCHOLARSHIP", "LOG_HABIT"]
EntryType = Literal["event", "task", "thought", "project_milestone", "habit", "research_paper", "scholarship_app"]
Status = Literal["open", "done", "resolved", "cancelled"]


class CaptureTextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)
    local_datetime: DateTime
    timezone: str = "Africa/Lagos"
    user_profile: dict | None = None


class CaptureAudioRequest(BaseModel):
    audio_base64: str = Field(min_length=1)
    local_datetime: DateTime
    timezone: str = "Africa/Lagos"
    mime_type: str = "audio/webm"
    user_profile: dict | None = None


class EntryOut(BaseModel):
    id: UUID
    type: EntryType
    title: str
    notes: str | None = None
    scheduled_at: DateTime | None = None
    status: Status
    created_at: DateTime
    last_referenced_at: DateTime | None = None
    calendar_sync_state: str = "not_applicable"
    metadata: dict[str, Any] = Field(default_factory=dict)


class EntryUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    notes: str | None = Field(default=None, max_length=10_000)
    scheduled_at: DateTime | None = None
    status: Status | None = None
    metadata: dict[str, Any] | None = None


class ProposalOut(BaseModel):
    id: UUID
    intent: Intent
    title: str
    notes: str | None = None
    datetime: DateTime | None = None
    related_entries: list[EntryOut] = Field(default_factory=list)
    resolves_entry_id: UUID | None = None
    memory_note: str | None = None
    answer: str | None = None
    requires_clarification: bool = False


class RecapRequest(BaseModel):
    timeframe: Literal["week", "month", "all"]


class RecapOut(BaseModel):
    timeframe: str
    completed: list[str]
    still_open: list[str]
    worth_revisiting: list[EntryOut]
    narration: str


class WeeklyReviewOut(BaseModel):
    timeframe: str
    completed_milestones: list[EntryOut]
    slipping_habits: list[str]
    papers_read: list[EntryOut]
    upcoming_deadlines: list[EntryOut]
    coach_narration: str


class DailyEssenceOut(BaseModel):
    date: str
    focus_type: Literal["deadline", "habit", "scholarship", "research", "thought", "capture"]
    title: str
    message: str
    suggested_action: str
    route: str
    related_entry: EntryOut | None = None
    module_counts: dict[str, int] = Field(default_factory=dict)


class PromptJobOut(BaseModel):
    kind: Literal["deadline", "habit", "stale_thought", "daily_essence", "daily_checkin", "weekly_review"]
    title: str
    message: str
    route: str
    scheduled_for: DateTime
    priority: Literal["low", "medium", "high"]
    related_entry: EntryOut | None = None


class PromptPlanOut(BaseModel):
    generated_at: DateTime
    timezone: str
    jobs: list[PromptJobOut]


class ConfigStatusOut(BaseModel):
    storage_mode: str
    database_configured: bool
    postgres_active: bool
    openai_configured: bool
    google_oauth_configured: bool
    token_encryption_configured: bool
    vapid_configured: bool
    frontend_app_url: str


class PaperEnrichmentOut(BaseModel):
    entry: EntryOut
    full_text_available: bool
    used_ai_summary: bool
    summary: str | None = None
    bibtex: str | None = None
    message: str


class PaperQuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2_000)


class PaperQuestionOut(BaseModel):
    answer: str
    citations: list[str] = Field(default_factory=list)
    used_ai: bool = False


class IntegrationConnectOut(BaseModel):
    authorization_url: str


class OAuthConnectionOut(BaseModel):
    provider: Literal["google_calendar", "google_gmail"]
    connected: bool
    provider_account_email: str | None = None
    scopes: list[str] = Field(default_factory=list)
    status: str = "not_connected"
    last_synced_at: DateTime | None = None
    last_error: str | None = None


class IntegrationsOut(BaseModel):
    google_calendar: OAuthConnectionOut
    google_gmail: OAuthConnectionOut


class IntegrationSyncOut(BaseModel):
    provider: Literal["calendar", "gmail"]
    connected: bool
    scanned_count: int
    imported_count: int = 0
    message: str
    last_synced_at: DateTime | None = None


class MeOut(BaseModel):
    display_name: str
    timezone: str
    calendar_connected: bool


class HabitLogOut(BaseModel):
    habit_entry_id: UUID
    completed_date: str
    recorded: bool


class HabitAnalyticsItem(BaseModel):
    habit_entry_id: UUID
    title: str
    logged_days: int
    completion_rate: float
    current_streak: int
    last_logged_date: date | None = None


class HabitAnalyticsOut(BaseModel):
    habits: list[HabitAnalyticsItem]


class DecompositionOut(BaseModel):
    parent_entry_id: UUID
    tasks: list[EntryOut]
