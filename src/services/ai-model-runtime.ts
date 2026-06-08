import {
  AI_MODEL_CAPABILITIES,
  AI_MODEL_FALLBACKS,
  DEFAULT_PROVIDER_MODEL_ID,
  MODEL_ACTION_CREDIT_FLOORS,
  MODEL_REGISTRY,
  type AllowedModelId,
  type ModelProvider,
} from '../config/ai-models.ts';

export type AIWorkflowTask =
  | 'conversation'
  | 'clarification'
  | 'intent'
  | 'planning'
  | 'frontend_generation'
  | 'backend_generation'
  | 'database'
  | 'debug'
  | 'design'
  | 'security'
  | 'streaming'
  | 'summary'
  | 'tests'
  | 'deploy'
  | 'vision'
  | 'long_context';

export type RuntimeStrength = 'none' | 'low' | 'medium' | 'high' | 'frontier';

export type RuntimeProviderAdapter =
  | 'openrouter'
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'fal';

export type RuntimeResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | { type: 'json_schema'; schemaName: string; schema: Record<string, unknown> };

export type RuntimeToolDefinition = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
};

export type AIModelCapabilityProfile = {
  id: AllowedModelId;
  provider: ModelProvider;
  adapter: RuntimeProviderAdapter;
  displayName: string;
  enabled: true;
  bestUse: string[];
  reasoning: RuntimeStrength;
  code: RuntimeStrength;
  comprehension: RuntimeStrength;
  agentic: RuntimeStrength;
  design: RuntimeStrength;
  security: RuntimeStrength;
  supports: {
    streaming: boolean;
    toolCalling: boolean;
    structuredOutput: boolean;
    jsonMode: boolean;
    vision: boolean;
    longContext: boolean;
    reasoningControl: boolean;
  };
  recommended: {
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    streamingTimeoutMs: number;
  };
  limits: {
    contextTokens: number;
    known: string[];
  };
  creditCost: number;
  speed: 'fast' | 'balanced' | 'deliberate';
  reliability: 'standard' | 'high' | 'experimental';
  fallbackPrimary: AllowedModelId;
  fallbackSecondary: AllowedModelId;
};

export type AIModelRuntimeConfig = {
  profile: AIModelCapabilityProfile;
  task: AIWorkflowTask;
  stream: boolean;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  responseFormat: RuntimeResponseFormat;
  tools: RuntimeToolDefinition[];
  toolChoice: 'auto' | 'none';
  reasoning: {
    enabled: boolean;
    effort: 'low' | 'medium' | 'high';
  };
  thinking: {
    enabled: boolean;
    budgetTokens: number;
    includeInResponse: boolean;
  };
  vision: {
    enabled: boolean;
  };
  longContext: {
    enabled: boolean;
    maxInputTokens: number;
  };
  fallbacks: AllowedModelId[];
  privateRuntimeNotes: string[];
};

const PROVIDER_ADAPTERS: Record<ModelProvider, RuntimeProviderAdapter> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'gemini',
  deepseek: 'deepseek',
};

function asRuntimeStrength(value: string | undefined): RuntimeStrength {
  if (value === 'frontier' || value === 'high' || value === 'medium' || value === 'low') return value;
  return 'none';
}

function comprehensionForProfile(modelId: AllowedModelId): RuntimeStrength {
  const caps = AI_MODEL_CAPABILITIES[modelId];
  if (caps.supportsLongContext && caps.reasoningLevel !== 'low') return 'high';
  if (caps.maxContextTokens >= 128_000) return 'medium';
  return asRuntimeStrength(caps.reasoningLevel);
}

function knownLimitsForProvider(provider: ModelProvider, modelId: AllowedModelId) {
  const limits: string[] = [];
  if (provider === 'deepseek') {
    limits.push('structured output and tool calling are routed conservatively unless the gateway confirms support');
  }
  if (modelId.includes('preview')) {
    limits.push('preview model; use fallback on provider instability');
  }
  if (modelId.includes('4.8')) {
    limits.push('new premium model; keep fallback ready for availability changes');
  }
  return limits;
}

function supportsReasoningControl(provider: ModelProvider, modelId: AllowedModelId) {
  // Expanded reasoning control detection for all major providers.
  // Huggy sends provider-specific reasoning/thinking parameters only when
  // the model is explicitly known to support them.
  if (provider === 'openai' && /gpt-5\.5|gpt-5-pro|o[1-4]/i.test(modelId)) return true;
  if (provider === 'anthropic' && /claude-opus|claude-sonnet-4/i.test(modelId)) return true;
  if (provider === 'google' && /gemini-3-pro|gemini-3-ultra/i.test(modelId)) return true;
  if (provider === 'deepseek' && /deepseek-r1|deepseek-v4/i.test(modelId)) return true;
  return false;
}

export function getAIModelCapabilityProfile(modelId: AllowedModelId): AIModelCapabilityProfile {
  const definition = MODEL_REGISTRY.find(model => model.id === modelId);
  if (!definition) {
    return getAIModelCapabilityProfile(DEFAULT_PROVIDER_MODEL_ID);
  }
  const caps = AI_MODEL_CAPABILITIES[modelId];
  const fallbacks = AI_MODEL_FALLBACKS[modelId]?.filter(Boolean) || [DEFAULT_PROVIDER_MODEL_ID];
  const isReasoningHeavy = caps.reasoningLevel === 'frontier' || caps.reasoningLevel === 'high';
  const isCodeHeavy = caps.codeLevel === 'frontier' || caps.codeLevel === 'high';
  const maxTokens = isCodeHeavy ? 9000 : isReasoningHeavy ? 6500 : 3600;

  return {
    id: modelId,
    provider: definition.provider,
    adapter: PROVIDER_ADAPTERS[definition.provider],
    displayName: definition.label,
    enabled: true,
    bestUse: caps.bestFor,
    reasoning: asRuntimeStrength(caps.reasoningLevel),
    code: asRuntimeStrength(caps.codeLevel),
    comprehension: comprehensionForProfile(modelId),
    agentic: asRuntimeStrength(caps.agenticLevel),
    design: asRuntimeStrength(caps.designLevel),
    security: asRuntimeStrength(caps.securityLevel),
    supports: {
      streaming: caps.supportsStreaming,
      toolCalling: caps.supportsToolCalling,
      structuredOutput: caps.supportsStructuredOutput,
      jsonMode: caps.supportsJsonMode,
      vision: caps.supportsVision,
      longContext: caps.supportsLongContext,
      reasoningControl: supportsReasoningControl(definition.provider, modelId),
    },
    recommended: {
      temperature: caps.speed === 'fast' ? 0.35 : 0.25,
      maxTokens,
      timeoutMs: caps.speed === 'deliberate' ? 120_000 : caps.speed === 'balanced' ? 75_000 : 45_000,
      streamingTimeoutMs: caps.speed === 'deliberate' ? 180_000 : caps.speed === 'balanced' ? 120_000 : 75_000,
    },
    limits: {
      contextTokens: caps.maxContextTokens,
      known: knownLimitsForProvider(definition.provider, modelId),
    },
    creditCost: MODEL_ACTION_CREDIT_FLOORS[modelId],
    speed: caps.speed,
    reliability: caps.reliability,
    fallbackPrimary: fallbacks[0] || DEFAULT_PROVIDER_MODEL_ID,
    fallbackSecondary: fallbacks[1] || fallbacks[0] || DEFAULT_PROVIDER_MODEL_ID,
  };
}

export function getAllAIModelCapabilityProfiles() {
  return MODEL_REGISTRY.map(model => getAIModelCapabilityProfile(model.id as AllowedModelId));
}

function taskNeedsStructuredOutput(task: AIWorkflowTask) {
  return ['intent', 'planning', 'database', 'security', 'tests', 'deploy'].includes(task);
}

function taskNeedsToolCalling(task: AIWorkflowTask) {
  return ['frontend_generation', 'backend_generation', 'database', 'debug', 'security', 'tests', 'deploy'].includes(task);
}

function taskNeedsLongContext(task: AIWorkflowTask) {
  return ['long_context', 'debug', 'frontend_generation', 'backend_generation', 'security'].includes(task);
}

function reasoningEffortForTask(profile: AIModelCapabilityProfile, task: AIWorkflowTask): 'low' | 'medium' | 'high' {
  if (profile.reasoning === 'frontier' && ['debug', 'security', 'backend_generation', 'database'].includes(task)) return 'high';
  if (['planning', 'frontend_generation', 'backend_generation', 'database', 'debug', 'design', 'security'].includes(task)) return 'medium';
  return 'low';
}

function thinkingBudgetForTask(profile: AIModelCapabilityProfile, task: AIWorkflowTask): number {
  if (!profile.supports.reasoningControl) return 0;
  if (['security', 'database', 'backend_generation'].includes(task) && (profile.reasoning === 'frontier' || profile.reasoning === 'high')) return 16384;
  if (['debug', 'planning', 'frontend_generation'].includes(task)) return 8192;
  if (['design', 'tests'].includes(task)) return 4096;
  return 2048;
}

function responseFormatForTask(profile: AIModelCapabilityProfile, task: AIWorkflowTask): RuntimeResponseFormat {
  if (!taskNeedsStructuredOutput(task) || !profile.supports.structuredOutput) return { type: 'text' };
  if (task === 'intent') {
    return {
      type: 'json_schema',
      schemaName: 'huggy_intent_decision',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          intent: { type: 'string' },
          confidence: { type: 'number' },
          should_mutate_files: { type: 'boolean' },
          requires_clarification: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['intent', 'confidence', 'should_mutate_files', 'requires_clarification', 'reason'],
      },
    };
  }
  return { type: 'json_object' };
}

function toolsForTask(profile: AIModelCapabilityProfile, task: AIWorkflowTask): RuntimeToolDefinition[] {
  if (!taskNeedsToolCalling(task) || !profile.supports.toolCalling) return [];
  const shared: RuntimeToolDefinition[] = [
    {
      name: 'inspect_project_files',
      description: 'Read relevant project files before deciding what to change.',
      parameters: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } } } },
    },
    {
      name: 'summarize_change_plan',
      description: 'Return a concise, structured plan for the intended change.',
      parameters: { type: 'object', properties: { goal: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } } },
    },
  ];
  if (task === 'debug' || task === 'tests') {
    shared.push({
      name: 'interpret_check_failure',
      description: 'Classify a build, lint, runtime or preview failure and propose a safe fix.',
      parameters: { type: 'object', properties: { diagnostic: { type: 'string' }, likely_file: { type: 'string' } } },
    });
  }
  return shared;
}

export function buildAIModelRuntimeConfig(input: {
  modelId: AllowedModelId;
  task: AIWorkflowTask;
  stream?: boolean;
  preferStructuredOutput?: boolean;
  hasVisionInput?: boolean;
  estimatedInputTokens?: number;
  timeoutMs?: number;
  maxTokens?: number;
}): AIModelRuntimeConfig {
  const profile = getAIModelCapabilityProfile(input.modelId);
  const task = input.task;
  const responseFormat = input.preferStructuredOutput === false
    ? { type: 'text' } as RuntimeResponseFormat
    : responseFormatForTask(profile, task);
  const tools = toolsForTask(profile, task);
  const reasoningEffort = reasoningEffortForTask(profile, task);
  const stream = Boolean(input.stream && profile.supports.streaming);
  const longContextEnabled = profile.supports.longContext && (
    taskNeedsLongContext(task) || Number(input.estimatedInputTokens || 0) > 90_000
  );

  const notes: string[] = [
    `adapter:${profile.adapter}`,
    `task:${task}`,
    `reasoning:${profile.reasoning}`,
    `code:${profile.code}`,
  ];
  if (responseFormat.type !== 'text') notes.push(`structured:${responseFormat.type}`);
  if (tools.length) notes.push(`tools:${tools.length}`);
  if (input.hasVisionInput && profile.supports.vision) notes.push('vision:enabled');
  if (longContextEnabled) notes.push('long_context:enabled');
  if (profile.supports.reasoningControl) notes.push(`thinking_budget:${thinkingBudgetForTask(profile, task)}`);

  return {
    profile,
    task,
    stream,
    temperature: task === 'conversation' ? Math.min(0.55, profile.recommended.temperature + 0.15) : profile.recommended.temperature,
    maxTokens: input.maxTokens || profile.recommended.maxTokens,
    timeoutMs: input.timeoutMs || (stream ? profile.recommended.streamingTimeoutMs : profile.recommended.timeoutMs),
    responseFormat,
    tools,
    toolChoice: tools.length ? 'auto' : 'none',
    reasoning: {
      enabled: profile.supports.reasoningControl && reasoningEffort !== 'low',
      effort: reasoningEffort,
    },
    thinking: {
      enabled: profile.supports.reasoningControl && reasoningEffort !== 'low',
      budgetTokens: thinkingBudgetForTask(profile, task),
      includeInResponse: false,
    },
    vision: {
      enabled: Boolean(input.hasVisionInput && profile.supports.vision),
    },
    longContext: {
      enabled: longContextEnabled,
      maxInputTokens: profile.limits.contextTokens,
    },
    fallbacks: [profile.fallbackPrimary, profile.fallbackSecondary].filter((id, index, list) => list.indexOf(id) === index),
    privateRuntimeNotes: notes,
  };
}

export function publicRuntimeErrorMessage(diagnosticCode: string) {
  if (/QUOTA|BILLING/i.test(diagnosticCode)) {
    return 'Ce modele manque temporairement de quota. Huggy peut continuer avec Auto ou un modele compatible.';
  }
  if (/TIMEOUT|UNAVAILABLE|CIRCUIT/i.test(diagnosticCode)) {
    return 'Ce modele est temporairement indisponible. Huggy essaie un modele compatible pour continuer.';
  }
  if (/BAD_REQUEST|UNSUPPORTED/i.test(diagnosticCode)) {
    return 'Ce modele a refuse la configuration demandee. Huggy reduit les options avancees et reessaie proprement.';
  }
  return "Le modele IA a rencontre un probleme. Huggy garde l'erreur propre et peut reessayer avec Auto.";
}
