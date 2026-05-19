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

export class OpenRouterService {
  private config: OpenRouterConfig;
  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  async chat(modelId: string, messages: ChatMessage[]) {
    // 1. Strict validation of primary model
    validateAllowedModel(modelId);

    // 2. Resolve and validate fallbacks
    const fallbackModels = AI_MODEL_FALLBACKS[modelId as AllowedModelId] || [];
    for (const fb of fallbackModels) {
      validateAllowedModel(fb);
    }

    // 3. Prepare OpenRouter request
    // We explicitly disable OpenRouter's internal fallback system to maintain strict control
    // if we use their internal fallback, we'd need to ensure every model in their list is in our whitelist.
    // Instead, we handle fallbacks manually or restrict OpenRouter to our specific list.
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'HTTP-Referer': this.config.siteUrl,
        'X-Title': this.config.appName,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: messages,
        models: [modelId, ...fallbackModels], // Only our allowed whitelist fallbacks
        route: 'fallback' // Use our specific list for fallbacks
      })
    });

    if (!response.ok) {
      const errorData = await response.json() as any;
      throw new Error(`OpenRouter Error: ${errorData?.error?.message || response.statusText}`);
    }

    return await response.json();
  }

  async getCatalog() {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) throw new Error('Failed to fetch OpenRouter catalog');
    return await response.json();
  }
}
