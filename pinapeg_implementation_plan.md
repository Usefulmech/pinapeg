# Pinapeg - Neon-First Implementation Plan

## Latest validation status

Validated on the local workspace after `.env` files were filled:

- Backend venv resolves to Python 3.11.7 after sandbox access is allowed.
- `pip install -e .[dev]` completed with `pypdf` and Alembic installed.
- `python -m alembic upgrade head` completed against the configured Neon database.
- FastAPI smoke checks passed for health, config status, profile, integrations, typed capture, confirmation, entry listing, and Daily Essence.
- Research-paper smoke passed for arXiv capture, Neon save, PDF full-text extraction, BibTeX generation, and semantic paper Q&A.
- Frontend `npm.cmd run build` now passes from Command Prompt and generates the PWA service worker/manifest.

## Current implementation decisions

- Project layout stays IDE-friendly at the root: `frontend/`, `backend/`, and `infra/`.
- Neon Postgres is the only durable database route for product data, users, Google connection records, and semantic memory.
- Neon is the preferred development and deployment database for product data.
- The backend accepts the normal Neon `postgresql://...` connection string and normalizes it to the installed Psycopg 3 driver internally.
- Alembic migrations read `backend/.env`, so migrations and the API point at the same database.
- Redis is separate from Neon and remains optional until background workers, reminders, and Gmail scans need queues.
- Neon Auth is the selected production auth route for Google sign-in/sign-up. Local `X-Pinapeg-User-Id` remains only as a development fallback until the Neon Auth SDK is installed and wired.
- Voice capture sends audio directly to FastAPI for transcription. No external storage provider is required.
- Pinapeg is PWA-first: installable browser app now, optional Android APK wrapper later.
- Root `/` is the welcome beginning. The active capture workspace lives at `/capture`.
- Desktop navigation stays restrained: Capture, Schedule, History, and Account, with module shelves and Review behind More. Account is a separate profile/settings surface with Profile and Settings/Integrations subsections. Mobile keeps the same three prominent bottom links.
- Google Calendar/Gmail Settings support a credential `Sync check` before full auto-import/review queues are enabled.
- Daily Essence is an in-app daily nudge now and becomes a Redis-scheduled prompt/push later.

## Product outcome

Pinapeg is a mobile-first PWA where a user can speak or type freely. The app turns input into a confirmed event, reminder, open thought, research paper, scholarship application, habit, or memory answer.

The app supports:

- `CREATE` — dated event/reminder saved to Pinapeg and later synced to Google Calendar after confirmation.
- `REMINDER_ONLY` — actionable item without a specific time.
- `OPEN_THOUGHT` — undated idea, concern, commitment, or reflection.
- `QUERY` — answer based on saved memory.
- `TRACK_PAPER` — research paper capture with metadata.
- `TRACK_SCHOLARSHIP` — scholarship capture with deadline and decomposed tasks.
- `LOG_HABIT` — daily or recurring habit tracking.

## Product module boundaries

| Module | Job | Not its job |
|---|---|---|
| Capture | Fast intake for voice, text, links, questions, habits, papers, and scholarship opportunities. | Long-term organization or accountability. |
| Thoughts | Unresolved meaning, ideas, worries, reflections, and things that are not yet tasks. | Streaks, deadlines, or research metadata. |
| Habits | Repeatable rhythms with daily logging, streaks, and completion analytics. | One-off tasks or vague reflections. |
| Papers | Research objects with source links, authors, abstracts, reading status, and follow-ups. | General thoughts or scholarship project planning. |
| Scholarships | Deadline goals with decomposed tasks and application progress. | Daily habit streaks or generic reminders. |
| Schedule | Dated events and reminders that need time awareness. | Deep reflection or research shelving. |
| Review | Accountability summary across modules. | Primary capture or raw data entry. |
| Daily Essence | One daily motivational/content-aware prompt derived from the user's own saved material. | Full weekly/monthly review replacement. |

## Prompting and review rhythm

Pinapeg should separate the meaning of an entry from the prompting system that wakes it up.

| Source module | What it represents | Redis/worker prompting behavior |
|---|---|---|
| Schedule | Time-bound events, reminders, deadlines, and one-off commitments. | Queue due-time reminders, pre-deadline nudges, missed-deadline follow-ups, and calendar sync jobs. |
| Habits | Repeated personal rhythms the user wants to build. | Queue recurring check-ins, streak recovery prompts, gentle missed-day nudges, and habit review stats. |
| Scholarships | Deadline goals with decomposed tasks. | Queue milestone reminders, application-deadline warnings, and overdue task nudges. |
| Papers | Research items to read, revisit, or summarize. | Queue reading follow-ups only when the user asks or the paper becomes part of a goal/review. |
| Thoughts | Open cognitive/emotional material that may need closure. | Queue soft resurfacing prompts when stale, but avoid treating every thought like a task. |
| Daily Essence | One short motivational/context-aware prompt for the day. | Generate or deliver once per user timezone day, based on schedule pressure, slipping habits, open goals, unread papers, and stale thoughts. |
| Weekly Review | Growth/accountability snapshot. | Generate weekly by user timezone, showing wins, missed tasks, habit movement, cognitive themes, deadlines, and suggested next loop. |

Review is not a normal task list. It should feel like a weekly mirror: what moved, what was missed, what pattern is forming, what the user keeps thinking about, and what deserves attention next.

## Technical architecture

```text
React + TypeScript + Vite PWA
  └─ FastAPI client: product data, voice audio, Google connect actions
              │
              ▼
FastAPI service
  ├─ Neon Auth identity next; local/dev identity fallback now
  ├─ direct voice transcription with OpenAI when configured
  ├─ Google OAuth connection and sync checks
  ├─ capture/proposal/confirmation API
  ├─ recap, analytics, and accountability logic
  └─ SQLAlchemy + Alembic
              │
              ▼
Neon Postgres + pgvector
  ├─ users
  ├─ entries
  ├─ oauth_connections
  ├─ habit_logs
  └─ entry_embeddings
```

## Ownership rules

| Concern | Owner |
|---|---|
| Users and profile data | Neon Postgres |
| Product records, statuses, reminders, conversations | Neon Postgres |
| Embeddings and semantic retrieval | Neon Postgres + pgvector |
| Google Calendar/Gmail authorization | FastAPI + encrypted Neon record |
| Voice capture | Browser MediaRecorder → FastAPI direct upload |
| AI, scheduled work, push dispatch | FastAPI worker |
| Queues and scheduled job coordination | Redis later, separate from Neon |

## Security and identity

Development uses `ALLOW_DEV_IDENTITY=true` and `X-Pinapeg-User-Id` from the local PWA. This is only a local convenience.

Production auth is Neon Auth with Google sign-in/sign-up. Neon Auth stores users and sessions in Neon, while the backend continues to own product-data writes and authorization checks.

Google Calendar/Gmail connection remains separate from app identity. It is only for access to calendar/email APIs, and refresh tokens stay encrypted in Neon.

## Data model

Core tables:

- `users`
  - `id UUID PK`
  - `external_user_id TEXT UNIQUE NOT NULL`
  - `email`, `display_name`, `avatar_url`
  - `timezone`
  - `created_at`, `updated_at`
- `oauth_connections`
  - Google Calendar/Gmail refresh-token records encrypted at rest.
- `entries`
  - events, tasks, thoughts, project milestones, habits, research papers, scholarship applications.
- `habit_logs`
- `entry_embeddings`
- Future: reminders, push subscriptions, conversation turns, reminder deliveries.

## API map

- `GET /health`
- `GET /v1/config/status`
- `GET /v1/me`
- `GET /v1/integrations`
- `GET /v1/integrations/google/{provider}/connect`
- `GET /v1/integrations/google/callback`
- `POST /v1/integrations/google/{provider}/sync`
- `DELETE /v1/integrations/google/{provider}`
- `POST /v1/capture/text`
- `POST /v1/capture/audio`
- `POST /v1/capture/{proposal_id}/confirm`
- `POST /v1/capture/{proposal_id}/discard`
- `GET /v1/entries`
- `PATCH /v1/entries/{entry_id}`
- `GET /v1/entries/{entry_id}/children`
- `POST /v1/entries/{entry_id}/complete|resolve|reopen`
- `POST /v1/entries/{entry_id}/decompose`
- `POST /v1/habits/{entry_id}/log`
- `POST /v1/papers/{entry_id}/enrich`
- `POST /v1/papers/{entry_id}/ask`
- `POST /v1/recaps`
- `POST /v1/ai-weekly-review`
- `GET /v1/daily-essence`
- `GET /v1/prompt-plan`
- `GET /v1/analytics/habits`
- `GET /v1/analytics/cv-timeline`

## Frontend routes

| Route | Purpose |
|---|---|
| `/` and `/welcome` | Welcome/auth entry and integration introduction |
| `/capture` | Mic, typed input, proposals, query answer |
| `/schedule` | Confirmed dated items |
| `/thoughts` | Open/resolved thoughts |
| `/papers` | Research shelf |
| `/projects` | Scholarships and decomposed task plans |
| `/habits` | Habit logging and analytics |
| `/cv-timeline` | Completed CV-worthy milestones |
| `/history` | Searchable capture history |
| `/weekly-review` | Accountability review |
| `/account` | Profile, user info, app settings, Google Calendar/Gmail connect, sync check |
| `/settings` | Back-compatible alias for Account and Google callback handling |

Daily Essence is not a separate route yet. It is a once-per-day in-app popup that can send the user into the relevant route.

## Delivery phases

### Phase 0 — foundation and shell

React PWA, FastAPI, Neon migrations, direct voice endpoint, clean navigation, local profile identity.

### Phase 1 — Neon activation and auth preparation

Enable Neon, run Alembic, switch `STORAGE_MODE=postgres`, verify entries persist across backend restarts, enable Neon Auth, and add `VITE_NEON_AUTH_URL`.

Current Phase 1 progress:

- Backend env now includes the Neon/Postgres, Google OAuth, OpenAI, token encryption, Redis, and VAPID placeholders needed for final setup.
- Frontend Google entry redirects to `VITE_NEON_AUTH_URL` when configured, with local profile fallback while Neon Auth is not filled.

### Phase 2 — typed capture, habits, papers, scholarships

Strengthen intent parsing, metadata extraction, habit analytics, scholarship plans, and research shelf.

Current Phase 2 progress:

- Research, Scholarships, and Habits now have guided quick-entry panels on their own pages.
- The panels still use the central capture/confirm pipeline, so Pinapeg keeps one product brain instead of three separate entry systems.
- Backend fallback parsing recognizes guided research-paper entries even when the user types a title instead of a DOI/link.
- Habit entries refresh analytics after save; scholarship entries can immediately become decomposed task plans; paper entries land directly in the reading shelf.
- Paper intelligence now enriches saved papers with PDF/arXiv text extraction, summary generation, BibTeX, and per-paper Q&A.

### Phase 3 — Google integrations

Complete Google Calendar write sync, Gmail scan review queue, reconnect/disconnect/error states.

### Phase 4 — semantic memory and AI review

OpenAI embeddings, pgvector related-memory retrieval, AI weekly review, Daily Essence enrichment, CV timeline enrichment.

### Phase 5 — reminders and background jobs

Redis-backed worker queue, `prompt-plan` enqueue loop, daily review/essence prompt by user timezone, reminder dispatch, Web Push, proactive accountability.

Current worker scaffold:

- `app.prompting` builds Redis-ready prompt plans.
- `app.prompt_queue` provides the queue adapter seam; it is in-process now and should move to Redis when `REDIS_URL` is ready.
- `app.job_handlers` turns prompt jobs into Daily Essence, Weekly Review, deadline, habit, and stale-thought delivery payloads.
- `python -m app.worker preview|enqueue|run-once` is the local worker CLI.

### Phase 6 — release hardening

Accessibility, PWA install QA, offline/cache review, migrations/backups, security review, deployment, optional Android wrapper research, and removal of the local development identity fallback.
