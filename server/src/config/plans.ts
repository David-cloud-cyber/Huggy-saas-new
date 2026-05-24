export type PlanId = 'free' | 'starter' | 'pro' | 'studio' | 'business' | 'enterprise';
export type ModelTier = 'economy' | 'standard' | 'pro' | 'premium' | 'max_quality';

export type PlanDefinition = {
  id: PlanId;
  name: string;
  monthlyPriceUsd: number | null;
  monthlyCredits: number;
  activeProjectsLimit: number | null;
  publicProjectsOnly: boolean;
  customDomainsLimit: number;
  includedSaasSubdomains: number | null;
  allowedModelTiers: ModelTier[];
  versionHistoryDays: number | null;
  badgeVisibleByDefault: boolean;
  badgeCanDisable: boolean;
  features: string[];
};

export const CREDIT_MARGIN_MULTIPLIER = 2.5;
export const MINIMUM_CREDIT_VALUE_USD = 0.16;
export const DEFAULT_SELL_VALUE_PER_CREDIT_USD = 0.2;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    monthlyPriceUsd: 0,
    monthlyCredits: 20,
    activeProjectsLimit: 1,
    publicProjectsOnly: true,
    customDomainsLimit: 0,
    includedSaasSubdomains: 1,
    allowedModelTiers: ['economy'],
    versionHistoryDays: 3,
    badgeVisibleByDefault: true,
    badgeCanDisable: false,
    features: ['1 active public project', '20 credits/month', 'Economy models', 'Community support']
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPriceUsd: 20,
    monthlyCredits: 100,
    activeProjectsLimit: 3,
    publicProjectsOnly: false,
    customDomainsLimit: 1,
    includedSaasSubdomains: null,
    allowedModelTiers: ['economy', 'standard'],
    versionHistoryDays: 7,
    badgeVisibleByDefault: false,
    badgeCanDisable: true,
    features: ['100 credits/month', '3 private projects', '1 custom domain', 'Auto mode and manual model selector']
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    monthlyPriceUsd: 49,
    monthlyCredits: 300,
    activeProjectsLimit: 10,
    publicProjectsOnly: false,
    customDomainsLimit: 5,
    includedSaasSubdomains: null,
    allowedModelTiers: ['economy', 'standard', 'pro'],
    versionHistoryDays: 30,
    badgeVisibleByDefault: false,
    badgeCanDisable: true,
    features: ['300 credits/month', '10 active projects', '5 custom domains', 'GitHub sync', 'Priority builds']
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    monthlyPriceUsd: 99,
    monthlyCredits: 700,
    activeProjectsLimit: 30,
    publicProjectsOnly: false,
    customDomainsLimit: 15,
    includedSaasSubdomains: null,
    allowedModelTiers: ['economy', 'standard', 'pro', 'premium'],
    versionHistoryDays: 90,
    badgeVisibleByDefault: false,
    badgeCanDisable: true,
    features: ['700 credits/month', '30 active projects', '15 custom domains', 'Team collaboration', 'Advanced rollback']
  },
  business: {
    id: 'business',
    name: 'Business',
    monthlyPriceUsd: 199,
    monthlyCredits: 1500,
    activeProjectsLimit: null,
    publicProjectsOnly: false,
    customDomainsLimit: 50,
    includedSaasSubdomains: null,
    allowedModelTiers: ['economy', 'standard', 'pro', 'premium'],
    versionHistoryDays: 180,
    badgeVisibleByDefault: false,
    badgeCanDisable: true,
    features: ['1,500 credits/month', '50 custom domains', 'Advanced roles', 'Audit logs', 'Priority support']
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPriceUsd: null,
    monthlyCredits: 0,
    activeProjectsLimit: null,
    publicProjectsOnly: false,
    customDomainsLimit: 9999,
    includedSaasSubdomains: null,
    allowedModelTiers: ['economy', 'standard', 'pro', 'premium', 'max_quality'],
    versionHistoryDays: null,
    badgeVisibleByDefault: false,
    badgeCanDisable: true,
    features: ['Custom credits', 'SSO/SAML', 'SLA', 'Dedicated models', 'Dedicated support']
  }
};

export const TOP_UPS = [
  { credits: 100, priceUsd: 20 },
  { credits: 250, priceUsd: 47 },
  { credits: 500, priceUsd: 90 },
  { credits: 1000, priceUsd: 170 },
  { credits: 2500, priceUsd: 400 }
] as const;

export function planCreditValueUsd(planId: PlanId) {
  const plan = PLANS[planId];
  if (!plan.monthlyPriceUsd || !plan.monthlyCredits) return DEFAULT_SELL_VALUE_PER_CREDIT_USD;
  return Math.max(MINIMUM_CREDIT_VALUE_USD, plan.monthlyPriceUsd / plan.monthlyCredits);
}

export function planFromUserId(userId: string): PlanId {
  if (userId.includes('enterprise')) return 'enterprise';
  if (userId.includes('business')) return 'business';
  if (userId.includes('studio')) return 'studio';
  if (userId.includes('pro')) return 'pro';
  if (userId.includes('free')) return 'free';
  return 'starter';
}
