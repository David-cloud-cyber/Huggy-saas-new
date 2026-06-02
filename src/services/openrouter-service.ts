import fetch from 'node-fetch';
import { validateAllowedModel } from './ai-validator.ts';
import { AI_MODEL_FALLBACKS, type AllowedModelId } from '../config/ai-models.ts';

export const OPENROUTER_API_KEY_ENV_NAMES = [
  'OPENROUTER_API_KEY',
  'OPEN_ROUTER_API_KEY',
  'OPENROUTER_KEY',
  'OPENROUTER_TOKEN',
] as const;

type OpenRouterEnv = Record<string, string | undefined>;

export function cleanOpenRouterHeaderValue(value: unknown): string {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

export function resolveOpenRouterApiKey(env: OpenRouterEnv = process.env, fallback = ''): string {
  const candidates = [
    ...OPENROUTER_API_KEY_ENV_NAMES.map(name => env[name]),
    fallback,
  ];
  for (const value of candidates) {
    const clean = cleanOpenRouterHeaderValue(value);
    if (clean && !clean.includes('***')) return clean;
  }
  return '';
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OpenRouterConfig {
  apiKey: string;
  siteUrl: string;
  appName: string;
}

export interface ChatCompletionResult {
  text: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cached_tokens?: number;
  };
  cost_usd: number;
}

export type StreamChatEvent =
  | { type: 'token'; text: string; model: string }
  | { type: 'usage'; usage: ChatCompletionResult['usage']; cost_usd: number; model: string };

export class OpenRouterService {
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = {
      apiKey: this.cleanHeaderValue(config.apiKey),
      siteUrl: this.cleanHeaderValue(config.siteUrl) || 'https://huggy.fun',
      appName: this.cleanHeaderValue(config.appName) || 'Huggy',
    };
  }

  /**
   * Main chat completion logic with exponential backoff retries, robust timeouts, and full token tracking.
   */
  async chat(modelId: string, messages: ChatMessage[], retryAttempts = 3, timeoutMs = 45000): Promise<ChatCompletionResult> {
    // 1. Validate models against strict allowlist
    validateAllowedModel(modelId);

    const fallbackModels = AI_MODEL_FALLBACKS[modelId as AllowedModelId] || [];
    for (const fb of fallbackModels) {
      validateAllowedModel(fb);
    }

    const payload = this.buildChatPayload(modelId, fallbackModels, messages);

    let attempt = 0;
    let delay = 1000; // start with 1s backoff

    while (attempt < retryAttempts) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: this.buildHeaders(),
          signal: controller.signal as any,
          body: JSON.stringify(payload)
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errMsg = await this.readProviderError(response);
          throw new Error(`OpenRouter HTTP ${response.status}: ${errMsg || response.statusText}`);
        }

        const data: any = await response.json();

        if (data?.error) {
          throw new Error(`OpenRouter API Error: ${data.error.message || JSON.stringify(data.error)}`);
        }

        const choice = data?.choices?.[0];
        const text = choice?.message?.content || choice?.text || '';
        
        // Extract token usage metrics
        const usage = data?.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        const prompt_tokens = usage.prompt_tokens || 0;
        const completion_tokens = usage.completion_tokens || 0;
        const total_tokens = usage.total_tokens || 0;
        const cached_tokens = data?.usage?.prompt_tokens_details?.cached || 0;

        // Custom price lookup matching OpenRouter standard rates where possible
        // or using estimated average fallback ($10 / million tokens for standard pro models)
        const real_or_est_cost = data?.price || this.estimateUsdCost(data?.model || modelId, prompt_tokens, completion_tokens);

        return {
          text,
          model: data?.model || modelId,
          usage: {
            prompt_tokens,
            completion_tokens,
            total_tokens,
            cached_tokens
          },
          cost_usd: real_or_est_cost
        };

      } catch (err: any) {
        if (attempt >= retryAttempts || err?.name === 'AbortError') {
          throw new Error(`Failed AI response after ${attempt} attempts: ${err.message}`);
        }
        console.warn(`[OPENROUTER CLIENT] Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
      }
    }

    throw new Error('Fallback block unreachable state.');
  }

  async getCatalog() {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) throw new Error('Failed to fetch OpenRouter catalog');
    return await response.json();
  }

  async *streamChat(modelId: string, messages: ChatMessage[], timeoutMs = 90000): AsyncGenerator<StreamChatEvent> {
    validateAllowedModel(modelId);

    const fallbackModels = AI_MODEL_FALLBACKS[modelId as AllowedModelId] || [];
    for (const fb of fallbackModels) {
      validateAllowedModel(fb);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: this.buildHeaders(),
        signal: controller.signal as any,
        body: JSON.stringify({
          ...this.buildChatPayload(modelId, fallbackModels, messages),
          stream: true,
          stream_options: { include_usage: true }
        })
      });

      if (!response.ok) {
        const errMsg = await this.readProviderError(response);
        throw new Error(`OpenRouter HTTP ${response.status}: ${errMsg || response.statusText}`);
      }

      if (!response.body) {
        throw new Error('OpenRouter streaming response body is empty');
      }

      let buffer = '';
      let model = modelId;

      for await (const chunk of response.body as any) {
        buffer += Buffer.from(chunk).toString('utf8');
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n').filter(line => line.startsWith('data:'));
          for (const line of lines) {
            const raw = line.replace(/^data:\s*/, '').trim();
            if (!raw || raw === '[DONE]') continue;

            let data: any;
            try {
              data = JSON.parse(raw);
            } catch {
              continue;
            }
            if (data?.error) {
              throw new Error(`OpenRouter API Error: ${data.error.message || JSON.stringify(data.error)}`);
            }
            model = data?.model || model;
            const text = data?.choices?.[0]?.delta?.content || data?.choices?.[0]?.text || '';
            if (text) {
              yield { type: 'token', text, model };
            }

            if (data?.usage) {
              const usage = data.usage;
              const promptTokens = usage.prompt_tokens || 0;
              const completionTokens = usage.completion_tokens || 0;
              yield {
                type: 'usage',
                model,
                usage: {
                  prompt_tokens: promptTokens,
                  completion_tokens: completionTokens,
                  total_tokens: usage.total_tokens || promptTokens + completionTokens,
                  cached_tokens: usage?.prompt_tokens_details?.cached || 0,
                },
                cost_usd: data?.price || this.estimateUsdCost(model, promptTokens, completionTokens),
              };
            }
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private cleanHeaderValue(value: string): string {
    return cleanOpenRouterHeaderValue(value);
  }

  private resolveApiKey(): string {
    return resolveOpenRouterApiKey(process.env, this.config.apiKey);
  }

  private buildHeaders() {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error('OpenRouter API key is not configured.');
    }

    return {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': this.config.siteUrl,
      'X-Title': this.config.appName,
      'Content-Type': 'application/json',
    };
  }

  private buildChatPayload(modelId: string, fallbackModels: AllowedModelId[], messages: ChatMessage[]) {
    const models = [modelId, ...fallbackModels].filter((model, index, list) => list.indexOf(model) === index);
    if (models.length > 1) {
      return {
        models,
        messages,
      };
    }

    return {
      model: modelId,
      messages,
    };
  }

  private async readProviderError(response: any): Promise<string> {
    const raw = await response.text().catch(() => '');
    if (!raw) return response.statusText || 'Provider returned an empty error response';

    try {
      const parsed = JSON.parse(raw);
      const error = parsed?.error || parsed;
      const message = String(error?.message || parsed?.message || '').trim();
      const code = String(error?.code || parsed?.code || '').trim();
      const metadata = code ? ` (${code})` : '';
      if (message) return `${message}${metadata}`;
    } catch {
      // Fall through to a bounded raw message. OpenRouter error bodies can be
      // verbose; never propagate arbitrary provider payloads into public UI.
    }

    return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 500);
  }

  private estimateUsdCost(model: string, prompt: number, completion: number): number {
    let inputRate = 0.000001;  // $1.00 per million
    let outputRate = 0.000003; // $3.00 per million

    const lower = model.toLowerCase();
    if (lower.includes('sonnet')) {
      inputRate = 0.000003;  // $3.00 per million
      outputRate = 0.000015; // $15.00 per million
    } else if (
      lower.includes('claude-opus') ||
      lower.includes('gpt-5.5-pro') ||
      lower.includes('gpt-5.5')
    ) {
      inputRate = 0.000015;  // $15.00 per million
      outputRate = 0.000075; // $75.00 per million
    } else if (lower.includes('flash') || lower.includes('nano')) {
      inputRate = 0.000000075;  // $0.075 per million
      outputRate = 0.0000003;   // $0.30 per million
    }

    return (prompt * inputRate) + (completion * outputRate);
  }
}
