# Neon Postgres Setup

Neon is the Postgres path for Pinapeg.

## Create the database

1. Create a Neon project.
2. Open SQL Editor and enable pgvector:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

3. Copy the direct connection string, not the pooled `-pooler` string, for Alembic migrations.
4. Put it in `backend/.env`:

```env
STORAGE_MODE=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
```

The backend also accepts `postgres://...` and `postgresql+psycopg://...`. If you paste the normal Neon `postgresql://...` URL, Pinapeg converts it to the installed Psycopg 3 SQLAlchemy driver internally.

5. Run migrations from `backend`:

```cmd
cd /d "C:\Users\USER\Documents\Python Project\pinapeg\backend"
.venv\Scripts\activate.bat
python -m alembic upgrade head
```

Alembic reads `backend/.env`, so migrations target the same Neon database as the API.

## Direct vs pooled

Use Neon's direct connection string for schema migrations. The pooled connection is useful later for deployed API runtime traffic, but migrations should not run through PgBouncer transaction pooling.

## Redis

Neon does not provide Redis. Pinapeg treats Redis as a separate worker/job service. For now the app can run without Redis; when background jobs become active, use one of:

- Upstash Redis
- Redis Cloud

Set it as:

```env
REDIS_URL=rediss://...
```

Do not paste an HTTPS REST URL into `REDIS_URL`; the backend worker uses the Redis protocol client.
