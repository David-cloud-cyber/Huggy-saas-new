import { trackFunnelEvent } from './conversion-events';
import { initThemeController } from './theme-controller';

export type PublicPlanKey = 'free' | 'pro' | 'scale';
export type BillingInterval = 'monthly' | 'annual';

type PricingSelection = {
  plan: PublicPlanKey;
  billing: BillingInterval;
};

const FALLBACK_PRICING: Record<PublicPlanKey, { monthly: number; annual: number; annualTotal: number; annualSaving: number }> = {
  free: { monthly: 0, annual: 0, annualTotal: 0, annualSaving: 0 },
  pro: { monthly: 25, annual: 20, annualTotal: 240, annualSaving: 60 },
  scale: { monthly: 200, annual: 160, annualTotal: 1920, annualSaving: 480 },
};

function normalizePlan(value: string | null | undefined): PublicPlanKey {
  return value === 'pro' || value === 'scale' ? value : 'free';
}

function normalizeBilling(value: string | null | undefined): BillingInterval {
  return value === 'annual' || value === 'yearly' ? 'annual' : 'monthly';
}

export function readPricingSelection(search = window.location.search): PricingSelection {
  const params = new URLSearchParams(search);
  return {
    plan: normalizePlan(params.get('plan')),
    billing: normalizeBilling(params.get('billing')),
  };
}

export function buildAuthUrl(plan: PublicPlanKey, billing: BillingInterval = 'monthly') {
  return `/auth.html?plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billing)}`;
}

export function buildCheckoutUrl(plan: Exclude<PublicPlanKey, 'free'>, billing: BillingInterval = 'monthly') {
  return `/checkout.html?plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billing)}`;
}

function formatUsd(value: number) {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function updatePricingCopy(selection: PricingSelection) {
  (['pro', 'scale'] as const).forEach((plan) => {
    const pricing = FALLBACK_PRICING[plan];
    const price = document.getElementById(`price-${plan}`);
    const note = document.getElementById(`note-${plan}`);

    if (price) {
      price.innerHTML = selection.billing === 'annual'
        ? `${formatUsd(pricing.annual)} <span>/mois</span>`
        : `${formatUsd(pricing.monthly)} <span>/mois</span>`;
    }
    if (note) {
      note.textContent = selection.billing === 'annual'
        ? `Facturé ${formatUsd(pricing.annualTotal)} par an · Économisez ${formatUsd(pricing.annualSaving)}`
        : 'Facturation mensuelle · annulation à tout moment';
    }
  });

  const monthlyButton = document.querySelector<HTMLButtonElement>('[data-billing-toggle="monthly"]');
  const annualButton = document.querySelector<HTMLButtonElement>('[data-billing-toggle="annual"]');
  monthlyButton?.classList.toggle('active', selection.billing === 'monthly');
  annualButton?.classList.toggle('active', selection.billing === 'annual');
  monthlyButton?.setAttribute('aria-pressed', String(selection.billing === 'monthly'));
  annualButton?.setAttribute('aria-pressed', String(selection.billing === 'annual'));
}

function updateCtas(selection: PricingSelection) {
  document.querySelectorAll<HTMLElement>('[data-pricing-plan]').forEach((element) => {
    const plan = normalizePlan(element.dataset.pricingPlan);
    const href = buildAuthUrl(plan, selection.billing);

    if (element instanceof HTMLAnchorElement) element.href = href;
    element.dataset.pricingBilling = selection.billing;
    element.setAttribute('data-funnel-plan', plan);
  });

  const sticky = document.getElementById('pricing-sticky-cta') as HTMLAnchorElement | null;
  const stickyLabel = document.getElementById('pricing-sticky-label');
  if (sticky) {
    const stickyPlan = selection.plan === 'free' ? 'pro' : selection.plan;
    sticky.href = buildAuthUrl(stickyPlan, selection.billing);
    const priceKey = selection.billing === 'annual' ? 'annual' : 'monthly';
    stickyLabel && (stickyLabel.textContent = `${stickyPlan === 'pro' ? 'Pro' : 'Scale'} · ${formatUsd(FALLBACK_PRICING[stickyPlan][priceKey])}/mois`);
  }
}

export function initPublicPricingFlow() {
  initThemeController();
  const isPricingPage = /\/pricing\.html$/.test(window.location.pathname);
  const pricingLinks = document.querySelectorAll<HTMLElement>('[data-pricing-plan], [data-conversion-plan]');
  if (!isPricingPage && !pricingLinks.length) return;

  let selection = readPricingSelection();
  if (isPricingPage) {
    trackFunnelEvent('pricing_view', { plan: selection.plan, billing: selection.billing });

    document.querySelectorAll<HTMLButtonElement>('[data-billing-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        selection = { ...selection, billing: normalizeBilling(button.dataset.billingToggle) };
        updatePricingCopy(selection);
        updateCtas(selection);
        trackFunnelEvent('billing_interval_changed', selection);
      });
    });

    document.querySelectorAll<HTMLElement>('[data-pricing-plan]').forEach((element) => {
      element.addEventListener('click', () => {
        const plan = normalizePlan(element.dataset.pricingPlan);
        trackFunnelEvent('pricing_plan_click', {
          plan,
          billing: selection.billing,
          text: element.textContent?.trim().replace(/\s+/g, ' '),
        });
      });
    });
  }

  document.querySelectorAll<HTMLElement>('[data-conversion-plan]').forEach((element) => {
    const plan = normalizePlan(element.dataset.conversionPlan);
    if (element instanceof HTMLAnchorElement) element.href = buildAuthUrl(plan, selection.billing);
  });

  updatePricingCopy(selection);
  updateCtas(selection);
}
