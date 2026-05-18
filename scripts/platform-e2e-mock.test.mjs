import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd().endsWith('huggy-saas') ? process.cwd() : join(process.cwd(), 'huggy-saas');

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dashboard = read('dashboard.html');
const builder = read('builder.html');
const builderTs = read('src/builder.ts');
const server = read('server.js');
const services = read('src/platform/services.ts');

assert(dashboard.includes('btn-new-project-sidebar') && dashboard.includes('btn-create-top'), 'e2e mock: dashboard must expose project creation CTAs');
assert(dashboard.includes('/src/supabase-dashboard.ts'), 'e2e mock: dashboard must load Supabase integration');
assert(builder.includes('id="chat-container"'), 'e2e mock: editor must expose AI chat panel');
assert(builder.includes('id="preview-frame"'), 'e2e mock: preview frame must exist');
assert(builder.includes('id="btn-build-preview"'), 'e2e mock: build preview button must exist');
assert(builder.includes('id="btn-refresh-preview"'), 'e2e mock: refresh preview button must exist');
assert(builder.includes('id="btn-deploy-project"'), 'e2e mock: deploy button must exist');
assert(builder.includes('id="tab-domains"'), 'e2e mock: domains tab must exist');
assert(builder.includes('id="tab-versions"'), 'e2e mock: versions tab must exist');
assert(builder.includes('id="tab-backend"'), 'e2e mock: backend status tab must exist');
assert(builderTs.includes('Preview build queued'), 'e2e mock: preview action must provide visible feedback');
assert(builderTs.includes('Production deploy queued via Railway backend'), 'e2e mock: deploy action must provide visible feedback');
assert(builderTs.includes('Rollback restored selected version'), 'e2e mock: rollback action must provide visible feedback');
assert(builderTs.includes('Domain workflow: add DNS then verify'), 'e2e mock: custom domain action must provide visible feedback');

for (const route of ['/projects/new', 'editor', 'preview', 'domains', 'deployments', 'versions', 'settings']) {
  assert(server.includes(route), `e2e mock: server must route ${route}`);
}

assert(services.includes('free: 0') && services.includes('starter: 1') && services.includes('pro: 5') && services.includes('studio: 15') && services.includes('business: 50'), 'e2e mock: domain plan limits must match product rules');
assert(services.includes('domain_limit_reached'), 'e2e mock: Free/custom-domain blocking must be implemented in DomainService');
assert(services.includes('rls_required'), 'e2e mock: Supabase provisioning must reject generated tables without RLS');

console.log('Platform e2e mock checks passed');
