import assert from 'node:assert/strict';
import { validateAllowedModel, ForbiddenModelError } from './src/services/ai-validator.ts';
import { AI_ALLOWED_MODELS } from './src/config/ai-models.ts';
import {
  buildWorldClassUiPolicy,
  chooseDesignDirection,
  classifyGeneratedAppType,
} from './src/services/design-generation-policy.ts';

async function runTests() {
  console.log('Starting AI Policy Tests...');

  // Test 1: Allowed model
  const model = AI_ALLOWED_MODELS[0];
  validateAllowedModel(model);
  assert.ok(model);
  console.log(`Success: Allowed model ${model} passed validation.`);
  validateAllowedModel('anthropic/claude-opus-4.8');
  validateAllowedModel('anthropic/claude-opus-4.8-fast');
  assert.ok(!AI_ALLOWED_MODELS.includes('google/gemini-3-flash-preview' as any));
  console.log('Success: Model registry v2 includes Opus 4.8 and excludes deprecated Gemini 3 preview.');

  // Test 2: Forbidden model
  assert.throws(
    () => validateAllowedModel('openai/gpt-4-total-garbage'),
    ForbiddenModelError,
    'Forbidden model should be blocked',
  );
  console.log('Success: Forbidden model correctly blocked.');

  // Test 3: Arbitrary string
  assert.throws(
    () => validateAllowedModel('"><script>alert(1)</script>'),
    ForbiddenModelError,
    'Malicious model ID should be blocked',
  );
  console.log('Success: Malicious model ID blocked.');

  // Test 4: Auto is a UI routing mode, never a provider model ID.
  assert.throws(
    () => validateAllowedModel('auto'),
    ForbiddenModelError,
    'Auto should not be sent to provider model validation',
  );
  console.log('Success: Auto is not accepted as a provider model.');

  // Test 5: UI generation policy adapts to the requested app type.
  assert.equal(
    classifyGeneratedAppType('Create a conversion landing page for an AI code assistant'),
    'landing_page',
  );
  assert.equal(
    classifyGeneratedAppType('Create a restaurant app with menu, reservation and reviews'),
    'restaurant',
  );
  assert.equal(
    classifyGeneratedAppType('Create an analytics dashboard with charts and KPI filters'),
    'analytics_dashboard',
  );
  assert.equal(
    classifyGeneratedAppType('Create an ecommerce shop with cart, products and checkout'),
    'ecommerce',
  );

  // Test 6: The world-class protocol rejects generic AI design and carries app-specific rules.
  const landingPolicy = buildWorldClassUiPolicy({
    prompt: 'Create a landing page for a developer AI tool',
  });
  assert.equal(landingPolicy.appType, 'landing_page');
  assert.equal(landingPolicy.designDirection, 'cinematic_landing');
  assert.ok(landingPolicy.systemPrompt.includes('Never produce UI that looks AI-generated'));
  assert.ok(landingPolicy.systemPrompt.includes('Break the generic hero pattern'));

  const dashboardPolicy = buildWorldClassUiPolicy({
    prompt: 'Create a dashboard for monitoring API usage and billing metrics',
  });
  assert.equal(dashboardPolicy.appType, 'analytics_dashboard');
  assert.equal(chooseDesignDirection(dashboardPolicy.appType, 'dashboard'), 'data_operational');
  assert.ok(dashboardPolicy.systemPrompt.includes('Never use a marketing hero'));

  console.log('Success: Adaptive world-class UI generation policy passed validation.');
  console.log('Tests completed.');
}

runTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
