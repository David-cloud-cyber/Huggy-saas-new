import assert from 'node:assert/strict';
import { detectHuggyCloudRequirements } from './src/services/huggy-cloud.ts';
import {
  applyHuggyFullstackKit,
  shouldApplyHuggyFullstackKit,
  validateHuggyFullstackFiles,
} from './src/services/fullstack-generation.ts';
import { inferProductionBlueprint } from './src/services/production-blueprints.ts';

const prompt = 'Create a CRM with login, clients, notes, invoices, uploads and persistent database.';
const requirement = detectHuggyCloudRequirements(prompt);
const baseFiles = [
  {
    path: 'package.json',
    language: 'json',
    content: JSON.stringify({
      scripts: {
        dev: 'vite',
        build: 'vite build',
        test: 'node --experimental-strip-types src/app.test.ts',
        lint: 'tsc --noEmit',
      },
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
      },
    }, null, 2),
  },
  {
    path: 'src/App.tsx',
    language: 'tsx',
    content: 'export default function App() { return <button onClick={() => null}>Save client</button>; }',
  },
];

assert.equal(shouldApplyHuggyFullstackKit({ prompt, files: baseFiles, requirement }), true);

const files = applyHuggyFullstackKit({
  files: baseFiles,
  projectName: 'CRM',
  prompt,
  requirement,
});

const byPath = new Map(files.map(file => [file.path, file.content]));

assert.ok(byPath.has('src/lib/huggyCloud.ts'));
assert.ok(byPath.has('src/lib/appData.ts'));
assert.ok(byPath.has('src/lib/validation.ts'));
assert.ok(byPath.has('supabase/functions/_shared/security.ts'));
assert.ok(byPath.has('supabase/schema.sql'));
assert.ok(byPath.has('src/fullstack.test.ts'));
assert.match(byPath.get('package.json') || '', /@supabase\/supabase-js/);
assert.match(byPath.get('package.json') || '', /"zod"/);
assert.match(byPath.get('package.json') || '', /src\/fullstack\.test\.ts/);
assert.match(byPath.get('supabase/schema.sql') || '', /enable row level security/i);
assert.match(byPath.get('supabase/schema.sql') || '', /grant usage on schema public to anon, authenticated/i);
assert.match(byPath.get('supabase/schema.sql') || '', /create policy "Users can read their records"/i);
assert.match(byPath.get('supabase/schema.sql') || '', /create table if not exists public\.app_contacts/i);
assert.match(byPath.get('supabase/schema.sql') || '', /create table if not exists public\.app_deals/i);
assert.match(byPath.get('supabase/schema.sql') || '', /create table if not exists public\.app_audit_logs/i);
assert.match(byPath.get('supabase/schema.sql') || '', /alter table public\.app_contacts enable row level security/i);
assert.match(byPath.get('supabase/schema.sql') || '', /create policy "Members can read app_contacts"/i);
assert.match(byPath.get('src/lib/appData.ts') || '', /isPreviewRuntime/);
assert.match(byPath.get('src/lib/validation.ts') || '', /z\.object/);
assert.match(byPath.get('supabase/functions/_shared/security.ts') || '', /assertRateLimit/);
assert.match(byPath.get('supabase/functions/_shared/security.ts') || '', /assertWebhookSignature/);
assert.doesNotMatch(files.map(file => file.content).join('\n'), /service[_-]?role|SUPABASE_SERVICE_ROLE|sbp_|secret eyJ/i);

const checks = validateHuggyFullstackFiles(files, requirement);
assert.equal(checks.filter(check => check.status === 'fail').length, 0, checks.map(check => `${check.key}: ${check.message}`).join('\n'));
assert.ok(checks.some(check => check.key === 'fullstack_client_present'));
assert.ok(checks.some(check => check.key === 'fullstack_rls_enabled'));
assert.ok(checks.some(check => check.key === 'fullstack_data_api_grants'));
assert.ok(checks.some(check => check.key === 'fullstack_all_private_tables_rls'));
assert.ok(checks.some(check => check.key === 'fullstack_zod_validation'));
assert.ok(checks.some(check => check.key === 'fullstack_rate_limit_helper'));

const marketplace = inferProductionBlueprint('Build a marketplace with sellers products orders payments and reviews');
assert.equal(marketplace.type, 'marketplace');
assert.ok(marketplace.tables.some(table => table.name === 'app_sellers'));
assert.ok(marketplace.tables.some(table => table.name === 'app_orders'));
assert.ok(marketplace.backend.requiresBilling);

console.log('test-fullstack-generation passed');
