import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd().endsWith('huggy-saas') ? process.cwd() : join(process.cwd(), 'huggy-saas');

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return entry === 'node_modules' || entry === 'dist' ? [] : walk(path);
    return [path];
  });
}

const requiredPages = [
  'index.html',
  'dashboard.html',
  'builder.html',
  'pricing.html',
  'security.html',
  'privacy.html',
  'documentation.html',
];
for (const page of requiredPages) assert(read(page).includes('<!DOCTYPE html>') || read(page).includes('<!doctype html>'), `${page} must be a valid HTML entry`);

const dashboard = read('dashboard.html');
const builder = read('builder.html');
const index = read('index.html');
const supabaseClient = read('src/lib/supabase.ts');
const supabaseDashboard = read('src/supabase-dashboard.ts');
const supabaseAuth = read('src/supabase-auth.ts');
const server = read('server.js');
const envExample = read('.env.example');
const railway = read('railway.json');

assert(dashboard.includes('btn-new-project-sidebar'), 'dashboard must expose sidebar new project CTA');
assert(dashboard.includes('btn-create-top'), 'dashboard must expose top new project CTA');
assert(dashboard.includes('id="ai-textarea"'), 'dashboard must expose prompt textarea');
assert(dashboard.includes('id="model-dropdown"'), 'dashboard must expose model selector');
assert(dashboard.includes('/src/supabase-dashboard.ts'), 'dashboard must load Supabase dashboard integration');
assert(index.includes('/src/supabase-auth.ts'), 'index/login/signup shell must load Supabase auth integration');
assert(!dashboard.includes('setTimeout(openSettings'), 'dashboard settings modal must not auto-open in production');
assert(!dashboard.match(/const\s+curtain[\s\S]*const\s+curtain/), 'dashboard must not redeclare curtain in one script scope');
assert(builder.includes('id="chat-container"'), 'builder must expose chat container');
assert(builder.includes('id="preview-frame"'), 'builder must expose preview frame');
assert(builder.includes('btn-deploy'), 'builder must expose deploy button');

const routeExpectations = ['/dashboard', '/projects', '/projects/new', '/billing', '/login', '/signup', '/organization/settings'];
for (const route of routeExpectations) assert(server.includes(`'${route}'`), `production server must route ${route}`);
assert(server.includes('dynamicRoutePatterns'), 'production server must define dynamic project route rewrites');
for (const segment of ['editor', 'preview', 'versions', 'deployments', 'domains', 'settings']) {
  assert(server.includes(segment), `production server must route /projects/:id/${segment}`);
}

const requiredEnv = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_SITE_URL',
  'OPENROUTER_APP_NAME',
  'AI_ALLOWED_MODELS',
  'AI_STRICT_MODEL_ALLOWLIST',
  'AI_DISABLE_UNLISTED_FALLBACKS',
  'VERCEL_TOKEN',
  'VERCEL_API_TOKEN',
  'VERCEL_PROJECT_PREFIX',
  'APP_PUBLIC_DOMAIN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];
for (const variable of requiredEnv) assert(envExample.includes(variable), `${variable} must be documented in .env.example`);
assert(railway.includes('node server.js'), 'Railway must start the production server with route rewrites');
assert(supabaseClient.includes('createClient'), 'Supabase client must use the official createClient API');
assert(supabaseClient.includes('VITE_SUPABASE_URL'), 'Supabase client must read the public Supabase URL');
assert(supabaseClient.includes('VITE_SUPABASE_ANON_KEY'), 'Supabase client must read the public anon key');
assert(!supabaseClient.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Frontend Supabase client must not reference service role key');
assert(supabaseDashboard.includes("from('projects')"), 'Dashboard must load projects from Supabase');
assert(supabaseDashboard.includes("from('users_profile')"), 'Dashboard must load user profile from Supabase');
assert(supabaseAuth.includes('signInWithMagicLink'), 'Auth shell must connect login/signup to Supabase magic link');

const forbiddenUiModels = ['Sonnet 4.5', 'Opus 4.5', 'Haiku 4.5', 'Gemini 2.0', 'gpt-4o-mini', 'o1-pro'];
for (const model of forbiddenUiModels) {
  assert(!dashboard.includes(model), `${model} must not appear in dashboard model UI`);
  assert(!builder.includes(model), `${model} must not appear in builder model UI`);
}

const sourceFiles = walk(join(root, 'src')).filter((path) => /\.(ts|tsx|js|html|css)$/.test(path));
for (const file of sourceFiles) {
  const content = readFileSync(file, 'utf8');
  assert(!/sk-[a-zA-Z0-9_-]{20,}/.test(content), `${file} must not contain OpenAI/OpenRouter-like secret`);
  assert(!/vercel_[a-zA-Z0-9_-]{20,}/.test(content), `${file} must not contain Vercel secret`);
}

console.log('QA static checks passed');
