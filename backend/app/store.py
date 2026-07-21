"""Repository protocol and safe local stores for Pinapeg."""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import or_, select

from .config import settings
from .database import sessions
from .embeddings import embed_text, embed_texts
from .models import EntryEmbeddingModel, EntryModel, HabitLogModel, OAuthConnectionModel, UserModel
from .schemas import EntryOut, HabitAnalyticsItem, OAuthConnectionOut
from .security import decrypt_secret, encrypt_secret


ENTRY_TYPE_BY_INTENT = {
    "CREATE": "event",
    "REMINDER_ONLY": "task",
    "OPEN_THOUGHT": "thought",
    "TRACK_PAPER": "research_paper",
    "TRACK_SCHOLARSHIP": "scholarship_app",
    "LOG_HABIT": "habit",
}

SCHOLARSHIP_TASKS = [
    "Review eligibility and requirements",
    "Prepare CV and supporting documents",
    "Draft the personal statement",
    "Request recommendations",
    "Review and submit the application",
]


@dataclass
class ProposalRecord:
    id: UUID
    user_id: str
    intent: str
    title: str
    notes: str | None
    scheduled_at: datetime | None
    related_ids: list[UUID] = field(default_factory=list)
    resolves_entry_id: UUID | None = None
    answer: str | None = None
    metadata: dict = field(default_factory=dict)


def _habit_metric(habit: EntryOut, dates: set[date]) -> HabitAnalyticsItem:
    today = datetime.now(UTC).date()
    current = today
    streak = 0
    while current in dates:
        streak += 1
        current -= timedelta(days=1)
    logged_days = len([logged for logged in dates if logged >= today - timedelta(days=29)])
    return HabitAnalyticsItem(
        habit_entry_id=habit.id,
        title=habit.title,
        logged_days=logged_days,
        completion_rate=round(logged_days / 30, 2),
        current_streak=streak,
        last_logged_date=max(dates) if dates else None,
    )


class MemoryStore:
    def __init__(self) -> None:
        self.entries: dict[str, list[EntryOut]] = {}
        self.proposals: dict[UUID, ProposalRecord] = {}
        self.habit_logs: set[tuple[str, UUID, date]] = set()
        self.oauth_connections: dict[tuple[str, str], OAuthConnectionOut] = {}
        self.oauth_refresh_tokens: dict[tuple[str, str], str] = {}

    def list_entries(self, user_id: str, *, entry_type: str | None = None, status: str | None = None, query: str | None = None) -> list[EntryOut]:
        items = self.entries.get(user_id, [])
        if entry_type:
            items = [item for item in items if item.type == entry_type]
        if status:
            items = [item for item in items if item.status == status]
        if query:
            needle = query.lower()
            items = [item for item in items if needle in f"{item.title} {item.notes or ''} {item.metadata}".lower()]
        return sorted(items, key=lambda item: item.scheduled_at or item.created_at, reverse=True)

    def related(self, user_id: str, text: str, limit: int = 4) -> list[EntryOut]:
        words = {word.strip(".,?!'").lower() for word in text.split() if len(word.strip(".,?!'")) > 3}
        scored: list[tuple[int, EntryOut]] = []
        for item in self.entries.get(user_id, []):
            haystack = f"{item.title} {item.notes or ''} {item.metadata}".lower()
            score = sum(word in haystack for word in words) + (2 if item.status == "open" else 0)
            if score:
                scored.append((score, item))
        return [item for _, item in sorted(scored, key=lambda pair: (pair[0], pair[1].created_at), reverse=True)[:limit]]

    def save_proposal(self, record: ProposalRecord) -> ProposalRecord:
        self.proposals[record.id] = record
        return record

    def confirm(self, user_id: str, proposal_id: UUID) -> EntryOut:
        proposal = self.proposals.get(proposal_id)
        if not proposal or proposal.user_id != user_id:
            raise KeyError("proposal")
        if proposal.intent == "QUERY":
            raise ValueError("query proposals cannot be confirmed")
        if proposal.resolves_entry_id:
            for index, item in enumerate(self.entries.get(user_id, [])):
                if item.id == proposal.resolves_entry_id:
                    changed = item.model_copy(update={"status": "resolved", "last_referenced_at": datetime.now(UTC)})
                    self.entries[user_id][index] = changed
                    del self.proposals[proposal_id]
                    return changed

        entry_type = ENTRY_TYPE_BY_INTENT[proposal.intent]
        entry = EntryOut(
            id=uuid4(),
            type=entry_type,
            title=proposal.title,
            notes=proposal.notes,
            scheduled_at=proposal.scheduled_at,
            status="open",
            created_at=datetime.now(UTC),
            calendar_sync_state="pending" if entry_type == "event" else "not_applicable",
            metadata=proposal.metadata,
        )
        self.entries.setdefault(user_id, []).append(entry)
        del self.proposals[proposal_id]
        return entry

    def discard(self, user_id: str, proposal_id: UUID) -> None:
        proposal = self.proposals.get(proposal_id)
        if proposal and proposal.user_id == user_id:
            del self.proposals[proposal_id]

    def transition(self, user_id: str, entry_id: UUID, status: str) -> EntryOut:
        return self.update_entry(user_id, entry_id, {"status": status, "last_referenced_at": datetime.now(UTC)})

    def update_entry(self, user_id: str, entry_id: UUID, changes: dict) -> EntryOut:
        for index, item in enumerate(self.entries.get(user_id, [])):
            if item.id == entry_id:
                updates = {key: value for key, value in changes.items() if key in {"title", "notes", "scheduled_at", "status", "last_referenced_at"}}
                if "metadata" in changes and changes["metadata"] is not None:
                    updates["metadata"] = {**item.metadata, **changes["metadata"]}
                changed = item.model_copy(update=updates)
                self.entries[user_id][index] = changed
                return changed
        raise KeyError("entry")

    def log_habit(self, user_id: str, entry_id: UUID) -> dict[str, str | UUID | bool]:
        habit = next((item for item in self.entries.get(user_id, []) if item.id == entry_id and item.type == "habit"), None)
        if habit is None:
            raise KeyError("habit")
        today = datetime.now(UTC).date()
        self.habit_logs.add((user_id, entry_id, today))
        return {"habit_entry_id": entry_id, "completed_date": today.isoformat(), "recorded": True}

    def children(self, user_id: str, entry_id: UUID) -> list[EntryOut]:
        children = [entry for entry in self.entries.get(user_id, []) if entry.metadata.get("derived_from") == str(entry_id)]
        return sorted(children, key=lambda entry: (int(entry.metadata.get("position", 999)), entry.created_at))

    def decompose(self, user_id: str, entry_id: UUID) -> list[EntryOut]:
        parent = next((item for item in self.entries.get(user_id, []) if item.id == entry_id and item.type == "scholarship_app"), None)
        if parent is None:
            raise KeyError("scholarship")
        existing = self.children(user_id, entry_id)
        if existing:
            return existing

        created = [
            EntryOut(
                id=uuid4(),
                type="task",
                title=f"{task} - {parent.title}",
                status="open",
                created_at=datetime.now(UTC),
                metadata={"derived_from": str(parent.id), "relation": "part_of_goal", "position": index + 1, "cv_category": "scholarship"},
            )
            for index, task in enumerate(SCHOLARSHIP_TASKS)
        ]
        self.entries.setdefault(user_id, []).extend(created)
        return created

    def habit_analytics(self, user_id: str) -> list[HabitAnalyticsItem]:
        habits = [entry for entry in self.entries.get(user_id, []) if entry.type == "habit"]
        return [_habit_metric(habit, {logged for log_user, habit_id, logged in self.habit_logs if log_user == user_id and habit_id == habit.id}) for habit in habits]

    def cv_timeline(self, user_id: str) -> list[EntryOut]:
        items = [entry for entry in self.entries.get(user_id, []) if entry.status in {"done", "resolved"} and entry.metadata.get("is_cv_worthy")]
        return sorted(items, key=lambda item: item.created_at)

    def save_oauth_connection(self, user_id: str, provider: str, provider_account_email: str, refresh_token: str, scopes: list[str], token_expires_at: datetime | None = None) -> OAuthConnectionOut:
        self.oauth_refresh_tokens[(user_id, provider)] = encrypt_secret(refresh_token)
        connection = OAuthConnectionOut(provider=provider, connected=True, provider_account_email=provider_account_email, scopes=scopes, status="active", last_synced_at=None, last_error=None)
        self.oauth_connections[(user_id, provider)] = connection
        return connection

    def oauth_connections_for_user(self, user_id: str) -> dict[str, OAuthConnectionOut | None]:
        return {
            "google_calendar": self.oauth_connections.get((user_id, "google_calendar")),
            "google_gmail": self.oauth_connections.get((user_id, "google_gmail")),
        }

    def delete_oauth_connection(self, user_id: str, provider: str) -> None:
        self.oauth_connections.pop((user_id, provider), None)
        self.oauth_refresh_tokens.pop((user_id, provider), None)

    def oauth_refresh_token(self, user_id: str, provider: str) -> tuple[str, str] | None:
        connection = self.oauth_connections.get((user_id, provider))
        encrypted = self.oauth_refresh_tokens.get((user_id, provider))
        if not connection or not connection.connected or not encrypted:
            return None
        return decrypt_secret(encrypted), connection.provider_account_email or "unknown-google-account"

    def record_oauth_sync(self, user_id: str, provider: str, last_error: str | None = None) -> OAuthConnectionOut | None:
        connection = self.oauth_connections.get((user_id, provider))
        if not connection:
            return None
        updated = connection.model_copy(update={
            "status": "error" if last_error else "active",
            "connected": last_error is None,
            "last_synced_at": datetime.now(UTC) if last_error is None else connection.last_synced_at,
            "last_error": last_error,
        })
        self.oauth_connections[(user_id, provider)] = updated
        return updated


class PostgresStore:
    """PostgreSQL-backed entry store; proposals remain short-lived until confirmed."""

    def __init__(self) -> None:
        self.proposals: dict[UUID, ProposalRecord] = {}

    @staticmethod
    def _out(entry: EntryModel) -> EntryOut:
        return EntryOut(
            id=entry.id,
            type=entry.type,
            title=entry.title,
            notes=entry.notes,
            scheduled_at=entry.scheduled_at,
            status=entry.status,
            created_at=entry.created_at,
            last_referenced_at=entry.last_referenced_at,
            calendar_sync_state=entry.calendar_sync_state,
            metadata=entry.metadata_json or {},
        )

    @staticmethod
    def _oauth_out(connection: OAuthConnectionModel) -> OAuthConnectionOut:
        return OAuthConnectionOut(
            provider=connection.provider,
            connected=connection.status == "active",
            provider_account_email=connection.provider_account_email,
            scopes=connection.scopes or [],
            status=connection.status,
            last_synced_at=connection.last_synced_at,
            last_error=connection.last_error,
        )

    @staticmethod
    def _content(entry: EntryModel) -> str:
        parts = [entry.title, entry.notes or ""]
        metadata = entry.metadata_json or {}
        if metadata.get("abstract"):
            parts.append(str(metadata["abstract"]))
        if metadata.get("authors"):
            parts.append(", ".join(str(author) for author in metadata["authors"]))
        return "\n".join(part for part in parts if part)

    @staticmethod
    def _user(session, external_user_id: str, create: bool = False) -> UserModel | None:
        user = session.scalar(select(UserModel).where(UserModel.external_user_id == external_user_id))
        if user is None and create:
            user = UserModel(external_user_id=external_user_id)
            session.add(user)
            session.flush()
        return user

    def list_entries(self, user_id: str, *, entry_type: str | None = None, status: str | None = None, query: str | None = None) -> list[EntryOut]:
        with next(sessions()) as session:
            user = self._user(session, user_id)
            if user is None:
                return []
            statement = select(EntryModel).where(EntryModel.user_id == user.id)
            if entry_type:
                statement = statement.where(EntryModel.type == entry_type)
            if status:
                statement = statement.where(EntryModel.status == status)
            if query:
                pattern = f"%{query}%"
                statement = statement.where(or_(EntryModel.title.ilike(pattern), EntryModel.notes.ilike(pattern)))
            statement = statement.order_by(EntryModel.scheduled_at.desc(), EntryModel.created_at.desc())
            return [self._out(entry) for entry in session.scalars(statement)]

    def related(self, user_id: str, text: str, limit: int = 4) -> list[EntryOut]:
        vector = embed_text(text)
        if vector is not None:
            try:
                with next(sessions()) as session:
                    user = self._user(session, user_id)
                    if user is not None:
                        distance = EntryEmbeddingModel.embedding.cosine_distance(vector.values).label("distance")
                        statement = (
                            select(EntryModel)
                            .join(EntryEmbeddingModel, EntryEmbeddingModel.entry_id == EntryModel.id)
                            .where(EntryModel.user_id == user.id)
                            .order_by(distance, EntryModel.created_at.desc())
                            .limit(limit)
                        )
                        matches = [self._out(entry) for entry in session.scalars(statement)]
                        if matches:
                            return matches
            except Exception:
                pass
        return self._keyword_related(user_id, text, limit)

    def _keyword_related(self, user_id: str, text: str, limit: int = 4) -> list[EntryOut]:
        words = [word.strip(".,?!'") for word in text.split() if len(word.strip(".,?!'")) > 3]
        candidates = self.list_entries(user_id)
        ranked = sorted(
            ((sum(word.lower() in f"{item.title} {item.notes or ''} {item.metadata}".lower() for word in words) + (2 if item.status == "open" else 0), item) for item in candidates),
            key=lambda pair: (pair[0], pair[1].created_at),
            reverse=True,
        )
        return [item for score, item in ranked if score][:limit]

    def _write_embeddings(self, session, user_id: UUID, entries: list[EntryModel]) -> None:
        contents = [self._content(entry) for entry in entries]
        results = embed_texts(contents)
        for entry, content, result in zip(entries, contents, results):
            session.merge(EntryEmbeddingModel(entry_id=entry.id, user_id=user_id, content=content, embedding=result.values, model=result.model))

    def save_proposal(self, record: ProposalRecord) -> ProposalRecord:
        self.proposals[record.id] = record
        return record

    def confirm(self, user_id: str, proposal_id: UUID) -> EntryOut:
        proposal = self.proposals.get(proposal_id)
        if not proposal or proposal.user_id != user_id:
            raise KeyError("proposal")
        if proposal.intent == "QUERY":
            raise ValueError("query proposals cannot be confirmed")
        with next(sessions()) as session:
            user = self._user(session, user_id, create=True)
            if proposal.resolves_entry_id:
                entry = session.scalar(select(EntryModel).where(EntryModel.id == proposal.resolves_entry_id, EntryModel.user_id == user.id))
                if entry is not None:
                    entry.status, entry.resolved_at, entry.last_referenced_at = "resolved", datetime.now(UTC), datetime.now(UTC)
                    session.commit()
                    del self.proposals[proposal_id]
                    return self._out(entry)
            entry_type = ENTRY_TYPE_BY_INTENT[proposal.intent]
            entry = EntryModel(
                user_id=user.id,
                type=entry_type,
                intent=proposal.intent,
                title=proposal.title,
                notes=proposal.notes,
                scheduled_at=proposal.scheduled_at,
                status="open",
                metadata_json=proposal.metadata,
                calendar_sync_state="pending" if entry_type == "event" else "not_applicable",
            )
            session.add(entry)
            session.flush()
            self._write_embeddings(session, user.id, [entry])
            session.commit()
            session.refresh(entry)
            del self.proposals[proposal_id]
            return self._out(entry)

    def discard(self, user_id: str, proposal_id: UUID) -> None:
        proposal = self.proposals.get(proposal_id)
        if proposal and proposal.user_id == user_id:
            del self.proposals[proposal_id]

    def transition(self, user_id: str, entry_id: UUID, status: str) -> EntryOut:
        return self.update_entry(user_id, entry_id, {"status": status, "last_referenced_at": datetime.now(UTC)})

    def update_entry(self, user_id: str, entry_id: UUID, changes: dict) -> EntryOut:
        with next(sessions()) as session:
            user = self._user(session, user_id)
            entry = session.scalar(select(EntryModel).where(EntryModel.id == entry_id, EntryModel.user_id == user.id)) if user else None
            if entry is None:
                raise KeyError("entry")

            should_reembed = False
            if "title" in changes and changes["title"] is not None:
                entry.title = changes["title"]
                should_reembed = True
            if "notes" in changes:
                entry.notes = changes["notes"]
                should_reembed = True
            if "scheduled_at" in changes:
                entry.scheduled_at = changes["scheduled_at"]
            if "status" in changes and changes["status"] is not None:
                entry.status = changes["status"]
                entry.last_referenced_at = datetime.now(UTC)
                if entry.status == "done":
                    entry.completed_at = datetime.now(UTC)
                if entry.status == "resolved":
                    entry.resolved_at = datetime.now(UTC)
            if "metadata" in changes and changes["metadata"] is not None:
                entry.metadata_json = {**(entry.metadata_json or {}), **changes["metadata"]}
                should_reembed = True

            session.flush()
            if should_reembed:
                self._write_embeddings(session, user.id, [entry])
            session.commit()
            session.refresh(entry)
            return self._out(entry)

    def log_habit(self, user_id: str, entry_id: UUID) -> dict[str, str | UUID | bool]:
        with next(sessions()) as session:
            user = self._user(session, user_id)
            habit = session.scalar(select(EntryModel).where(EntryModel.id == entry_id, EntryModel.user_id == user.id, EntryModel.type == "habit")) if user else None
            if habit is None:
                raise KeyError("habit")
            today = datetime.now(UTC).date()
            existing = session.scalar(select(HabitLogModel).where(HabitLogModel.habit_entry_id == entry_id, HabitLogModel.completed_date == today))
            if existing is None:
                session.add(HabitLogModel(user_id=user.id, habit_entry_id=entry_id, completed_date=today))
                session.commit()
            return {"habit_entry_id": entry_id, "completed_date": today.isoformat(), "recorded": True}

    def children(self, user_id: str, entry_id: UUID) -> list[EntryOut]:
        with next(sessions()) as session:
            user = self._user(session, user_id)
            if user is None:
                return []
            statement = select(EntryModel).where(
                EntryModel.user_id == user.id,
                EntryModel.metadata_json.op("->>")("derived_from") == str(entry_id),
            )
            children = [self._out(entry) for entry in session.scalars(statement)]
            return sorted(children, key=lambda entry: (int(entry.metadata.get("position", 999)), entry.created_at))

    def decompose(self, user_id: str, entry_id: UUID) -> list[EntryOut]:
        with next(sessions()) as session:
            user = self._user(session, user_id)
            parent = session.scalar(select(EntryModel).where(EntryModel.id == entry_id, EntryModel.user_id == user.id, EntryModel.type == "scholarship_app")) if user else None
            if parent is None:
                raise KeyError("scholarship")
            existing_statement = select(EntryModel).where(
                EntryModel.user_id == user.id,
                EntryModel.metadata_json.op("->>")("derived_from") == str(parent.id),
            )
            existing = [self._out(entry) for entry in session.scalars(existing_statement)]
            if existing:
                return sorted(existing, key=lambda entry: (int(entry.metadata.get("position", 999)), entry.created_at))

            tasks = [
                EntryModel(
                    user_id=user.id,
                    type="task",
                    intent="REMINDER_ONLY",
                    title=f"{label} - {parent.title}",
                    status="open",
                    metadata_json={"derived_from": str(parent.id), "relation": "part_of_goal", "position": index + 1, "cv_category": "scholarship"},
                )
                for index, label in enumerate(SCHOLARSHIP_TASKS)
            ]
            session.add_all(tasks)
            session.flush()
            self._write_embeddings(session, user.id, tasks)
            session.commit()
            return [self._out(task) for task in tasks]

    def habit_analytics(self, user_id: str) -> list[HabitAnalyticsItem]:
        with next(sessions()) as session:
            user = self._user(session, user_id)
            if user is None:
                return []
            habits = [self._out(entry) for entry in session.scalars(select(EntryModel).where(EntryModel.user_id == user.id, EntryModel.type == "habit"))]
            metrics: list[HabitAnalyticsItem] = []
            for habit in habits:
                dates = {
                    log.completed_date
                    for log in session.scalars(select(HabitLogModel).where(HabitLogModel.user_id == user.id, HabitLogModel.habit_entry_id == habit.id))
                }
                metrics.append(_habit_metric(habit, dates))
            return metrics

    def cv_timeline(self, user_id: str) -> list[EntryOut]:
        with next(sessions()) as session:
            user = self._user(session, user_id)
            if user is None:
                return []
            statement = (
                select(EntryModel)
                .where(
                    EntryModel.user_id == user.id,
                    EntryModel.status.in_(["done", "resolved"]),
                    EntryModel.metadata_json.op("->>")("is_cv_worthy") == "true",
                )
                .order_by(EntryModel.created_at.asc())
            )
            return [self._out(entry) for entry in session.scalars(statement)]

    def save_oauth_connection(self, user_id: str, provider: str, provider_account_email: str, refresh_token: str, scopes: list[str], token_expires_at: datetime | None = None) -> OAuthConnectionOut:
        with next(sessions()) as session:
            user = self._user(session, user_id, create=True)
            connection = session.scalar(
                select(OAuthConnectionModel).where(
                    OAuthConnectionModel.user_id == user.id,
                    OAuthConnectionModel.provider == provider,
                    OAuthConnectionModel.provider_account_email == provider_account_email,
                )
            )
            if connection is None:
                connection = OAuthConnectionModel(user_id=user.id, provider=provider, provider_account_email=provider_account_email)
                session.add(connection)
            connection.encrypted_refresh_token = encrypt_secret(refresh_token)
            connection.token_expires_at = token_expires_at
            connection.scopes = scopes
            connection.status = "active"
            connection.last_error = None
            session.commit()
            session.refresh(connection)
            return self._oauth_out(connection)

    def oauth_connections_for_user(self, user_id: str) -> dict[str, OAuthConnectionOut | None]:
        with next(sessions()) as session:
            user = self._user(session, user_id)
            if user is None:
                return {"google_calendar": None, "google_gmail": None}
            rows = session.scalars(select(OAuthConnectionModel).where(OAuthConnectionModel.user_id == user.id)).all()
            by_provider = {row.provider: self._oauth_out(row) for row in rows}
            return {"google_calendar": by_provider.get("google_calendar"), "google_gmail": by_provider.get("google_gmail")}

    def delete_oauth_connection(self, user_id: str, provider: str) -> None:
        with next(sessions()) as session:
            user = self._user(session, user_id)
            if user is None:
                return
            connection = session.scalar(select(OAuthConnectionModel).where(OAuthConnectionModel.user_id == user.id, OAuthConnectionModel.provider == provider))
            if connection is not None:
                connection.status = "revoked"
                session.commit()

    def oauth_refresh_token(self, user_id: str, provider: str) -> tuple[str, str] | None:
        with next(sessions()) as session:
            user = self._user(session, user_id)
            if user is None:
                return None
            connection = session.scalar(
                select(OAuthConnectionModel).where(
                    OAuthConnectionModel.user_id == user.id,
                    OAuthConnectionModel.provider == provider,
                    OAuthConnectionModel.status == "active",
                )
            )
            if connection is None:
                return None
            return decrypt_secret(connection.encrypted_refresh_token), connection.provider_account_email

    def record_oauth_sync(self, user_id: str, provider: str, last_error: str | None = None) -> OAuthConnectionOut | None:
        with next(sessions()) as session:
            user = self._user(session, user_id)
            if user is None:
                return None
            connection = session.scalar(
                select(OAuthConnectionModel).where(
                    OAuthConnectionModel.user_id == user.id,
                    OAuthConnectionModel.provider == provider,
                )
            )
            if connection is None:
                return None
            connection.status = "error" if last_error else "active"
            connection.last_error = last_error
            if last_error is None:
                connection.last_synced_at = datetime.now(UTC)
            session.commit()
            session.refresh(connection)
            return self._oauth_out(connection)


store = PostgresStore() if settings().storage_mode.lower() == "postgres" else MemoryStore()
