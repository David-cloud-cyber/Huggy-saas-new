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

export async function getVerifiedSession() {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (sessionError || !session) return null;

    const { data: userData, error: userError } = await supabase.auth.getUser(
      session.access_token,
    );
    const user = userData?.user;

    if (userError || !user) {
      await supabase.auth.signOut();
      return null;
    }

    return {
      session,
      user,
    };
  } catch {
    await supabase.auth.signOut();
    return null;
  }
}
