"""Prompt job handlers.

These handlers currently produce delivery payloads/loggable outcomes. Later,
they should persist notification rows, send Web Push, email, or in-app inbox
items after Redis claims the jobs.
"""

from datetime import UTC, datetime
from typing import Any

from .essence import create_daily_essence
from .schemas import PromptJobOut
from .services import create_weekly_review


def handle_prompt_job(user_id: str, job: PromptJobOut) -> dict[str, Any]:
    if job.kind == "daily_essence":
        essence = create_daily_essence(user_id)
        return {
            "kind": job.kind,
            "handled_at": datetime.now(UTC).isoformat(),
            "route": essence.route,
            "title": essence.title,
            "message": essence.message,
        }

    if job.kind == "alarm_10m":
        return {
            "kind": job.kind,
            "handled_at": datetime.now(UTC).isoformat(),
            "route": job.route,
            "title": job.title,
            "message": job.message,
            "play_sound": True,
            "related_entry_id": str(job.related_entry.id) if job.related_entry else None,
        }


    if job.kind == "daily_checkin":
        return {
            "kind": job.kind,
            "handled_at": datetime.now(UTC).isoformat(),
            "route": job.route,
            "title": "Daily Check-in",
            "message": "Time for your daily reflection. Open Pinapeg to track your progress and clear your mind.",
        }

    if job.kind == "weekly_review":
        review = create_weekly_review(user_id, "week")
        return {
            "kind": job.kind,
            "handled_at": datetime.now(UTC).isoformat(),
            "route": job.route,
            "title": "Weekly Review",
            "message": review.coach_narration,
            "counts": {
                "milestones": len(review.completed_milestones),
                "slipping_habits": len(review.slipping_habits),
                "papers_read": len(review.papers_read),
                "upcoming_deadlines": len(review.upcoming_deadlines),
            },
        }

    return {
        "kind": job.kind,
        "handled_at": datetime.now(UTC).isoformat(),
        "route": job.route,
        "title": job.title,
        "message": job.message,
        "related_entry_id": str(job.related_entry.id) if job.related_entry else None,
    }
