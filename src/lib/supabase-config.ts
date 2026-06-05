const DEV_FALLBACK_SUPABASE_URL = 'https://notgpriaragtiahcqjoa.supabase.co';
const DEV_FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rp4hpA--fkybGy0GczSMvA_KU9BitSa';

const configuredUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const configuredPublishableKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '',
).trim();
const allowDevFallback = !import.meta.env.PROD;

export const SUPABASE_URL =
  configuredUrl || (allowDevFallback ? DEV_FALLBACK_SUPABASE_URL : '');

export const SUPABASE_PUBLISHABLE_KEY =
  configuredPublishableKey || (allowDevFallback ? DEV_FALLBACK_SUPABASE_PUBLISHABLE_KEY : '');

export const SUPABASE_BROWSER_CONFIG_STATUS = {
  hasUrl: Boolean(configuredUrl),
  hasPublishableKey: Boolean(configuredPublishableKey),
  usingDevFallback: allowDevFallback && (!configuredUrl || !configuredPublishableKey),
  projectRef: getSupabaseProjectRef(SUPABASE_URL),
};

export function hasSupabaseBrowserConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function getSupabaseProjectRef(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.endsWith('.supabase.co') ? host.split('.')[0] : host;
  } catch {
    return 'invalid-url';
  }
}

if (!hasSupabaseBrowserConfig()) {
  console.error('[huggy:supabase_browser_config_missing]', {
    message: 'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_ANON_KEY are required in production.',
    status: SUPABASE_BROWSER_CONFIG_STATUS,
  });
}
