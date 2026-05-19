import axios from 'axios';
import { IncomingMessage } from 'http';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

export interface ModelDetails {
  id: string;
  name: string;
  tier: 'economy' | 'standard' | 'pro' | 'premium' | 'max-quality';
  promptCostPerMillion: number; // USD
  completionCostPerMillion: number; // USD
  capabilities: string[];
}

export class OpenRouterService {
  // Configured model list with specific tier pricing
  static MODELS: Record<string, ModelDetails> = {
    'google/gemini-2.5-flash': {
      id: 'google/gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      tier: 'economy',
      promptCostPerMillion: 0.075,
      completionCostPerMillion: 0.30,
      capabilities: ['Economy', 'Speed', 'Vision']
    },
    'anthropic/claude-3.5-haiku': {
      id: 'anthropic/claude-3.5-haiku',
      name: 'Claude 3.5 Haiku',
      tier: 'standard',
      promptCostPerMillion: 0.80,
      completionCostPerMillion: 4.00,
      capabilities: ['Standard', 'Code', 'Speed']
    },
    'anthropic/claude-3.5-sonnet': {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet',
      tier: 'pro',
      promptCostPerMillion: 3.00,
      completionCostPerMillion: 15.00,
      capabilities: ['Pro', 'Code', 'Complex UI']
    },
    'openai/gpt-4o': {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      tier: 'premium',
      promptCostPerMillion: 2.50,
      completionCostPerMillion: 10.00,
      capabilities: ['Premium', 'Reasoning', 'Vision']
    },
    'deepseek/deepseek-r1': {
      id: 'deepseek/deepseek-r1',
      name: 'DeepSeek R1',
      tier: 'max-quality',
      promptCostPerMillion: 2.00,
      completionCostPerMillion: 8.00,
      capabilities: ['Max Quality', 'Reasoning', 'Complex Math']
    }
  };

  /**
   * Resolves the selected routing mode/custom option to a concrete OpenRouter model
   */
  static resolveModel(mode: string, customModel?: string): ModelDetails {
    if (mode === 'custom' && customModel && this.MODELS[customModel]) {
      return this.MODELS[customModel];
    }

    switch (mode) {
      case 'fast':
      case 'economy':
        return this.MODELS['google/gemini-2.5-flash'];
      case 'balanced':
      case 'standard':
        return this.MODELS['anthropic/claude-3.5-haiku'];
      case 'pro':
        return this.MODELS['anthropic/claude-3.5-sonnet'];
      case 'max-quality':
        return this.MODELS['deepseek/deepseek-r1'];
      case 'auto':
      default:
        // Default Auto resolves standard tasks to haiku, large/code tasks to sonnet
        return this.MODELS['anthropic/claude-3.5-haiku'];
    }
  }

  /**
   * Calls OpenRouter completions endpoint with streaming support (Server-Sent Events)
   */
  static async streamCompletion(
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    onChunk: (text: string) => void
  ): Promise<{ promptTokens: number; completionTokens: number; totalCostUsd: number }> {
    const model = this.MODELS[modelId] || this.MODELS['google/gemini-2.5-flash'];

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model.id,
        messages,
        stream: true
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://huggy.ai',
          'X-Title': 'Huggy SaaS Platform'
        },
        responseType: 'stream'
      }
    );

    const stream = response.data as IncomingMessage;
    let accumulatedText = '';
    let promptTokens = 0;
    let completionTokens = 0;

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.includes('[DONE]')) continue;
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.replace('data: ', ''));
              const content = data.choices?.[0]?.delta?.content || '';
              if (content) {
                accumulatedText += content;
                onChunk(content);
              }
              // Extract usage metadata if returned by provider
              if (data.usage) {
                promptTokens = data.usage.prompt_tokens;
                completionTokens = data.usage.completion_tokens;
              }
            } catch (err) {
              // ignore malformed JSON chunks
            }
          }
        }
      });

      stream.on('end', () => {
        // Fallback token estimations if usage isn't returned
        if (promptTokens === 0) {
          promptTokens = Math.ceil(messages.reduce((acc, m) => acc + m.content.length, 0) / 4);
          completionTokens = Math.ceil(accumulatedText.length / 4);
        }

        const costPrompt = (promptTokens / 1000000) * model.promptCostPerMillion;
        const costCompletion = (completionTokens / 1000000) * model.completionCostPerMillion;
        const totalCostUsd = costPrompt + costCompletion;

        resolve({
          promptTokens,
          completionTokens,
          totalCostUsd
        });
      });

      stream.on('error', (err) => reject(err));
    });
  }
}
