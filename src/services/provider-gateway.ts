import {
  AI_MODEL_FALLBACKS,
  DEFAULT_PROVIDER_MODEL_ID,
  isAllowedModelId,
  type AllowedModelId,
} from '../config/ai-models.ts';
import { validateAllowedModel } from './ai-validator.ts';
import type { ChatCompletionResult, ChatMessage, OpenRouterService, StreamChatEvent } from './openrouter-service.ts';
import type { ProviderRequestConfig } from './provider-adapters.ts';

type CircuitState = {
  failures: number;
  blockedUntil: number;
};

type ModelRuntimeMetric = {
  model_id: string;
  requests: number;
  successes: number;
  failures: number;
  retries: number;
  fallback_uses: number;
  total_latency_ms: number;
  last_error_code: string | null;
  last_used_at: string | null;
};

export class ProviderGatewayError extends Error {
  diagnosticCode: string;
  statusCode: number;
  retryable: boolean;
  modelId?: string;

  constructor(message: string, options: { diagnosticCode: string; statusCode?: number; retryable?: boolean; modelId?: string }) {
    super(message);
    this.name = 'ProviderGatewayError';
    this.diagnosticCode = options.diagnosticCode;
    this.statusCode = options.statusCode || 502;
    this.retryable = Boolean(options.retryable);
    this.modelId = options.modelId;
  }
}

export class ProviderGateway {
  private circuits = new Map<string, CircuitState>();
  private metrics = new Map<string, ModelRuntimeMetric>();
  private openRouter: OpenRouterService;
  private options: { breakerMs?: number; failureThreshold?: number };

  constructor(openRouter: OpenRouterService, options: { breakerMs?: number; failureThreshold?: number } = {}) {
    this.openRouter = openRouter;
    this.options = options;
  }

  resolveAutoModel(policy: 'economy' | 'balanced' | 'premium' | 'auto' = 'auto'): AllowedModelId {
    if (policy === 'premium') return 'google/gemini-3-pro-preview';
    if (policy === 'economy') return 'google/gemini-3.5-flash';
    return DEFAULT_PROVIDER_MODEL_ID;
  }

  async chat(modelId: string, messages: ChatMessage[], options: {
    timeoutMs?: number;
    maxAttempts?: number;
    runtimeConfig?: ProviderRequestConfig;
    runtimeConfigForModel?: (modelId: AllowedModelId) => ProviderRequestConfig | undefined;
  } = {}): Promise<ChatCompletionResult> {
    const primary = this.requireProviderModel(modelId);
    const candidates = this.candidatesFor(primary);
    const maxAttempts = Math.max(1, options.maxAttempts || 2);
    let lastError: any = null;

    for (const candidate of candidates) {
      const candidateRuntimeConfig = options.runtimeConfigForModel?.(candidate) || options.runtimeConfig;
      if (candidate !== primary) this.noteFallbackUse(candidate);
      const circuitError = this.getCircuitError(candidate);
      if (circuitError) {
        lastError = circuitError;
        continue;
      }
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const startedAt = Date.now();
        this.noteRequest(candidate);
        try {
          const result = await this.openRouter.chat(candidate, messages, 1, options.timeoutMs || 45_000, candidateRuntimeConfig);
          this.noteMetricSuccess(candidate, Date.now() - startedAt);
          this.noteSuccess(candidate);
          return result;
        } catch (error: any) {
          lastError = error;
          const classified = this.classifyError(error, candidate);
          if (classified.diagnosticCode === 'PROVIDER_UNSUPPORTED_RUNTIME_CONFIG' && candidateRuntimeConfig) {
            try {
              this.noteRetry(candidate);
              const result = await this.openRouter.chat(candidate, messages, 1, options.timeoutMs || 45_000);
              this.noteMetricSuccess(candidate, Date.now() - startedAt);
              this.noteSuccess(candidate);
              return result;
            } catch (degradedError: any) {
              lastError = degradedError;
            }
          }
          this.noteFailure(candidate, classified.retryable);
          this.noteMetricFailure(candidate, classified.diagnosticCode, Date.now() - startedAt);
          if (!classified.retryable) throw classified;
          if (attempt >= maxAttempts) break;
          this.noteRetry(candidate);
          await sleep(250 * attempt);
        }
      }
    }

    throw this.classifyError(lastError, primary);
  }

  async *streamChat(modelId: string, messages: ChatMessage[], options: {
    timeoutMs?: number;
    runtimeConfig?: ProviderRequestConfig;
    runtimeConfigForModel?: (modelId: AllowedModelId) => ProviderRequestConfig | undefined;
  } = {}): AsyncGenerator<StreamChatEvent> {
    const primary = this.requireProviderModel(modelId);
    const candidates = this.candidatesFor(primary);
    let lastError: any = null;

    for (const candidate of candidates) {
      const candidateRuntimeConfig = options.runtimeConfigForModel?.(candidate) || options.runtimeConfig;
      if (candidate !== primary) this.noteFallbackUse(candidate);
      const circuitError = this.getCircuitError(candidate);
      if (circuitError) {
        lastError = circuitError;
        continue;
      }
      let yieldedAnyEvent = false;
      const startedAt = Date.now();
      this.noteRequest(candidate);
      try {
        for await (const event of this.openRouter.streamChat(candidate, messages, options.timeoutMs || 90_000, candidateRuntimeConfig)) {
          yieldedAnyEvent = true;
          yield event;
        }
        this.noteMetricSuccess(candidate, Date.now() - startedAt);
        this.noteSuccess(candidate);
        return;
      } catch (error: any) {
        lastError = error;
        const classified = this.classifyError(error, candidate);
        if (!yieldedAnyEvent && classified.diagnosticCode === 'PROVIDER_UNSUPPORTED_RUNTIME_CONFIG' && candidateRuntimeConfig) {
          try {
            this.noteRetry(candidate);
            for await (const event of this.openRouter.streamChat(candidate, messages, options.timeoutMs || 90_000)) {
              yieldedAnyEvent = true;
              yield event;
            }
            this.noteMetricSuccess(candidate, Date.now() - startedAt);
            this.noteSuccess(candidate);
            return;
          } catch (degradedError: any) {
            lastError = degradedError;
          }
        }
        this.noteFailure(candidate, classified.retryable);
        this.noteMetricFailure(candidate, classified.diagnosticCode, Date.now() - startedAt);
        if (yieldedAnyEvent || !classified.retryable) throw classified;
      }
    }

    throw this.classifyError(lastError, primary);
  }

  getCircuitSnapshot() {
    const now = Date.now();
    return Array.from(this.circuits.entries()).map(([model_id, state]) => ({
      model_id,
      failures: state.failures,
      blocked: state.blockedUntil > now,
      blocked_until: state.blockedUntil > now ? new Date(state.blockedUntil).toISOString() : null,
    }));
  }

  getRuntimeMetricsSnapshot() {
    return Array.from(this.metrics.values()).map(item => ({
      ...item,
      average_latency_ms: item.requests ? Math.round(item.total_latency_ms / item.requests) : 0,
    }));
  }

  private requireProviderModel(modelId: string): AllowedModelId {
    if (!modelId || modelId === 'auto') {
      throw new ProviderGatewayError('Internal model routing error: auto must be resolved before provider calls.', {
        diagnosticCode: 'AUTO_MODEL_NOT_RESOLVED',
        statusCode: 500,
        retryable: false,
        modelId,
      });
    }
    validateAllowedModel(modelId);
    if (!isAllowedModelId(modelId)) {
      throw new ProviderGatewayError('Selected model is not allowed.', {
        diagnosticCode: 'MODEL_NOT_ALLOWED',
        statusCode: 403,
        retryable: false,
        modelId,
      });
    }
    return modelId;
  }

  private candidatesFor(modelId: AllowedModelId): AllowedModelId[] {
    return [modelId, ...(AI_MODEL_FALLBACKS[modelId] || [])]
      .filter((candidate, index, list) => list.indexOf(candidate) === index)
      .filter(isAllowedModelId);
  }

  private getCircuitError(modelId: AllowedModelId): ProviderGatewayError | null {
    const state = this.circuits.get(modelId);
    if (state && state.blockedUntil > Date.now()) {
      return new ProviderGatewayError('The selected AI model is temporarily paused after repeated provider failures. Choose Auto or retry shortly.', {
        diagnosticCode: 'PROVIDER_CIRCUIT_OPEN',
        statusCode: 503,
        retryable: true,
        modelId,
      });
    }
    return null;
  }

  private noteSuccess(modelId: AllowedModelId) {
    this.circuits.delete(modelId);
  }

  private noteFailure(modelId: AllowedModelId, retryable: boolean) {
    if (!retryable) return;
    const threshold = this.options.failureThreshold || 3;
    const current = this.circuits.get(modelId) || { failures: 0, blockedUntil: 0 };
    const failures = current.failures + 1;
    this.circuits.set(modelId, {
      failures,
      blockedUntil: failures >= threshold ? Date.now() + (this.options.breakerMs || 90_000) : 0,
    });
  }

  private metricFor(modelId: string): ModelRuntimeMetric {
    const current = this.metrics.get(modelId);
    if (current) return current;
    const next: ModelRuntimeMetric = {
      model_id: modelId,
      requests: 0,
      successes: 0,
      failures: 0,
      retries: 0,
      fallback_uses: 0,
      total_latency_ms: 0,
      last_error_code: null,
      last_used_at: null,
    };
    this.metrics.set(modelId, next);
    return next;
  }

  private noteRequest(modelId: string) {
    const metric = this.metricFor(modelId);
    metric.requests += 1;
    metric.last_used_at = new Date().toISOString();
  }

  private noteRetry(modelId: string) {
    this.metricFor(modelId).retries += 1;
  }

  private noteFallbackUse(modelId: string) {
    this.metricFor(modelId).fallback_uses += 1;
  }

  private noteMetricSuccess(modelId: string, latencyMs: number) {
    const metric = this.metricFor(modelId);
    metric.successes += 1;
    metric.total_latency_ms += Math.max(0, latencyMs);
    metric.last_error_code = null;
  }

  private noteMetricFailure(modelId: string, diagnosticCode: string, latencyMs: number) {
    const metric = this.metricFor(modelId);
    metric.failures += 1;
    metric.total_latency_ms += Math.max(0, latencyMs);
    metric.last_error_code = diagnosticCode;
  }

  private classifyError(error: any, modelId: string): ProviderGatewayError {
    if (error instanceof ProviderGatewayError) return error;
    const message = String(error?.message || error || 'AI provider request failed.');
    if (/auto must be resolved/i.test(message)) {
      return new ProviderGatewayError(message, { diagnosticCode: 'AUTO_MODEL_NOT_RESOLVED', statusCode: 500, retryable: false, modelId });
    }
    if (/not configured|OPENROUTER_API_KEY/i.test(message)) {
      return new ProviderGatewayError('OpenRouter is not configured. Add OPENROUTER_API_KEY on Railway and redeploy. The backend also accepts OPEN_ROUTER_API_KEY, OPENROUTER_KEY, or OPENROUTER_TOKEN.', {
        diagnosticCode: 'OPENROUTER_NOT_CONFIGURED',
        statusCode: 503,
        retryable: false,
        modelId,
      });
    }
    if (/401|403|invalid api key|unauthorized|permission/i.test(message)) {
      return new ProviderGatewayError('OpenRouter key invalid or unauthorized. Update OPENROUTER_API_KEY on Railway and redeploy.', {
        diagnosticCode: 'OPENROUTER_KEY_INVALID',
        statusCode: 503,
        retryable: false,
        modelId,
      });
    }
    if (/402|quota|billing|insufficient.*credit|payment required/i.test(message)) {
      return new ProviderGatewayError('The AI provider rejected the request because the provider account has insufficient credits or quota.', {
        diagnosticCode: 'PROVIDER_QUOTA_OR_BILLING',
        statusCode: 503,
        retryable: false,
        modelId,
      });
    }
    if (/404|model.*not.*found|not found|not available/i.test(message)) {
      return new ProviderGatewayError('The selected AI model is unavailable on OpenRouter. Choose Auto or another allowed model.', {
        diagnosticCode: 'MODEL_UNAVAILABLE',
        statusCode: 502,
        retryable: true,
        modelId,
      });
    }
    if (/429|rate limit|too many requests/i.test(message)) {
      return new ProviderGatewayError('OpenRouter rate limit reached. Please wait a moment and try again.', {
        diagnosticCode: 'PROVIDER_RATE_LIMITED',
        statusCode: 429,
        retryable: true,
        modelId,
      });
    }
    if (/unsupported parameter|unsupported.*response_format|tool_choice|tools|reasoning|json_schema/i.test(message)) {
      return new ProviderGatewayError('The selected model rejected an advanced runtime option. Huggy will retry with a simpler compatible request.', {
        diagnosticCode: 'PROVIDER_UNSUPPORTED_RUNTIME_CONFIG',
        statusCode: 502,
        retryable: true,
        modelId,
      });
    }
    if (/400|bad request|invalid request|provider rejected/i.test(message)) {
      return new ProviderGatewayError('OpenRouter rejected the AI request format. Retry with Auto; if it keeps happening, check the selected model and Railway logs.', {
        diagnosticCode: 'PROVIDER_BAD_REQUEST',
        statusCode: 502,
        retryable: false,
        modelId,
      });
    }
    if (/timeout|AbortError|aborted|OpenRouter HTTP 5|ECONNRESET|ENOTFOUND|fetch failed|network|provider|upstream/i.test(message)) {
      const isTimeout = /timeout|AbortError|aborted/i.test(message);
      return new ProviderGatewayError(isTimeout
        ? 'The AI provider did not answer in time after Huggy tried allowed fallbacks.'
        : 'The AI provider is temporarily unavailable after Huggy tried allowed fallbacks.', {
        diagnosticCode: isTimeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
        statusCode: isTimeout ? 504 : 502,
        retryable: true,
        modelId,
      });
    }
    return new ProviderGatewayError(message, {
      diagnosticCode: 'PROVIDER_REQUEST_FAILED',
      statusCode: error?.statusCode || 502,
      retryable: false,
      modelId,
    });
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
