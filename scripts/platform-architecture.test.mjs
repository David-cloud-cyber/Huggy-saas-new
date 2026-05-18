import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd().endsWith('huggy-saas') ? process.cwd() : join(process.cwd(), 'huggy-saas');

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const services = read('src/platform/services.ts');
const types = read('src/platform/types.ts');
const migration = read('supabase/migrations/0005_deployment_preview_backend_completion.sql');
const envExample = read('.env.example');
const builder = read('builder.html');
const builderTs = read('src/builder.ts');

for (const serviceName of [
  'VercelService',
  'DeploymentService',
  'PreviewService',
  'DomainService',
  'ProjectVersionService',
  'BackendProvisioningService',
  'SupabaseProvisioningService',
  'BuildJobService',
  'AgentGenerationService',
  'RollbackService',
]) {
  assert(services.includes(`class ${serviceName}`) || services.includes(`class ${serviceName} extends`), `${serviceName} must exist`);
}

for (const methodName of [
  'createProject(',
  'getProject(',
  'setEnvironmentVariables(',
  'createDeployment(',
  'getDeploymentStatus(',
  'addDomain(',
  'verifyDomain(',
  'removeDomain(',
  'assignAlias(',
  'rollbackDeployment(',
]) {
  assert(services.includes(methodName), `VercelService must expose ${methodName}`);
}

assert(services.includes('process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN'), 'VercelService must read VERCEL_TOKEN only from backend process.env');
assert(services.includes('process.env.VERCEL_TEAM_ID'), 'VercelService must support VERCEL_TEAM_ID');
assert(services.includes('process.env.VERCEL_PROJECT_PREFIX'), 'VercelService must support VERCEL_PROJECT_PREFIX');
assert(services.includes('process.env.APP_PUBLIC_DOMAIN'), 'DomainService must support APP_PUBLIC_DOMAIN');
assert(!builder.includes('VERCEL_TOKEN'), 'builder UI must not expose VERCEL_TOKEN');
assert(!builderTs.includes('VERCEL_TOKEN'), 'builder script must not expose VERCEL_TOKEN');
assert(!builder.includes('SUPABASE_SERVICE_ROLE_KEY'), 'builder UI must not expose SUPABASE_SERVICE_ROLE_KEY');
assert(!builderTs.includes('SUPABASE_SERVICE_ROLE_KEY'), 'builder script must not expose SUPABASE_SERVICE_ROLE_KEY');
assert(services.includes("'VERCEL_TOKEN', 'VERCEL_API_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY'"), 'deployment env injection must filter backend-only secrets');
assert(services.includes('vercel_unauthorized') && services.includes('vercel_forbidden') && services.includes('vercel_rate_limited'), 'Vercel errors must be mapped cleanly');
assert(services.includes('redactSecrets'), 'Vercel/service errors must redact secrets');

for (const table of [
  'previews',
  'project_backends',
  'project_backend_resources',
]) {
  assert(migration.includes(`create table if not exists ${table}`), `${table} migration must exist`);
  assert(migration.includes(`alter table ${table} enable row level security`), `${table} must enable RLS`);
}

for (const column of [
  'provider_project_id',
  'provider_deployment_id',
  'preview_url',
  'production_url',
]) {
  assert(migration.includes(column), `deployments must include ${column}`);
}

assert(migration.includes('check (rls_enabled = true'), 'generated backend resources must enforce RLS for exposed resources');
assert(types.includes('PreviewRecord'), 'PreviewRecord type must exist');
assert(types.includes('ProjectBackend'), 'ProjectBackend type must exist');
assert(types.includes('ProjectBackendResource'), 'ProjectBackendResource type must exist');

for (const envName of ['VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'VERCEL_PROJECT_PREFIX', 'APP_PUBLIC_DOMAIN', 'SUPABASE_SERVICE_ROLE_KEY']) {
  assert(envExample.includes(envName), `${envName} must be documented`);
}

for (const uiId of ['btn-build-preview', 'btn-refresh-preview', 'btn-deploy-project', 'btn-rollback-version', 'btn-add-domain', 'tab-versions', 'tab-domains', 'tab-backend']) {
  assert(builder.includes(uiId) || builderTs.includes(uiId), `${uiId} must exist for project workflow UI`);
}

console.log('Platform architecture tests passed');
