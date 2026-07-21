const demoUserId = import.meta.env.VITE_DEMO_USER_ID ?? 'local-demo-user';
const neonAuthUrl = (import.meta.env.VITE_NEON_AUTH_URL ?? '').trim();
const displayNameKey = 'pinapeg.displayName';
const profileKey = 'pinapeg.profile';
type NeonAuthClient = {
  signIn?: { social?: (options: { provider: 'google'; callbackURL: string }) => Promise<unknown> };
  getSession?: () => Promise<unknown>;
  signOut?: () => Promise<unknown>;
  getJWTToken?: () => Promise<string | null>;
};
let neonAuthClient: NeonAuthClient | null | undefined;

export interface LocalAccount {
  id: string;
  name: string;
  email?: string;
}

export interface UserProfile {
  name: string;
  email?: string;
  role: string;
  focus: string;
  workMode: string;
  timezone: string;
}

const defaultProfile = (): UserProfile => ({
  name: localStorage.getItem(displayNameKey) || 'You',
  role: 'Student / Builder',
  focus: 'Open capture',
  workMode: 'Fast capture',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

export function getStoredProfile(): UserProfile {
  try {
    return { ...defaultProfile(), ...JSON.parse(localStorage.getItem(profileKey) || '{}') };
  } catch {
    return defaultProfile();
  }
}

export function updateStoredProfile(changes: Partial<UserProfile>): UserProfile {
  const next = { ...getStoredProfile(), ...changes };
  localStorage.setItem(profileKey, JSON.stringify(next));
  if (changes.name) localStorage.setItem(displayNameKey, next.name);
  return next;
}

export function getLocalAccount(): LocalAccount {
  const profile = getStoredProfile();
  return { id: demoUserId, name: profile.name, email: profile.email };
}

async function getNeonAuthClient(): Promise<NeonAuthClient | null> {
  if (!neonAuthUrl) return null;
  if (neonAuthClient !== undefined) return neonAuthClient;
  try {
    const { createAuthClient } = await import('@neondatabase/auth');
    neonAuthClient = createAuthClient(neonAuthUrl) as NeonAuthClient;
  } catch {
    neonAuthClient = null;
  }
  return neonAuthClient;
}

function sessionUser(payload: unknown): { id?: string; name?: string; displayName?: string; email?: string } | null {
  const value = payload as { data?: unknown; user?: unknown } | null;
  const data = (value?.data ?? value) as { user?: unknown } | null;
  return (data?.user ?? value?.user ?? null) as { id?: string; name?: string; displayName?: string; email?: string } | null;
}

export async function getCurrentAccount(): Promise<LocalAccount> {
  const auth = await getNeonAuthClient();
  try {
    const user = sessionUser(await auth?.getSession?.());
    if (user?.id || user?.email) {
      updateStoredProfile({
        name: user.name || user.displayName || user.email || getStoredProfile().name,
        email: user.email,
      });
      return {
        id: user.id || user.email || demoUserId,
        name: user.name || user.displayName || user.email || 'You',
        email: user.email,
      };
    }
  } catch {
    // Fall back to local demo identity.
  }
  return getLocalAccount();
}

export async function updateProfileName(name: string): Promise<LocalAccount> {
  const cleanName = name.trim() || 'You';
  updateStoredProfile({ name: cleanName });
  return { id: demoUserId, name: cleanName };
}

export async function updateProfile(changes: Partial<UserProfile>): Promise<UserProfile> {
  return updateStoredProfile(changes);
}

export async function signOut() {
  localStorage.setItem('pinapeg.signedOut', 'yes');
  localStorage.removeItem(displayNameKey);
  localStorage.removeItem(profileKey);
  localStorage.removeItem('pinapeg.onboardingComplete');
  try {
    const auth = await getNeonAuthClient();
    await auth?.signOut?.();
  } catch {
    // Ignore error
  }
}

export function hasNeonAuth(): boolean {
  return Boolean(neonAuthUrl);
}

function safeCallbackPath(callbackPath: string): string {
  const route = callbackPath.trim();
  return route.startsWith('/') && !route.startsWith('//') ? route : '/capture';
}

function authErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  return typeof candidate.status === 'number'
    ? candidate.status
    : typeof candidate.response?.status === 'number'
      ? candidate.response.status
      : undefined;
}

export async function signInWithGoogle(callbackPath = '/capture'): Promise<boolean> {
  localStorage.removeItem('pinapeg.signedOut');
  if (!neonAuthUrl) throw new Error('Google sign-in is not configured. Add the Neon Auth URL to frontend/.env.');
  const auth = await getNeonAuthClient();
  if (!auth?.signIn?.social) throw new Error('The Neon Auth client could not load. Restart the frontend and try again.');
  try {
    await auth.signIn.social({
      provider: 'google',
      // Neon Auth accepts this app-relative callback on both localhost and 127.0.0.1.
      callbackURL: safeCallbackPath(callbackPath),
    });
  } catch (error) {
    if (authErrorStatus(error) === 403) {
      throw new Error('Neon Auth blocked Google sign-in. Enable Google under Neon Auth ? Configuration ? OAuth providers, then add this app domain as a trusted origin.');
    }
    throw error;
  }
  return true;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const auth = await getNeonAuthClient();
    const session = await auth?.getSession?.();
    const data = (session as any)?.data ?? session;
    const token = data?.session?.token || data?.token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Keep local fallback.
  }
  headers['X-Pinapeg-User-Id'] = (await getCurrentAccount()).id || demoUserId;
  return headers;
}
