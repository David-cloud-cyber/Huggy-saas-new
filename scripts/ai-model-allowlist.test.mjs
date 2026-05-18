import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd().endsWith('huggy-saas') ? process.cwd() : join(process.cwd(), 'huggy-saas');
const allowedModels = [
  'openai/gpt-5.5',
  'openai/gpt-5.5-pro',
  'anthropic/claude-opus-4.7',
  'anthropic/claude-sonnet-4.6',
  'google/gemini-3-pro',
  'google/gemini-3-flash',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'deepseek/deepseek-coder',
  'qwen/qwen-coder',
  'mistralai/codestral',
];
const allowedSet = new Set(allowedModels);
const disallowedModels = [
  'openai/gpt-4o-mini',
  'google/gemini-flash-1.5',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3.7-sonnet',
  'openai/o1-pro',
  'frontend/injected-model',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const config = read('src/config/ai-models.ts');
const billing = read('src/platform/billing-ai.ts');
const migration = read('supabase/migrations/0004_strict_ai_model_allowlist.sql');
const envExample = read('.env.example');

for (const model of allowedModels) {
  assert(config.includes(`'${model}'`), `${model} missing from central config`);
  assert(migration.includes(`'${model}'`), `${model} missing from strict migration`);
}

for (const model of disallowedModels) {
  assert(!billing.includes(model), `${model} must not be hardcoded in backend billing service`);
  assert(!migration.includes(model), `${model} must not be seeded in strict migration`);
}

assert(config.includes('validateAllowedModel'), 'validateAllowedModel must exist');
assert(config.includes('ForbiddenModelError'), 'ForbiddenModelError must exist');
assert(config.includes('auditBlockedModelAttempt'), 'blocked attempts must be audited');
assert(billing.includes('validateAllowedModel(request.model.openRouterModel'), 'OpenRouterService must validate model before request');
assert(billing.includes('getAllowedFallbacks(request.model.openRouterModel'), 'OpenRouterService must validate allowed fallbacks');
assert(billing.includes('AI_MODEL_PLAN_ACCESS'), 'ModelRouter must enforce plan access');
assert(migration.includes('ai_blocked_model_audit_logs'), 'database must include blocked model audit logs');
assert(migration.includes('is_allowed = (openrouter_model_id in'), 'database must enforce strict allowed check');
assert(envExample.includes('AI_STRICT_MODEL_ALLOWLIST="true"'), 'strict allowlist env flag must be documented');
assert(envExample.includes('AI_DISABLE_UNLISTED_FALLBACKS="true"'), 'unlisted fallback disable flag must be documented');

const fallbackBlock = config.match(/export const AI_MODEL_FALLBACKS:[\s\S]*?export const AI_MODEL_PLAN_ACCESS/)?.[0] ?? '';
for (const fallback of fallbackBlock.match(/'[^']+\/[^']+'/g) ?? []) {
  const model = fallback.slice(1, -1);
  assert(allowedSet.has(model), `fallback ${model} must be in AI_ALLOWED_MODELS`);
}

console.log('AI model allowlist runtime checks passed');
