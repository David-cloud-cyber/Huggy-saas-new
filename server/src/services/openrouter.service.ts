import axios from 'axios';
import { IncomingMessage } from 'http';
import {
  AI_ALLOWED_MODELS,
  AI_MODEL_CAPABILITIES,
  AI_MODEL_PLAN_ACCESS,
  AI_MODEL_TIERS,
  ForbiddenModelError,
  InsufficientCreditsError,
  ModelNotAllowedForPlanError,
  ModelUnavailableError,
  NegativeMarginBlockedError,
  getAllowedFallbacks,
  getConfiguredAllowedModels,
  validateAllowedModel,
  type AiAllowedModelId,
  type AiBlockedSource,
  type AiModelTier,
  type AiPlanKey,
} from '../config/ai-models';

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const SELL_VALUE_PER_CREDIT = 0.20;
const MIN_MARGIN_MULTIPLIER = 2.5;

export interface ModelDetails {
  id: AiAllowedModelId;
  name: string;
  tier: AiModelTier;
  promptCostPerMillion: number;
  completionCostPerMillion: number;
  capabilities: string[];
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  maxContextTokens: number;
  isAvailable: boolean;
}

export interface RoutingInput {
  mode?: string;
  customModel?: string;
  planKey?: AiPlanKey;
  availableCredits?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  requiresVision?: boolean;
  requiresTools?: boolean;
  minMarginMultiplier?: number;
  source?: AiBlockedSource;
  organizationId?: string;
  userId?: string;
}

export interface SyncOpenRouterModelResult {
  id: AiAllowedModelId;
  isAvailable: boolean;
  promptCostPerMillion?: number;
  completionCostPerMillion?: number;
}

export class OpenRouterService {
  static MODELS: Record<AiAllowedModelId, ModelDetails> = Object.fromEntries(
    AI_ALLOWED_MODELS.map((id) => {
      const capabilities = AI_MODEL_CAPABILITIES[id];
      return [
        id,
        {
          id,
          name: capabilities.displayName,
          tier: AI_MODEL_TIERS[id],
          promptCostPerMillion: capabilities.promptCostPerMillion,
          completionCostPerMillion: capabilities.completionCostPerMillion,
          capabilities: capabilities.capabilities,
          supportsStreaming: capabilities.supportsStreaming,
          supportsTools: capabilities.supportsTools,
          supportsVision: capabilities.supportsVision,
          supportsJsonMode: capabilities.supportsJsonMode,
          maxContextTokens: capabilities.maxContextTokens,
          isAvailable: true,
        },
      ];
    })
  ) as Record<AiAllowedModelId, ModelDetails>;

  static validateAllowedModel = validateAllowedModel;
  static getAllowedFallbacks = getAllowedFallbacks;
  static ForbiddenModelError = ForbiddenModelError;
  static ModelUnavailableError = ModelUnavailableError;
  static ModelNotAllowedForPlanError = ModelNotAllowedForPlanError;
  static InsufficientCreditsError = InsufficientCreditsError;
  static NegativeMarginBlockedError = NegativeMarginBlockedError;

  static listAllowedModels(): ModelDetails[] {
    return getConfiguredAllowedModels(process.env.AI_ALLOWED_MODELS).map((modelId) => this.getModel(modelId));
  }

  static getModel(modelId: string, source: AiBlockedSource = 'api'): ModelDetails {
    validateAllowedModel(modelId, { source });
    const model = this.MODELS[modelId];
    if (!model) throw new ModelUnavailableError(modelId);
    return model;
  }

  /**
   * Resolves a routing mode or custom choice to a concrete whitelisted model.
   * This method is intentionally fail-closed: unknown custom models throw, and
   * unavailable models are not silently replaced with unlisted fallbacks.
   */
  static resolveModel(mode = 'auto', customModel?: string, input: RoutingInput = {}): ModelDetails {
    const source: AiBlockedSource = input.source ?? (mode === 'custom' ? 'custom' : 'auto');
    const planKey = this.normalizePlanKey(input.planKey);
    const planTiers = AI_MODEL_PLAN_ACCESS[planKey];

    let candidateIds: AiAllowedModelId[];

    if (mode === 'custom') {
      if (!customModel) throw new ForbiddenModelError('missing_custom_model');
      validateAllowedModel(customModel, { source, organizationId: input.organizationId, userId: input.userId });
      candidateIds = [customModel];
    } else {
      candidateIds = this.modelIdsForMode(mode);
    }

    const allowedCandidates = candidateIds
      .map((modelId) => this.getModel(modelId, source))
      .filter((model) => planTiers.includes(model.tier))
      .filter((model) => !input.requiresVision || model.supportsVision)
      .filter((model) => !input.requiresTools || model.supportsTools);

    if (allowedCandidates.length === 0) {
      const firstCandidate = candidateIds[0];
      if (firstCandidate && !planTiers.includes(AI_MODEL_TIERS[firstCandidate])) {
        throw new ModelNotAllowedForPlanError(firstCandidate, planKey);
      }
      throw new ModelUnavailableError(candidateIds[0] ?? 'no_allowed_model');
    }

    const selected = allowedCandidates.find((model) => model.isAvailable) ?? allowedCandidates[0];
    validateAllowedModel(selected.id, { source, organizationId: input.organizationId, userId: input.userId });
    if (!selected.isAvailable) throw new ModelUnavailableError(selected.id);

    const estimate = this.estimateCredits(selected, input.estimatedInputTokens ?? 0, input.estimatedOutputTokens ?? 800);
    const minMargin = input.minMarginMultiplier ?? MIN_MARGIN_MULTIPLIER;
    if (estimate.marginMultiplier < minMargin) throw new NegativeMarginBlockedError(selected.id, estimate.marginMultiplier);
    if (input.availableCredits !== undefined && estimate.credits > input.availableCredits) {
      throw new InsufficientCreditsError(estimate.credits, input.availableCredits);
    }

    return selected;
  }

  static estimateCredits(model: ModelDetails, promptTokens: number, completionTokens: number) {
    const totalCostUsd = (promptTokens / 1_000_000) * model.promptCostPerMillion
      + (completionTokens / 1_000_000) * model.completionCostPerMillion;
    const credits = Math.max(1.0, Math.ceil((totalCostUsd * MIN_MARGIN_MULTIPLIER / SELL_VALUE_PER_CREDIT) * 10) / 10);
    const marginMultiplier = totalCostUsd > 0 ? credits * SELL_VALUE_PER_CREDIT / totalCostUsd : Number.POSITIVE_INFINITY;
    return { totalCostUsd, credits, marginMultiplier };
  }

  static async streamCompletion(
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    onChunk: (text: string) => void
  ): Promise<{ promptTokens: number; completionTokens: number; totalCostUsd: number }> {
    validateAllowedModel(modelId, { source: 'api' });
    const model = this.getModel(modelId);
    if (!model.isAvailable) throw new ModelUnavailableError(model.id);

    const fallbackModels = getAllowedFallbacks(model.id, { source: 'api' });
    for (const fallback of fallbackModels) validateAllowedModel(fallback, { source: 'api' });

    const response = await axios.post(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      {
        model: model.id,
        messages,
        stream: true,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://huggy.ai',
          'X-Title': process.env.OPENROUTER_APP_NAME || 'Huggy SaaS Platform',
        },
        responseType: 'stream',
      }
    );

    const stream = response.data as IncomingMessage;
    let accumulatedText = '';
    let promptTokens = 0;
    let completionTokens = 0;

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter((line) => line.trim() !== '');
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
              if (data.usage) {
                promptTokens = data.usage.prompt_tokens;
                completionTokens = data.usage.completion_tokens;
              }
            } catch {
              // Streaming providers can emit non-JSON keepalive frames.
            }
          }
        }
      });

      stream.on('end', () => {
        if (promptTokens === 0) {
          promptTokens = Math.ceil(messages.reduce((acc, message) => acc + message.content.length, 0) / 4);
          completionTokens = Math.ceil(accumulatedText.length / 4);
        }
        resolve({
          promptTokens,
          completionTokens,
          totalCostUsd: this.estimateCredits(model, promptTokens, completionTokens).totalCostUsd,
        });
      });

      stream.on('error', (err) => reject(err));
    });
  }

  static async syncOpenRouterAllowedModels(fetcher: typeof fetch = fetch): Promise<SyncOpenRouterModelResult[]> {
    const response = await fetcher(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://huggy.ai',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'Huggy SaaS Platform',
      },
    });
    if (!response.ok) throw new Error(`OpenRouter model catalog sync failed: ${response.status}`);

    const payload = await response.json() as { data?: Array<{ id: string; pricing?: { prompt?: string; completion?: string } }> };
    const remoteModels = new Map((payload.data ?? []).map((model) => [model.id, model]));

    return AI_ALLOWED_MODELS.map((modelId) => {
      const remote = remoteModels.get(modelId);
      const isAvailable = Boolean(remote);
      this.MODELS[modelId].isAvailable = isAvailable;
      if (remote?.pricing?.prompt) this.MODELS[modelId].promptCostPerMillion = Number(remote.pricing.prompt) * 1_000_000;
      if (remote?.pricing?.completion) this.MODELS[modelId].completionCostPerMillion = Number(remote.pricing.completion) * 1_000_000;
      return {
        id: modelId,
        isAvailable,
        promptCostPerMillion: this.MODELS[modelId].promptCostPerMillion,
        completionCostPerMillion: this.MODELS[modelId].completionCostPerMillion,
      };
    });
  }

  private static modelIdsForMode(mode: string): AiAllowedModelId[] {
    switch (mode) {
      case 'fast':
      case 'economy':
        return ['openai/gpt-5-nano', 'google/gemini-3-flash'];
      case 'balanced':
      case 'standard':
        return ['openai/gpt-5-mini', 'google/gemini-3-flash', 'qwen/qwen-coder'];
      case 'pro':
        return ['google/gemini-3-pro', 'deepseek/deepseek-coder', 'mistralai/codestral'];
      case 'premium':
        return ['anthropic/claude-sonnet-4.6', 'openai/gpt-5.5'];
      case 'max-quality':
      case 'max_quality':
        return ['openai/gpt-5.5-pro', 'anthropic/claude-opus-4.7'];
      case 'auto':
      default:
        return ['openai/gpt-5-mini', 'google/gemini-3-flash', 'openai/gpt-5-nano'];
    }
  }

  private static normalizePlanKey(planKey: unknown): AiPlanKey {
    return typeof planKey === 'string' && planKey in AI_MODEL_PLAN_ACCESS ? planKey as AiPlanKey : 'starter';
  }
}
