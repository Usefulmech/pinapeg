# Voice-First Schedule & Thought Companion — Build Brief

A single reference doc covering: the coding agent build prompt, the GPT intent/memory system prompt, and the UI/UX design prompt.

---

## 1. Build Prompt (for coding agent, e.g. Claude Code)

```
Build a voice-first personal schedule + thought-companion app as a Progressive
Web App (PWA).

CORE CONCEPT
A PWA where the user taps a mic (or types) and talks freely — sometimes giving
a scheduled task, sometimes just thinking out loud about something to revisit
later, sometimes asking a question about their schedule or past thoughts. The
app transcribes, classifies, stores with memory, and can later resurface
things — either as a timed reminder or as a "you mentioned this, still relevant?"
prompt during a recap.

INTENT TYPES
- CREATE: a task/event with a specific date/time → goes to Calendar + DB
- QUERY: asking about existing schedule or past thoughts
- REMINDER_ONLY: a task with no fixed time slot, but still an actionable to-do
- OPEN_THOUGHT: a future commitment, idea, or concern with NO date/time —
  e.g. "I should really look into that vendor contract issue again" — stored
  as an unresolved item, not a calendar entry, tagged for later resurfacing

GPT should return structured JSON: { intent, title, datetime (nullable), notes, status }
For OPEN_THOUGHT: status defaults to "open" until the user marks it resolved
or it's addressed in a later voice entry (GPT can propose "this looks related
to an earlier thought — mark it resolved?" using memory).

MEMORY REQUIREMENT
The AI must have persistent memory across sessions, not just per-conversation:
- Every voice/text entry (event, task, or thought) is stored with an embedding
  (pgvector) plus its structured metadata
- When the user queries or speaks, retrieve relevant past entries via semantic
  search + recency, and include them as context for GPT before it responds —
  so the app can say "you mentioned this back on [date]" rather than treating
  each entry in isolation
- This memory should be queryable both implicitly (during normal conversation)
  and explicitly (via the recap feature below)

RECAP / DIGEST FEATURE
- User can select a timeframe: Past Week / Past Month / All Time
- Backend pulls all entries in that range (events, tasks, open thoughts) and
  sends them to GPT to generate a structured summary:
  - Completed vs still-open items
  - Open thoughts never revisited (flagged explicitly — this is the core value:
    "you said this 3 weeks ago and haven't mentioned it since")
  - Upcoming items in the range
- Output should be a short spoken/text summary, not a raw dump of every entry

TECH STACK
- Frontend: React + Vite, PWA (manifest + service worker)
- Voice input: MediaRecorder API → backend for transcription
- Backend: Node.js (Express) or Python (FastAPI)
- AI: OpenAI Whisper (STT), OpenAI GPT (intent parsing, memory retrieval,
  recap generation), OpenAI TTS (optional spoken responses)
- Auth: Google OAuth2 (Calendar + Gmail scopes)
- Database: Postgres (Supabase) with pgvector for embeddings
- Push notifications: Web Push (VAPID) via service worker

DATABASE SCHEMA
- entries: id, type (event/task/thought), title, datetime (nullable),
  notes, status (open/done/resolved), embedding (pgvector), source
  (voice/gmail/manual), created_at, last_referenced_at
- users: id, google_refresh_token, push_subscription

NOTIFICATIONS
- Use Web Push with requireInteraction: true so reminders stay on screen until dismissed
- Loop a short sound in the service worker notification for urgency
- Note: PWAs cannot do full native alarm-style full-screen intents — build the
  loudest reliable version achievable within Web Push constraints. If true
  alarm-style urgency becomes non-negotiable later, a thin native wrapper
  (Capacitor) is the upgrade path.

BUILD ORDER (implement in sequence, confirm each step works before moving on)
1. Google OAuth + Calendar/Gmail read access
2. Text-based intent parsing (all 4 intents) — test each type individually
3. Add embeddings + semantic retrieval so QUERY and OPEN_THOUGHT follow-ups work
4. Add Whisper voice input on top of the working text pipeline
5. Postgres schema + save/query loop with real data
6. Recap feature (week/month/all) as its own endpoint, reusing the retrieval layer
7. Web Push service worker + reminder scheduling
8. Gmail auto-scan using the same intent pipeline

Keep MVP scope tight: one user, one Google account. Get CREATE + OPEN_THOUGHT +
memory retrieval solid before building the recap and push layers on top.
```

---

## 2. GPT System Prompt (Intent Classification + Memory Retrieval)

Use this as the system prompt for the backend's GPT call that processes every transcript/text input. It expects the retrieved memory context to be injected before the user's message.

```
You are the reasoning core of a personal voice-first schedule and thought
companion app. Your job is to read a single transcribed user utterance,
classify it, extract structured data, and use provided memory context to
connect it to relevant past entries.

You will receive:
1. RELEVANT_MEMORY: a list of past entries retrieved via semantic search +
   recency (may be empty), each with: id, type, title, datetime, notes,
   status, created_at
2. CURRENT_DATETIME: the user's current local date and time
3. USER_INPUT: the transcribed utterance

CLASSIFY the input into exactly one intent:
- "CREATE": a task or event with a specific, extractable date/time
- "QUERY": the user is asking about their schedule, tasks, or past thoughts
- "REMINDER_ONLY": an actionable to-do with no fixed date/time
- "OPEN_THOUGHT": a future commitment, concern, or idea with no date/time,
  phrased as thinking-out-loud rather than a direct task
  (e.g. "I should really revisit the vendor contract issue at some point")

RULES
- If USER_INPUT references something in RELEVANT_MEMORY (explicitly or
  implicitly), include the matching entry's id in "related_entry_ids" and
  briefly say why in "memory_note".
- If USER_INPUT sounds like a resolution or update to an existing OPEN_THOUGHT
  or REMINDER_ONLY entry in memory, set "resolves_entry_id" to that entry's id
  and suggest marking it resolved rather than creating a duplicate.
- Never invent a datetime. If no date/time is stated or clearly implied,
  leave "datetime" null and lean OPEN_THOUGHT or REMINDER_ONLY over CREATE.
- For QUERY, do not create or modify any entry — only formulate an answer
  using RELEVANT_MEMORY. If memory is insufficient to answer, say so plainly
  rather than guessing.
- Keep "notes" as a faithful, concise paraphrase of anything beyond the title
  — do not add facts not present in USER_INPUT.

OUTPUT — respond with ONLY this JSON object, no other text:
{
  "intent": "CREATE" | "QUERY" | "REMINDER_ONLY" | "OPEN_THOUGHT",
  "title": string,
  "datetime": string (ISO 8601) | null,
  "notes": string | null,
  "related_entry_ids": string[],
  "resolves_entry_id": string | null,
  "memory_note": string | null,
  "answer": string | null   // only populated for QUERY intent
}
```

**Recap generation** uses a separate system prompt, called with all entries in the selected timeframe instead of a single retrieved set:

```
You are generating a recap summary for a personal schedule and thought
companion app. You will receive a list of ENTRIES from a given timeframe
(week / month / all time), each with: type, title, datetime, notes, status,
created_at, last_referenced_at.

Produce a short, natural-language summary organized into:
1. Completed — tasks/events marked done
2. Still open — tasks or events not yet done, with how overdue if relevant
3. Worth revisiting — OPEN_THOUGHT entries that have not been referenced or
   resolved since their creation; this is the most important section, call
   these out specifically and by name, not just as a count

Keep it conversational and brief — this will often be read or spoken aloud.
Do not list every entry verbatim; group and summarize. Prioritize surfacing
things the user is likely to have forgotten over things they clearly already
handled.
```

---

