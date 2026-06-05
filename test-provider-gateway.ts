import assert from 'node:assert/strict';
import { ProviderGateway, ProviderGatewayError } from './src/services/provider-gateway.ts';
import { resolveOpenRouterApiKey, type ChatMessage } from './src/services/openrouter-service.ts';

const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

class FakeOpenRouter {
  calls: string[] = [];
  failures: Error[] = [];

  async chat(modelId: string) {
    this.calls.push(modelId);
    const failure = this.failures.shift();
    if (failure) throw failure;
    return {
      text: 'ok',
      model: modelId,
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      cost_usd: 0.001,
    };
  }

  async *streamChat(modelId: string) {
    this.calls.push(modelId);
    const failure = this.failures.shift();
    if (failure) throw failure;
    yield { type: 'token' as const, text: 'ok', model: modelId };
  }
}

{
  assert.equal(resolveOpenRouterApiKey({ OPEN_ROUTER_API_KEY: '  sk-or-alias\n' }), 'sk-or-alias');
  assert.equal(resolveOpenRouterApiKey({ OPENROUTER_API_KEY: '***redacted***', OPENROUTER_TOKEN: ' sk-or-token ' }), 'sk-or-token');
  assert.equal(resolveOpenRouterApiKey({ OPENROUTER_API_KEY: '***redacted***' }), '');
}

{
  const fake = new FakeOpenRouter();
  const gateway = new ProviderGateway(fake as any);
  await assert.rejects(() => gateway.chat('auto', messages), (error: any) => {
    assert.ok(error instanceof ProviderGatewayError);
    assert.equal(error.diagnosticCode, 'AUTO_MODEL_NOT_RESOLVED');
    return true;
  });
  assert.equal(fake.calls.length, 0);
}

{
  const fake = new FakeOpenRouter();
  fake.failures.push(new Error('OpenRouter HTTP 500: upstream unavailable'));
  const gateway = new ProviderGateway(fake as any);
  const result = await gateway.chat('google/gemini-3.5-flash', messages, { maxAttempts: 2 });
  assert.equal(result.text, 'ok');
  assert.equal(fake.calls.length, 2);
}

{
  const fake = new FakeOpenRouter();
  fake.failures.push(new Error('OpenRouter HTTP 401: invalid api key'));
  const gateway = new ProviderGateway(fake as any);
  await assert.rejects(() => gateway.chat('google/gemini-3.5-flash', messages), (error: any) => {
    assert.equal(error.diagnosticCode, 'OPENROUTER_KEY_INVALID');
    assert.equal(error.retryable, false);
    return true;
  });
  assert.equal(fake.calls.length, 1);
}

{
  const fake = new FakeOpenRouter();
  fake.failures.push(new Error('OpenRouter HTTP 404: model not available'));
  const gateway = new ProviderGateway(fake as any);
  const result = await gateway.chat('google/gemini-3-pro-preview', messages, { maxAttempts: 1 });
  assert.equal(result.text, 'ok');
  assert.equal(fake.calls[0], 'google/gemini-3-pro-preview');
  assert.notEqual(fake.calls[1], 'google/gemini-3-pro-preview');
}

{
  const fake = new FakeOpenRouter();
  fake.failures.push(...Array.from({ length: 20 }, () => new Error('AbortError: aborted')));
  const gateway = new ProviderGateway(fake as any, { failureThreshold: 50 });
  await assert.rejects(() => gateway.chat('google/gemini-3-pro-preview', messages, { maxAttempts: 1 }), (error: any) => {
    assert.ok(error instanceof ProviderGatewayError);
    assert.equal(error.diagnosticCode, 'PROVIDER_TIMEOUT');
    assert.equal(error.retryable, true);
    assert.match(error.message, /tried allowed fallbacks/i);
    return true;
  });
  assert.ok(fake.calls.length > 1);
  assert.equal(fake.calls.includes('auto'), false);
}

{
  const fake = new FakeOpenRouter();
  fake.failures.push(...Array.from({ length: 12 }, () => new Error('OpenRouter HTTP 500: upstream unavailable')));
  const gateway = new ProviderGateway(fake as any, { failureThreshold: 2, breakerMs: 60_000 });
  await assert.rejects(() => gateway.chat('google/gemini-3.5-flash', messages, { maxAttempts: 1 }));
  await assert.rejects(() => gateway.chat('google/gemini-3.5-flash', messages, { maxAttempts: 1 }));
  const snapshot = gateway.getCircuitSnapshot();
  assert.ok(snapshot.some(item => item.model_id === 'google/gemini-3.5-flash' && item.blocked));
}

console.log('test-provider-gateway passed');
