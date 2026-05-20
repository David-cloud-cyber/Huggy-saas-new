import { 
  AI_ALLOWED_MODELS, 
  AI_MODEL_PLAN_ACCESS, 
  AI_MODEL_CAPABILITIES, 
  AI_MODEL_TIERS, 
  UserPlan, 
  type AllowedModelId 
} from '../config/ai-models.ts';
import { 
  validateAllowedModel, 
  ModelNotAllowedForPlanError, 
} from './ai-validator.ts';

export interface RoutingContext {
  plan: UserPlan | 'free' | 'producer' | 'studio' | 'business';
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
    if (context.mode === 'Custom' && requestedCustomModelId) {
      validateAllowedModel(requestedCustomModelId);
      
      const minPlan = AI_MODEL_PLAN_ACCESS[requestedCustomModelId as AllowedModelId];
      if (!this.isPlanSufficient(context.plan, minPlan)) {
        throw new ModelNotAllowedForPlanError(requestedCustomModelId, context.plan);
      }
      
      // Credit check threshold for custom selection
      if (context.userCredits <= 5 && AI_MODEL_TIERS[requestedCustomModelId as AllowedModelId] !== 'Standard') {
        throw new Error(`Your manual selection (${requestedCustomModelId}) requires Pro/Premium capabilities, but you are low on credits (${context.userCredits}). Please use Auto mode or top up.`);
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
      capableModels = ['google/gemini-3-flash'];
    }

    // 4. Smart Router Mode Selection logic
    let selectedModel: AllowedModelId;

    switch (context.mode) {
      case 'Fast':
        selectedModel = 'google/gemini-3-flash';
        break;

      case 'Balanced':
        selectedModel = 'google/gemini-3-pro';
        break;

      case 'Pro':
        selectedModel = planAccessibleModels.includes('openai/gpt-5.5') 
          ? 'openai/gpt-5.5' 
          : 'anthropic/claude-sonnet-4.6';
        break;

      case 'Premium':
      case 'Max Quality':
        selectedModel = planAccessibleModels.includes('openai/gpt-5.5-pro')
          ? 'openai/gpt-5.5-pro'
          : planAccessibleModels.includes('anthropic/claude-opus-4.7')
            ? 'anthropic/claude-opus-4.7'
            : 'openai/gpt-5.5';
        break;

      case 'Auto':
      default: {
        // AI Model selection optimizing for Quality, Speed and Cost:
        // Adjust model selection depending on task complexity and user balance
        const complexity = context.taskComplexity || 'medium';

        if (context.userCredits <= 10) {
          // Credit Optimization: Demote to standard/fast models to protect user balance
          selectedModel = 'google/gemini-3-flash';
        } else if (complexity === 'simple') {
          // Simple Chat / small modification: Economy Model
          selectedModel = 'google/gemini-3-flash';
        } else if (complexity === 'complex') {
          // High complexity multi-file modification
          selectedModel = planAccessibleModels.includes('anthropic/claude-sonnet-4.6')
            ? 'anthropic/claude-sonnet-4.6'
            : 'google/gemini-3-pro';
        } else if (complexity === 'extreme' && context.userCredits > 50) {
          // Power task: Standard default to sonnet or premium if under Studio tier
          selectedModel = planAccessibleModels.includes('openai/gpt-5.5-pro')
            ? 'openai/gpt-5.5-pro'
            : 'anthropic/claude-sonnet-4.6';
        } else {
          // Medium/Default Task: Balanced Standard or high-tier fallback
          selectedModel = planAccessibleModels.includes('google/gemini-3-pro')
            ? 'google/gemini-3-pro'
            : 'google/gemini-3-flash';
        }
        break;
      }
    }

    // Double check compatibility filtering
    if (!capableModels.includes(selectedModel)) {
       selectedModel = capableModels.includes('google/gemini-3-flash') 
        ? 'google/gemini-3-flash' 
        : capableModels[0] as AllowedModelId;
    }

    validateAllowedModel(selectedModel);

    return selectedModel;
  }

  private isPlanSufficient(userPlan: string, requiredPlan: string): boolean {
    const hierarchy = ['free', 'producer', 'starter', 'studio', 'pro', 'business', 'enterprise'];
    
    // map alternate user names from billing setup mapping compatibility
    const normalize = (p: string) => {
      const lower = p.toLowerCase();
      if (lower === 'pro') return 'pro';
      if (lower === 'producer') return 'producer';
      if (lower === 'studio') return 'studio';
      return lower;
    };

    const usrIdx = hierarchy.indexOf(normalize(userPlan));
    const reqIdx = hierarchy.indexOf(normalize(requiredPlan));

    return usrIdx >= reqIdx;
  }
}
