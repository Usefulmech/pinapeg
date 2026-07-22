# Pinapeg

Voice-first personal schedule and thought companion. Pinapeg turns a typed or spoken capture into a confirmed calendar event, reminder, open thought, research paper, scholarship application, habit, or answer based on saved memory.

## Structure

- `frontend` - React + TypeScript PWA (styled with Vanilla CSS, Plus Jakarta Sans typography, and modern animated glassmorphism).
- `backend` - FastAPI domain API, capture pipeline, worker daemon, and memory store.
- `infra` - setup notes for Neon PostgreSQL, Neon Auth, and Google OAuth.

The root folder is openable directly in any IDE. Frontend, backend, and infrastructure stay separated so local development and deployment remain clear.

---

## Hackathon Fit: Apps For Your Life

**Category:** Apps for your life — a consumer app for keeping thoughts, deadlines, learning, applications, and everyday routines in one calm personal space.

Pinapeg is intentionally not a second task manager. Its core interaction is an uncapped typed or voice capture; the user can put down the thought first, then confirm a useful form of it. Schedule and habits remain separate: schedule is for dated commitments, while habits are repeated rhythms. Daily Essence and Weekly Review bring useful context back without turning the product into a noisy dashboard.

---

## Key Product & Architectural Decisions

| Decision | Why it matters |
| --- | --- |
| **Neon Postgres (Serverless)** | Durable single source of truth for users, entries, pgvector embeddings, and OAuth connections. |
| **Neon Auth + Google** | Low-friction sign-in with Google OAuth and zero password management overhead. |
| **Capture First** | Users do not need to decide whether an idea is a task, paper, scholarship, habit, or thought before recording it. |
| **PWA & Native Install** | Browser-installable PWA (`vite-plugin-pwa`) with offline precaching, push notifications, and sound chimes. |
| **Zero-Dependency SQLite Queue** | Daily prompts, essence nudges, and weekly review jobs use a zero-installation SQLite queue (`queue.db`), avoiding Docker or Redis server dependencies. |
| **Strict Auth Guard (`RequireAuth`)** | Protects all app routes (`/capture`, `/schedule`, etc.) and redirects unauthenticated visitors directly to `/welcome`, eliminating pre-auth visual leaks. |
| **Unified Typography & Design** | `Plus Jakarta Sans` heading hierarchy, system-wide arc/pill rounded buttons (`border-radius: 999px`), left-aligned category guidance, and ambient moving aura cards. |

---

## Local Development

### 1. Environment Setup
- Copy `frontend/.env.example` to `frontend/.env`
- Copy `backend/.env.example` to `backend/.env`

### 2. Backend Setup (FastAPI & Python 3.11+)
```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate.bat
pip install -e .[dev]
pip install "psycopg[binary]"
```

Start the FastAPI backend server:
```powershell
python -m uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup (React PWA + Vite)
```powershell
cd frontend
npm install
npm run dev
```

#### Exposing Frontend to Local Network / Mobile Testing:
To test Pinapeg on your mobile phone, tablet, or another device on the same Wi-Fi network, run:
```powershell
npm run dev:host
```
Vite will print your local network address (e.g. `http://192.168.x.x:5173`) to open directly on your mobile browser!

---

## Database Management & Starting Afresh

Pinapeg supports two storage modes (`STORAGE_MODE` in `backend/.env`):
- `STORAGE_MODE=memory` (In-memory storage for rapid local testing).
- `STORAGE_MODE=postgres` (Neon serverless PostgreSQL database).

### Clearing the Database (Starting Afresh)
If you want to clear all user data and start with a 100% clean slate:

#### Option A: Running the Reset Script (Recommended)
Run the built-in database reset script in `backend`:
```powershell
python reset_db.py
```
This connects to your `DATABASE_URL` and safely truncates all tables (`users`, `entries`, `oauth_connections`, `entry_embeddings`, `habit_logs`).

#### Option B: Direct SQL in Neon Console
1. Log into your [Neon Console](https://console.neon.tech).
2. Open the **SQL Editor**.
3. Execute:
   ```sql
   TRUNCATE TABLE users, entries, oauth_connections, entry_embeddings, habit_logs RESTART IDENTITY CASCADE;
   ```

#### Option C: Resetting Browser Local Storage
In your browser DevTools (`F12`), go to **Application → Local Storage** and click **Clear All** (or run `localStorage.clear()` in the Console) to reset local sign-in markers.

---

## Background Worker Daemon

The background worker evaluates prompt schedules, sends morning **Daily Essence** nudges, generates **Weekly Reviews**, and checks habit rhythms.

### Running the Worker:
- **Continuous daemon loop**:
  ```powershell
  python -m app.worker loop --interval 60
  ```
- **Single evaluation run**:
  ```powershell
  python -m app.worker run-once
  ```

---

## Current Product Surfaces

- `Welcome` (`/welcome`) — Clean onboarding reveal, feature highlights, and secure Google sign-in.
- `Capture` (`/capture`) — Typed and voice entry point with quick chips for *Thought*, *Paper*, *Scholarship*, and *Habit*, complete with dynamic faint guidance and active pill feedback.
- `Schedule` (`/schedule`) — Day/week/month calendar strip, Google Calendar sync status, and manual task addition.
- `History` (`/history`) — Flushed-up timeline of past captures, entries, and completed items with 3-dot edit/delete actions.
- `Thoughts` (`/thoughts`) — Loose ideas, questions, and notes shelf.
- `Papers` (`/papers`) — Research shelf with arXiv/DOI automatic metadata lookup, abstract extraction, BibTeX, and PDF Q&A.
- `Scholarships` (`/projects`) — Application cockpit for funding opportunities, link content scraping, task decomposition, and deadline radar.
- `Habits` (`/habits`) — Daily rhythm tracker with completion analytics and streak counters.
- `Weekly Review` (`/weekly-review`) — Structured reflection page featuring an AI coach summary, metric stat grid, and deadline pressure points.
- `Daily Essence` — Once-per-day personalized nudge derived from open deadlines, habits, and research.

---

## Deployment Guidelines

### Frontend (Vercel)
- Set `frontend` as the project root in Vercel.
- Environment variables:
  - `VITE_API_URL=https://YOUR_RENDER_API.onrender.com/v1`
  - `VITE_NEON_AUTH_URL=https://...`
  - `VITE_VAPID_PUBLIC_KEY=...`

### Backend (Render / Cloud Host)
- Root directory: `backend` (or `rootDir: backend` in `render.yaml`).
- Pre-deploy command: `python -m alembic upgrade head` (if using migrations).
- Start command: Uvicorn binding to `$PORT`.
- Environment variables:
  - `STORAGE_MODE=postgres`
  - `DATABASE_URL=postgresql://...`
  - `OPENAI_API_KEY=sk-...`
  - `GOOGLE_CLIENT_ID=...`
  - `GOOGLE_CLIENT_SECRET=...`
  - `GOOGLE_REDIRECT_URI=https://YOUR_RENDER_API.onrender.com/v1/integrations/google/callback`
  - `CORS_ORIGINS=https://YOUR_VERCEL_DOMAIN`
  - `FRONTEND_APP_URL=https://YOUR_VERCEL_DOMAIN`

---

## Hackathon Feedback Session

- **Feedback Session ID**: `6814531f-d21d-4517-9b03-6023d12078dc`
