import { readFileSync } from 'node:fs';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const serverSource = readFileSync('server.ts', 'utf8');
const browserAuthSource = readFileSync('src/lib/supabase-browser.ts', 'utf8');
const authGuardSource = readFileSync('src/auth-guard.ts', 'utf8');
const authPageSource = readFileSync('auth.html', 'utf8');

assert(
  serverSource.includes('function getRequiredAuth'),
  'server auth must expose a single getRequiredAuth helper',
);

assert(
  serverSource.includes('SERVER_AUTH_STATE_INVARIANT'),
  'server auth invariant must be logged internally',
);

assert(
  !/diagnostic_code:\s*['"]AUTH_USER_UNDEFINED_BUG['"]/.test(serverSource),
  'AUTH_USER_UNDEFINED_BUG must never be returned as a public diagnostic',
);

assert(
  !/AUTH_USER_UNDEFINED_BUG:\s*['"]check_server_auth_flow['"]/.test(serverSource),
  'AUTH_USER_UNDEFINED_BUG must not have a public suggested action',
);

assert(
  !serverSource.includes('AUTH_USER_UNDEFINED_BUG'),
  'AUTH_USER_UNDEFINED_BUG must be removed from server auth flow entirely',
);

assert(
  !/function getUserOrgId\(req: any\): string \{\s*return req\.user\?\.id \|\| DEFAULT_ORG_ID;\s*\}/.test(serverSource),
  'authenticated user lookup must not silently fall back to DEFAULT_ORG_ID',
);

assert(
  !/catch\s*\{\s*await supabase\.auth\.signOut\(\);\s*return null;\s*\}/.test(browserAuthSource),
  'browser auth must not sign out on generic transient errors',
);

assert(
  browserAuthSource.includes('isConfirmedInvalidSessionError'),
  'browser auth must sign out only on confirmed invalid session errors',
);

assert(
  browserAuthSource.includes("scope: 'local'"),
  'browser auth must sign out current device only',
);

assert(
  browserAuthSource.includes("flowType: 'pkce'"),
  'browser auth must use the PKCE OAuth flow',
);

assert(
  browserAuthSource.includes("HUGGY_AUTH_STORAGE_KEY = 'huggy.auth.session.v2'"),
  'browser auth must use the v2 auth storage key',
);

assert(
  authGuardSource.includes('getVerifiedSession({ allowRefresh: true })'),
  'private route guard must refresh once before redirecting',
);

assert(
  authPageSource.includes('data-provider="google"') && authPageSource.includes('Continue with Google'),
  'auth page must include the Google sign-in control',
);

console.log('auth-state guards passed');
