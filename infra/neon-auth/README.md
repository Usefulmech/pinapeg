# Neon Auth setup

Pinapeg is Neon-only for product data and identity. Neon Auth is the selected production path for Google sign-in/sign-up.

## What Neon handles

- User sign-in/sign-up sessions.
- Google OAuth flow for application identity.
- Auth state stored in Neon alongside the database branch.

Google Calendar and Gmail credentials are still separate backend integrations. They stay in `backend/.env` because they grant access to Google APIs after a Pinapeg user is already signed in.

## Local setup

1. In Neon Console, open the Pinapeg project and enable Neon Auth.
2. Copy the Neon Auth URL into the frontend env:

   ```env
   VITE_NEON_AUTH_URL=https://...
   ```

3. Install the Neon client SDK in `frontend`:

   ```cmd
   cd /d "C:\Users\USER\Documents\Python Project\pinapeg\frontend"
   npm.cmd install
   ```

4. Wire the auth client:

   ```ts
   import { createAuthClient } from '@neondatabase/auth';

   export const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL);
   ```

5. Replace the local development identity fallback with the Neon session user and send that user id to the backend.

## Google OAuth

Neon Auth supports Google OAuth. Shared Google OAuth credentials are available for development/testing, but production should use your own Google OAuth app credentials configured in Neon Auth settings.

Pinapeg sends an app-relative callback such as `/capture`. Keep it relative: do **not** replace it with `http://127.0.0.1:5174/capture`, which Neon Auth rejects as `INVALID_CALLBACKURL` on the fresh local dev port.

In Neon Auth, enable Google under **Configuration ? OAuth providers**. Before production, add the Vercel application domain as a trusted origin/app domain in Neon Auth as well.

## Current repo status

- `frontend/.env.example` includes `VITE_NEON_AUTH_URL`.
- The welcome screen shows the Google/Neon Auth entry state.
- The app still uses `X-Pinapeg-User-Id` only as a local development fallback until the Neon SDK install completes cleanly.
- Product data remains in Neon Postgres through the backend.
