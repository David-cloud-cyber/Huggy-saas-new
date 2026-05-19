import { ModelTier } from './plans';

export type AiMode = 'auto' | 'fast' | 'balanced' | 'pro' | 'max_quality' | 'custom';

export type AiModelDefinition = {
  id: string;
  displayName: string;
  provider: string;
  tier: ModelTier;
  strengths: string[];
  speed: 'fast' | 'balanced' | 'slow';
  costLabel: 'low' | 'medium' | 'high' | 'very_high';
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  maxContextTokens: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  isAvailable: boolean;
  requiresConfirmation: boolean;
};

export const AI_MODELS: AiModelDefinition[] = [
  {
    id: 'openai/gpt-5-nano',
    displayName: 'GPT-5 Nano',
    provider: 'OpenAI',
    tier: 'economy',
    strengths: ['Fast edits', 'classification', 'summaries'],
    speed: 'fast',
    costLabel: 'low',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsJsonMode: true,
    maxContextTokens: 64000,
    inputUsdPerMillion: 0.08,
    outputUsdPerMillion: 0.4,
    isAvailable: true,
    requiresConfirmation: false
  },
  {
    id: 'google/gemini-3-flash',
    displayName: 'Gemini 3 Flash',
    provider: 'Google',
    tier: 'economy',
    strengths: ['Fast UI changes', 'preview fixes', 'vision'],
    speed: 'fast',
    costLabel: 'low',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: 1000000,
    inputUsdPerMillion: 0.12,
    outputUsdPerMillion: 0.6,
    isAvailable: true,
    requiresConfirmation: false
  },
  {
    id: 'openai/gpt-5-mini',
    displayName: 'GPT-5 Mini',
    provider: 'OpenAI',
    tier: 'standard',
    strengths: ['Components', 'UI polish', 'debug'],
    speed: 'fast',
    costLabel: 'medium',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: 128000,
    inputUsdPerMillion: 0.25,
    outputUsdPerMillion: 1.25,
    isAvailable: true,
    requiresConfirmation: false
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    displayName: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    tier: 'pro',
    strengths: ['Code', 'architecture', 'debug'],
    speed: 'balanced',
    costLabel: 'high',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: false,
    maxContextTokens: 200000,
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    isAvailable: true,
    requiresConfirmation: false
  },
  {
    id: 'deepseek/deepseek-coder',
    displayName: 'DeepSeek Coder',
    provider: 'DeepSeek',
    tier: 'pro',
    strengths: ['Code', 'refactors', 'debug'],
    speed: 'balanced',
    costLabel: 'medium',
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    supportsJsonMode: true,
    maxContextTokens: 128000,
    inputUsdPerMillion: 0.35,
    outputUsdPerMillion: 1.4,
    isAvailable: true,
    requiresConfirmation: false
  },
  {
    id: 'qwen/qwen-coder',
    displayName: 'Qwen Coder',
    provider: 'Qwen',
    tier: 'pro',
    strengths: ['Code', 'large context', 'tests'],
    speed: 'balanced',
    costLabel: 'medium',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsJsonMode: true,
    maxContextTokens: 128000,
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.6,
    isAvailable: true,
    requiresConfirmation: false
  },
  {
    id: 'mistralai/codestral',
    displayName: 'Codestral',
    provider: 'Mistral',
    tier: 'pro',
    strengths: ['Code', 'completion', 'tests'],
    speed: 'fast',
    costLabel: 'medium',
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    supportsJsonMode: true,
    maxContextTokens: 32000,
    inputUsdPerMillion: 0.3,
    outputUsdPerMillion: 0.9,
    isAvailable: true,
    requiresConfirmation: false
  },
  {
    id: 'google/gemini-3-pro',
    displayName: 'Gemini 3 Pro',
    provider: 'Google',
    tier: 'premium',
    strengths: ['Full app', 'vision', 'long context'],
    speed: 'balanced',
    costLabel: 'high',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: 1000000,
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    isAvailable: true,
    requiresConfirmation: true
  },
  {
    id: 'openai/gpt-5.5',
    displayName: 'GPT-5.5',
    provider: 'OpenAI',
    tier: 'premium',
    strengths: ['Architecture', 'full app', 'security'],
    speed: 'balanced',
    costLabel: 'very_high',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: 256000,
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 20,
    isAvailable: true,
    requiresConfirmation: true
  },
  {
    id: 'anthropic/claude-opus-4.7',
    displayName: 'Claude Opus 4.7',
    provider: 'Anthropic',
    tier: 'max_quality',
    strengths: ['Max quality', 'hard debugging', 'security'],
    speed: 'slow',
    costLabel: 'very_high',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: false,
    maxContextTokens: 200000,
    inputUsdPerMillion: 15,
    outputUsdPerMillion: 75,
    isAvailable: true,
    requiresConfirmation: true
  }
];

export const MODEL_FALLBACKS: Record<string, string[]> = {
  'anthropic/claude-opus-4.7': ['openai/gpt-5.5', 'google/gemini-3-pro'],
  'openai/gpt-5.5': ['google/gemini-3-pro', 'anthropic/claude-sonnet-4.6'],
  'google/gemini-3-pro': ['anthropic/claude-sonnet-4.6', 'google/gemini-3-flash'],
  'anthropic/claude-sonnet-4.6': ['deepseek/deepseek-coder', 'openai/gpt-5-mini'],
  'deepseek/deepseek-coder': ['qwen/qwen-coder', 'mistralai/codestral'],
  'qwen/qwen-coder': ['mistralai/codestral', 'openai/gpt-5-mini'],
  'mistralai/codestral': ['openai/gpt-5-mini', 'google/gemini-3-flash'],
  'openai/gpt-5-mini': ['google/gemini-3-flash', 'openai/gpt-5-nano'],
  'google/gemini-3-flash': ['openai/gpt-5-nano'],
  'openai/gpt-5-nano': []
};

export function getModelById(modelId: string) {
  return AI_MODELS.find((model) => model.id === modelId) || null;
}

export function listModelsByTier(tiers: ModelTier[]) {
  return AI_MODELS.filter((model) => tiers.includes(model.tier));
}
