import './src/load-env';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OpenRouterService } from './src/services/openrouter.service';
import {
  AI_ALLOWED_MODEL_SET,
  AI_ALLOWED_MODELS,
  ForbiddenModelError,
  ModelNotAllowedForPlanError,
  ModelUnavailableError,
  clearBlockedModelAuditLogs,
  getAllowedFallbacks,
  listBlockedModelAuditLogs,
  validateAllowedModel,
} from './src/config/ai-models';

let failedTestsCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAILED: ${message}`);
    failedTestsCount++;
  } else {
    console.log(`PASSED: ${message}`);
  }
}

function assertThrows<TError extends Error>(fn: () => unknown, errorClass: new (...args: any[]) => TError, message: string) {
  try {
    fn();
    assert(false, message);
  } catch (err) {
    assert(err instanceof errorClass, message);
  }
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return walk(path);
    return [path];
  });
}

async function runTests() {
  console.log('Starting Huggy SaaS backend service tests...\n');

  console.log('--- Strict OpenRouter allowlist tests ---');
  validateAllowedModel('openai/gpt-5-mini');
  assert(true, 'Allowed model is accepted');

  clearBlockedModelAuditLogs();
  assertThrows(() => validateAllowedModel('openai/gpt-4o'), ForbiddenModelError, 'Disallowed model is blocked');
  assert(listBlockedModelAuditLogs().length === 1, 'Blocked model attempt is audited in runtime audit buffer');

  const fallbackModels = getAllowedFallbacks('openai/gpt-5.5-pro');
  assert(fallbackModels.every((model) => AI_ALLOWED_MODEL_SET.has(model)), 'All fallbacks stay inside AI_ALLOWED_MODELS');

  const modelAuto = OpenRouterService.resolveModel('auto', undefined, { planKey: 'starter' });
  assert(AI_ALLOWED_MODEL_SET.has(modelAuto.id), 'Auto mode resolves only to an allowed model');
  assert(['openai/gpt-5-mini', 'google/gemini-3-flash', 'openai/gpt-5-nano'].includes(modelAuto.id), 'Auto mode uses the approved standard/economy pool');

  const modelCustom = OpenRouterService.resolveModel('custom', 'google/gemini-3-flash', { planKey: 'starter' });
  assert(modelCustom.id === 'google/gemini-3-flash', 'Custom mode accepts a whitelisted model allowed by plan');

  assertThrows(
    () => OpenRouterService.resolveModel('custom', 'frontend/injected-model', { planKey: 'starter' }),
    ForbiddenModelError,
    'Custom mode blocks arbitrary frontend model IDs'
  );

  assertThrows(
    () => OpenRouterService.resolveModel('custom', 'openai/gpt-5.5-pro', { planKey: 'starter' }),
    ModelNotAllowedForPlanError,
    'Custom mode blocks whitelisted models that are not available on the current plan'
  );

  const previousAvailability = OpenRouterService.MODELS['google/gemini-3-flash'].isAvailable;
  OpenRouterService.MODELS['google/gemini-3-flash'].isAvailable = false;
  assertThrows(
    () => OpenRouterService.resolveModel('custom', 'google/gemini-3-flash', { planKey: 'starter' }),
    ModelUnavailableError,
    'Unavailable custom model fails closed instead of falling back externally'
  );
  OpenRouterService.MODELS['google/gemini-3-flash'].isAvailable = previousAvailability;

  const serverSourceFiles = walk(join(process.cwd(), 'server', 'src')).filter((path) => path.endsWith('.ts'));
  const disallowedModelLiterals = [
    'google/gemini-2.5-flash',
    'anthropic/claude-3.5-haiku',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'deepseek/deepseek-r1',
  ];
  for (const file of serverSourceFiles) {
    const content = readFileSync(file, 'utf8');
    for (const model of disallowedModelLiterals) {
      assert(!content.includes(model), `${model} is not hardcoded in ${file}`);
    }
  }

  for (const model of AI_ALLOWED_MODELS) {
    assert(OpenRouterService.MODELS[model].id === model, `${model} is present in OpenRouterService catalog`);
  }

  console.log('\n--- Credit margin tests ---');
  const estimate = OpenRouterService.estimateCredits(OpenRouterService.MODELS['openai/gpt-5-mini'], 100000, 20000);
  assert(estimate.marginMultiplier >= 2.5, 'Credit estimate preserves minimum margin multiplier');

  console.log('\n----------------------------------------');
  if (failedTestsCount > 0) {
    console.error(`Tests completed with ${failedTestsCount} failures.`);
    process.exit(1);
  }
  console.log('All unit and assertion tests passed successfully.');
  process.exit(0);
}

runTests();
