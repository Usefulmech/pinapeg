"""SQLite-based prompt planning.

Produces the queue payloads delivered by user timezone.
"""

from datetime import UTC, datetime, timedelta

from .schemas import PromptJobOut, PromptPlanOut
from .store import store


def build_prompt_plan(user_id: str, timezone: str = "Africa/Lagos") -> PromptPlanOut:
    now = datetime.now(UTC)
    entries = store.list_entries(user_id)
    open_entries = [entry for entry in entries if entry.status == "open"]
    jobs: list[PromptJobOut] = []

    for entry in sorted((item for item in open_entries if item.scheduled_at), key=lambda item: item.scheduled_at or item.created_at)[:6]:
        scheduled_at = entry.scheduled_at or now
        if scheduled_at < now:
            jobs.append(PromptJobOut(
                kind="deadline",
                title="Missed deadline check",
                message=f"{entry.title} has passed. Decide whether to reschedule, close, or keep it open.",
                route="/schedule" if entry.type in {"event", "task"} else "/projects",
                scheduled_for=now,
                priority="high",
                related_entry=entry,
            ))
        elif scheduled_at <= now + timedelta(days=1):
            jobs.append(PromptJobOut(
                kind="deadline",
                title="Deadline within 24 hours",
                message=f"{entry.title} is close. Pick the next action before the day fills up.",
                route="/schedule" if entry.type in {"event", "task"} else "/projects",
                scheduled_for=max(now, scheduled_at - timedelta(hours=3)),
                priority="high",
                related_entry=entry,
            ))
        elif scheduled_at <= now + timedelta(days=7):
            jobs.append(PromptJobOut(
                kind="deadline",
                title="Upcoming deadline",
                message=f"{entry.title} is coming up this week.",
                route="/schedule" if entry.type in {"event", "task"} else "/projects",
                scheduled_for=max(now, scheduled_at - timedelta(days=1)),
                priority="medium",
                related_entry=entry,
            ))

    for metric in store.habit_analytics(user_id):
        if metric.current_streak == 0 or metric.completion_rate < 0.5:
            jobs.append(PromptJobOut(
                kind="habit",
                title="Habit rhythm check",
                message=f"{metric.title} needs a small check-in today.",
                route="/habits",
                scheduled_for=now.replace(hour=18, minute=0, second=0, microsecond=0) if now.hour < 18 else now,
                priority="medium",
                related_entry=next((entry for entry in entries if str(entry.id) == str(metric.habit_entry_id)), None),
            ))

    stale_cutoff = now - timedelta(days=7)
    stale_thoughts = [
        entry
        for entry in open_entries
        if entry.type == "thought" and (entry.last_referenced_at or entry.created_at) <= stale_cutoff
    ][:3]
    for entry in stale_thoughts:
        jobs.append(PromptJobOut(
            kind="stale_thought",
            title="Thought resurfacing",
            message=f"{entry.title} is still open. Decide whether it needs action, rest, or closure.",
            route="/thoughts",
            scheduled_for=now,
            priority="low",
            related_entry=entry,
        ))

    jobs.append(PromptJobOut(
        kind="daily_essence",
        title="Daily Essence",
        message="Generate the user's one content-aware nudge for today.",
        route="/capture",
        scheduled_for=now.replace(hour=8, minute=0, second=0, microsecond=0) if now.hour < 8 else now + timedelta(days=1),
        priority="medium",
    ))

    days_until_monday = (7 - now.weekday()) % 7 or 7
    next_monday = (now + timedelta(days=days_until_monday)).replace(hour=8, minute=30, second=0, microsecond=0)
    jobs.append(PromptJobOut(
        kind="weekly_review",
        title="Weekly Review",
        message="Generate the weekly mirror: wins, missed tasks, habits, cognitive themes, and next pressure points.",
        route="/weekly-review",
        scheduled_for=next_monday,
        priority="medium",
    ))

    priority_order = {"high": 0, "medium": 1, "low": 2}
    jobs = sorted(jobs, key=lambda job: (priority_order[job.priority], job.scheduled_for))[:12]
    return PromptPlanOut(generated_at=now, timezone=timezone, jobs=jobs)
