import { PlatformError } from '../platform/security.ts';
import type { UUID } from '../platform/types.ts';

export type AiAllowedModelId =
  | 'openai/gpt-5.5'
  | 'openai/gpt-5.5-pro'
  | 'anthropic/claude-opus-4.7'
  | 'anthropic/claude-sonnet-4.6'
  | 'google/gemini-3-pro'
  | 'google/gemini-3-flash'
  | 'openai/gpt-5-mini'
  | 'openai/gpt-5-nano'
  | 'deepseek/deepseek-coder'
  | 'qwen/qwen-coder'
  | 'mistralai/codestral';

export type AiModelTier = 'economy' | 'standard' | 'pro' | 'premium' | 'max_quality';
export type AiPlanKey = 'free' | 'starter' | 'pro' | 'studio' | 'business' | 'enterprise';
export type AiBlockedSource = 'auto' | 'custom' | 'api';

export interface AiModelCapabilityDefinition {
  displayName: string;
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'qwen' | 'mistralai';
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  maxContextTokens: number;
  speed: 'fast' | 'medium' | 'slow';
  costIndicator: 'low' | 'medium' | 'high' | 'very_high';
  strengths: string[];
  requiresConfirmation: boolean;
}

export interface AiBlockedModelAuditLog {
  organization_id?: UUID;
  user_id?: UUID;
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
] as const satisfies readonly AiAllowedModelId[];

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

export const AI_MODEL_CAPABILITIES: Record<AiAllowedModelId, AiModelCapabilityDefinition> = {
  'openai/gpt-5.5': { displayName: 'GPT-5.5', provider: 'openai', supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 256000, speed: 'medium', costIndicator: 'very_high', strengths: ['Architecture', 'Full app generation', 'Reasoning'], requiresConfirmation: true },
  'openai/gpt-5.5-pro': { displayName: 'GPT-5.5 Pro', provider: 'openai', supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 256000, speed: 'slow', costIndicator: 'very_high', strengths: ['Critical reasoning', 'Complex debugging', 'Architecture'], requiresConfirmation: true },
  'anthropic/claude-opus-4.7': { displayName: 'Claude Opus 4.7', provider: 'anthropic', supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 200000, speed: 'slow', costIndicator: 'very_high', strengths: ['Long context', 'Architecture', 'Security'], requiresConfirmation: true },
  'anthropic/claude-sonnet-4.6': { displayName: 'Claude Sonnet 4.6', provider: 'anthropic', supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 200000, speed: 'medium', costIndicator: 'high', strengths: ['Code', 'Refactoring', 'Planning'], requiresConfirmation: true },
  'google/gemini-3-pro': { displayName: 'Gemini 3 Pro', provider: 'google', supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 1000000, speed: 'medium', costIndicator: 'high', strengths: ['Large context', 'Planning', 'Vision'], requiresConfirmation: false },
  'google/gemini-3-flash': { displayName: 'Gemini 3 Flash', provider: 'google', supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 1000000, speed: 'fast', costIndicator: 'medium', strengths: ['Fast edits', 'Summaries', 'Vision'], requiresConfirmation: false },
  'openai/gpt-5-mini': { displayName: 'GPT-5 Mini', provider: 'openai', supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 128000, speed: 'fast', costIndicator: 'medium', strengths: ['Components', 'Chat', 'UI'], requiresConfirmation: false },
  'openai/gpt-5-nano': { displayName: 'GPT-5 Nano', provider: 'openai', supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, maxContextTokens: 64000, speed: 'fast', costIndicator: 'low', strengths: ['Simple chat', 'Small edits', 'Classification'], requiresConfirmation: false },
  'deepseek/deepseek-coder': { displayName: 'DeepSeek Coder', provider: 'deepseek', supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, maxContextTokens: 128000, speed: 'medium', costIndicator: 'medium', strengths: ['Code generation', 'Debugging', 'Refactoring'], requiresConfirmation: false },
  'qwen/qwen-coder': { displayName: 'Qwen Coder', provider: 'qwen', supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, maxContextTokens: 128000, speed: 'fast', costIndicator: 'medium', strengths: ['Code generation', 'Fast edits', 'Utilities'], requiresConfirmation: false },
  'mistralai/codestral': { displayName: 'Codestral', provider: 'mistralai', supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, maxContextTokens: 128000, speed: 'medium', costIndicator: 'medium', strengths: ['Code completion', 'Refactoring', 'Tests'], requiresConfirmation: false },
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

export class ForbiddenModelError extends PlatformError {
  constructor(modelId: string) {
    super('forbidden_model', 'This AI model is not allowed by the platform whitelist.', 403, { modelId });
    this.name = 'ForbiddenModelError';
  }
}

export class ModelUnavailableError extends PlatformError {
  constructor(modelId: string) {
    super('model_unavailable', 'This AI model is currently unavailable.', 503, { modelId });
    this.name = 'ModelUnavailableError';
  }
}

export class ModelNotAllowedForPlanError extends PlatformError {
  constructor(modelId: string, planKey: string) {
    super('model_not_allowed_for_plan', 'This AI model is not allowed for the current plan.', 403, { modelId, planKey });
    this.name = 'ModelNotAllowedForPlanError';
  }
}

export class InsufficientCreditsError extends PlatformError {
  constructor(requiredCredits: number, availableCredits: number) {
    super('insufficient_credits', 'Credit balance is insufficient for this action.', 402, { requiredCredits, availableCredits });
    this.name = 'InsufficientCreditsError';
  }
}

export class NegativeMarginBlockedError extends PlatformError {
  constructor(modelId: string, marginMultiplier: number) {
    super('negative_margin_blocked', 'This AI request was blocked because the estimated margin is too low.', 402, { modelId, marginMultiplier });
    this.name = 'NegativeMarginBlockedError';
  }
}

export function auditBlockedModelAttempt(input: Omit<AiBlockedModelAuditLog, 'created_at'>): AiBlockedModelAuditLog {
  const auditLog = { ...input, created_at: new Date().toISOString() };
  blockedModelAuditLogs.push(auditLog);
  console.warn('[ai-model-whitelist] blocked model attempt', auditLog);
  return auditLog;
}

export function listBlockedModelAuditLogs(): AiBlockedModelAuditLog[] {
  return [...blockedModelAuditLogs];
}

export function clearBlockedModelAuditLogs(): void {
  blockedModelAuditLogs.length = 0;
}

export function validateAllowedModel(modelId: string, context?: { organizationId?: UUID; userId?: UUID; source?: AiBlockedSource }): asserts modelId is AiAllowedModelId {
  if (!AI_ALLOWED_MODEL_SET.has(modelId)) {
    auditBlockedModelAttempt({
      organization_id: context?.organizationId,
      user_id: context?.userId,
      requested_model: modelId,
      reason: 'not_in_ai_allowed_models',
      source: context?.source ?? 'api',
    });
    throw new ForbiddenModelError(modelId);
  }
}

export function getAllowedFallbacks(modelId: string, context?: { organizationId?: UUID; userId?: UUID; source?: AiBlockedSource }): AiAllowedModelId[] {
  validateAllowedModel(modelId, context);
  const fallbacks = AI_MODEL_FALLBACKS[modelId];
  for (const fallback of fallbacks) validateAllowedModel(fallback, context);
  return [...fallbacks];
}

export function getConfiguredAllowedModels(envValue: string | undefined): AiAllowedModelId[] {
  if (!envValue?.trim()) return [...AI_ALLOWED_MODELS];
  const configured = envValue.split(',').map((value) => value.trim()).filter(Boolean);
  for (const modelId of configured) validateAllowedModel(modelId, { source: 'api' });
  return configured as AiAllowedModelId[];
}
