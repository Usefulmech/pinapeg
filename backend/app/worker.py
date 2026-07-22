"""Worker entry point.

Local mode can preview and run prompt jobs without Redis. Production mode should
run this process separately, use Redis to schedule/claim jobs, and deliver Web
Push/in-app notifications from the claimed jobs.
"""
import argparse
import json
import logging
from datetime import UTC, datetime

from .job_handlers import handle_prompt_job
from .prompt_queue import prompt_queue, queue_backend_name
from .prompting import build_prompt_plan

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def enqueue_prompt_plan(user_id: str, timezone: str = "Africa/Lagos") -> int:
    plan = build_prompt_plan(user_id, timezone)
    count = prompt_queue.enqueue_many(user_id, plan.jobs)
    logger.info("Queued %s prompt job(s) using %s backend.", count, queue_backend_name())
    return count


def run_due_prompt_jobs(user_id: str, timezone: str = "Africa/Lagos") -> list[dict]:
    if not prompt_queue.pending:
        enqueue_prompt_plan(user_id, timezone)
    due = prompt_queue.due(now=datetime.now(UTC))
    outcomes = [handle_prompt_job(envelope.user_id, envelope.job) for envelope in due]
    logger.info("Handled %s due prompt job(s).", len(outcomes))
    return outcomes


def preview_prompt_plan(user_id: str, timezone: str = "Africa/Lagos") -> dict:
    plan = build_prompt_plan(user_id, timezone)
    return plan.model_dump(mode="json")


import time


def main() -> None:
    parser = argparse.ArgumentParser(description="Pinapeg prompt worker")
    parser.add_argument("command", choices=["preview", "enqueue", "run-once", "loop"], nargs="?", default="preview")
    parser.add_argument("--user-id", default="local-demo-user")
    parser.add_argument("--timezone", default="Africa/Lagos")
    parser.add_argument("--interval", type=int, default=60, help="Interval in seconds for loop mode")
    args = parser.parse_args()

    if args.command == "preview":
        print(json.dumps(preview_prompt_plan(args.user_id, args.timezone), indent=2))
        return

    if args.command == "enqueue":
        print(json.dumps({"queued": enqueue_prompt_plan(args.user_id, args.timezone), "backend": queue_backend_name()}, indent=2))
        return

    if args.command == "loop":
        logger.info("Starting worker loop mode (polling every %ss)...", args.interval)
        try:
            while True:
                outcomes = run_due_prompt_jobs(args.user_id, args.timezone)
                if outcomes:
                    logger.info("Processed %s job(s): %s", len(outcomes), outcomes)
                time.sleep(args.interval)
        except KeyboardInterrupt:
            logger.info("Worker loop stopped.")
        return

    outcomes = run_due_prompt_jobs(args.user_id, args.timezone)
    print(json.dumps({"handled": len(outcomes), "outcomes": outcomes, "backend": queue_backend_name()}, indent=2))


if __name__ == "__main__":
    main()
