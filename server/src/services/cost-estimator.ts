import { AiModelDefinition } from '../config/ai-models';
import { CREDIT_MARGIN_MULTIPLIER, PlanId, planCreditValueUsd } from '../config/plans';

export type ActionKind =
  | 'chat_simple'
  | 'technical_plan'
  | 'ui_change'
  | 'component_change'
  | 'new_feature'
  | 'mvp_generation'
  | 'debug_simple'
  | 'debug_complex'
  | 'preview_build'
  | 'production_deploy'
  | 'domain_operation'
  | 'security_scan_simple'
  | 'security_scan_full';

type EstimateInput = {
  planId: PlanId;
  actionKind: ActionKind;
  model: AiModelDefinition;
  inputTokens?: number;
  outputTokens?: number;
  infraCostUsd?: number;
  storageCostUsd?: number;
  buildCostUsd?: number;
  domainOperationCostUsd?: number;
  complexitySurchargeCredits?: number;
};

const MINIMUM_ACTION_CREDITS: Record<ActionKind, number> = {
  chat_simple: 0.5,
  technical_plan: 1,
  ui_change: 0.5,
  component_change: 1,
  new_feature: 3,
  mvp_generation: 10,
  debug_simple: 0,
  debug_complex: 2,
  preview_build: 0.2,
  production_deploy: 1,
  domain_operation: 0,
  security_scan_simple: 1,
  security_scan_full: 4
};

export function estimateActionCost(input: EstimateInput) {
  const inputTokens = input.inputTokens ?? 6000;
  const outputTokens = input.outputTokens ?? 3000;
  const openRouterCostUsd =
    (inputTokens / 1_000_000) * input.model.inputUsdPerMillion +
    (outputTokens / 1_000_000) * input.model.outputUsdPerMillion;
  const realCostUsd =
    openRouterCostUsd +
    (input.infraCostUsd ?? 0.003) +
    (input.storageCostUsd ?? 0.001) +
    (input.buildCostUsd ?? 0) +
    (input.domainOperationCostUsd ?? 0);
  const sellValuePerCredit = planCreditValueUsd(input.planId);
  const requiredCredits = ceilToTenth((realCostUsd * CREDIT_MARGIN_MULTIPLIER) / sellValuePerCredit);
  const finalCredits = Math.max(
    MINIMUM_ACTION_CREDITS[input.actionKind],
    requiredCredits + (input.complexitySurchargeCredits ?? 0)
  );
  const revenueUsd = finalCredits * sellValuePerCredit;
  const marginUsd = revenueUsd - realCostUsd;
  const marginMultiplier = realCostUsd > 0 ? revenueUsd / realCostUsd : Number.POSITIVE_INFINITY;

  return {
    actionKind: input.actionKind,
    modelId: input.model.id,
    tier: input.model.tier,
    inputTokens,
    outputTokens,
    openRouterCostUsd: roundMoney(openRouterCostUsd),
    realCostUsd: roundMoney(realCostUsd),
    sellValuePerCredit: roundMoney(sellValuePerCredit),
    estimatedCredits: ceilToTenth(finalCredits),
    minimumMarginMultiplier: CREDIT_MARGIN_MULTIPLIER,
    marginUsd: roundMoney(marginUsd),
    marginMultiplier: roundMoney(marginMultiplier),
    requiresConfirmation: input.model.requiresConfirmation || finalCredits >= 8,
    marginProtected: marginUsd >= 0 && marginMultiplier >= CREDIT_MARGIN_MULTIPLIER
  };
}

export function assertPositiveMargin(estimate: ReturnType<typeof estimateActionCost>) {
  if (!estimate.marginProtected) {
    throw Object.assign(new Error('This action was blocked because it could create a negative or unsafe margin.'), {
      statusCode: 402
    });
  }
}

function ceilToTenth(value: number) {
  return Math.ceil(value * 10) / 10;
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}
