export type Intent = 'CREATE' | 'REMINDER_ONLY' | 'OPEN_THOUGHT' | 'QUERY' | 'TRACK_PAPER' | 'TRACK_SCHOLARSHIP' | 'LOG_HABIT';
export type EntryType = 'event' | 'task' | 'thought' | 'project_milestone' | 'habit' | 'research_paper' | 'scholarship_app';
export type Status = 'open' | 'done' | 'resolved' | 'cancelled';

export interface Entry {
  id: string;
  type: EntryType;
  title: string;
  notes?: string | null;
  scheduled_at?: string | null;
  status: Status;
  created_at: string;
  last_referenced_at?: string | null;
  calendar_sync_state?: string;
  metadata: Record<string, unknown>;
}

export interface Proposal {
  id: string;
  intent: Intent;
  title: string;
  notes?: string | null;
  datetime?: string | null;
  related_entries: Entry[];
  resolves_entry_id?: string | null;
  memory_note?: string | null;
  answer?: string | null;
  requires_clarification?: boolean;
}

export interface Recap {
  timeframe: string;
  completed: string[];
  still_open: string[];
  worth_revisiting: Entry[];
  narration: string;
}

export interface HabitMetric {
  habit_entry_id: string;
  title: string;
  logged_days: number;
  completion_rate: number;
  current_streak: number;
  last_logged_date?: string | null;
}

export interface WeeklyReview {
  timeframe: string;
  completed_milestones: Entry[];
  slipping_habits: string[];
  papers_read: Entry[];
  upcoming_deadlines: Entry[];
  coach_narration: string;
}

export interface DailyEssence {
  date: string;
  focus_type: 'deadline' | 'habit' | 'scholarship' | 'research' | 'thought' | 'capture';
  title: string;
  message: string;
  suggested_action: string;
  route: string;
  related_entry?: Entry | null;
  module_counts: Record<string, number>;
}

export interface PaperEnrichmentResult {
  entry: Entry;
  full_text_available: boolean;
  used_ai_summary: boolean;
  summary?: string | null;
  bibtex?: string | null;
  message: string;
}

export interface PaperQuestionResult {
  answer: string;
  citations: string[];
  used_ai: boolean;
}

export interface ConfigStatus {
  storage_mode: string;
  database_configured: boolean;
  postgres_active: boolean;
  redis_configured: boolean;
  redis_reachable: boolean;
  openai_configured: boolean;
  google_oauth_configured: boolean;
  token_encryption_configured: boolean;
  vapid_configured: boolean;
  frontend_app_url: string;
}

export interface OAuthConnection {
  provider: 'google_calendar' | 'google_gmail';
  connected: boolean;
  provider_account_email?: string | null;
  scopes: string[];
  status: string;
  last_synced_at?: string | null;
  last_error?: string | null;
}

export interface Integrations {
  google_calendar: OAuthConnection;
  google_gmail: OAuthConnection;
}

export interface IntegrationSyncResult {
  provider: 'calendar' | 'gmail';
  connected: boolean;
  scanned_count: number;
  imported_count: number;
  message: string;
  last_synced_at?: string | null;
}
