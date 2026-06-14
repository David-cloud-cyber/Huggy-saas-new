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
  'deepseek/deepseek-v4-flash',
  'Auto simple tasks should prefer the lightweight economy model.',
);

assert.equal(
  await router.selectModel({
    plan: 'free',
    mode: 'Auto',
    userCredits: 10,
    taskComplexity: 'medium',
  }),
  'deepseek/deepseek-v4-flash',
  'Auto medium tasks should avoid provider lock-in and use a capable free-tier model.',
);

assert.equal(
  await router.selectModel({
    plan: 'pro',
    mode: 'Auto',
    userCredits: 80,
    taskComplexity: 'complex',
  }),
  'moonshotai/kimi-k2.6',
  'Auto complex tasks should upgrade to a strong agentic coding model when plan and credits allow it.',
);

assert.equal(
  await router.selectModel({
    plan: 'scale',
    mode: 'Auto',
    userCredits: 120,
    taskComplexity: 'extreme',
  }),
  'anthropic/claude-fable-5',
  'Auto extreme tasks should use the frontier Fable model when available.',
);

assert.equal(
  await router.selectModel({
    plan: 'scale',
    mode: 'Custom',
    userCredits: 120,
    taskComplexity: 'extreme',
  }, '~anthropic/claude-fable-latest'),
  '~anthropic/claude-fable-latest',
  'Manual selection must respect the latest Fable alias.',
);

assert.equal(
  await router.selectModel({
    plan: 'scale',
    mode: 'Auto',
    userCredits: 100,
    taskComplexity: 'medium',
    preferredModels: ['anthropic/claude-opus-4.8', 'anthropic/claude-opus-4.8-fast', 'anthropic/claude-opus-4.7'],
  }),
  'anthropic/claude-opus-4.8',
  'Studio Design/Decks auto routing should prioritize Opus when plan and credits allow it.',
);

assert.equal(
  await router.selectModel({
    plan: 'free',
    mode: 'Auto',
    userCredits: 10,
    taskComplexity: 'medium',
    preferredModels: ['anthropic/claude-opus-4.8', 'anthropic/claude-opus-4.8-fast', 'anthropic/claude-opus-4.7'],
  }),
  'deepseek/deepseek-v4-flash',
  'Studio Opus preference should fall back to the diversified safe router when Opus is not available.',
);

console.log('model-router tests passed');
