import fetch from 'node-fetch';
import { validateAllowedModel } from './ai-validator.ts';
import { AI_MODEL_FALLBACKS, type AllowedModelId } from '../config/ai-models.ts';

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
    this.config = config;
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

    const payload = {
      model: modelId,
      messages: messages,
      models: [modelId, ...fallbackModels],
      route: 'fallback'
    };

    let attempt = 0;
    let delay = 1000; // start with 1s backoff

    while (attempt < retryAttempts) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.maskApiKey(this.config.apiKey)}`,
            'HTTP-Referer': this.config.siteUrl,
            'X-Title': this.config.appName,
            'Content-Type': 'application/json'
          },
          signal: controller.signal as any,
          body: JSON.stringify(payload)
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errMsg = await response.text();
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
        headers: {
          'Authorization': `Bearer ${this.maskApiKey(this.config.apiKey)}`,
          'HTTP-Referer': this.config.siteUrl,
          'X-Title': this.config.appName,
          'Content-Type': 'application/json'
        },
        signal: controller.signal as any,
        body: JSON.stringify({
          model: modelId,
          messages,
          models: [modelId, ...fallbackModels],
          route: 'fallback',
          stream: true,
          stream_options: { include_usage: true }
        })
      });

      if (!response.ok) {
        const errMsg = await response.text();
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

  private maskApiKey(key: string): string {
    // Return key, or if it looks unmasked, fetch standard configuration safely
    if (key.includes('***')) {
      const actualFromEnv = process.env.OPENROUTER_API_KEY || '';
      return actualFromEnv;
    }
    return key;
  }

  private estimateUsdCost(model: string, prompt: number, completion: number): number {
    let inputRate = 0.000001;  // $1.00 per million
    let outputRate = 0.000003; // $3.00 per million

    const lower = model.toLowerCase();
    if (lower.includes('claude-3-5') || lower.includes('sonnet')) {
      inputRate = 0.000003;  // $3.00 per million
      outputRate = 0.000015; // $15.00 per million
    } else if (lower.includes('claude-opus') || lower.includes('gpt-5.5-pro')) {
      inputRate = 0.000015;  // $15.00 per million
      outputRate = 0.000075; // $75.00 per million
    } else if (lower.includes('flash') || lower.includes('nano')) {
      inputRate = 0.000000075;  // $0.075 per million
      outputRate = 0.0000003;   // $0.30 per million
    }

    return (prompt * inputRate) + (completion * outputRate);
  }
}
