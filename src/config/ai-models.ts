export const AI_ALLOWED_MODELS = [
  'openai/gpt-5.5',
  'openai/gpt-5.5-pro',
  'anthropic/claude-opus-4.7',
  'anthropic/claude-sonnet-4.6',
  'google/gemini-3-pro',
  'google/gemini-3-flash',
  'google/gemini-3.5-flash',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'deepseek/deepseek-coder',
  'qwen/qwen-coder',
  'mistralai/codestral',
  'auto'
] as const;

export type AllowedModelId = (typeof AI_ALLOWED_MODELS)[number];

export const AIModelTier = {
  STANDARD: 'Standard',
  PRO: 'Pro',
  PREMIUM: 'Premium'
} as const;

export type AIModelTier = (typeof AIModelTier)[keyof typeof AIModelTier];

export const AI_MODEL_TIERS: Record<AllowedModelId, AIModelTier> = {
  'openai/gpt-5.5': AIModelTier.PRO,
  'openai/gpt-5.5-pro': AIModelTier.PREMIUM,
  'anthropic/claude-opus-4.7': AIModelTier.PREMIUM,
  'anthropic/claude-sonnet-4.6': AIModelTier.PRO,
  'google/gemini-3-pro': AIModelTier.STANDARD,
  'google/gemini-3-flash': AIModelTier.STANDARD,
  'google/gemini-3.5-flash': AIModelTier.STANDARD,
  'openai/gpt-5-mini': AIModelTier.STANDARD,
  'openai/gpt-5-nano': AIModelTier.STANDARD,
  'deepseek/deepseek-coder': AIModelTier.STANDARD,
  'qwen/qwen-coder': AIModelTier.STANDARD,
  'mistralai/codestral': AIModelTier.STANDARD,
  'auto': AIModelTier.STANDARD,
};

export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  maxContextTokens: number;
}

export const AI_MODEL_CAPABILITIES: Record<AllowedModelId, ModelCapabilities> = {
  'openai/gpt-5.5': { supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 128000 },
  'openai/gpt-5.5-pro': { supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 128000 },
  'anthropic/claude-opus-4.7': { supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 200000 },
  'anthropic/claude-sonnet-4.6': { supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 200000 },
  'google/gemini-3-pro': { supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 2000000 },
  'google/gemini-3-flash': { supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 1000000 },
  'google/gemini-3.5-flash': { supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 1000000 },
  'openai/gpt-5-mini': { supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, maxContextTokens: 128000 },
  'openai/gpt-5-nano': { supportsStreaming: true, supportsTools: false, supportsVision: false, supportsJsonMode: false, maxContextTokens: 32000 },
  'deepseek/deepseek-coder': { supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, maxContextTokens: 64000 },
  'qwen/qwen-coder': { supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, maxContextTokens: 64000 },
  'mistralai/codestral': { supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, maxContextTokens: 32000 },
  'auto': { supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, maxContextTokens: 128000 },
};

export const AI_MODEL_FALLBACKS: Record<AllowedModelId, AllowedModelId[]> = {
  'openai/gpt-5.5-pro': ['openai/gpt-5.5'],
  'openai/gpt-5.5': ['anthropic/claude-sonnet-4.6'],
  'anthropic/claude-opus-4.7': ['anthropic/claude-sonnet-4.6'],
  'anthropic/claude-sonnet-4.6': ['google/gemini-3-pro'],
  'google/gemini-3-pro': ['google/gemini-3-flash'],
  'openai/gpt-5-mini': ['google/gemini-3-flash'],
  'openai/gpt-5-nano': ['google/gemini-3-flash'],
  'deepseek/deepseek-coder': ['qwen/qwen-coder'],
  'qwen/qwen-coder': ['deepseek/deepseek-coder'],
  'mistralai/codestral': ['deepseek/deepseek-coder'],
  'google/gemini-3-flash': [],
  'google/gemini-3.5-flash': ['google/gemini-3-flash'],
  'auto': ['google/gemini-3.5-flash', 'google/gemini-3-flash'],
};

export const UserPlan = {
  FREE: 'free',
  PRODUCER: 'producer',
  STUDIO: 'studio'
} as const;

export type UserPlan = (typeof UserPlan)[keyof typeof UserPlan];

export const AI_MODEL_PLAN_ACCESS: Record<AllowedModelId, UserPlan> = {
  'openai/gpt-5.5': UserPlan.PRODUCER,
  'openai/gpt-5.5-pro': UserPlan.STUDIO,
  'anthropic/claude-opus-4.7': UserPlan.STUDIO,
  'anthropic/claude-sonnet-4.6': UserPlan.PRODUCER,
  'google/gemini-3-pro': UserPlan.FREE,
  'google/gemini-3-flash': UserPlan.FREE,
  'google/gemini-3.5-flash': UserPlan.FREE,
  'openai/gpt-5-mini': UserPlan.FREE,
  'openai/gpt-5-nano': UserPlan.FREE,
  'deepseek/deepseek-coder': UserPlan.FREE,
  'qwen/qwen-coder': UserPlan.FREE,
  'mistralai/codestral': UserPlan.FREE,
  'auto': UserPlan.FREE,
};
