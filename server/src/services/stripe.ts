import Stripe from 'stripe';
import { allowLocalMocks, env } from '../lib/env';
import { PlanId, TOP_UPS } from '../config/plans';
import { UserContext } from './store';

export class StripeService {
  private stripe: Stripe | null;

  constructor() {
    this.stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;
  }

  async createSubscriptionCheckout(user: UserContext, planId: PlanId) {
    const price = stripePriceForPlan(planId);
    if (!this.stripe || !price) {
      if (!allowLocalMocks()) {
        throw Object.assign(new Error('Stripe checkout is not configured. Add STRIPE_SECRET_KEY and plan price ids.'), {
          statusCode: 503
        });
      }
      return {
        mode: 'mock',
        checkout_url: `${env.appUrl}/pricing.html?checkout=mock-subscription&plan=${planId}`,
        plan_id: planId
      };
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      line_items: [{ price, quantity: 1 }],
      success_url: `${env.appUrl}/dashboard.html?billing=success`,
      cancel_url: `${env.appUrl}/pricing.html?billing=cancelled`,
      metadata: {
        user_id: user.id,
        plan_id: planId
      }
    }, {
      idempotencyKey: `subscription:${user.id}:${planId}`
    });

    return { checkout_url: session.url, plan_id: planId };
  }

  async createTopUpCheckout(user: UserContext, credits: number) {
    const topUp = TOP_UPS.find((item) => item.credits === credits);
    if (!topUp) throw Object.assign(new Error('Unknown top-up product.'), { statusCode: 400 });

    if (!this.stripe) {
      if (!allowLocalMocks()) {
        throw Object.assign(new Error('Stripe top-up checkout is not configured. Add STRIPE_SECRET_KEY.'), {
          statusCode: 503
        });
      }
      return {
        mode: 'mock',
        checkout_url: `${env.appUrl}/pricing.html?checkout=mock-topup&credits=${credits}`,
        credits
      };
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${credits} Huggy credits` },
          unit_amount: Math.round(topUp.priceUsd * 100)
        },
        quantity: 1
      }],
      success_url: `${env.appUrl}/dashboard.html?topup=success`,
      cancel_url: `${env.appUrl}/pricing.html?topup=cancelled`,
      metadata: {
        user_id: user.id,
        credits: String(credits),
        expires_after_months: '12'
      }
    }, {
      idempotencyKey: `topup:${user.id}:${credits}:${Date.now()}`
    });

    return { checkout_url: session.url, credits };
  }

  async createPortal(user: UserContext) {
    if (!this.stripe) {
      if (!allowLocalMocks()) {
        throw Object.assign(new Error('Stripe customer portal is not configured. Add STRIPE_SECRET_KEY.'), {
          statusCode: 503
        });
      }
      return { portal_url: `${env.appUrl}/pricing.html?portal=mock` };
    }

    throw Object.assign(new Error('Customer portal requires a stored Stripe customer id.'), { statusCode: 409 });
  }
}

function stripePriceForPlan(planId: PlanId) {
  return {
    free: env.stripePriceFree,
    starter: env.stripePriceStarter,
    pro: env.stripePricePro,
    studio: env.stripePriceStudio,
    business: env.stripePriceBusiness,
    enterprise: env.stripePriceEnterprise
  }[planId];
}
