export type AiModelTier = 'economy' | 'standard' | 'pro' | 'premium' | 'max_quality';
export type AiPlanKey = 'free' | 'starter' | 'pro' | 'studio' | 'business' | 'enterprise';
export type AiBlockedSource = 'auto' | 'custom' | 'api';

export interface AiModelCapabilities {
  displayName: string;
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'qwen' | 'mistralai';
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  maxContextTokens: number;
  promptCostPerMillion: number;
  completionCostPerMillion: number;
  capabilities: string[];
}

export interface AiBlockedModelAuditLog {
  organization_id?: string;
  user_id?: string;
  requested_model: string;
  reason: string;
  source: AiBlockedSource;
  created_at: string;
}

export const AI_ALLOWED_MODELS = [
  'openai/gpt-5.5',
  'openai/gpt-5.5-pro',
  'anthropic/claude-opus-4.7',
  'anthropic/claude-sonnet-4.6',
  'google/gemini-3-pro',
  'google/gemini-3-flash',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'deepseek/deepseek-coder',
  'qwen/qwen-coder',
  'mistralai/codestral',
] as const;

export type AiAllowedModelId = (typeof AI_ALLOWED_MODELS)[number];

export const AI_ALLOWED_MODEL_SET = new Set<string>(AI_ALLOWED_MODELS);

export const AI_MODEL_TIERS: Record<AiAllowedModelId, AiModelTier> = {
  'openai/gpt-5.5': 'premium',
  'openai/gpt-5.5-pro': 'max_quality',
  'anthropic/claude-opus-4.7': 'max_quality',
  'anthropic/claude-sonnet-4.6': 'premium',
  'google/gemini-3-pro': 'pro',
  'google/gemini-3-flash': 'standard',
  'openai/gpt-5-mini': 'standard',
  'openai/gpt-5-nano': 'economy',
  'deepseek/deepseek-coder': 'pro',
  'qwen/qwen-coder': 'standard',
  'mistralai/codestral': 'pro',
};

export const AI_MODEL_CAPABILITIES: Record<AiAllowedModelId, AiModelCapabilities> = {
  'openai/gpt-5.5': {
    displayName: 'GPT-5.5',
    provider: 'openai',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: 256000,
    promptCostPerMillion: 5,
    completionCostPerMillion: 20,
    capabilities: ['Premium', 'Architecture', 'Reasoning', 'Vision'],
  },
  'openai/gpt-5.5-pro': {
    displayName: 'GPT-5.5 Pro',
    provider: 'openai',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: 256000,
    promptCostPerMillion: 15,
    completionCostPerMillion: 60,
    capabilities: ['Max Quality', 'Critical Reasoning', 'Complex Debugging'],
  },
  'anthropic/claude-opus-4.7': {
    displayName: 'Claude Opus 4.7',
    provider: 'anthropic',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: 200000,
    promptCostPerMillion: 15,
    completionCostPerMillion: 75,
    capabilities: ['Max Quality', 'Long Context', 'Security', 'Architecture'],
  },
  'anthropic/claude-sonnet-4.6': {
    displayName: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: 200000,
    promptCostPerMillion: 3,
    completionCostPerMillion: 15,
    capabilities: ['Premium', 'Code', 'Refactoring', 'Planning'],
  },
  'google/gemini-3-pro': {
    displayName: 'Gemini 3 Pro',
    provider: 'google',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: 1000000,
    promptCostPerMillion: 2.5,
    completionCostPerMillion: 10,
    capabilities: ['Pro', 'Large Context', 'Vision'],
  },
  'google/gemini-3-flash': {
    displayName: 'Gemini 3 Flash',
    provider: 'google',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: 1000000,
    promptCostPerMillion: 0.15,
    completionCostPerMillion: 0.6,
    capabilities: ['Standard', 'Speed', 'Vision'],
  },
  'openai/gpt-5-mini': {
    displayName: 'GPT-5 Mini',
    provider: 'openai',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: 128000,
    promptCostPerMillion: 0.25,
    completionCostPerMillion: 1,
    capabilities: ['Standard', 'Components', 'UI'],
  },
  'openai/gpt-5-nano': {
    displayName: 'GPT-5 Nano',
    provider: 'openai',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsJsonMode: true,
    maxContextTokens: 64000,
    promptCostPerMillion: 0.05,
    completionCostPerMillion: 0.2,
    capabilities: ['Economy', 'Classification', 'Simple Chat'],
  },
  'deepseek/deepseek-coder': {
    displayName: 'DeepSeek Coder',
    provider: 'deepseek',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsJsonMode: true,
    maxContextTokens: 128000,
    promptCostPerMillion: 0.14,
    completionCostPerMillion: 0.28,
    capabilities: ['Pro', 'Code', 'Debugging'],
  },
  'qwen/qwen-coder': {
    displayName: 'Qwen Coder',
    provider: 'qwen',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsJsonMode: true,
    maxContextTokens: 128000,
    promptCostPerMillion: 0.2,
    completionCostPerMillion: 0.8,
    capabilities: ['Standard', 'Code', 'Fast Edits'],
  },
  'mistralai/codestral': {
    displayName: 'Codestral',
    provider: 'mistralai',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsJsonMode: true,
    maxContextTokens: 128000,
    promptCostPerMillion: 0.3,
    completionCostPerMillion: 0.9,
    capabilities: ['Pro', 'Code Completion', 'Tests'],
  },
};

export const AI_MODEL_FALLBACKS: Record<AiAllowedModelId, AiAllowedModelId[]> = {
  'openai/gpt-5.5-pro': ['openai/gpt-5.5'],
  'openai/gpt-5.5': ['anthropic/claude-sonnet-4.6'],
  'anthropic/claude-opus-4.7': ['anthropic/claude-sonnet-4.6'],
  'anthropic/claude-sonnet-4.6': ['google/gemini-3-pro'],
  'google/gemini-3-pro': ['google/gemini-3-flash'],
  'google/gemini-3-flash': [],
  'openai/gpt-5-mini': ['google/gemini-3-flash'],
  'openai/gpt-5-nano': ['google/gemini-3-flash'],
  'deepseek/deepseek-coder': ['qwen/qwen-coder'],
  'qwen/qwen-coder': ['mistralai/codestral'],
  'mistralai/codestral': ['deepseek/deepseek-coder'],
};

export const AI_MODEL_PLAN_ACCESS: Record<AiPlanKey, AiModelTier[]> = {
  free: ['economy'],
  starter: ['economy', 'standard'],
  pro: ['economy', 'standard', 'pro'],
  studio: ['economy', 'standard', 'pro', 'premium'],
  business: ['economy', 'standard', 'pro', 'premium'],
  enterprise: ['economy', 'standard', 'pro', 'premium', 'max_quality'],
};

const blockedModelAuditLogs: AiBlockedModelAuditLog[] = [];

export class ForbiddenModelError extends Error {
  readonly code = 'forbidden_model';
  readonly statusCode = 403;

  constructor(modelId: string) {
    super(`AI model is not allowed by the platform whitelist: ${modelId}`);
    this.name = 'ForbiddenModelError';
  }
}

export class ModelUnavailableError extends Error {
  readonly code = 'model_unavailable';
  readonly statusCode = 503;

  constructor(modelId: string) {
    super(`AI model is currently unavailable: ${modelId}`);
    this.name = 'ModelUnavailableError';
  }
}

export class ModelNotAllowedForPlanError extends Error {
  readonly code = 'model_not_allowed_for_plan';
  readonly statusCode = 403;

  constructor(modelId: string, planKey: string) {
    super(`AI model ${modelId} is not allowed for plan ${planKey}.`);
    this.name = 'ModelNotAllowedForPlanError';
  }
}

export class InsufficientCreditsError extends Error {
  readonly code = 'insufficient_credits';
  readonly statusCode = 402;

  constructor(requiredCredits: number, availableCredits: number) {
    super(`Insufficient credits. Required: ${requiredCredits}; available: ${availableCredits}.`);
    this.name = 'InsufficientCreditsError';
  }
}

export class NegativeMarginBlockedError extends Error {
  readonly code = 'negative_margin_blocked';
  readonly statusCode = 402;

  constructor(modelId: string, marginMultiplier: number) {
    super(`AI request blocked because estimated margin is too low for ${modelId}: ${marginMultiplier}.`);
    this.name = 'NegativeMarginBlockedError';
  }
}

export function auditBlockedModelAttempt(input: Omit<AiBlockedModelAuditLog, 'created_at'>): AiBlockedModelAuditLog {
  const log = { ...input, created_at: new Date().toISOString() };
  blockedModelAuditLogs.push(log);
  console.warn('[ai-model-allowlist] blocked model attempt', log);
  return log;
}

export function listBlockedModelAuditLogs(): AiBlockedModelAuditLog[] {
  return [...blockedModelAuditLogs];
}

export function clearBlockedModelAuditLogs(): void {
  blockedModelAuditLogs.length = 0;
}

export function validateAllowedModel(
  modelId: string,
  context: { organizationId?: string; userId?: string; source?: AiBlockedSource; reason?: string } = {}
): asserts modelId is AiAllowedModelId {
  if (!AI_ALLOWED_MODEL_SET.has(modelId)) {
    auditBlockedModelAttempt({
      organization_id: context.organizationId,
      user_id: context.userId,
      requested_model: modelId,
      reason: context.reason ?? 'not_in_ai_allowed_models',
      source: context.source ?? 'api',
    });
    throw new ForbiddenModelError(modelId);
  }
}

export function getAllowedFallbacks(
  modelId: string,
  context: { organizationId?: string; userId?: string; source?: AiBlockedSource } = {}
): AiAllowedModelId[] {
  validateAllowedModel(modelId, context);
  const fallbacks = AI_MODEL_FALLBACKS[modelId];
  for (const fallback of fallbacks) validateAllowedModel(fallback, context);
  return [...fallbacks];
}

export function getConfiguredAllowedModels(envValue: string | undefined): AiAllowedModelId[] {
  if (!envValue?.trim()) return [...AI_ALLOWED_MODELS];
  const models = envValue.split(',').map((value) => value.trim()).filter(Boolean);
  for (const model of models) validateAllowedModel(model, { source: 'api', reason: 'invalid_env_allowed_model' });
  return models as AiAllowedModelId[];
}
