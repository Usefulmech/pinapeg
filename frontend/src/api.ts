import type { ConfigStatus, DailyEssence, Entry, HabitMetric, Integrations, IntegrationSyncResult, PaperEnrichmentResult, PaperQuestionResult, Proposal, Recap, WeeklyReview } from './types';
import { getAuthHeaders } from './auth';

const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/v1';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...authHeaders, ...options.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? body?.message ?? 'Something went wrong. Please try again.');
  }
  return response.json() as Promise<T>;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export const api = {
  capture: (text: string) => request<Proposal>('/capture/text', { method: 'POST', body: JSON.stringify({ text, local_datetime: new Date().toISOString() }) }),
  captureAudio: async (blob: Blob) => request<Proposal>('/capture/audio', {
    method: 'POST',
    body: JSON.stringify({ audio_base64: await blobToBase64(blob), mime_type: blob.type || 'audio/webm', local_datetime: new Date().toISOString() })
  }),
  confirm: (proposalId: string) => request<Entry>(`/capture/${proposalId}/confirm`, { method: 'POST' }),
  discard: (proposalId: string) => request<void>(`/capture/${proposalId}/discard`, { method: 'POST' }),
  entries: (params = '') => request<Entry[]>(`/entries${params}`),
  updateEntry: (id: string, payload: Partial<Pick<Entry, 'title' | 'notes' | 'scheduled_at' | 'status' | 'metadata'>>) => request<Entry>(`/entries/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  children: (id: string) => request<Entry[]>(`/entries/${id}/children`),
  schedule: () => request<Entry[]>('/schedule'),
  updateStatus: (id: string, action: 'complete' | 'resolve' | 'reopen') => request<Entry>(`/entries/${id}/${action}`, { method: 'POST' }),
  logHabit: (id: string) => request<{ habit_entry_id: string; completed_date: string; recorded: boolean }>(`/habits/${id}/log`, { method: 'POST' }),
  decompose: (id: string) => request<{ parent_entry_id: string; tasks: Entry[] }>(`/entries/${id}/decompose`, { method: 'POST' }),
  enrichPaper: (id: string) => request<PaperEnrichmentResult>(`/papers/${id}/enrich`, { method: 'POST' }),
  askPaper: (id: string, question: string) => request<PaperQuestionResult>(`/papers/${id}/ask`, { method: 'POST', body: JSON.stringify({ question }) }),
  recap: (timeframe: string) => request<Recap>('/recaps', { method: 'POST', body: JSON.stringify({ timeframe }) }),
  weeklyReview: (timeframe: string) => request<WeeklyReview>('/ai-weekly-review', { method: 'POST', body: JSON.stringify({ timeframe }) }),
  dailyEssence: () => request<DailyEssence>('/daily-essence'),
  habitAnalytics: () => request<{ habits: HabitMetric[] }>('/analytics/habits'),
  cvTimeline: () => request<Entry[]>('/analytics/cv-timeline'),
  googleConnect: (provider: 'calendar' | 'gmail') => request<{ authorization_url: string }>(`/integrations/google/${provider}/connect`),
  googleSync: (provider: 'calendar' | 'gmail') => request<IntegrationSyncResult>(`/integrations/google/${provider}/sync`, { method: 'POST' }),
  integrations: () => request<Integrations>('/integrations'),
  configStatus: () => request<ConfigStatus>('/config/status'),
  me: () => request<{ display_name: string; timezone: string; calendar_connected: boolean }>('/me')
};
