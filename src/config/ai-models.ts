export const UserPlan = {
  FREE: 'free',
  PRO: 'pro',
  SCALE: 'scale',
  ENTERPRISE: 'enterprise',
} as const;

export type UserPlan = (typeof UserPlan)[keyof typeof UserPlan];

export const AIModelTier = {
  ECONOMY: 'Economy',
  STANDARD: 'Standard',
  PRO: 'Pro',
  PREMIUM: 'Premium',
} as const;

export type AIModelTier = (typeof AIModelTier)[keyof typeof AIModelTier];

export type ModelProvider = 'anthropic' | 'openai' | 'google' | 'deepseek';
export type ModelStrength = 'low' | 'medium' | 'high' | 'frontier';
export type ModelSpeed = 'fast' | 'balanced' | 'deliberate';
export type ModelReliability = 'standard' | 'high' | 'experimental';

export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  supportsStructuredOutput: boolean;
  supportsToolCalling: boolean;
  supportsLongContext: boolean;
  reasoningLevel: ModelStrength;
  codeLevel: ModelStrength;
  agenticLevel: ModelStrength;
  designLevel: ModelStrength;
  securityLevel: ModelStrength;
  speed: ModelSpeed;
  reliability: ModelReliability;
  bestFor: string[];
  maxContextTokens: number;
}

export interface ModelDefinition {
  id: string;
  label: string;
  provider: ModelProvider;
  contextWindow: number;
  tier: AIModelTier;
  minPlan: UserPlan;
  creditFloor: number;
  isNew?: boolean;
  isFast?: boolean;
  isPremium?: boolean;
  description: string;
  capabilities?: Partial<Omit<ModelCapabilities, 'maxContextTokens'>>;
}

export const MODEL_REGISTRY = [
  {
    id: 'google/gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    provider: 'google',
    contextWindow: 1000000,
    tier: AIModelTier.ECONOMY,
    minPlan: UserPlan.FREE,
    creditFloor: 2,
    isFast: true,
    description: 'Low-latency Gemini routing for fast planning and small app edits.',
    capabilities: { supportsVision: true },
  },
  {
    id: 'google/gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    provider: 'google',
    contextWindow: 1000000,
    tier: AIModelTier.ECONOMY,
    minPlan: UserPlan.FREE,
    creditFloor: 2,
    isFast: true,
    isNew: true,
    description: 'Fast Gemini preview for responsive generation and iteration.',
    capabilities: { supportsVision: true },
  },
  {
    id: 'openai/gpt-5-mini',
    label: 'GPT-5 Mini',
    provider: 'openai',
    contextWindow: 128000,
    tier: AIModelTier.ECONOMY,
    minPlan: UserPlan.FREE,
    creditFloor: 1.5,
    isFast: true,
    description: 'Efficient OpenAI model for quick prompts, fixes and lightweight builds.',
    capabilities: { supportsVision: true },
  },
  {
    id: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    contextWindow: 128000,
    tier: AIModelTier.ECONOMY,
    minPlan: UserPlan.FREE,
    creditFloor: 1.5,
    isFast: true,
    description: 'Cost-efficient DeepSeek model for simple changes and drafts.',
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    contextWindow: 128000,
    tier: AIModelTier.STANDARD,
    minPlan: UserPlan.PRO,
    creditFloor: 4.5,
    description: 'Balanced DeepSeek coding model for multi-file app work.',
  },
  {
    id: 'google/gemini-3-pro-preview',
    label: 'Gemini 3 Pro Preview',
    provider: 'google',
    contextWindow: 1000000,
    tier: AIModelTier.PRO,
    minPlan: UserPlan.PRO,
    creditFloor: 7,
    isPremium: true,
    isNew: true,
    description: 'Large-context Gemini preview for complex product reasoning.',
    capabilities: { supportsVision: true },
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    contextWindow: 200000,
    tier: AIModelTier.PRO,
    minPlan: UserPlan.PRO,
    creditFloor: 8,
    description: 'Strong Claude model for high-quality product code and reasoning.',
    capabilities: { supportsVision: true },
  },
  {
    id: 'anthropic/claude-opus-4.7',
    label: 'Claude Opus 4.7',
    provider: 'anthropic',
    contextWindow: 200000,
    tier: AIModelTier.PREMIUM,
    minPlan: UserPlan.SCALE,
    creditFloor: 14,
    isPremium: true,
    description: 'Premium Claude model for demanding architecture and coding tasks.',
    capabilities: { supportsVision: true },
  },
  {
    id: 'anthropic/claude-opus-4.8',
    label: 'Claude Opus 4.8',
    provider: 'anthropic',
    contextWindow: 200000,
    tier: AIModelTier.PREMIUM,
    minPlan: UserPlan.SCALE,
    creditFloor: 16,
    isPremium: true,
    isNew: true,
    description: 'Most capable Claude option for complex reasoning and coding.',
    capabilities: { supportsVision: true },
  },
  {
    id: 'anthropic/claude-opus-4.8-fast',
    label: 'Claude Opus 4.8 Fast',
    provider: 'anthropic',
    contextWindow: 200000,
    tier: AIModelTier.PREMIUM,
    minPlan: UserPlan.SCALE,
    creditFloor: 18,
    isPremium: true,
    isFast: true,
    isNew: true,
    description: 'Opus-level capability with faster turnaround.',
    capabilities: { supportsVision: true },
  },
  {
    id: 'openai/gpt-5.5',
    label: 'GPT-5.5',
    provider: 'openai',
    contextWindow: 200000,
    tier: AIModelTier.PREMIUM,
    minPlan: UserPlan.SCALE,
    creditFloor: 14,
    isPremium: true,
    description: 'Premium OpenAI model for complex full-stack generation.',
    capabilities: { supportsVision: true },
  },
  {
    id: 'openai/gpt-5.5-pro',
    label: 'GPT-5.5 Pro',
    provider: 'openai',
    contextWindow: 200000,
    tier: AIModelTier.PREMIUM,
    minPlan: UserPlan.SCALE,
    creditFloor: 45,
    isPremium: true,
    description: 'Highest-cost OpenAI option reserved for exceptional builds.',
    capabilities: { supportsVision: true },
  },
] as const satisfies readonly ModelDefinition[];

export type AllowedModelId = (typeof MODEL_REGISTRY)[number]['id'];
export type ModelSelectionId = AllowedModelId | 'auto';

export const DEFAULT_PROVIDER_MODEL_ID: AllowedModelId = 'google/gemini-3.5-flash';

export const AI_ALLOWED_MODELS = [
  'google/gemini-3-flash-preview',
  'google/gemini-3.5-flash',
  'openai/gpt-5-mini',
  'google/gemini-3-pro-preview',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4.7',
  'openai/gpt-5.5',
  'openai/gpt-5.5-pro',
  'deepseek/deepseek-v4-flash',
  'deepseek/deepseek-v4-pro',
  'anthropic/claude-opus-4.8',
  'anthropic/claude-opus-4.8-fast',
] as AllowedModelId[];

export const AI_AUTO_MODEL_OPTION = {
  id: 'auto',
  display_name: 'Auto',
  label: 'Auto',
  provider: 'auto',
  tier: 'Auto',
  description: 'Huggy chooses the lowest-cost model capable of completing the task.',
} as const;

export const PROVIDER_META: Record<ModelProvider, {
  label: string;
  color: string;
  textColor: string;
  icon: string;
}> = {
  anthropic: { label: 'Anthropic', color: '#CC785C', textColor: '#fff', icon: 'anthropic' },
  openai: { label: 'OpenAI', color: '#0F9F7A', textColor: '#fff', icon: 'openai' },
  google: { label: 'Google', color: '#4285F4', textColor: '#fff', icon: 'google' },
  deepseek: { label: 'DeepSeek', color: '#4D6BFE', textColor: '#fff', icon: 'deepseek' },
};

export function getModelsByProvider() {
  const initial: Record<ModelProvider, ModelDefinition[]> = {
    anthropic: [],
    openai: [],
    google: [],
    deepseek: [],
  };
  return MODEL_REGISTRY.reduce<Record<ModelProvider, ModelDefinition[]>>((acc, model) => {
    const provider = model.provider;
    acc[provider].push(model);
    return acc;
  }, initial);
}

export function isAllowedModelId(value: unknown): value is AllowedModelId {
  return typeof value === 'string' && (AI_ALLOWED_MODELS as readonly string[]).includes(value);
}

export function normalizeModelSelectionId(value: unknown): ModelSelectionId {
  if (value === 'auto' || value === '' || value == null) return 'auto';
  return isAllowedModelId(value) ? value : 'auto';
}

const buildRecord = <T>(mapper: (model: ModelDefinition) => T) => (
  Object.fromEntries(MODEL_REGISTRY.map(model => [model.id, mapper(model)])) as Record<AllowedModelId, T>
);

function strengthForModel(model: ModelDefinition, kind: 'reasoning' | 'code' | 'agentic' | 'design' | 'security'): ModelStrength {
  const id = model.id.toLowerCase();
  if (id.includes('opus') || id.includes('gpt-5.5-pro')) return 'frontier';
  if (id.includes('sonnet') || id.includes('gpt-5.5') || id.includes('gemini-3-pro')) return 'high';
  if (id.includes('deepseek-v4-pro')) return kind === 'code' ? 'high' : 'medium';
  if (model.tier === AIModelTier.STANDARD || model.tier === AIModelTier.PRO) return 'medium';
  return 'low';
}

function speedForModel(model: ModelDefinition): ModelSpeed {
  if (model.isFast || model.id.includes('flash') || model.id.includes('mini')) return 'fast';
  if (model.isPremium || model.id.includes('pro')) return 'deliberate';
  return 'balanced';
}

function reliabilityForModel(model: ModelDefinition): ModelReliability {
  if (model.id.includes('preview') || model.id.includes('4.8')) return 'experimental';
  if (model.provider === 'anthropic' || model.provider === 'openai') return 'high';
  return 'standard';
}

function bestUsesForModel(model: ModelDefinition): string[] {
  const id = model.id.toLowerCase();
  if (id.includes('opus')) return ['architecture', 'complex_reasoning', 'design_critique', 'full_stack_generation', 'debug'];
  if (id.includes('sonnet')) return ['code_generation', 'refactor', 'debug', 'product_reasoning'];
  if (id.includes('gpt-5.5-pro')) return ['full_stack_generation', 'security', 'structured_planning', 'debug'];
  if (id.includes('gpt-5.5')) return ['frontend_backend', 'code_generation', 'agentic_workflow'];
  if (id.includes('gemini-3-pro')) return ['long_context', 'vision', 'product_reasoning', 'analysis'];
  if (id.includes('gemini')) return ['fast_classification', 'long_context', 'vision', 'simple_streaming'];
  if (id.includes('deepseek-v4-pro')) return ['code_generation', 'multi_file_edits', 'debug'];
  return ['simple_chat', 'small_edits', 'classification'];
}

export const AI_MODEL_DISPLAY_NAMES = buildRecord(model => model.label);

export const AI_MODEL_TIERS = buildRecord(model => model.tier);

export const AI_MODEL_PLAN_ACCESS = buildRecord(model => model.minPlan);

export const MODEL_ACTION_CREDIT_FLOORS = buildRecord(model => model.creditFloor);

export const AI_MODEL_CAPABILITIES = buildRecord<ModelCapabilities>(model => ({
  supportsStreaming: model.capabilities?.supportsStreaming ?? true,
  supportsTools: model.capabilities?.supportsTools ?? ['anthropic', 'openai', 'google'].includes(model.provider),
  supportsVision: model.capabilities?.supportsVision ?? false,
  supportsJsonMode: model.capabilities?.supportsJsonMode ?? model.provider !== 'deepseek',
  supportsStructuredOutput: model.capabilities?.supportsStructuredOutput ?? model.capabilities?.supportsJsonMode ?? model.provider !== 'deepseek',
  supportsToolCalling: model.capabilities?.supportsToolCalling ?? model.capabilities?.supportsTools ?? ['anthropic', 'openai', 'google'].includes(model.provider),
  supportsLongContext: model.capabilities?.supportsLongContext ?? model.contextWindow >= 200000,
  reasoningLevel: model.capabilities?.reasoningLevel ?? strengthForModel(model, 'reasoning'),
  codeLevel: model.capabilities?.codeLevel ?? strengthForModel(model, 'code'),
  agenticLevel: model.capabilities?.agenticLevel ?? strengthForModel(model, 'agentic'),
  designLevel: model.capabilities?.designLevel ?? strengthForModel(model, 'design'),
  securityLevel: model.capabilities?.securityLevel ?? strengthForModel(model, 'security'),
  speed: model.capabilities?.speed ?? speedForModel(model),
  reliability: model.capabilities?.reliability ?? reliabilityForModel(model),
  bestFor: model.capabilities?.bestFor ?? bestUsesForModel(model),
  maxContextTokens: model.contextWindow,
}));

export const AI_MODEL_FALLBACKS = buildRecord<AllowedModelId[]>(model => {
  const ordered = MODEL_REGISTRY
    .filter(candidate => candidate.id !== model.id)
    .filter(candidate => candidate.minPlan === UserPlan.FREE || candidate.tier !== AIModelTier.PREMIUM)
    .sort((a, b) => a.creditFloor - b.creditFloor)
    .slice(0, 3)
    .map(candidate => candidate.id as AllowedModelId);
  return ordered.length ? ordered : [DEFAULT_PROVIDER_MODEL_ID];
});

export type ModelCreditRate = {
  id: ModelSelectionId;
  display_name: string;
  tier: AIModelTier | 'Auto';
  availability: UserPlan | 'all';
  credits: {
    plan: string;
    build: string;
    fix: string;
    deploy: string;
  };
};

function formatCredit(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

export const MODEL_CREDIT_RATES: ModelCreditRate[] = [
  {
    id: 'auto',
    display_name: 'Auto',
    tier: 'Auto',
    availability: 'all',
    credits: { plan: 'Low', build: 'Adaptive', fix: 'Adaptive', deploy: 'Standard' },
  },
  ...MODEL_REGISTRY.map(model => {
    const base = model.creditFloor;
    return {
      id: model.id as AllowedModelId,
      display_name: model.label,
      tier: model.tier,
      availability: model.minPlan,
      credits: {
        plan: `~${formatCredit(Math.max(1, base * 0.55))}`,
        build: `from ${formatCredit(base)}`,
        fix: `from ${formatCredit(Math.max(1, base * 0.45))}`,
        deploy: '1-3',
      },
    };
  }),
];
