import { AI_MODELS, AiMode, getModelById, listModelsByTier } from '../config/ai-models';
import { PLANS, PlanId } from '../config/plans';
import { ActionKind, assertPositiveMargin, estimateActionCost } from './cost-estimator';

export type RouteInput = {
  planId: PlanId;
  mode?: AiMode;
  customModelId?: string;
  actionKind: ActionKind;
  prompt?: string;
  maxCreditsPerAction?: number;
  confirmedPremium?: boolean;
};

export class ModelRouterService {
  listModels(planId: PlanId) {
    const allowed = new Set(PLANS[planId].allowedModelTiers);
    return AI_MODELS.map((model) => ({
      ...model,
      availableForPlan: allowed.has(model.tier),
      upgradeRequired: !allowed.has(model.tier)
    }));
  }

  route(input: RouteInput) {
    const mode = input.mode || 'auto';
    const plan = PLANS[input.planId];
    const planTiers = plan.allowedModelTiers;
    let candidates = listModelsByTier(planTiers).filter((model) => model.isAvailable);

    if (mode === 'custom') {
      if (!input.customModelId) {
        throw Object.assign(new Error('Custom mode requires a model id.'), { statusCode: 400 });
      }
      const model = getModelById(input.customModelId);
      if (!model) throw Object.assign(new Error('Model is not available in the Huggy catalog.'), { statusCode: 404 });
      if (!planTiers.includes(model.tier)) {
        throw Object.assign(new Error('This model is not available on your current plan.'), { statusCode: 403 });
      }
      candidates = [model];
    } else if (mode === 'fast') {
      candidates = candidates.filter((model) => model.speed === 'fast');
    } else if (mode === 'balanced') {
      candidates = candidates.filter((model) => ['economy', 'standard', 'pro'].includes(model.tier));
    } else if (mode === 'pro') {
      candidates = candidates.filter((model) => ['pro', 'standard'].includes(model.tier));
    } else if (mode === 'max_quality') {
      candidates = candidates.filter((model) => ['max_quality', 'premium'].includes(model.tier));
    }

    if (!candidates.length) {
      throw Object.assign(new Error('No allowed model is available for this plan and mode.'), { statusCode: 403 });
    }

    const sorted = candidates.sort((a, b) => scoreModel(a, input.actionKind, mode) - scoreModel(b, input.actionKind, mode));
    const selected = sorted[0];
    const estimate = estimateActionCost({
      planId: input.planId,
      actionKind: input.actionKind,
      model: selected,
      inputTokens: estimateTokens(input.prompt || ''),
      outputTokens: estimateOutputTokens(input.actionKind),
      buildCostUsd: input.actionKind === 'production_deploy' ? 0.02 : 0
    });

    assertPositiveMargin(estimate);

    if (input.maxCreditsPerAction && estimate.estimatedCredits > input.maxCreditsPerAction) {
      throw Object.assign(new Error('Estimated credits exceed your max credits per action setting.'), { statusCode: 402 });
    }

    if (selected.requiresConfirmation && !input.confirmedPremium) {
      return {
        selectedModel: selected,
        estimate,
        mode,
        requiresConfirmation: true,
        confirmationReason: 'Premium or Max Quality models require confirmation before spending credits.'
      };
    }

    return {
      selectedModel: selected,
      estimate,
      mode,
      requiresConfirmation: false
    };
  }
}

function scoreModel(model: (typeof AI_MODELS)[number], actionKind: ActionKind, mode: AiMode) {
  const tierWeight = { economy: 1, standard: 2, pro: 3, premium: 5, max_quality: 8 }[model.tier];
  const speedWeight = { fast: 0, balanced: 1, slow: 2 }[model.speed];
  const codingBonus = ['component_change', 'new_feature', 'mvp_generation', 'debug_complex'].includes(actionKind)
    && model.strengths.some((strength) => /code|architecture|debug|full app/i.test(strength))
    ? -2
    : 0;
  const premiumPenalty = mode === 'auto' && ['chat_simple', 'ui_change', 'preview_build'].includes(actionKind) ? 5 : 0;
  return tierWeight + speedWeight + codingBonus + premiumPenalty;
}

function estimateTokens(prompt: string) {
  return Math.max(1200, Math.ceil(prompt.length / 4) + 2500);
}

function estimateOutputTokens(actionKind: ActionKind) {
  if (actionKind === 'mvp_generation') return 14000;
  if (actionKind === 'new_feature') return 8000;
  if (actionKind === 'debug_complex') return 6000;
  if (actionKind === 'component_change') return 4500;
  return 2200;
}
