export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://notgpriaragtiahcqjoa.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_rp4hpA--fkybGy0GczSMvA_KU9BitSa';

export function hasSupabaseBrowserConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}
