"""Queue adapter boundary for prompt jobs.

Jobs are persisted in SQLite (queue.db) so prompt jobs survive process restarts.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol
from urllib.parse import urlparse

from .config import settings
from .schemas import PromptJobOut


@dataclass
class QueueEnvelope:
    user_id: str
    job: PromptJobOut


class PromptQueue(Protocol):
    @property
    def pending(self) -> list[QueueEnvelope]:
        ...

    def enqueue_many(self, user_id: str, jobs: list[PromptJobOut]) -> int:
        ...

    def due(self, *, now: datetime | None = None) -> list[QueueEnvelope]:
        ...


@dataclass
class InProcessPromptQueue:
    """Tiny queue-shaped adapter used until Redis is enabled."""

    pending: list[QueueEnvelope] = field(default_factory=list)

    def enqueue_many(self, user_id: str, jobs: list[PromptJobOut]) -> int:
        self.pending.extend(QueueEnvelope(user_id=user_id, job=job) for job in jobs)
        return len(jobs)

    def due(self, *, now: datetime | None = None) -> list[QueueEnvelope]:
        current = now or datetime.now(UTC)
        due_items = [item for item in self.pending if item.job.scheduled_for <= current]
        self.pending = [item for item in self.pending if item.job.scheduled_for > current]
        return due_items


import sqlite3
from pathlib import Path

class SqlitePromptQueue:
    def __init__(self):
        from .config import BACKEND_DIR
        db_path = BACKEND_DIR / "queue.db"
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.execute(
            """CREATE TABLE IF NOT EXISTS prompt_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                scheduled_for REAL NOT NULL,
                payload TEXT NOT NULL
            )"""
        )
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_scheduled_for ON prompt_jobs(scheduled_for)")
        self.conn.commit()

    @property
    def pending(self) -> list[QueueEnvelope]:
        cursor = self.conn.execute("SELECT user_id, payload FROM prompt_jobs ORDER BY scheduled_for ASC LIMIT 50")
        envelopes: list[QueueEnvelope] = []
        for user_id, payload in cursor:
            job_data = json.loads(payload)
            envelopes.append(QueueEnvelope(user_id=user_id, job=PromptJobOut.model_validate(job_data)))
        return envelopes

    def enqueue_many(self, user_id: str, jobs: list[PromptJobOut]) -> int:
        if not jobs:
            return 0
        rows = []
        for job in jobs:
            rows.append((user_id, job.scheduled_for.timestamp(), job.model_dump_json()))
        self.conn.executemany(
            "INSERT INTO prompt_jobs (user_id, scheduled_for, payload) VALUES (?, ?, ?)",
            rows
        )
        self.conn.commit()
        return len(jobs)

    def due(self, *, now: datetime | None = None) -> list[QueueEnvelope]:
        current = now or datetime.now(UTC)
        current_ts = current.timestamp()
        
        cursor = self.conn.execute(
            "SELECT id, user_id, payload FROM prompt_jobs WHERE scheduled_for <= ?",
            (current_ts,)
        )
        rows = cursor.fetchall()
        if not rows:
            return []
            
        ids = [row[0] for row in rows]
        self.conn.execute(
            f"DELETE FROM prompt_jobs WHERE id IN ({','.join('?' * len(ids))})",
            ids
        )
        self.conn.commit()
        
        envelopes: list[QueueEnvelope] = []
        for row in rows:
            user_id = row[1]
            payload = row[2]
            job_data = json.loads(payload)
            envelopes.append(QueueEnvelope(user_id=user_id, job=PromptJobOut.model_validate(job_data)))
        return envelopes



def queue_backend_name() -> str:
    return "sqlite"

def make_prompt_queue() -> PromptQueue:
    return SqlitePromptQueue()

prompt_queue = make_prompt_queue()
