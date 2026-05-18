import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

export interface SupabaseConfigStatus {
  configured: boolean;
  missing: string[];
}

let client: SupabaseClient | null = null;

function readEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string | undefined {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const missing: string[] = [];
  if (!readEnv('VITE_SUPABASE_URL')) missing.push('VITE_SUPABASE_URL');
  if (!readEnv('VITE_SUPABASE_ANON_KEY')) missing.push('VITE_SUPABASE_ANON_KEY');
  return { configured: missing.length === 0, missing };
}

export function getSupabaseClient(): SupabaseClient | null {
  const status = getSupabaseConfigStatus();
  if (!status.configured) return null;
  if (!client) {
    client = createClient(readEnv('VITE_SUPABASE_URL')!, readEnv('VITE_SUPABASE_ANON_KEY')!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  }
  return client;
}

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function signInWithMagicLink(email: string, redirectTo = `${window.location.origin}/dashboard`): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
