import { AI_ALLOWED_MODEL_SET, AI_ALLOWED_MODELS, ForbiddenModelError, clearBlockedModelAuditLogs, getAllowedFallbacks, listBlockedModelAuditLogs, validateAllowedModel } from '../config/ai-models.ts';
import { ModelCatalogService, ModelRouterService, OpenRouterService, PLAN_CATALOG, type WalletSnapshot } from './billing-ai.ts';
import type { RequestContext } from './types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertThrows<TError extends Error>(fn: () => unknown, errorClass: new (...args: never[]) => TError, message: string): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof errorClass) return;
    throw new Error(`${message}: unexpected error ${(error as Error).name}`);
  }
  throw new Error(`${message}: no error thrown`);
}

const context: RequestContext = {
  correlationId: 'correlation_test',
  userId: 'user_test',
  organizationId: 'org_test',
  role: 'owner',
};

const wallet: WalletSnapshot = {
  organizationId: 'org_test',
  planCreditsBalance: 1000,
  topupCreditsBalance: 1000,
  reservedCredits: 0,
  sellValuePerCreditUsd: 0.2,
};

clearBlockedModelAuditLogs();
validateAllowedModel('openai/gpt-5.5');
assertThrows(() => validateAllowedModel('openai/gpt-4o-mini'), ForbiddenModelError, 'non-whitelisted model must be blocked');
assert(listBlockedModelAuditLogs().length === 1, 'blocked attempt must create audit log');
assertThrows(() => getAllowedFallbacks('openai/gpt-4o-mini'), ForbiddenModelError, 'fallback source model must be whitelisted');
for (const modelId of AI_ALLOWED_MODELS) {
  for (const fallback of getAllowedFallbacks(modelId)) assert(AI_ALLOWED_MODEL_SET.has(fallback), `fallback ${fallback} must be whitelisted`);
}

const catalog = new ModelCatalogService();
assertThrows(() => catalog.getModel('frontend/injected-model'), ForbiddenModelError, 'arbitrary frontend model id must be blocked');

const router = new ModelRouterService();
const autoDecision = router.route({ context, plan: PLAN_CATALOG.business, wallet, taskType: 'new_feature', complexityScore: 7, estimatedInputTokens: 1000, estimatedOutputTokens: 1000 });
assert(AI_ALLOWED_MODEL_SET.has(autoDecision.selectedModel.openRouterModel), 'auto router must choose whitelisted model');

const customDecision = router.route({ context, plan: PLAN_CATALOG.enterprise, wallet, taskType: 'debug_complex', complexityScore: 9, preferences: { mode: 'custom' }, requestedModelKey: 'openai/gpt-5.5-pro', estimatedInputTokens: 1000, estimatedOutputTokens: 1000 });
assert(customDecision.selectedModel.openRouterModel === 'openai/gpt-5.5-pro', 'custom allowed model must be accepted');
assertThrows(() => router.route({ context, plan: PLAN_CATALOG.enterprise, wallet, taskType: 'debug_complex', complexityScore: 9, preferences: { mode: 'custom' }, requestedModelKey: 'openai/gpt-4o-mini' }), ForbiddenModelError, 'custom non-whitelisted model must be blocked');

const openRouter = new OpenRouterService(() => 'test-key');
const selectedModel = catalog.getModel('google/gemini-3-flash');
await openRouter.complete({ model: selectedModel, messages: [{ role: 'user', content: 'Hello' }] });
const syncResult = await openRouter.syncOpenRouterAllowedModels([{ id: 'google/gemini-3-flash', pricing: { prompt: '0.00000015', completion: '0.0000006' } }, { id: 'non-whitelisted/model' }]);
assert(syncResult.some((model) => model.modelId === 'google/gemini-3-flash' && model.isAvailable), 'catalog sync must mark existing whitelisted model available');
assert(!syncResult.some((model) => String(model.modelId) === 'non-whitelisted/model'), 'catalog sync must never add unlisted models');

console.log('AI model allowlist tests passed');
