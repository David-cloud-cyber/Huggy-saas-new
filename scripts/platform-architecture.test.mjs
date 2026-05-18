import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const services = read('src/platform/services.ts');
const types = read('src/platform/types.ts');
const migration = read('supabase/migrations/0005_deployment_preview_backend_completion.sql');
const authMigration = read('supabase/migrations/0006_auth_bootstrap_and_rls_assertions.sql');
const envExample = read('.env.example');
const builder = read('builder.html');
const builderTs = read('src/builder.ts');
const dashboardTs = read('src/supabase-dashboard.ts');
const server = read('server.js');
const runtimeApi = read('src/platform/runtime-api.mjs');

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
assert(server.includes('handleRuntimeApi'), 'production server must mount runtime platform API before static routes');
assert(runtimeApi.includes('SUPABASE_SERVICE_ROLE_KEY'), 'runtime API must use Supabase service role only on the backend');
assert(runtimeApi.includes('OPENROUTER_API_KEY'), 'runtime API must call OpenRouter from backend only');
assert(runtimeApi.includes('VERCEL_TOKEN'), 'runtime API must call Vercel from backend only');
assert(runtimeApi.includes('allowedModels') && runtimeApi.includes('forbidden_model'), 'runtime API must enforce strict OpenRouter whitelist');
assert(runtimeApi.includes('credit_reservations') && runtimeApi.includes('credit_ledger'), 'runtime API must persist credit reservations and ledger entries');
assert(runtimeApi.includes('agent_runs') && runtimeApi.includes('project_files') && runtimeApi.includes('project_versions'), 'runtime API must persist agent runs, files and versions');
assert(runtimeApi.includes('/v13/deployments'), 'runtime API must create Vercel preview/production deployments');
for (const route of ['/api/projects', '/api/deploy', '/api/domains', '/api/billing', '/api/ai/estimate']) {
  assert(runtimeApi.includes(route), `runtime API must expose ${route}`);
}
assert(!builderTs.includes('OPENROUTER_API_KEY'), 'builder must not expose OpenRouter key');
assert(!dashboardTs.includes('SUPABASE_SERVICE_ROLE_KEY'), 'dashboard must not expose Supabase service role key');

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
assert(authMigration.includes('handle_new_user_workspace'), 'auth bootstrap migration must create user profile workspace and membership');
assert(authMigration.includes('on_auth_user_created_workspace'), 'auth bootstrap migration must install auth.users trigger');
assert(authMigration.includes('assert_platform_rls_enabled'), 'RLS assertion function must exist');
assert(types.includes('PreviewRecord'), 'PreviewRecord type must exist');
assert(types.includes('ProjectBackend'), 'ProjectBackend type must exist');
assert(types.includes('ProjectBackendResource'), 'ProjectBackendResource type must exist');

for (const envName of ['VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'VERCEL_PROJECT_PREFIX', 'APP_PUBLIC_DOMAIN', 'SUPABASE_SERVICE_ROLE_KEY']) {
  assert(envExample.includes(envName), `${envName} must be documented`);
}

for (const uiId of ['btn-build-preview', 'btn-refresh-preview', 'btn-deploy-project', 'btn-rollback-version', 'btn-add-domain', 'tab-versions', 'tab-domains', 'tab-backend']) {
  assert(builder.includes(uiId) || builderTs.includes(uiId), `${uiId} must exist for project workflow UI`);
}
assert(builderTs.includes('/api/projects/') && builderTs.includes('/messages'), 'builder chat must call runtime AI API');
assert(builderTs.includes('/api/deploy') && builderTs.includes('/api/domains'), 'builder deploy/domain actions must call public Railway API aliases');
assert(builder.includes('<iframe class="preview-frame"'), 'builder preview must render a real iframe target');
assert(dashboardTs.includes('/api/projects'), 'dashboard must create real Supabase projects through runtime API');

console.log('Platform architecture tests passed');
