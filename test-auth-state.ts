import { readFileSync } from 'node:fs';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const serverSource = readFileSync('server.ts', 'utf8');
const browserAuthSource = readFileSync('src/lib/supabase-browser.ts', 'utf8');

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

console.log('auth-state guards passed');
