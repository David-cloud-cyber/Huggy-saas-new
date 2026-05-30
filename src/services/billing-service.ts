import Stripe from 'stripe';

export interface PlanConfig {
  id: string;
  name: string;
  amount: number;
  credits: number;
  dailyCredits?: number;
  monthlyCreditCap?: number;
  maxProjects: number;
  customDomains: number;
  topupPricePer50?: number;
  rollover: 'none' | 'monthly' | 'annual_period';
  features: string[];
}

export const SAAS_PLANS: Record<string, PlanConfig> = {
  free: {
    id: 'plan_free',
    name: 'Free',
    amount: 0,
    credits: 30,
    dailyCredits: 5,
    monthlyCreditCap: 30,
    maxProjects: 1,
    customDomains: 0,
    rollover: 'none',
    features: ['5 daily promo credits', '30 monthly credit cap', 'Public previews', 'Huggy backend basics'],
  },
  pro: {
    id: 'plan_pro_100',
    name: 'Pro',
    amount: 25,
    credits: 100,
    dailyCredits: 5,
    monthlyCreditCap: 150,
    maxProjects: 10,
    customDomains: 3,
    topupPricePer50: 15,
    rollover: 'monthly',
    features: ['100 monthly credits', '5 daily promo credits', 'Private projects', 'Supabase backend, auth and database', 'Vercel publishing', 'Code export'],
  },
  pro_200: { id: 'plan_pro_200', name: 'Pro 200', amount: 50, credits: 200, dailyCredits: 5, monthlyCreditCap: 250, maxProjects: 15, customDomains: 4, topupPricePer50: 15, rollover: 'monthly', features: ['200 monthly credits', 'Private projects', 'Backend services', 'Deployments'] },
  pro_400: { id: 'plan_pro_400', name: 'Pro 400', amount: 100, credits: 400, dailyCredits: 5, monthlyCreditCap: 450, maxProjects: 25, customDomains: 6, topupPricePer50: 15, rollover: 'monthly', features: ['400 monthly credits', 'Private projects', 'Backend services', 'Deployments'] },
  pro_800: { id: 'plan_pro_800', name: 'Pro 800', amount: 200, credits: 800, dailyCredits: 5, monthlyCreditCap: 850, maxProjects: 40, customDomains: 10, topupPricePer50: 15, rollover: 'monthly', features: ['800 monthly credits', 'Private projects', 'Backend services', 'Deployments'] },
  pro_1200: { id: 'plan_pro_1200', name: 'Pro 1200', amount: 294, credits: 1200, dailyCredits: 5, monthlyCreditCap: 1250, maxProjects: 60, customDomains: 15, topupPricePer50: 15, rollover: 'monthly', features: ['1,200 monthly credits', 'Private projects', 'Backend services', 'Deployments'] },
  pro_2000: { id: 'plan_pro_2000', name: 'Pro 2000', amount: 480, credits: 2000, dailyCredits: 5, monthlyCreditCap: 2050, maxProjects: 100, customDomains: 25, topupPricePer50: 15, rollover: 'monthly', features: ['2,000 monthly credits', 'Private projects', 'Backend services', 'Deployments'] },
  pro_5000: { id: 'plan_pro_5000', name: 'Pro 5000', amount: 1125, credits: 5000, dailyCredits: 5, monthlyCreditCap: 5050, maxProjects: 200, customDomains: 50, topupPricePer50: 15, rollover: 'monthly', features: ['5,000 monthly credits', 'Private projects', 'Backend services', 'Deployments'] },
  pro_10000: { id: 'plan_pro_10000', name: 'Pro 10000', amount: 2250, credits: 10000, dailyCredits: 5, monthlyCreditCap: 10050, maxProjects: 500, customDomains: 100, topupPricePer50: 15, rollover: 'monthly', features: ['10,000 monthly credits', 'Private projects', 'Backend services', 'Deployments'] },
  business: {
    id: 'plan_business_100',
    name: 'Business',
    amount: 50,
    credits: 100,
    maxProjects: 50,
    customDomains: 10,
    topupPricePer50: 30,
    rollover: 'monthly',
    features: ['100 monthly credits', 'Team controls', 'Roles and permissions', 'Shared templates', 'Supabase backend, auth and database', 'Full-stack hosting', 'Priority support'],
  },
  business_200: { id: 'plan_business_200', name: 'Business 200', amount: 100, credits: 200, maxProjects: 75, customDomains: 15, topupPricePer50: 30, rollover: 'monthly', features: ['200 monthly credits', 'Team controls', 'Backend services', 'Priority support'] },
  business_400: { id: 'plan_business_400', name: 'Business 400', amount: 200, credits: 400, maxProjects: 100, customDomains: 25, topupPricePer50: 30, rollover: 'monthly', features: ['400 monthly credits', 'Team controls', 'Backend services', 'Priority support'] },
  business_800: { id: 'plan_business_800', name: 'Business 800', amount: 400, credits: 800, maxProjects: 200, customDomains: 50, topupPricePer50: 30, rollover: 'monthly', features: ['800 monthly credits', 'Team controls', 'Backend services', 'Priority support'] },
  business_1200: { id: 'plan_business_1200', name: 'Business 1200', amount: 588, credits: 1200, maxProjects: 300, customDomains: 75, topupPricePer50: 30, rollover: 'monthly', features: ['1,200 monthly credits', 'Team controls', 'Backend services', 'Priority support'] },
  business_2000: { id: 'plan_business_2000', name: 'Business 2000', amount: 960, credits: 2000, maxProjects: 500, customDomains: 100, topupPricePer50: 30, rollover: 'monthly', features: ['2,000 monthly credits', 'Team controls', 'Backend services', 'Priority support'] },
  business_5000: { id: 'plan_business_5000', name: 'Business 5000', amount: 2250, credits: 5000, maxProjects: 1000, customDomains: 250, topupPricePer50: 30, rollover: 'monthly', features: ['5,000 monthly credits', 'Team controls', 'Backend services', 'Priority support'] },
  business_10000: { id: 'plan_business_10000', name: 'Business 10000', amount: 4300, credits: 10000, maxProjects: 2000, customDomains: 500, topupPricePer50: 30, rollover: 'monthly', features: ['10,000 monthly credits', 'Team controls', 'Backend services', 'Priority support'] },
  enterprise: {
    id: 'plan_enterprise',
    name: 'Enterprise',
    amount: 0,
    credits: 0,
    maxProjects: 9999,
    customDomains: 9999,
    rollover: 'annual_period',
    features: ['Volume pricing', 'SSO', 'Advanced security', 'Custom model and usage policy', 'Dedicated support'],
  },
};

export const TOPUP_PRODUCTS = [
  { id: 'topup_pro_50', plan: 'pro', credits: 50, price: 15.00, expiresMonths: 12 },
  { id: 'topup_pro_100', plan: 'pro', credits: 100, price: 30.00, expiresMonths: 12 },
  { id: 'topup_pro_250', plan: 'pro', credits: 250, price: 75.00, expiresMonths: 12 },
  { id: 'topup_pro_500', plan: 'pro', credits: 500, price: 150.00, expiresMonths: 12 },
  { id: 'topup_pro_1000', plan: 'pro', credits: 1000, price: 300.00, expiresMonths: 12 },
  { id: 'topup_business_50', plan: 'business', credits: 50, price: 30.00, expiresMonths: 12 },
  { id: 'topup_business_100', plan: 'business', credits: 100, price: 60.00, expiresMonths: 12 },
  { id: 'topup_business_250', plan: 'business', credits: 250, price: 150.00, expiresMonths: 12 },
  { id: 'topup_business_500', plan: 'business', credits: 500, price: 300.00, expiresMonths: 12 },
  { id: 'topup_business_1000', plan: 'business', credits: 1000, price: 600.00, expiresMonths: 12 },
];

export class StripeService {
  private stripe: Stripe | null = null;
  private supabase: any;

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, { apiVersion: '2025-02-18' as any });
    } else {
      console.warn('STRIPE_SECRET_KEY is missing. Stripe integrations will execute in simulation mode.');
    }
  }

  private getStripeClient(): Stripe {
    if (!this.stripe) {
      throw new Error('Stripe client is missing keys and must be initialized in .env with STRIPE_SECRET_KEY.');
    }
    return this.stripe;
  }

  async createSubscriptionCheckout(organizationId: string, email: string, planKey: string, successUrl: string, cancelUrl: string): Promise<string> {
    const plan = SAAS_PLANS[planKey.toLowerCase()];
    if (!plan) throw new Error(`Unknown plan key specified: ${planKey}`);

    if (this.stripe) {
      const client = this.getStripeClient();
      
      // Get or create customer
      let customerId = '';
      const { data: custRecord } = await this.supabase
        .from('stripe_customers')
        .select('stripe_customer_id')
        .eq('id', organizationId)
        .maybeSingle();

      if (custRecord) {
        customerId = custRecord.stripe_customer_id;
      } else {
        const customer = await client.customers.create({
          email,
          metadata: { organization_id: organizationId }
        });
        customerId = customer.id;
        await this.supabase
          .from('stripe_customers')
          .insert([{ id: organizationId, stripe_customer_id: customerId, email }]);
      }

      const session = await client.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Huggy SaaS - ${plan.name} Plan`,
                description: `Monthly billing for ${plan.name}. Includes ${plan.credits || 'custom volume'} AI credits plus Huggy backend, auth, database, preview, hosting and deploy workflows.`,
              },
              unit_amount: Math.round(plan.amount * 100),
              recurring: { interval: 'month' }
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { organization_id: organizationId, plan_key: planKey }
      });

      return session.url || successUrl;
    } else {
      // Return dev simulated portal redirection url
      console.log(`[STRIPE SIMULATION] Subscription checkout created for ${planKey}`);
      return `/settings?plan=${planKey}&simulated_success=true`;
    }
  }

  async createTopupCheckout(organizationId: string, email: string, productId: string, successUrl: string, cancelUrl: string): Promise<string> {
    const item = TOPUP_PRODUCTS.find(p => p.id === productId);
    if (!item) throw new Error(`Invalid top-up product: ${productId}`);

    if (this.stripe) {
      const client = this.getStripeClient();
      const session = await client.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Credits Topup - ${item.credits} Credits`,
                description: `12-month non-negative margin protected credits.`,
              },
              unit_amount: Math.round(item.price * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { organization_id: organizationId, topup_credits: String(item.credits), topup_product_id: productId }
      });

      return session.url || successUrl;
    } else {
      return `/settings?topup=${productId}&simulated_success=true`;
    }
  }

  /**
   * Safe handle of webhook events including subscription updates and one-time pay topups.
   */
  async handleWebhook(rawBody: string, signature: string, webhookSecret: string): Promise<{ processed: boolean; reason?: string }> {
    if (!this.stripe) {
      return { processed: false, reason: 'Stripe is running in simulated context. Raw webhooks are bypassed.' };
    }

    const client = this.getStripeClient();
    let event: Stripe.Event;

    try {
      event = client.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      throw new Error(`Stripe signature validation failed: ${err.message}`);
    }

    // 1. Idempotency safeguard checking supabase ledger
    const { data: alreadyProcessed } = await this.supabase
      .from('stripe_events')
      .select('processed')
      .eq('event_id', event.id)
      .maybeSingle();

    if (alreadyProcessed?.processed) {
      return { processed: true, reason: 'Webhook already evaluated. Safe exit.' };
    }

    // Insert as initial stage
    await this.supabase
      .from('stripe_events')
      .upsert([{ event_id: event.id, event_type: event.type, processed: false }]);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.organization_id;
        
        if (!orgId) break;

        // One-time Topups
        if (session.mode === 'payment') {
          const creditsStr = session.metadata?.topup_credits;
          const creditsVal = creditsStr ? parseInt(creditsStr, 10) : 0;
          if (creditsVal > 0) {
            // Allocate balance safely
            const { data: wallet } = await this.supabase
              .from('credit_wallets')
              .select('balance')
              .eq('organization_id', orgId)
              .maybeSingle();

            const current = wallet ? parseFloat(wallet.balance) : 0;
            const updated = current + creditsVal;

            await this.supabase
              .from('credit_wallets')
              .upsert([{ organization_id: orgId, balance: updated, updated_at: new Date().toISOString() }]);

            await this.supabase
              .from('credit_ledger')
              .insert([{
                wallet_id: orgId,
                type: 'topup',
                amount: creditsVal,
                balance_after: updated,
                description: `Credit top-up purchased - ID: ${session.metadata?.topup_product_id}`,
                reference_id: session.id
              }]);
          }
        }

        // Subscription Initial Setup
        if (session.mode === 'subscription' && session.subscription) {
          const planKey = session.metadata?.plan_key || 'free';
          const plan = SAAS_PLANS[planKey.toLowerCase()];
          const subObj = await client.subscriptions.retrieve(session.subscription as string);

          await this.syncSubscription(orgId, subObj, plan.id, plan.credits);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        // Lookup organization mapping
        const { data: customer } = await this.supabase
          .from('stripe_customers')
          .select('id')
          .eq('stripe_customer_id', sub.customer as string)
          .maybeSingle();

        if (customer) {
          const planId = sub.metadata?.plan_id || 'pro';
          const plan = SAAS_PLANS[planId] || SAAS_PLANS.pro;
          await this.syncSubscription(customer.id, sub, plan.id, plan.credits);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const { data: customer } = await this.supabase
          .from('stripe_customers')
          .select('id')
          .eq('stripe_customer_id', sub.customer as string)
          .maybeSingle();

        if (customer) {
          // Demote to free plan limits
          await this.demoteToFreePlan(customer.id);
        }
        break;
      }
    }

    // Mark as processed
    await this.supabase
      .from('stripe_events')
      .update({ processed: true })
      .eq('event_id', event.id);

    return { processed: true };
  }

  private async syncSubscription(organizationId: string, stripeSubscription: any, planId: string, creditsToGrant: number) {
    if (!this.supabase) return;

    // Save/update subscription record
    await this.supabase
      .from('subscriptions')
      .upsert({
        organization_id: organizationId,
        stripe_subscription_id: stripeSubscription.id,
        plan_id: planId,
        status: stripeSubscription.status,
        current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        updated_at: new Date().toISOString()
      }, { onConflict: 'stripe_subscription_id' });

    // Grant recurring subscription credits
    const { data: wallet } = await this.supabase
      .from('credit_wallets')
      .select('balance')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const current = wallet ? parseFloat(wallet.balance) : 0;
    const updated = current + creditsToGrant;

    await this.supabase
      .from('credit_wallets')
      .upsert([{ organization_id: organizationId, balance: updated, updated_at: new Date().toISOString() }]);

    await this.supabase
      .from('credit_ledger')
      .insert([{
        wallet_id: organizationId,
        type: 'subscription_grant',
        amount: creditsToGrant,
        balance_after: updated,
        description: `Plan subscription monthly credits granted automatically.`,
        reference_id: stripeSubscription.id
      }]);
  }

  private async demoteToFreePlan(organizationId: string) {
    if (!this.supabase) return;

    const freePlan = SAAS_PLANS.free;

    // Reset subscription records
    await this.supabase
      .from('subscriptions')
      .update({
        plan_id: freePlan.id,
        status: 'canceled',
        stripe_subscription_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', organizationId);

    // Limit or reset credits
    const { data: wallet } = await this.supabase
      .from('credit_wallets')
      .select('balance')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const current = wallet ? parseFloat(wallet.balance) : 0;
    
    // Safety caps: allow residual topups, but cap standard balance to Free grants
    const targetBalance = Math.min(current, parseFloat(String(freePlan.credits)));

    await this.supabase
      .from('credit_wallets')
      .update({ balance: targetBalance })
      .eq('organization_id', organizationId);
  }
}
