import assert from 'node:assert/strict';
import { ModelRouter } from './src/services/model-router.ts';

const router = new ModelRouter();

assert.equal(
  await router.selectModel({
    plan: 'free',
    mode: 'Auto',
    userCredits: 10,
    taskComplexity: 'simple',
  }),
  'openai/gpt-5-mini',
  'Auto simple tasks should prefer the lightweight economy model.',
);

assert.equal(
  await router.selectModel({
    plan: 'free',
    mode: 'Auto',
    userCredits: 10,
    taskComplexity: 'medium',
  }),
  'google/gemini-3.5-flash',
  'Auto medium tasks should use the balanced free-tier default.',
);

assert.equal(
  await router.selectModel({
    plan: 'pro',
    mode: 'Auto',
    userCredits: 80,
    taskComplexity: 'complex',
  }),
  'google/gemini-3-pro-preview',
  'Auto complex tasks should upgrade to a stronger Pro model when plan and credits allow it.',
);

assert.equal(
  await router.selectModel({
    plan: 'business',
    mode: 'Auto',
    userCredits: 100,
    taskComplexity: 'extreme',
  }),
  'anthropic/claude-opus-4.8-fast',
  'Auto extreme tasks should use the premium fast model when available.',
);

console.log('model-router tests passed');
