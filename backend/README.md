# Pinapeg API

Install Python 3.11+, then run:

```cmd
cd /d "C:\Users\USER\Documents\Python Project\pinapeg\backend"
py -3.11 -m venv .venv
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -e .[dev]
python reset_db.py
python -m uvicorn app.main:app --reload --port 8000
```

`ALLOW_DEV_IDENTITY=true` permits the local PWA's `X-Pinapeg-User-Id` header. Never rely on that header as production authentication.

## Background Worker

The background worker runs using a zero-dependency SQLite prompt queue (`queue.db`):

```cmd
cd /d "C:\Users\USER\Documents\Python Project\pinapeg\backend"
.venv\Scripts\activate.bat
python -m app.worker preview --user-id local-demo-user
python -m app.worker run-once --user-id local-demo-user
python -m app.worker loop --interval 60
```

`preview` shows due prompt jobs. `run-once` evaluates and handles due jobs immediately. `loop` runs the background worker daemon continuously.

Google Calendar and Gmail credentials live in `backend/.env`. The callback URI is:

```text
http://localhost:8000/v1/integrations/google/callback
```
