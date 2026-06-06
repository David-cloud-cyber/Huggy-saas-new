import { 
  AI_ALLOWED_MODELS, 
  AI_MODEL_PLAN_ACCESS, 
  AI_MODEL_CAPABILITIES, 
  AI_MODEL_TIERS, 
  DEFAULT_PROVIDER_MODEL_ID,
  MODEL_ACTION_CREDIT_FLOORS,
  UserPlan, 
  type AllowedModelId 
} from '../config/ai-models.ts';
import { 
  validateAllowedModel, 
  ModelNotAllowedForPlanError, 
} from './ai-validator.ts';

export interface RoutingContext {
  plan: UserPlan | 'free' | 'pro' | 'scale' | 'enterprise';
  mode: 'Auto' | 'Fast' | 'Balanced' | 'Pro' | 'Premium' | 'Max Quality' | 'Custom';
  userCredits: number;
  taskComplexity?: 'simple' | 'medium' | 'complex' | 'extreme';
  preferredModels?: AllowedModelId[];
  requiredCapabilities?: {
    vision?: boolean;
    tools?: boolean;
    structuredOutput?: boolean;
    longContext?: boolean;
    reasoning?: boolean;
    code?: boolean;
    agentic?: boolean;
    design?: boolean;
    security?: boolean;
  };
}

export class ModelRouter {
  async selectModel(context: RoutingContext, requestedCustomModelId?: string): Promise<AllowedModelId> {
    // 1. Direct validation of custom model choice if in Custom mode
    if (context.mode === 'Custom' && requestedCustomModelId && requestedCustomModelId !== 'auto') {
      validateAllowedModel(requestedCustomModelId);
      
      const minPlan = AI_MODEL_PLAN_ACCESS[requestedCustomModelId as AllowedModelId];
      if (!this.isPlanSufficient(context.plan, minPlan)) {
        throw new ModelNotAllowedForPlanError(requestedCustomModelId, context.plan);
      }
      
      // Credit check threshold for custom selection
      if (context.userCredits < MODEL_ACTION_CREDIT_FLOORS[requestedCustomModelId as AllowedModelId]) {
        throw new Error('Action unavailable with current plan. Please use Auto or upgrade.');
      }

      return requestedCustomModelId as AllowedModelId;
    }

    // 2. Filter available models based on Plan access
    const planAccessibleModels = AI_ALLOWED_MODELS.filter(modelId => {
      const minPlan = AI_MODEL_PLAN_ACCESS[modelId];
      return this.isPlanSufficient(context.plan, minPlan);
    });

    // 3. Filter by required capabilities
    let capableModels = planAccessibleModels.filter(modelId => {
      const caps = AI_MODEL_CAPABILITIES[modelId];
      if (context.requiredCapabilities?.vision && !caps.supportsVision) return false;
      if (context.requiredCapabilities?.tools && !caps.supportsTools) return false;
      if (context.requiredCapabilities?.structuredOutput && !caps.supportsStructuredOutput) return false;
      if (context.requiredCapabilities?.longContext && !caps.supportsLongContext) return false;
      return true;
    });

    if (capableModels.length === 0) {
      // In extremis, use the raw whitelist fallbacks directly
      capableModels = [DEFAULT_PROVIDER_MODEL_ID];
    }

    const affordableModels = capableModels
      .filter(modelId => MODEL_ACTION_CREDIT_FLOORS[modelId] <= context.userCredits)
      .sort((a, b) => MODEL_ACTION_CREDIT_FLOORS[a] - MODEL_ACTION_CREDIT_FLOORS[b]);

    if (affordableModels.length === 0) {
      throw new Error('Action unavailable with current plan. Please use Auto or upgrade.');
    }

    const firstAffordable = (preferred: AllowedModelId[]) => (
      preferred.find(modelId => affordableModels.includes(modelId)) || this.selectBestAutoModel(affordableModels, context)
    );

    // 4. Smart Router Mode Selection logic
    let selectedModel: AllowedModelId;
    const preferredModel = context.preferredModels?.find(modelId => affordableModels.includes(modelId));

    if (context.mode === 'Auto' && preferredModel) {
      selectedModel = preferredModel;
    } else {

      switch (context.mode) {
        case 'Fast':
          selectedModel = firstAffordable(['openai/gpt-5-mini', 'deepseek/deepseek-v4-flash', 'google/gemini-3.5-flash']);
          break;

        case 'Balanced':
          selectedModel = firstAffordable(['google/gemini-3.5-flash', 'google/gemini-3-flash-preview', 'openai/gpt-5-mini', 'deepseek/deepseek-v4-pro']);
          break;

        case 'Pro':
          selectedModel = firstAffordable(['google/gemini-3-pro-preview', 'anthropic/claude-sonnet-4.6', 'openai/gpt-5.5']);
          break;

        case 'Premium':
        case 'Max Quality':
          selectedModel = firstAffordable(['anthropic/claude-opus-4.8-fast', 'anthropic/claude-opus-4.8', 'openai/gpt-5.5-pro', 'anthropic/claude-opus-4.7']);
          break;

        case 'Auto':
        default: {
          selectedModel = this.selectBestAutoModel(affordableModels, context);
          break;
        }
      }
    }

    // Double check compatibility filtering
    if (!capableModels.includes(selectedModel)) {
       selectedModel = capableModels.includes(DEFAULT_PROVIDER_MODEL_ID) 
        ? DEFAULT_PROVIDER_MODEL_ID 
        : capableModels[0] as AllowedModelId;
    }

    validateAllowedModel(selectedModel);

    return selectedModel;
  }

  private selectBestAutoModel(models: AllowedModelId[], context: RoutingContext): AllowedModelId {
    if (!models.length) return DEFAULT_PROVIDER_MODEL_ID;
    const complexity = context.taskComplexity || 'medium';
    if (!this.hasSpecificCapabilityNeeds(context)) {
      if (complexity === 'simple') {
        return this.firstAvailable(models, ['openai/gpt-5-mini', 'deepseek/deepseek-v4-flash', 'google/gemini-3.5-flash', 'google/gemini-3-flash-preview']);
      }
      if (complexity === 'complex') {
        return this.firstAvailable(models, ['google/gemini-3-pro-preview', 'anthropic/claude-sonnet-4.6', 'deepseek/deepseek-v4-pro', 'openai/gpt-5.5']);
      }
      if (complexity === 'extreme') {
        return this.firstAvailable(models, ['anthropic/claude-opus-4.8-fast', 'anthropic/claude-opus-4.8', 'openai/gpt-5.5-pro', 'anthropic/claude-sonnet-4.6']);
      }
      return this.firstAvailable(models, ['google/gemini-3.5-flash', 'google/gemini-3-flash-preview', 'openai/gpt-5-mini', 'deepseek/deepseek-v4-pro']);
    }
    const scored = models.map(modelId => ({
      modelId,
      score: this.scoreModel(modelId, context, complexity),
    })).sort((a, b) => b.score - a.score);
    return scored[0]?.modelId || models[0];
  }

  private firstAvailable(models: AllowedModelId[], preferred: AllowedModelId[]) {
    return preferred.find(modelId => models.includes(modelId)) || models[0];
  }

  private hasSpecificCapabilityNeeds(context: RoutingContext) {
    const required = context.requiredCapabilities || {};
    return Object.values(required).some(Boolean);
  }

  private scoreModel(modelId: AllowedModelId, context: RoutingContext, complexity: RoutingContext['taskComplexity']) {
    const caps = AI_MODEL_CAPABILITIES[modelId];
    const creditCost = MODEL_ACTION_CREDIT_FLOORS[modelId] || 1;
    let score = 0;

    score += this.strengthScore(caps.reasoningLevel) * (context.requiredCapabilities?.reasoning ? 3 : complexity === 'simple' ? 0.6 : 1.4);
    score += this.strengthScore(caps.codeLevel) * (context.requiredCapabilities?.code ? 3 : complexity === 'simple' ? 0.6 : 1.6);
    score += this.strengthScore(caps.agenticLevel) * (context.requiredCapabilities?.agentic ? 2.6 : complexity === 'extreme' ? 1.7 : 0.9);
    score += this.strengthScore(caps.designLevel) * (context.requiredCapabilities?.design ? 2.2 : 0.7);
    score += this.strengthScore(caps.securityLevel) * (context.requiredCapabilities?.security ? 2.2 : 0.6);

    if (context.requiredCapabilities?.vision && caps.supportsVision) score += 14;
    if (context.requiredCapabilities?.tools && caps.supportsToolCalling) score += 10;
    if (context.requiredCapabilities?.structuredOutput && caps.supportsStructuredOutput) score += 8;
    if (context.requiredCapabilities?.longContext && caps.supportsLongContext) score += 8;

    if (complexity === 'simple') {
      score += caps.speed === 'fast' ? 12 : caps.speed === 'balanced' ? 6 : 0;
      score -= creditCost * 1.4;
    } else if (complexity === 'extreme') {
      score += caps.reasoningLevel === 'frontier' ? 18 : caps.reasoningLevel === 'high' ? 10 : 0;
      score += caps.codeLevel === 'frontier' ? 14 : caps.codeLevel === 'high' ? 9 : 0;
      score -= creditCost * 0.15;
    } else if (complexity === 'complex') {
      score += caps.codeLevel === 'frontier' ? 10 : caps.codeLevel === 'high' ? 8 : 0;
      score += caps.reasoningLevel === 'frontier' ? 8 : caps.reasoningLevel === 'high' ? 6 : 0;
      score -= creditCost * 0.35;
    } else {
      score += caps.speed === 'fast' ? 5 : 2;
      score += caps.reliability === 'high' ? 4 : caps.reliability === 'standard' ? 2 : 0;
      score -= creditCost * 0.7;
    }

    if (caps.reliability === 'experimental') score -= complexity === 'simple' ? 2 : 0.5;
    if (context.userCredits < creditCost * 4) score -= creditCost;
    return score;
  }

  private strengthScore(value: string) {
    if (value === 'frontier') return 10;
    if (value === 'high') return 7;
    if (value === 'medium') return 4;
    return 1;
  }

  private isPlanSufficient(userPlan: string, requiredPlan: string): boolean {
    const tierValue = (p: string) => {
      const lower = p.toLowerCase();
      if (lower === 'enterprise') return 3;
      if (lower === 'scale') return 2;
      if (lower === 'pro') return 1;
      return 0;
    };

    return tierValue(userPlan) >= tierValue(requiredPlan);
  }
}
