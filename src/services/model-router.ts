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
  requiredCapabilities?: {
    vision?: boolean;
    tools?: boolean;
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
      preferred.find(modelId => affordableModels.includes(modelId)) || affordableModels[0]
    );

    // 4. Smart Router Mode Selection logic
    let selectedModel: AllowedModelId;

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
        // AI Model selection optimizing for Quality, Speed and Cost:
        // Adjust model selection depending on task complexity and user balance
        const complexity = context.taskComplexity || 'medium';

        if (complexity === 'simple') {
          // Simple Chat / small modification: Economy Model
          selectedModel = firstAffordable(['openai/gpt-5-mini', 'deepseek/deepseek-v4-flash', 'google/gemini-3.5-flash', 'google/gemini-3-flash-preview']);
        } else if (complexity === 'complex') {
          // High complexity multi-file modification
          selectedModel = firstAffordable(['google/gemini-3-pro-preview', 'anthropic/claude-sonnet-4.6', 'deepseek/deepseek-v4-pro', 'openai/gpt-5.5']);
        } else if (complexity === 'extreme' && context.userCredits > 50) {
          // Power task: Standard default to sonnet or premium on higher tiers.
          selectedModel = firstAffordable(['anthropic/claude-opus-4.8-fast', 'anthropic/claude-opus-4.8', 'openai/gpt-5.5-pro', 'anthropic/claude-sonnet-4.6']);
        } else {
          // Medium/Default Task: Balanced Standard or high-tier fallback
          selectedModel = firstAffordable(['google/gemini-3.5-flash', 'google/gemini-3-flash-preview', 'openai/gpt-5-mini', 'deepseek/deepseek-v4-pro']);
        }
        break;
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
