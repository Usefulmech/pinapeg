# Google OAuth Setup

Create one OAuth client in Google Cloud for the Pinapeg backend.

## OAuth Client

- Application type: Web application
- Authorized JavaScript origins:
  - `http://localhost:5173`
- Authorized redirect URI:
  - `http://localhost:8000/v1/integrations/google/callback`

## Backend Environment

Put these values in `backend/.env`:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/v1/integrations/google/callback
GOOGLE_OAUTH_STATE_SECRET=replace-with-a-long-random-string
TOKEN_ENCRYPTION_KEY=replace-with-another-long-random-string
FRONTEND_APP_URL=http://localhost:5173
```

## Scopes Used

- Google Calendar: `https://www.googleapis.com/auth/calendar.events`
- Gmail scan: `https://www.googleapis.com/auth/gmail.readonly`
- Account email binding: `openid email`

The backend stores Google refresh tokens encrypted in PostgreSQL when `STORAGE_MODE=postgres`. In memory mode, connection status only lasts until the API process restarts.
