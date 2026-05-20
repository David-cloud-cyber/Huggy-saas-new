import Stripe from 'stripe';
import { UserPlan } from '../config/ai-models.ts';

export interface PlanConfig {
  id: string;
  name: string;
  amount: number;
  credits: number;
  maxProjects: number;
  customDomains: number;
}

export const SAAS_PLANS: Record<string, PlanConfig> = {
  free: { id: 'plan_free', name: 'Free', amount: 0, credits: 20, maxProjects: 1, customDomains: 0 },
  starter: { id: 'plan_starter', name: 'Starter', amount: 20, credits: 100, maxProjects: 3, customDomains: 1 },
  pro: { id: 'plan_pro', name: 'Pro', amount: 49, credits: 300, maxProjects: 10, customDomains: 5 },
  studio: { id: 'plan_studio', name: 'Studio', amount: 99, credits: 700, maxProjects: 30, customDomains: 15 },
  business: { id: 'plan_business', name: 'Business', amount: 199, credits: 1500, maxProjects: 999, customDomains: 50 },
};

export const TOPUP_PRODUCTS = [
  { id: 'topup_100', credits: 100, price: 20.00 },
  { id: 'topup_250', credits: 250, price: 47.00 },
  { id: 'topup_500', credits: 500, price: 90.00 },
  { id: 'topup_1000', credits: 1000, price: 170.00 },
  { id: 'topup_2500', credits: 2500, price: 400.00 }
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
                description: `Monthly billing for ${plan.name} - Includes ${plan.credits} AI credits and custom domains.`,
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
          const planId = sub.metadata?.plan_id || 'starter'; // fallback
          const plan = SAAS_PLANS[planId] || SAAS_PLANS.starter;
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
