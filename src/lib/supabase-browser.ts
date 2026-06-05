import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase-config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'huggy-auth-session',
  },
});

export function getRedirectTarget(): string {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }
  return '/dashboard.html';
}

type BrowserSession = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

function isConfirmedInvalidSessionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { status?: unknown; message?: unknown; code?: unknown; name?: unknown };
  const status = Number(record.status || 0);
  const text = `${record.name || ''} ${record.code || ''} ${record.message || ''}`.toLowerCase();
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    /invalid.*jwt|jwt.*expired|session.*not.*found|refresh.*token.*not.*found|invalid.*refresh|token.*expired|not authenticated/.test(text)
  );
}

async function verifySessionUser(session: BrowserSession) {
  if (!session?.access_token) return { verified: null, error: null };
  try {
    const { data: userData, error } = await supabase.auth.getUser(session.access_token);
    const user = userData?.user;
    if (error || !user) return { verified: null, error: error || new Error('Supabase user missing from session') };
    return {
      verified: {
        session,
        user,
      },
      error: null,
    };
  } catch (error) {
    return { verified: null, error };
  }
}

export async function getVerifiedSession() {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (sessionError || !session) return null;

    const first = await verifySessionUser(session);
    if (first.verified) return first.verified;

    const refreshed = await refreshVerifiedSession();
    if (refreshed) return refreshed;

    if (isConfirmedInvalidSessionError(first.error)) {
      await supabase.auth.signOut();
    }

    return null;
  } catch {
    return null;
  }
}

export async function refreshVerifiedSession() {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data?.session) {
      if (isConfirmedInvalidSessionError(error)) await supabase.auth.signOut();
      return null;
    }

    const verified = await verifySessionUser(data.session);
    if (verified.verified) return verified.verified;

    if (isConfirmedInvalidSessionError(verified.error)) await supabase.auth.signOut();
    return null;
  } catch (error) {
    if (isConfirmedInvalidSessionError(error)) await supabase.auth.signOut();
    return null;
  }
}
