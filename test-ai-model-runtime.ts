import assert from 'node:assert/strict';
import { AI_ALLOWED_MODELS, MODEL_REGISTRY, type AllowedModelId } from './src/config/ai-models.ts';
import {
  buildAIModelRuntimeConfig,
  getAIModelCapabilityProfile,
  getAllAIModelCapabilityProfiles,
} from './src/services/ai-model-runtime.ts';
import { buildProviderRequestConfig, toOpenRouterChatPayloadExtras } from './src/services/provider-adapters.ts';
import { ModelRouter } from './src/services/model-router.ts';

const profiles = getAllAIModelCapabilityProfiles();

assert.equal(profiles.length, MODEL_REGISTRY.length, 'Every allowed model should have a runtime profile.');
for (const modelId of AI_ALLOWED_MODELS) {
  const profile = getAIModelCapabilityProfile(modelId);
  assert.equal(profile.id, modelId);
  assert.ok(profile.displayName);
  assert.ok(profile.bestUse.length > 0);
  assert.ok(profile.recommended.maxTokens >= 3000);
  assert.ok(profile.recommended.timeoutMs >= 12_000);
  assert.ok(profile.fallbackPrimary);
  assert.notEqual(profile.fallbackPrimary, modelId, 'Fallback should not point to the same primary model.');
}

{
  const runtime = buildAIModelRuntimeConfig({
    modelId: 'openai/gpt-5-mini',
    task: 'conversation',
    stream: true,
  });
  assert.equal(runtime.task, 'conversation');
  assert.equal(runtime.stream, true);
  assert.equal(runtime.responseFormat.type, 'text');
  assert.equal(runtime.tools.length, 0, 'Simple conversation must not force tool calling.');
  assert.ok(runtime.temperature > 0.3, 'Conversation should stay warmer than code generation.');
}

{
  const runtime = buildAIModelRuntimeConfig({
    modelId: 'anthropic/claude-opus-4.8',
    task: 'backend_generation',
    stream: false,
    estimatedInputTokens: 160_000,
  });
  assert.equal(runtime.longContext.enabled, true);
  assert.ok(runtime.tools.length > 0, 'Agentic build tasks should enable tools when the model supports them.');
  assert.ok(runtime.maxTokens >= 9000, 'Code generation should reserve enough output tokens.');
}

{
  const runtime = buildAIModelRuntimeConfig({
    modelId: 'google/gemini-3-pro-preview',
    task: 'intent',
  });
  assert.notEqual(runtime.responseFormat.type, 'text', 'Intent routing should request structured output when supported.');
  const providerConfig = buildProviderRequestConfig(runtime);
  assert.equal(providerConfig.adapter, 'gemini');
  assert.deepEqual(providerConfig.responseFormat, { response_mime_type: 'application/json' });
}

{
  const runtime = buildAIModelRuntimeConfig({
    modelId: 'deepseek/deepseek-v4-flash',
    task: 'debug',
  });
  const providerConfig = buildProviderRequestConfig(runtime);
  const extras = toOpenRouterChatPayloadExtras(providerConfig);
  assert.equal(providerConfig.adapter, 'deepseek');
  assert.equal('response_format' in extras, false, 'DeepSeek should not receive structured output unless the registry says it supports it.');
}

{
  const openAiRuntime = buildAIModelRuntimeConfig({ modelId: 'openai/gpt-5.5', task: 'security' });
  const anthropicRuntime = buildAIModelRuntimeConfig({ modelId: 'anthropic/claude-sonnet-4.6', task: 'security' });
  const openAiConfig = buildProviderRequestConfig(openAiRuntime);
  const anthropicConfig = buildProviderRequestConfig(anthropicRuntime);
  assert.notDeepEqual(openAiConfig, anthropicConfig, 'Provider adapters must not produce one generic request shape.');
}

{
  const router = new ModelRouter();
  const selected = await router.selectModel({
    plan: 'scale',
    mode: 'Custom',
    userCredits: 100,
    taskComplexity: 'extreme',
  }, 'anthropic/claude-opus-4.8');
  assert.equal(selected, 'anthropic/claude-opus-4.8', 'Manual model selection must be respected when allowed.');
}

{
  const router = new ModelRouter();
  const selected = await router.selectModel({
    plan: 'scale',
    mode: 'Auto',
    userCredits: 100,
    taskComplexity: 'extreme',
    requiredCapabilities: {
      reasoning: true,
      code: true,
      agentic: true,
      structuredOutput: true,
      longContext: true,
    },
  });
  const profile = getAIModelCapabilityProfile(selected as AllowedModelId);
  assert.notEqual(profile.reasoning, 'low');
  assert.notEqual(profile.code, 'low');
  assert.equal(profile.supports.longContext, true);
}

// Thinking/reasoning budget tests
{
  const runtime = buildAIModelRuntimeConfig({ modelId: 'openai/gpt-5.5', task: 'security' });
  assert.ok(runtime.thinking, 'Runtime config should include thinking section');
  assert.ok(runtime.thinking.budgetTokens > 0, 'Security task with reasoning model should get a thinking budget');
  assert.equal(runtime.thinking.includeInResponse, false, 'Thinking should not be included in user-facing response');
  assert.equal(runtime.thinking.enabled, true, 'Thinking should be enabled for security task with reasoning model');
}

{
  const runtime = buildAIModelRuntimeConfig({ modelId: 'openai/gpt-5-mini', task: 'conversation' });
  assert.ok('thinking' in runtime, 'All runtime configs should include thinking section');
}

// Expanded reasoning control detection
{
  const anthropicProfile = getAIModelCapabilityProfile('anthropic/claude-opus-4.8');
  assert.equal(anthropicProfile.supports.reasoningControl, true, 'Claude Opus should support reasoning control');
}

{
  const anthropicSonnetProfile = getAIModelCapabilityProfile('anthropic/claude-sonnet-4.6');
  assert.equal(anthropicSonnetProfile.supports.reasoningControl, true, 'Claude Sonnet 4.6 should support reasoning control');
}

// Temperature safety via provider adapters
{
  const runtime = buildAIModelRuntimeConfig({ modelId: 'anthropic/claude-opus-4.8', task: 'security', stream: true });
  const providerConfig = buildProviderRequestConfig(runtime);
  if (runtime.thinking.enabled) {
    assert.equal(providerConfig.temperature, 1.0, 'Thinking-enabled models should use temperature 1.0 for safety');
    assert.ok(providerConfig.thinking_budget! > 0, 'Provider config should forward thinking budget');
  }
}

// Thinking budget for OpenRouter extras
{
  const runtime = buildAIModelRuntimeConfig({ modelId: 'openai/gpt-5.5', task: 'backend_generation' });
  const providerConfig = buildProviderRequestConfig(runtime);
  const extras = toOpenRouterChatPayloadExtras(providerConfig);
  if (providerConfig.thinking_budget) {
    assert.ok(extras.thinking, 'OpenRouter extras should forward thinking params');
  }
}
console.log('ai-model-runtime tests passed');

