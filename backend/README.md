# Pinapeg API

Install Python 3.11+, then run:

```cmd
cd /d "C:\Users\USER\Documents\Python Project\pinapeg\backend"
py -3.11 -m venv .venv
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -e .[dev]
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --port 8000
```

`ALLOW_DEV_IDENTITY=true` permits the local PWA's `X-Pinapeg-User-Id` header. Never rely on that header as production authentication.

## Worker preview

The worker is Redis-ready but can run locally without Redis:

```cmd
cd /d "C:\Users\USER\Documents\Python Project\pinapeg\backend"
.venv\Scripts\activate.bat
python -m app.worker preview --user-id local-demo-user
python -m app.worker enqueue --user-id local-demo-user
python -m app.worker run-once --user-id local-demo-user
```

`preview` shows the prompt jobs Redis will later enqueue. `run-once` handles due jobs using the in-process queue until `REDIS_URL` is wired.

Google Calendar and Gmail credentials live only in `backend/.env`. The callback URI is:

```text
http://localhost:8000/v1/integrations/google/callback
```
