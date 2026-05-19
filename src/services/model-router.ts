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
  InsufficientCreditsError, 
  NegativeMarginBlockedError 
} from './ai-validator.ts';

export interface RoutingContext {
  plan: UserPlan;
  mode: 'Auto' | 'Fast' | 'Balanced' | 'Pro' | 'Premium';
  userCredits: number;
  requiredCapabilities?: {
    vision?: boolean;
    tools?: boolean;
  };
}

export class ModelRouter {
  async selectModel(context: RoutingContext): Promise<AllowedModelId> {
    // 1. Filter models by plan access
    const planAccessibleModels = AI_ALLOWED_MODELS.filter(modelId => {
      const minPlan = AI_MODEL_PLAN_ACCESS[modelId];
      return this.isPlanSufficient(context.plan, minPlan);
    });

    // 2. Filter by required capabilities
    const capableModels = planAccessibleModels.filter(modelId => {
      const caps = AI_MODEL_CAPABILITIES[modelId];
      if (context.requiredCapabilities?.vision && !caps.supportsVision) return false;
      if (context.requiredCapabilities?.tools && !caps.supportsTools) return false;
      return true;
    });

    // 3. Selection logic based on mode
    let selectedModel: AllowedModelId;

    switch (context.mode) {
      case 'Fast':
        selectedModel = 'google/gemini-3.5-flash';
        break;
      case 'Premium':
        selectedModel = 'openai/gpt-5.5-pro';
        break;
      case 'Pro':
        selectedModel = 'openai/gpt-5.5';
        break;
      case 'Balanced':
      case 'Auto':
      default:
        selectedModel = 'anthropic/claude-sonnet-4.6';
        break;
    }

    // 4. Final safety checks
    // Check if the selected model became unavailable after filtering (fallback to flash if allowed)
    if (!capableModels.includes(selectedModel)) {
       selectedModel = capableModels.includes('google/gemini-3.5-flash') 
        ? 'google/gemini-3.5-flash' 
        : capableModels.includes('google/gemini-3-flash')
        ? 'google/gemini-3-flash'
        : capableModels[0];
    }

    if (!selectedModel) {
      throw new Error('No compatible models found for your current plan and requirements.');
    }

    // 5. Explicit whitelist validation
    validateAllowedModel(selectedModel);

    return selectedModel;
  }

  private isPlanSufficient(userPlan: UserPlan, requiredPlan: UserPlan): boolean {
    const hierarchy = [UserPlan.FREE, UserPlan.PRODUCER, UserPlan.STUDIO];
    return hierarchy.indexOf(userPlan) >= hierarchy.indexOf(requiredPlan);
  }
}
