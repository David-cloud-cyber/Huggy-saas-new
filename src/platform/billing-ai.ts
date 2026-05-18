import { PlatformError, requireRole } from './security';
import type { Project, RequestContext, UUID } from './types';

export type PlanKey = 'free' | 'starter' | 'pro' | 'studio' | 'business' | 'enterprise';
export type ModelTier = 'economy' | 'standard' | 'pro' | 'premium' | 'max_quality';
export type ModelRoutingMode = 'auto' | 'fast' | 'balanced' | 'pro' | 'max_quality' | 'custom';
export type AiTaskType =
  | 'chat_simple'
  | 'technical_plan'
  | 'ui_small_change'
  | 'component_change'
  | 'new_feature'
  | 'full_mvp'
  | 'debug_simple'
  | 'debug_complex'
  | 'build_preview'
  | 'deploy_production'
  | 'domain_operation'
  | 'security_scan_simple'
  | 'security_scan_full';

export interface PlanDefinition {
  key: PlanKey;
  name: string;
  monthlyPriceUsd: number | null;
  monthlyCredits: number;
  activeProjectsLimit: number | null;
  customDomainsLimit: number;
  allowedModelTiers: ModelTier[];
  versionHistoryDays: number | null;
  badgeRemoval: boolean;
  exportCode: boolean;
  githubSync: boolean;
  supabaseIntegration: boolean;
  teamCollaboration: boolean;
  auditLogs: boolean;
  priorityBuilds: boolean;
  publicProjectsOnly: boolean;
  maxCreditsPerAction: number;
}

export interface TopUpProductDefinition {
  key: string;
  credits: number;
  priceUsd: number;
  expiresAfterMonths: number;
}

export interface AiModelDefinition {
  key: string;
  provider: 'openrouter';
  displayName: string;
  openRouterModel: string;
  tier: ModelTier;
  strengths: string[];
  speed: 'fast' | 'medium' | 'slow';
  costIndicator: 'low' | 'medium' | 'high' | 'very_high';
  contextWindow: number;
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  requiresConfirmation: boolean;
}

export interface AiModelPricing {
  modelKey: string;
  inputCostPer1MTokens: number;
  outputCostPer1MTokens: number;
  cachedInputCostPer1MTokens?: number;
  requestCostUsd: number;
}

export interface CostComponents {
  openRouterCostUsd: number;
  infraCostUsd: number;
  storageCostUsd: number;
  buildCostUsd: number;
  domainOperationCostUsd: number;
}

export interface CostEstimateInput {
  action: AiTaskType;
  plan: PlanDefinition;
  sellValuePerCreditUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  modelPricing?: AiModelPricing;
  components?: Partial<CostComponents>;
  complexitySurchargeCredits?: number;
  minimumActionCredits?: number;
  userMaxCreditsPerAction?: number;
  premiumConfirmationRequired?: boolean;
}

export interface CostEstimate {
  action: AiTaskType;
  estimatedCostUsd: number;
  requiredCredits: number;
  finalCredits: number;
  sellValuePerCreditUsd: number;
  estimatedMarginMultiplier: number;
  confirmationRequired: boolean;
  reasons: string[];
}

export interface WalletSnapshot {
  organizationId: UUID;
  planCreditsBalance: number;
  topupCreditsBalance: number;
  reservedCredits: number;
  sellValuePerCreditUsd: number;
}

export interface CreditReservation {
  id: UUID;
  organizationId: UUID;
  userId: UUID;
  projectId?: UUID;
  amount: number;
  status: 'reserved' | 'finalized' | 'released' | 'refunded';
  reason: string;
  estimatedCostUsd: number;
  createdAt: string;
}

export interface RoutingPreferences {
  mode: ModelRoutingMode;
  customModelKey?: string;
  maxCreditsPerAction?: number;
  confirmBeforePremium?: boolean;
  revertToAutoAfterResponse?: boolean;
}

export interface RoutingInput {
  context: RequestContext;
  plan: PlanDefinition;
  wallet: WalletSnapshot;
  taskType: AiTaskType;
  complexityScore: number;
  preferences?: Partial<RoutingPreferences>;
  requestedModelKey?: string;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  requireVision?: boolean;
  requireToolCalling?: boolean;
}

export interface RoutingDecision {
  id: UUID;
  mode: ModelRoutingMode;
  selectedModel: AiModelDefinition;
  estimate: CostEstimate;
  confirmationRequired: boolean;
  blocked: boolean;
  upgradeRequired: boolean;
  alternatives: AiModelDefinition[];
  rationale: string;
  rejectedModels: Array<{ modelKey: string; reason: string }>;
}

export interface OpenRouterChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface OpenRouterCompletionRequest {
  model: AiModelDefinition;
  messages: OpenRouterChatMessage[];
  stream?: boolean;
  jsonMode?: boolean;
  tools?: unknown[];
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export interface OpenRouterUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd: number;
  actualCostUsd?: number;
}

export interface OpenRouterCompletionResult {
  id: string;
  model: string;
  content: string;
  usage: OpenRouterUsage;
  finishReason?: string;
}

export interface CheckoutSessionRequest {
  context: RequestContext;
  planKey?: PlanKey;
  topUpKey?: string;
  interval?: 'monthly' | 'yearly';
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
  mode: 'subscription' | 'payment';
}

export interface SubscriptionSnapshot {
  organizationId: UUID;
  planKey: PlanKey;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface MemberCreditPolicy {
  organizationId: UUID;
  userId: UUID;
  monthlyCreditLimit?: number;
  perActionCreditLimit?: number;
  premiumModelsAllowed: boolean;
}

export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
  free: {
    key: 'free',
    name: 'Free',
    monthlyPriceUsd: 0,
    monthlyCredits: 20,
    activeProjectsLimit: 1,
    customDomainsLimit: 0,
    allowedModelTiers: ['economy'],
    versionHistoryDays: null,
    badgeRemoval: false,
    exportCode: false,
    githubSync: false,
    supabaseIntegration: false,
    teamCollaboration: false,
    auditLogs: false,
    priorityBuilds: false,
    publicProjectsOnly: true,
    maxCreditsPerAction: 5,
  },
  starter: {
    key: 'starter',
    name: 'Starter',
    monthlyPriceUsd: 20,
    monthlyCredits: 100,
    activeProjectsLimit: 3,
    customDomainsLimit: 1,
    allowedModelTiers: ['economy', 'standard'],
    versionHistoryDays: 7,
    badgeRemoval: true,
    exportCode: true,
    githubSync: false,
    supabaseIntegration: false,
    teamCollaboration: false,
    auditLogs: false,
    priorityBuilds: false,
    publicProjectsOnly: false,
    maxCreditsPerAction: 15,
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    monthlyPriceUsd: 49,
    monthlyCredits: 300,
    activeProjectsLimit: 10,
    customDomainsLimit: 5,
    allowedModelTiers: ['economy', 'standard', 'pro'],
    versionHistoryDays: 30,
    badgeRemoval: true,
    exportCode: true,
    githubSync: true,
    supabaseIntegration: true,
    teamCollaboration: false,
    auditLogs: false,
    priorityBuilds: true,
    publicProjectsOnly: false,
    maxCreditsPerAction: 35,
  },
  studio: {
    key: 'studio',
    name: 'Studio',
    monthlyPriceUsd: 99,
    monthlyCredits: 700,
    activeProjectsLimit: 30,
    customDomainsLimit: 15,
    allowedModelTiers: ['economy', 'standard', 'pro', 'premium'],
    versionHistoryDays: 90,
    badgeRemoval: true,
    exportCode: true,
    githubSync: true,
    supabaseIntegration: true,
    teamCollaboration: true,
    auditLogs: true,
    priorityBuilds: true,
    publicProjectsOnly: false,
    maxCreditsPerAction: 75,
  },
  business: {
    key: 'business',
    name: 'Business',
    monthlyPriceUsd: 199,
    monthlyCredits: 1500,
    activeProjectsLimit: null,
    customDomainsLimit: 50,
    allowedModelTiers: ['economy', 'standard', 'pro', 'premium'],
    versionHistoryDays: 180,
    badgeRemoval: true,
    exportCode: true,
    githubSync: true,
    supabaseIntegration: true,
    teamCollaboration: true,
    auditLogs: true,
    priorityBuilds: true,
    publicProjectsOnly: false,
    maxCreditsPerAction: 150,
  },
  enterprise: {
    key: 'enterprise',
    name: 'Enterprise',
    monthlyPriceUsd: null,
    monthlyCredits: 0,
    activeProjectsLimit: null,
    customDomainsLimit: Number.POSITIVE_INFINITY,
    allowedModelTiers: ['economy', 'standard', 'pro', 'premium', 'max_quality'],
    versionHistoryDays: null,
    badgeRemoval: true,
    exportCode: true,
    githubSync: true,
    supabaseIntegration: true,
    teamCollaboration: true,
    auditLogs: true,
    priorityBuilds: true,
    publicProjectsOnly: false,
    maxCreditsPerAction: 500,
  },
};

export const TOPUP_PRODUCTS: TopUpProductDefinition[] = [
  { key: 'credits_100', credits: 100, priceUsd: 20, expiresAfterMonths: 12 },
  { key: 'credits_250', credits: 250, priceUsd: 47, expiresAfterMonths: 12 },
  { key: 'credits_500', credits: 500, priceUsd: 90, expiresAfterMonths: 12 },
  { key: 'credits_1000', credits: 1000, priceUsd: 170, expiresAfterMonths: 12 },
  { key: 'credits_2500', credits: 2500, priceUsd: 400, expiresAfterMonths: 12 },
];

export const AI_MODEL_CATALOG: AiModelDefinition[] = [
  { key: 'economy_fast', provider: 'openrouter', displayName: 'Economy Fast', openRouterModel: 'google/gemini-flash-1.5', tier: 'economy', strengths: ['Summary', 'Small edits', 'Vision'], speed: 'fast', costIndicator: 'low', contextWindow: 1_000_000, supportsStreaming: true, supportsJsonMode: true, supportsToolCalling: true, supportsVision: true, requiresConfirmation: false },
  { key: 'standard_balanced', provider: 'openrouter', displayName: 'Standard Balanced', openRouterModel: 'openai/gpt-4o-mini', tier: 'standard', strengths: ['UI', 'Components', 'Workflows'], speed: 'fast', costIndicator: 'medium', contextWindow: 128_000, supportsStreaming: true, supportsJsonMode: true, supportsToolCalling: true, supportsVision: true, requiresConfirmation: false },
  { key: 'pro_code', provider: 'openrouter', displayName: 'Pro Code', openRouterModel: 'anthropic/claude-3.5-sonnet', tier: 'pro', strengths: ['Code', 'Debug', 'Architecture'], speed: 'medium', costIndicator: 'high', contextWindow: 200_000, supportsStreaming: true, supportsJsonMode: true, supportsToolCalling: true, supportsVision: true, requiresConfirmation: false },
  { key: 'premium_architect', provider: 'openrouter', displayName: 'Premium Architect', openRouterModel: 'anthropic/claude-3.7-sonnet', tier: 'premium', strengths: ['Full app', 'Security', 'Difficult debug'], speed: 'medium', costIndicator: 'very_high', contextWindow: 200_000, supportsStreaming: true, supportsJsonMode: true, supportsToolCalling: true, supportsVision: true, requiresConfirmation: true },
  { key: 'max_quality', provider: 'openrouter', displayName: 'Max Quality', openRouterModel: 'openai/o1-pro', tier: 'max_quality', strengths: ['Complex reasoning', 'Architecture', 'Critical debugging'], speed: 'slow', costIndicator: 'very_high', contextWindow: 200_000, supportsStreaming: false, supportsJsonMode: true, supportsToolCalling: false, supportsVision: true, requiresConfirmation: true },
];

export const AI_MODEL_PRICING: Record<string, AiModelPricing> = {
  economy_fast: { modelKey: 'economy_fast', inputCostPer1MTokens: 0.075, outputCostPer1MTokens: 0.30, cachedInputCostPer1MTokens: 0.025, requestCostUsd: 0 },
  standard_balanced: { modelKey: 'standard_balanced', inputCostPer1MTokens: 0.15, outputCostPer1MTokens: 0.60, cachedInputCostPer1MTokens: 0.075, requestCostUsd: 0 },
  pro_code: { modelKey: 'pro_code', inputCostPer1MTokens: 3.00, outputCostPer1MTokens: 15.00, cachedInputCostPer1MTokens: 0.30, requestCostUsd: 0 },
  premium_architect: { modelKey: 'premium_architect', inputCostPer1MTokens: 3.00, outputCostPer1MTokens: 15.00, cachedInputCostPer1MTokens: 0.30, requestCostUsd: 0 },
  max_quality: { modelKey: 'max_quality', inputCostPer1MTokens: 15.00, outputCostPer1MTokens: 60.00, cachedInputCostPer1MTokens: 7.50, requestCostUsd: 0 },
};

const ACTION_MINIMUM_CREDITS: Record<AiTaskType, number> = {
  chat_simple: 0.5,
  technical_plan: 1,
  ui_small_change: 0.5,
  component_change: 1,
  new_feature: 3,
  full_mvp: 10,
  debug_simple: 0,
  debug_complex: 2,
  build_preview: 0.2,
  deploy_production: 1,
  domain_operation: 0,
  security_scan_simple: 1,
  security_scan_full: 4,
};

const ACTION_COMPLEXITY_SURCHARGE: Record<AiTaskType, number> = {
  chat_simple: 0,
  technical_plan: 0.5,
  ui_small_change: 0.2,
  component_change: 0.5,
  new_feature: 1,
  full_mvp: 4,
  debug_simple: 0,
  debug_complex: 1,
  build_preview: 0,
  deploy_production: 0.5,
  domain_operation: 0,
  security_scan_simple: 0.5,
  security_scan_full: 2,
};

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): UUID {
  return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function ceilToTenth(value: number): number {
  return Math.ceil(value * 10) / 10;
}

function totalBalance(wallet: WalletSnapshot): number {
  return wallet.planCreditsBalance + wallet.topupCreditsBalance - wallet.reservedCredits;
}

function estimatedOpenRouterCost(input: CostEstimateInput): number {
  if (!input.modelPricing) return 0;
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const cachedInputTokens = input.cachedInputTokens ?? 0;
  const billableInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  return input.modelPricing.requestCostUsd
    + billableInputTokens * input.modelPricing.inputCostPer1MTokens / 1_000_000
    + outputTokens * input.modelPricing.outputCostPer1MTokens / 1_000_000
    + cachedInputTokens * (input.modelPricing.cachedInputCostPer1MTokens ?? input.modelPricing.inputCostPer1MTokens) / 1_000_000;
}

export class PricingCatalogService {
  listPlans(): PlanDefinition[] {
    return Object.values(PLAN_CATALOG);
  }

  getPlan(planKey: PlanKey): PlanDefinition {
    return PLAN_CATALOG[planKey];
  }

  listTopUps(): TopUpProductDefinition[] {
    return TOPUP_PRODUCTS;
  }

  creditUnitPriceForTopUp(key: string): number {
    const topUp = TOPUP_PRODUCTS.find((product) => product.key === key);
    if (!topUp) throw new PlatformError('topup_not_found', 'Top-up product not found.', 404);
    return topUp.priceUsd / topUp.credits;
  }
}

export class BillingCatalogService {
  constructor(private readonly pricing = new PricingCatalogService()) {}

  getPublicPlans(): PlanDefinition[] {
    return this.pricing.listPlans();
  }

  getPlanFeatures(planKey: PlanKey): PlanDefinition {
    return this.pricing.getPlan(planKey);
  }

  assertCanManageBilling(context: RequestContext): void {
    requireRole(context, ['owner', 'admin']);
  }
}

export class StripeService {
  constructor(private readonly secretKeyProvider: () => string | undefined = () => undefined) {}

  private assertConfigured(): void {
    if (!this.secretKeyProvider()) throw new PlatformError('stripe_key_missing', 'Stripe secret key is not configured on the backend.', 500);
  }

  async createSubscriptionCheckout(input: CheckoutSessionRequest): Promise<CheckoutSessionResult> {
    this.assertConfigured();
    if (!input.planKey) throw new PlatformError('plan_required', 'Plan key is required for subscription checkout.', 422);
    return { id: id('stripe_checkout'), url: input.successUrl, mode: 'subscription' };
  }

  async createTopUpCheckout(input: CheckoutSessionRequest): Promise<CheckoutSessionResult> {
    this.assertConfigured();
    if (!input.topUpKey) throw new PlatformError('topup_required', 'Top-up key is required for checkout.', 422);
    return { id: id('stripe_checkout'), url: input.successUrl, mode: 'payment' };
  }

  async createCustomerPortal(context: RequestContext, returnUrl: string): Promise<{ url: string }> {
    this.assertConfigured();
    requireRole(context, ['owner', 'admin']);
    return { url: returnUrl };
  }

  verifyWebhook(payload: string, signature: string, webhookSecret: string): StripeWebhookEvent {
    this.assertConfigured();
    if (!payload || !signature || !webhookSecret) throw new PlatformError('invalid_stripe_webhook', 'Stripe webhook signature is invalid.', 400);
    return { id: id('stripe_event'), type: 'unknown', payload: {} };
  }
}

export class TopUpService {
  constructor(private readonly pricing = new PricingCatalogService()) {}

  listProducts(): TopUpProductDefinition[] {
    return this.pricing.listTopUps();
  }

  grantCredits(context: RequestContext, topUpKey: string): { credits: number; expiresAt: string; unitPriceUsd: number } {
    requireRole(context, ['owner', 'admin']);
    const product = this.pricing.listTopUps().find((candidate) => candidate.key === topUpKey);
    if (!product) throw new PlatformError('topup_not_found', 'Top-up product not found.', 404);
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + product.expiresAfterMonths);
    return { credits: product.credits, expiresAt: expiresAt.toISOString(), unitPriceUsd: product.priceUsd / product.credits };
  }
}

export class SubscriptionSyncService {
  syncFromStripeEvent(event: StripeWebhookEvent): { processed: true; eventType: string } {
    return { processed: true, eventType: event.type };
  }

  nextMonthlyGrant(subscription: SubscriptionSnapshot, plan: PlanDefinition): { organizationId: UUID; credits: number; planKey: PlanKey } {
    if (subscription.status !== 'active' && subscription.status !== 'trialing') throw new PlatformError('subscription_not_active', 'Subscription is not active.', 402);
    return { organizationId: subscription.organizationId, credits: plan.monthlyCredits, planKey: plan.key };
  }
}

export class MemberLimitService {
  assertMemberCanSpend(context: RequestContext, policy: MemberCreditPolicy | undefined, requestedCredits: number): void {
    if (context.role === 'viewer') throw new PlatformError('viewer_cannot_spend', 'Viewers cannot consume credits.', 403);
    if (policy?.perActionCreditLimit !== undefined && requestedCredits > policy.perActionCreditLimit) {
      throw new PlatformError('member_action_limit_exceeded', 'This action exceeds the member credit limit.', 402, { requestedCredits, perActionCreditLimit: policy.perActionCreditLimit });
    }
  }

  assertPremiumAllowed(policy: MemberCreditPolicy | undefined, model: AiModelDefinition): void {
    if ((model.tier === 'premium' || model.tier === 'max_quality') && policy && !policy.premiumModelsAllowed) {
      throw new PlatformError('member_premium_blocked', 'Premium models are blocked by member policy.', 403);
    }
  }
}

export class CostEstimatorService {
  readonly minimumMarginMultiplier = 2.5;

  estimate(input: CostEstimateInput): CostEstimate {
    const components = input.components ?? {};
    const openRouterCostUsd = components.openRouterCostUsd ?? estimatedOpenRouterCost(input);
    const estimatedCostUsd = openRouterCostUsd
      + (components.infraCostUsd ?? 0)
      + (components.storageCostUsd ?? 0)
      + (components.buildCostUsd ?? 0)
      + (components.domainOperationCostUsd ?? 0);
    const sellValuePerCreditUsd = input.sellValuePerCreditUsd ?? 0.20;
    const requiredCredits = ceilToTenth(estimatedCostUsd * this.minimumMarginMultiplier / sellValuePerCreditUsd);
    const finalCredits = Math.max(
      input.minimumActionCredits ?? ACTION_MINIMUM_CREDITS[input.action],
      requiredCredits + (input.complexitySurchargeCredits ?? ACTION_COMPLEXITY_SURCHARGE[input.action]),
    );
    const maxCredits = Math.min(input.plan.maxCreditsPerAction, input.userMaxCreditsPerAction ?? Number.POSITIVE_INFINITY);
    const reasons: string[] = [];
    if (finalCredits > maxCredits) reasons.push('estimated_credits_exceed_action_limit');
    if (input.premiumConfirmationRequired) reasons.push('premium_model_requires_confirmation');
    if (estimatedCostUsd > 0 && finalCredits * sellValuePerCreditUsd / estimatedCostUsd < this.minimumMarginMultiplier) reasons.push('margin_protection_adjusted_credits');
    return {
      action: input.action,
      estimatedCostUsd,
      requiredCredits,
      finalCredits: ceilToTenth(finalCredits),
      sellValuePerCreditUsd,
      estimatedMarginMultiplier: estimatedCostUsd > 0 ? finalCredits * sellValuePerCreditUsd / estimatedCostUsd : Number.POSITIVE_INFINITY,
      confirmationRequired: reasons.length > 0,
      reasons,
    };
  }
}

export class ModelCatalogService {
  listModels(): AiModelDefinition[] {
    return AI_MODEL_CATALOG;
  }

  getModel(modelKey: string): AiModelDefinition {
    const model = AI_MODEL_CATALOG.find((candidate) => candidate.key === modelKey);
    if (!model) throw new PlatformError('model_not_found', 'AI model not found.', 404);
    return model;
  }

  getPricing(modelKey: string): AiModelPricing {
    const pricing = AI_MODEL_PRICING[modelKey];
    if (!pricing) throw new PlatformError('model_pricing_not_found', 'AI model pricing not found.', 404);
    return pricing;
  }

  allowedModelsForPlan(plan: PlanDefinition): AiModelDefinition[] {
    return AI_MODEL_CATALOG.filter((model) => plan.allowedModelTiers.includes(model.tier));
  }
}

export class ModelRouterService {
  constructor(private readonly catalog = new ModelCatalogService(), private readonly estimator = new CostEstimatorService()) {}

  route(input: RoutingInput): RoutingDecision {
    const mode = input.preferences?.mode ?? 'auto';
    const candidates = this.candidatesFor(input, mode);
    const selectedModel = this.selectModel(input, candidates, mode);
    const pricing = this.catalog.getPricing(selectedModel.key);
    const estimate = this.estimator.estimate({
      action: input.taskType,
      plan: input.plan,
      sellValuePerCreditUsd: input.wallet.sellValuePerCreditUsd,
      inputTokens: input.estimatedInputTokens,
      outputTokens: input.estimatedOutputTokens,
      modelPricing: pricing,
      userMaxCreditsPerAction: input.preferences?.maxCreditsPerAction,
      premiumConfirmationRequired: selectedModel.requiresConfirmation && (input.preferences?.confirmBeforePremium ?? true),
    });
    const availableCredits = totalBalance(input.wallet);
    const blocked = estimate.finalCredits > availableCredits;
    const upgradeRequired = !input.plan.allowedModelTiers.includes(selectedModel.tier);
    const rejectedModels = AI_MODEL_CATALOG.filter((model) => !candidates.includes(model)).map((model) => ({ modelKey: model.key, reason: this.rejectionReason(input, model) }));
    return {
      id: id('route'),
      mode,
      selectedModel,
      estimate,
      confirmationRequired: estimate.confirmationRequired || selectedModel.requiresConfirmation || mode === 'max_quality',
      blocked,
      upgradeRequired,
      alternatives: candidates.filter((model) => model.key !== selectedModel.key).slice(0, 3),
      rationale: this.rationale(input, selectedModel, mode),
      rejectedModels,
    };
  }

  private candidatesFor(input: RoutingInput, mode: ModelRoutingMode): AiModelDefinition[] {
    if (mode === 'custom' && input.requestedModelKey) return [this.catalog.getModel(input.requestedModelKey)];
    return this.catalog.allowedModelsForPlan(input.plan).filter((model) => {
      if (input.requireVision && !model.supportsVision) return false;
      if (input.requireToolCalling && !model.supportsToolCalling) return false;
      if (mode === 'fast') return model.speed === 'fast';
      if (mode === 'pro') return model.tier === 'pro' || model.tier === 'premium';
      if (mode === 'max_quality') return model.tier === 'max_quality' || model.tier === 'premium';
      return true;
    });
  }

  private selectModel(input: RoutingInput, candidates: AiModelDefinition[], mode: ModelRoutingMode): AiModelDefinition {
    if (candidates.length === 0) throw new PlatformError('no_model_available', 'No AI model is available for this plan and task.', 422);
    if (mode === 'custom' && input.requestedModelKey) return candidates[0];
    if (mode === 'fast') return candidates.find((model) => model.tier === 'economy') ?? candidates[0];
    if (mode === 'max_quality') return candidates[candidates.length - 1];
    if (input.taskType === 'full_mvp' || input.taskType === 'debug_complex' || input.complexityScore >= 8) return candidates.find((model) => model.tier === 'premium') ?? candidates.find((model) => model.tier === 'pro') ?? candidates[candidates.length - 1];
    if (input.taskType === 'new_feature' || input.taskType === 'component_change' || input.complexityScore >= 5) return candidates.find((model) => model.tier === 'pro') ?? candidates.find((model) => model.tier === 'standard') ?? candidates[0];
    return candidates.find((model) => model.tier === 'standard') ?? candidates.find((model) => model.tier === 'economy') ?? candidates[0];
  }

  private rejectionReason(input: RoutingInput, model: AiModelDefinition): string {
    if (!input.plan.allowedModelTiers.includes(model.tier)) return 'tier_not_allowed_by_plan';
    if (input.requireVision && !model.supportsVision) return 'vision_required';
    if (input.requireToolCalling && !model.supportsToolCalling) return 'tool_calling_required';
    return 'not_selected';
  }

  private rationale(input: RoutingInput, model: AiModelDefinition, mode: ModelRoutingMode): string {
    if (mode === 'auto') return `Auto selected ${model.displayName} for ${input.taskType} with complexity ${input.complexityScore}.`;
    if (mode === 'custom') return `Custom model ${model.displayName} was selected and validated against plan, credits and margin.`;
    return `${mode} mode selected ${model.displayName}.`;
  }
}

export class CreditWalletService {
  availableCredits(wallet: WalletSnapshot): number {
    return totalBalance(wallet);
  }

  assertSufficientBalance(wallet: WalletSnapshot, credits: number): void {
    if (this.availableCredits(wallet) < credits) {
      throw new PlatformError('insufficient_credits', 'Credit balance is insufficient for this action.', 402, { requiredCredits: credits, availableCredits: this.availableCredits(wallet) });
    }
  }
}

export class CreditReservationService {
  constructor(private readonly walletService = new CreditWalletService()) {}

  reserve(context: RequestContext, wallet: WalletSnapshot, estimate: CostEstimate, reason: string): CreditReservation {
    requireRole(context, ['owner', 'admin', 'editor']);
    this.walletService.assertSufficientBalance(wallet, estimate.finalCredits);
    return {
      id: id('reservation'),
      organizationId: context.organizationId,
      userId: context.userId,
      projectId: context.projectId,
      amount: estimate.finalCredits,
      status: 'reserved',
      reason,
      estimatedCostUsd: estimate.estimatedCostUsd,
      createdAt: now(),
    };
  }

  finalize(reservation: CreditReservation, actualCostUsd: number, sellValuePerCreditUsd: number): CreditReservation & { refundCredits: number; actualMarginMultiplier: number } {
    const requiredCredits = ceilToTenth(actualCostUsd * 2.5 / sellValuePerCreditUsd);
    const chargedCredits = Math.min(reservation.amount, Math.max(requiredCredits, 0));
    return {
      ...reservation,
      amount: chargedCredits,
      status: 'finalized',
      refundCredits: ceilToTenth(Math.max(0, reservation.amount - chargedCredits)),
      actualMarginMultiplier: actualCostUsd > 0 ? chargedCredits * sellValuePerCreditUsd / actualCostUsd : Number.POSITIVE_INFINITY,
    };
  }

  refundPlatformError(reservation: CreditReservation): CreditReservation {
    return { ...reservation, status: 'refunded', amount: 0 };
  }
}

export class DomainEntitlementService {
  readonly reservedSubdomains = new Set(['admin', 'api', 'www', 'app', 'billing', 'support', 'help', 'docs', 'status', 'cdn', 'assets', 'mail', 'email', 'auth', 'login', 'signup']);

  assertCanAddCustomDomain(context: RequestContext, plan: PlanDefinition, currentCustomDomainCount: number, addonDomainCount = 0): void {
    requireRole(context, ['owner', 'admin', 'editor']);
    if (plan.customDomainsLimit + addonDomainCount <= currentCustomDomainCount) {
      throw new PlatformError('custom_domain_limit_reached', 'Custom domain limit reached for this plan.', 402, { plan: plan.key, limit: plan.customDomainsLimit, addonDomainCount });
    }
  }

  validateCustomDomain(domain: string): string {
    const normalized = domain.trim().toLowerCase();
    if (!/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(normalized)) {
      throw new PlatformError('invalid_domain', 'The custom domain is invalid.', 422);
    }
    return normalized;
  }

  validateSaasSubdomain(slug: string): string {
    const normalized = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, '');
    if (!normalized || this.reservedSubdomains.has(normalized)) {
      throw new PlatformError('reserved_subdomain', 'This SaaS subdomain is reserved.', 422);
    }
    return normalized;
  }
}

export class VercelDomainService {
  createDnsInstructions(domain: string, verificationToken: string): Array<{ type: string; name: string; value: string }> {
    const apex = domain.split('.').length === 2;
    return apex
      ? [
        { type: 'A', name: '@', value: '76.76.21.21' },
        { type: 'TXT', name: `_huggy-verify.${domain}`, value: verificationToken },
      ]
      : [
        { type: 'CNAME', name: domain.split('.')[0], value: 'cname.vercel-dns.com' },
        { type: 'TXT', name: `_huggy-verify.${domain}`, value: verificationToken },
      ];
  }

  async addDomain(project: Project, domain: string): Promise<{ projectId: UUID; vercelProjectId?: string; domain: string; status: 'pending' }> {
    return { projectId: project.id, vercelProjectId: project.vercelProjectId, domain, status: 'pending' };
  }

  async verifyDomain(project: Project, domain: string): Promise<{ projectId: UUID; domain: string; verified: boolean }> {
    return { projectId: project.id, domain, verified: true };
  }
}

export class OpenRouterService {
  constructor(private readonly apiKeyProvider: () => string | undefined, private readonly catalog = new ModelCatalogService()) {}

  async complete(request: OpenRouterCompletionRequest): Promise<OpenRouterCompletionResult> {
    const apiKey = this.apiKeyProvider();
    if (!apiKey) throw new PlatformError('openrouter_api_key_missing', 'OpenRouter API key is not configured on the backend.', 500);
    const inputTokens = request.messages.reduce((total, message) => total + Math.ceil(message.content.length / 4), 0);
    const outputTokens = 256;
    const pricing = this.catalog.getPricing(request.model.key);
    const usage: OpenRouterUsage = {
      inputTokens,
      outputTokens,
      cachedInputTokens: 0,
      estimatedCostUsd: estimatedOpenRouterCost({ action: 'chat_simple', plan: PLAN_CATALOG.free, inputTokens, outputTokens, modelPricing: pricing }),
    };
    return {
      id: id('openrouter'),
      model: request.model.openRouterModel,
      content: '',
      usage,
      finishReason: 'stop',
    };
  }
}

export class BillingAlertService {
  shouldAlertMargin(actualMarginMultiplier: number): boolean {
    return actualMarginMultiplier < 2;
  }

  shouldAlertEstimateDrift(estimatedCostUsd: number, actualCostUsd: number): boolean {
    if (estimatedCostUsd <= 0) return actualCostUsd > 0;
    return Math.abs(actualCostUsd - estimatedCostUsd) / estimatedCostUsd > 0.2;
  }
}
