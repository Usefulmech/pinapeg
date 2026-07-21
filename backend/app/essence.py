"""Daily Essence: a small personal nudge derived from a user's own Pinapeg memory."""

from datetime import UTC, datetime, timedelta

from .schemas import DailyEssenceOut, EntryOut
from .store import store


def _route_for(entry: EntryOut | None) -> str:
    if entry is None:
        return "/capture"
    return {
        "event": "/schedule",
        "task": "/schedule",
        "thought": "/thoughts",
        "project_milestone": "/projects",
        "habit": "/habits",
        "research_paper": "/papers",
        "scholarship_app": "/projects",
    }.get(entry.type, "/capture")


def _module_counts(entries: list[EntryOut]) -> dict[str, int]:
    open_entries = [entry for entry in entries if entry.status == "open"]
    return {
        "thoughts": len([entry for entry in open_entries if entry.type == "thought"]),
        "habits": len([entry for entry in open_entries if entry.type == "habit"]),
        "papers": len([entry for entry in open_entries if entry.type == "research_paper"]),
        "scholarships": len([entry for entry in open_entries if entry.type == "scholarship_app"]),
        "deadlines": len([entry for entry in open_entries if entry.scheduled_at is not None]),
    }


def create_daily_essence(user_id: str) -> DailyEssenceOut:
    entries = store.list_entries(user_id)
    now = datetime.now(UTC)
    counts = _module_counts(entries)
    open_entries = [entry for entry in entries if entry.status == "open"]

    upcoming_deadlines = sorted(
        [
            entry
            for entry in open_entries
            if entry.scheduled_at and entry.scheduled_at >= now and entry.scheduled_at <= now + timedelta(days=14)
        ],
        key=lambda entry: entry.scheduled_at or entry.created_at,
    )
    if upcoming_deadlines:
        entry = upcoming_deadlines[0]
        return DailyEssenceOut(
            date=now.date().isoformat(),
            focus_type="deadline",
            title="Protect the next deadline.",
            message=f"{entry.title} is the closest pressure point. Give it one small move before adding new plans.",
            suggested_action="Open the deadline",
            route=_route_for(entry),
            related_entry=entry,
            module_counts=counts,
        )

    habit_metrics = store.habit_analytics(user_id)
    slipping_metric = next((metric for metric in habit_metrics if metric.current_streak == 0 or metric.completion_rate < 0.5), None)
    if slipping_metric:
        entry = next((candidate for candidate in entries if str(candidate.id) == str(slipping_metric.habit_entry_id)), None)
        return DailyEssenceOut(
            date=now.date().isoformat(),
            focus_type="habit",
            title="Return to one rhythm.",
            message=f"{slipping_metric.title} needs a light touch today. Do the smallest honest version and log it.",
            suggested_action="Open habits",
            route="/habits",
            related_entry=entry,
            module_counts=counts,
        )

    scholarship = next((entry for entry in open_entries if entry.type == "scholarship_app"), None)
    if scholarship:
        return DailyEssenceOut(
            date=now.date().isoformat(),
            focus_type="scholarship",
            title="Move one application forward.",
            message=f"{scholarship.title} does not need a heroic session. One document, one outline, or one requirement check is enough.",
            suggested_action="Open scholarships",
            route="/projects",
            related_entry=scholarship,
            module_counts=counts,
        )

    paper = next((entry for entry in open_entries if entry.type == "research_paper"), None)
    if paper:
        return DailyEssenceOut(
            date=now.date().isoformat(),
            focus_type="research",
            title="Keep the research shelf alive.",
            message=f"Spend ten minutes with {paper.title}, then mark whether it is worth deeper reading.",
            suggested_action="Open papers",
            route="/papers",
            related_entry=paper,
            module_counts=counts,
        )

    thought = next((entry for entry in sorted(open_entries, key=lambda item: item.last_referenced_at or item.created_at) if entry.type == "thought"), None)
    if thought:
        return DailyEssenceOut(
            date=now.date().isoformat(),
            focus_type="thought",
            title="Revisit the thought underneath the noise.",
            message=f"{thought.title} is still open. Decide whether it needs action, rest, or closure.",
            suggested_action="Open thoughts",
            route="/thoughts",
            related_entry=thought,
            module_counts=counts,
        )

    return DailyEssenceOut(
        date=now.date().isoformat(),
        focus_type="capture",
        title="Capture the signal of today.",
        message="Save one thing that matters: a deadline, a paper, a worry, a habit, or a small win. Pinapeg gets better when your real life enters it.",
        suggested_action="Capture one thing",
        route="/capture",
        related_entry=None,
        module_counts=counts,
    )
