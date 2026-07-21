"""create Pinapeg domain schema with user-scoped vector memory

Revision ID: 0001_domain_schema
Revises:
Create Date: 2026-07-17
"""
from alembic import op

revision = "0001_domain_schema"
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("""
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), external_user_id TEXT UNIQUE NOT NULL,
      email TEXT, display_name TEXT, avatar_url TEXT, timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE oauth_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('google_calendar','google_gmail')), provider_account_email TEXT NOT NULL,
      encrypted_refresh_token TEXT NOT NULL, token_expires_at TIMESTAMPTZ, scopes TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','error')), last_synced_at TIMESTAMPTZ, last_error TEXT,
      UNIQUE(user_id, provider, provider_account_email)
    );
    CREATE TABLE entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('event','task','thought')), intent TEXT NOT NULL CHECK (intent IN ('CREATE','REMINDER_ONLY','OPEN_THOUGHT')),
      title TEXT NOT NULL, notes TEXT, scheduled_at TIMESTAMPTZ, timezone TEXT, end_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','resolved','cancelled')),
      source TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('voice','text','gmail','manual','calendar')),
      calendar_event_id TEXT, calendar_id TEXT,
      calendar_sync_state TEXT NOT NULL DEFAULT 'not_applicable' CHECK (calendar_sync_state IN ('not_applicable','pending','synced','failed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, last_referenced_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}',
      CONSTRAINT event_requires_time CHECK (type <> 'event' OR scheduled_at IS NOT NULL)
    );
    CREATE INDEX entries_user_created_idx ON entries (user_id, created_at DESC);
    CREATE INDEX entries_schedule_idx ON entries (user_id, scheduled_at) WHERE scheduled_at IS NOT NULL;
    CREATE TABLE entry_embeddings (
      entry_id UUID PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL, embedding vector(1536) NOT NULL, model TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX entry_embeddings_hnsw_idx ON entry_embeddings USING hnsw (embedding vector_cosine_ops);
    CREATE INDEX entry_embeddings_user_idx ON entry_embeddings (user_id, created_at DESC);
    CREATE TABLE entry_relations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE, to_entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      relation TEXT NOT NULL CHECK (relation IN ('related','proposed_resolution','supersedes','derived_from')),
      confidence NUMERIC NOT NULL DEFAULT 0.5, created_by TEXT NOT NULL CHECK (created_by IN ('ai','user')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (from_entry_id <> to_entry_id)
    );
    CREATE TABLE conversation_turns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_id UUID REFERENCES entries(id) ON DELETE SET NULL, role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
      input_kind TEXT NOT NULL CHECK (input_kind IN ('voice','text','action')), content TEXT NOT NULL, raw_transcript TEXT, intent_payload JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX conversation_turns_user_created_idx ON conversation_turns (user_id, created_at DESC);
    CREATE TABLE reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      trigger_at TIMESTAMPTZ NOT NULL, state TEXT NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','sent','snoozed','done','cancelled','failed')),
      snoozed_until TIMESTAMPTZ, last_sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX reminders_due_idx ON reminders (trigger_at) WHERE state IN ('scheduled','snoozed');
    CREATE TABLE push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, device_label TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ
    );
    CREATE TABLE reminder_deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), reminder_id UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
      subscription_id UUID NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE, attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      result TEXT NOT NULL CHECK (result IN ('sent','expired','failed')), provider_response TEXT
    );
    """)

def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS reminder_deliveries, push_subscriptions, reminders, conversation_turns, entry_relations, entry_embeddings, entries, oauth_connections, users CASCADE")
