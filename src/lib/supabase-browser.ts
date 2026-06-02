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
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(
    sessionData.session.access_token,
  );

  if (userError || !userData.user) {
    await supabase.auth.signOut();
    return null;
  }

  return {
    session: sessionData.session,
    user: userData.user,
  };
}
