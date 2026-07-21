# Pinapeg

Voice-first personal schedule and thought companion. Pinapeg turns a typed or spoken capture into a confirmed calendar event, reminder, open thought, research paper, scholarship application, habit, or answer based on saved memory.

## Structure

- `frontend` - React + TypeScript PWA.
- `backend` - FastAPI domain API, capture pipeline, and worker entry point.
- `infra` - setup notes for Neon, Neon Auth, Redis, and Google OAuth.

The root folder is meant to be opened directly in any IDE. Frontend, backend, and infrastructure stay separated so local development and deployment remain clear.

## Hackathon Fit: Apps For Your Life

**Category:** Apps for your life ? a consumer app for keeping thoughts, deadlines, learning, applications, and everyday routines in one calm personal space.

Pinapeg is intentionally not a second task manager. Its core interaction is an uncapped typed or voice capture; the user can put down the thought first, then confirm a useful form of it. Schedule and habits remain separate: schedule is for dated commitments, while habits are repeated rhythms. Daily Essence and Weekly Review bring useful context back without turning the product into a noisy dashboard.

## Key Product Decisions

| Decision | Why it matters |
| --- | --- |
| Neon Postgres only for durable data | One production source of truth for user records, embeddings, and integrations. |
| Neon Auth + Google | Familiar, low-friction sign-in with no duplicate email/password flow. |
| Capture first | Users do not need to decide whether an idea is a task, paper, scholarship, habit, or thought before recording it. |
| PWA first | Pinapeg is installable from a browser now; an Android wrapper can follow later without blocking access. |
| Zero-installation SQLite queue | Daily prompts and review jobs use a local SQLite queue, avoiding Docker or external services for the local demo. |

## Local Development

1. Copy `frontend/.env.example` to `frontend/.env` and `backend/.env.example` to `backend/.env`.
2. Create a Neon Postgres database, enable `vector`, and put the direct Neon `postgresql://...` connection string in `backend/.env`.
3. When ready for Google sign-in/sign-up, enable Neon Auth and put its public auth URL in `frontend/.env` as `VITE_NEON_AUTH_URL`.
4. In `backend`, create a Python 3.11+ virtual environment, activate it, install dependencies with `pip install -e .[dev]`, run `python -m alembic upgrade head`, then start `python -m uvicorn app.main:app --reload --port 8000`.
5. In `frontend`, run `npm install`, then `npm.cmd run dev` on Windows.

If Neon is not ready yet, leave `STORAGE_MODE=memory` and `DATABASE_URL=` in `backend/.env`; the API will still run locally without PostgreSQL. Only run `python -m alembic upgrade head` after you paste a real Neon `DATABASE_URL` and switch `STORAGE_MODE=postgres`.

If the browser keeps showing an older UI, clear the old PWA service worker once or run the fresh dev port:

```cmd
cd /d "C:\Users\USER\Documents\Python Project\pinapeg\frontend"
npm.cmd run dev:fresh
```

## Backend venv recovery on Windows Command Prompt

If `backend/.venv` points to a missing Python path or commands fail with `No suitable Python runtime found`, recreate it from Command Prompt:

```cmd
cd /d "C:\Users\USER\Documents\Python Project\pinapeg\backend"
rmdir /s /q .venv
py -3.11 -m venv .venv
```

If `py -3.11` does not detect Python, use the direct Python 3.11 path:

```cmd
"C:\Users\USER\AppData\Local\Programs\Python\Python311\python.exe" -m venv .venv
```

Then activate and install:

```cmd
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -e .[dev]
```

After filling `backend/.env` with Neon settings, run migrations and start the API:

```cmd
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --port 8000
```

Optional quick syntax check:

```cmd
python -m compileall app
```

Full local test order after both `.env` files are filled:

```cmd
cd /d "C:\Users\USER\Documents\Python Project\pinapeg\backend"
.venv\Scripts\activate.bat
python -m pip install -e .[dev]
python -m alembic upgrade head
python -m compileall app
python -m uvicorn app.main:app --reload --port 8000
```

In another Command Prompt window:

```cmd
cd /d "C:\Users\USER\Documents\Python Project\pinapeg\frontend"
npm.cmd install
npm.cmd run build
npm.cmd run dev:fresh
```

Quick API checks after the backend is running:

```cmd
curl http://localhost:8000/health
curl http://localhost:8000/v1/config/status
```

Worker/Redis check after `REDIS_URL` is filled:

```cmd
cd /d "C:\Users\USER\Documents\Python Project\pinapeg\backend"
.venv\Scripts\activate.bat
python -m app.worker preview --user-id local-demo-user
python -m app.worker enqueue --user-id local-demo-user
python -m app.worker run-once --user-id local-demo-user
```

## Memory

Neon Postgres stores the durable entries. When `OPENAI_API_KEY` is set, the backend also writes pgvector embeddings into `entry_embeddings` and uses semantic similarity for related-memory suggestions. Without an OpenAI key, Pinapeg falls back to local keyword matching.

## Voice Capture

The mic UI records in the browser and sends audio directly to FastAPI. Browser mic access works on `localhost` or HTTPS after the user grants permission. Full speech-to-text needs `OPENAI_API_KEY` in `backend/.env`; without it, typed capture still works and voice capture falls back to a placeholder proposal.

## PWA First

Pinapeg is structured as a PWA first: Vite builds a web manifest and service worker through `vite-plugin-pwa`, so users can install it from the browser without Play Store release costs. A native Android APK can come later by wrapping the PWA with a Trusted Web Activity or Capacitor after the web app is stable.

## Current Product Surfaces

- `Welcome` - first screen at `/` with a short reveal onboarding, lightweight preference capture, and production-style Google sign-in entry.
- `Account` - view-first profile with editable name, role, focus, work mode, timezone, Google Calendar/Gmail connections, push preferences, and Daily Essence status.
- `Capture` - typed/voice entry point with starters for papers, scholarships, and habits.
- `Schedule` - day/week/month calendar strip plus a clean timeline for dated reminders, events, and deadlines.
- `Papers` - research shelf with authors, abstracts, source links, and read status.
- `Paper intelligence` - enrich saved papers with PDF text extraction, summary, BibTeX, and paper Q&A when a public PDF/arXiv source is available.
- `Scholarships` - application cockpit with active opportunities, deadline radar, task progress, fit notes, essay vault direction, and reloadable decomposed tasks.
- `Habits` - daily logging plus streak/completion analytics.
- `Weekly Review` - accountability summary for milestones, slipping habits, papers, and deadlines.
- `Daily Essence` - once-per-day personal nudge derived from the user's own open deadlines, habits, papers, scholarships, and thoughts.
- `CV timeline` - completed entries marked as CV-worthy.

## Quick Demo And Sample Data

No seed import is required. Start with `STORAGE_MODE=memory` for a safe demonstration, or use your Neon database after migrations. In Capture, try one line at a time:

- `Submit my Chevening application by October 7 and remind me to ask Ada for a reference.`
- `Read the arXiv paper on retrieval augmented generation this weekend.`
- `I keep avoiding my portfolio because I am unsure what to show.`
- `Walk for 20 minutes after work on weekdays.`

The confirm step lets you keep, classify, and schedule the result. For the research demo, paste an arXiv or public PDF link in Papers, then run enrichment for text extraction, summary, BibTeX, and grounded Q&A.

Useful backend env values:

```env
STORAGE_MODE=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
OPENAI_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
```

## Neon And Valkey-Compatible Jobs
Paste Neon's direct `postgresql://...` connection string as-is. The backend normalizes it to the installed Psycopg 3 SQLAlchemy driver before opening connections or running Alembic migrations.

No queue server is required for the local hackathon demo: leave the queue variables blank and Pinapeg uses its in-process fallback. This avoids Docker and any local service installation while you test capture, schedule, review, papers, and scholarships.

When background prompts are ready, **Valkey** is the recommended free, open-source choice over KeyDB. Valkey speaks the same Redis protocol, so the existing Python `redis` client and `REDIS_*` variable names remain intentionally compatible. On Windows, use WSL if you later self-host Valkey; Docker is not required. A managed Redis/Valkey-compatible endpoint is also fine for Render production.

KeyDB is compatible too, but it does not offer a meaningful advantage for this project. See the official [Valkey installation guide](https://valkey.io/topics/installation/) and [Valkey migration guide](https://valkey.io/topics/migration/) if you choose to run it yourself.

Use the Redis protocol URL, not an HTTPS REST endpoint:

```env
REDIS_URL=rediss://USERNAME:PASSWORD@HOST:PORT
```

If the Redis dashboard gives you Python fields instead of a URL, use this style in `backend/.env`:

```env
REDIS_HOST=your-redis-host
REDIS_PORT=17587
REDIS_USERNAME=default
REDIS_PASSWORD=your-redis-password
REDIS_SSL=false
```

Do not paste the Redis dashboard Python snippet into `.env`. Copy only the host, port, username, password, and SSL setting into the variables above. Keep the real password out of README and Git.

## Credentials

Frontend public values go in `frontend/.env`. Neon, Google OAuth, OpenAI, encryption, and worker secrets go in `backend/.env`.

The frontend Capture workspace is at `/capture`. The root `/` route is the auth/welcome beginning.

The welcome Google button uses the official `@neondatabase/auth` client. Do not open the raw Neon Auth URL directly in the browser as the sign-in page; the client starts the Google OAuth flow from `VITE_NEON_AUTH_URL`.

`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are only for Web Push/PWA notifications. The public key can be exposed to the browser later as `VITE_VAPID_PUBLIC_KEY`; the private key must stay in `backend/.env`. Leave them blank until push reminders are enabled.

Google OAuth redirect URI:

```text
http://localhost:8000/v1/integrations/google/callback
```

See `infra/neon/README.md`, `infra/neon-auth/README.md`, and `infra/google-oauth/README.md` for setup details.

After Google Calendar or Gmail is connected, Account exposes a `Sync check` action. It refreshes the stored Google token and scans a small recent/upcoming sample so credentials can be verified before full auto-import is enabled.

## Architecture Boundaries

Neon Postgres is the source of truth for Pinapeg users, records, Google connection metadata, and memory. Redis is for short-lived queues, jobs, and scheduling coordination. FastAPI owns AI calls, direct voice transcription, Google OAuth credentials, scheduled work, and all product-data writes.

Daily Essence is available immediately through the API and frontend popup. Later, Redis should schedule and deliver it by user timezone through push/email/in-app notifications.

Schedule and habits remain separate concepts. Schedule is for dated commitments and deadline prompts. Habits are repeated rhythms and streaks. Redis should later orchestrate both, plus weekly review generation, without merging their product meaning.

The backend now exposes `GET /v1/prompt-plan` as a Redis-ready preview of what the worker should enqueue later: deadline nudges, habit rhythm checks, stale-thought resurfacing, Daily Essence generation, and Weekly Review generation.

Paper enrichment uses `pypdf`, so rerun `pip install -e .[dev]` in `backend` after pulling these changes. arXiv links and direct PDF URLs can be full-text extracted now. DOI entries retrieve Crossref metadata; full-text extraction depends on having a public PDF source.

Local worker preview:

```cmd
cd /d "C:\Users\USER\Documents\Python Project\pinapeg\backend"
.venv\Scripts\activate.bat
python -m app.worker preview --user-id local-demo-user
python -m app.worker run-once --user-id local-demo-user
```

## Codex And GPT-5.6 Contribution

Pinapeg was built with Codex and GPT-5.6 as an implementation partner, while the product direction, provider accounts, credentials, and final review stayed user-owned.

Codex accelerated the workflow by:

- scaffolding the separated React PWA, FastAPI backend, migrations, environment templates, and deployment files;
- translating product ideas into the capture-first domain model, Neon-only data path, and Redis-protocol queue boundary;
- iterating on the mobile bottom navigation, account/integration flow, responsive interaction states, and the paper-reveal Google onboarding;
- tracing the Neon Auth `403 INVALID_CALLBACKURL` to an absolute callback on the fresh localhost port and changing the client to a safe app-relative callback;
- documenting Windows Command Prompt recovery, PWA behavior, Neon, OAuth, Valkey, and deployment steps.

Use this as an honest technical implementation note in the submission: GPT-5.6 and Codex accelerated scaffolding, debugging, UI iteration, and documentation; human judgment made the product choices and reviewed the results.

### Codex Feedback Session ID

Before submitting, run `/feedback` in the Codex task where most of Pinapeg was built. Copy the generated session ID into the hackathon form and, if useful, paste it below. Do not invent an ID manually.

```text
Codex feedback session ID: 6814531f-d21d-4517-9b03-6023d12078dc
```

### Hackathon Submission Checklist

- [ ] State the **Apps for your life** category and the capture-first personal companion concept.
- [ ] Link the deployed Vercel frontend and Render backend once published.
- [ ] Include this README and the `/feedback` session ID from the core Codex task.
- [ ] Keep all `.env` files and provider secrets out of the repository.

## Deployment

Frontend deploy target: Vercel.

- Use the `frontend` folder as the Vercel project root.
- `frontend/vercel.json` sets Vite, `npm run build`, `dist`, and SPA rewrites.
- Production frontend env:
  - `VITE_API_URL=https://YOUR_RENDER_API.onrender.com/v1`
  - `VITE_NEON_AUTH_URL=...`
  - `VITE_VAPID_PUBLIC_KEY=...`

Backend deploy target: Render Blueprint.

- `render.yaml` lives at the repo root and points Render to `backend` through `rootDir`.
- Render runs `python -m alembic upgrade head` before starting the API.
- Render start command binds to `$PORT` with Uvicorn.
- Fill all `sync: false` values in the Render Dashboard; do not commit real secrets.
- Production backend env values to fill in Render:
  - `DATABASE_URL`
  - `REDIS_URL` or `REDIS_HOST` / `REDIS_PORT` / `REDIS_USERNAME` / `REDIS_PASSWORD` / `REDIS_SSL`
  - `CORS_ORIGINS=https://YOUR_VERCEL_DOMAIN`
  - `FRONTEND_APP_URL=https://YOUR_VERCEL_DOMAIN`
  - `OPENAI_API_KEY`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI=https://YOUR_RENDER_API.onrender.com/v1/integrations/google/callback`
  - `GOOGLE_OAUTH_STATE_SECRET`
  - `TOKEN_ENCRYPTION_KEY`
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`

Important: Render Blueprints require a real Git repo pushed to GitHub, GitLab, or Bitbucket. This local folder must be initialized/committed/pushed before Render can read `render.yaml`.
