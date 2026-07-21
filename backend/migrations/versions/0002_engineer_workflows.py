"""add engineer workflow entry types and habit logs

Revision ID: 0002_engineer_workflows
Revises: 0001_domain_schema
Create Date: 2026-07-18
"""
from alembic import op

revision = "0002_engineer_workflows"
down_revision = "0001_domain_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_type_check;
    ALTER TABLE entries ADD CONSTRAINT entries_type_check CHECK
      (type IN ('event','task','thought','project_milestone','habit','research_paper','scholarship_app'));
    ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_intent_check;
    ALTER TABLE entries ADD CONSTRAINT entries_intent_check CHECK
      (intent IN ('CREATE','REMINDER_ONLY','OPEN_THOUGHT','TRACK_PAPER','TRACK_SCHOLARSHIP','LOG_HABIT'));
    ALTER TABLE entry_relations DROP CONSTRAINT IF EXISTS entry_relations_relation_check;
    ALTER TABLE entry_relations ADD CONSTRAINT entry_relations_relation_check CHECK
      (relation IN ('related','proposed_resolution','supersedes','derived_from','part_of_project','part_of_goal'));
    CREATE TABLE habit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      habit_entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      completed_date DATE NOT NULL,
      value NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX habit_logs_entry_day_idx ON habit_logs (habit_entry_id, completed_date);
    CREATE INDEX habit_logs_user_day_idx ON habit_logs (user_id, completed_date DESC);
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS habit_logs;
    ALTER TABLE entry_relations DROP CONSTRAINT IF EXISTS entry_relations_relation_check;
    ALTER TABLE entry_relations ADD CONSTRAINT entry_relations_relation_check CHECK
      (relation IN ('related','proposed_resolution','supersedes','derived_from'));
    ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_intent_check;
    ALTER TABLE entries ADD CONSTRAINT entries_intent_check CHECK
      (intent IN ('CREATE','REMINDER_ONLY','OPEN_THOUGHT'));
    ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_type_check;
    ALTER TABLE entries ADD CONSTRAINT entries_type_check CHECK
      (type IN ('event','task','thought'));
    """)
