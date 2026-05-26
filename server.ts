import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// Import our custom services
import { OpenRouterService } from './src/services/openrouter-service.ts';
import { ModelRouter, type RoutingContext } from './src/services/model-router.ts';
import { ForbiddenModelError, validateAllowedModel } from './src/services/ai-validator.ts';
import { AI_ALLOWED_MODELS, AI_MODEL_TIERS, AI_MODEL_CAPABILITIES, UserPlan } from './src/config/ai-models.ts';
import { CostEstimatorService, CreditWalletService, CreditLedgerService, CreditReservationService } from './src/services/credit-system.ts';
import { DomainService, VercelDomainService } from './src/services/domain-service.ts';
import { StripeService, SAAS_PLANS, TOPUP_PRODUCTS } from './src/services/billing-service.ts';
import { AuditLogService, BillingAlertService, UsageMeteringService, MemberLimitService } from './src/services/platform-support.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;
const DEFAULT_SUPABASE_URL = 'https://notgpriaragtiahcqjoa.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rp4hpA--fkybGy0GczSMvA_KU9BitSa';

// Standard middlewares
app.use(express.json());

// ── LAZY-LOADED RESOURCES / CLIENT GAUARDS ───────────────────────────
let supabase: any = null;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      supabase = createClient(url, key);
    } else {
      console.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured. Falling back to local in-memory simulation state.');
    }
  }
  return supabase;
}

let supabaseAuth: any = null;
function getSupabaseAuthClient() {
  if (!supabaseAuth) {
    const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const key =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      DEFAULT_SUPABASE_PUBLISHABLE_KEY;

    supabaseAuth = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseAuth;
}

async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  const authClient = getSupabaseAuthClient();
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired session',
    });
  }

  req.user = data.user;
  return next();
}

app.get('/api/auth/me', requireAuth, (req: any, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

app.use('/api/billing/wallet', requireAuth);
app.use('/api/billing/ledger', requireAuth);
app.use('/api/billing/checkout', requireAuth);
app.use('/api/billing/portal', requireAuth);
app.use('/api/ai/estimate', requireAuth);
app.use('/api/ai/route', requireAuth);
app.use('/api/users/me', requireAuth);
app.use('/api/projects', requireAuth);

// ── LOCAL IN-MEMORY BACKUP DATA STORES (For instant developer previews with zero credentials) ──
const SIM_WALLETS = new Map<string, { balance: number; updated_at: string }>();
const SIM_LEDGERS: any[] = [];
const SIM_RESERVATIONS = new Map<string, any>();
const SIM_DOMAINS: any[] = [];
const SIM_DEPLOYMENTS: any[] = [];
const SIM_USER_PREFS = new Map<string, any>();
const SIM_PROJECT_PREFS = new Map<string, any>();
const SIM_AUDITS: any[] = [];

// Initialize a default simulated user/organization wallet with 100.0 credits for previewing
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000000';
SIM_WALLETS.set(DEFAULT_ORG_ID, { balance: 100.00, updated_at: new Date().toISOString() });

// Instantiate Core Services
const openRouter = new OpenRouterService({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-mock-key-for-preview',
  siteUrl: process.env.OPENROUTER_SITE_URL || 'https://huggy.app',
  appName: process.env.OPENROUTER_APP_NAME || 'Huggy SaaS'
});

const modelRouter = new ModelRouter();
const costEstimator = new CostEstimatorService();

// Wrapper to safely access DB status or simulated state
function getDbHelpers() {
  const client = getSupabase();
  return {
    getWallet: async (orgId: string) => {
      if (client) {
        const { data } = await client.from('credit_wallets').select('balance').eq('organization_id', orgId).maybeSingle();
        return data ? parseFloat(data.balance) : 0;
      }
      return SIM_WALLETS.get(orgId)?.balance ?? 100.00;
    },
    updateWallet: async (orgId: string, diff: number) => {
      if (client) {
        const { data: wallet } = await client.from('credit_wallets').select('balance').eq('organization_id', orgId).maybeSingle();
        const current = wallet ? parseFloat(wallet.balance) : 100.00;
        const next = current + diff;
        await client.from('credit_wallets').upsert([{ organization_id: orgId, balance: next, updated_at: new Date().toISOString() }]);
        return next;
      } else {
        const current = SIM_WALLETS.get(orgId)?.balance ?? 100.00;
        const next = current + diff;
        SIM_WALLETS.set(orgId, { balance: next, updated_at: new Date().toISOString() });
        return next;
      }
    },
    addLedger: async (orgId: string, type: string, amount: number, balance_after: number, desc: string, refId: string) => {
      const log = { wallet_id: orgId, type, amount, balance_after, description: desc, reference_id: refId, created_at: new Date().toISOString() };
      if (client) {
        await client.from('credit_ledger').insert([log]);
      } else {
        SIM_LEDGERS.unshift(log);
      }
    },
    addAudit: async (data: any) => {
      if (client) {
        await client.from('audit_logs').insert([{ ...data, created_at: new Date().toISOString() }]);
      } else {
        SIM_AUDITS.unshift({ ...data, id: String(SIM_AUDITS.length + 1), created_at: new Date().toISOString() });
      }
    },
    createReservation: async (orgId: string, amount: number, refId: string) => {
      const expires_at = new Date(Date.now() + 15 * 60000).toISOString();
      const res = { id: `res_${Math.random().toString(36).substring(2, 11)}`, wallet_id: orgId, amount, status: 'reserved', reference_id: refId, expires_at };
      if (client) {
        await client.from('credit_reservations').insert([res]);
      } else {
        SIM_RESERVATIONS.set(refId, res);
      }
      return res;
    }
  };
}

// ──────────────────────────────────────────────────────────────────────
// 1. BILLING ENDPOINTS
// ──────────────────────────────────────────────────────────────────────

// GET /billing/plans
app.get('/api/billing/plans', (req, res) => {
  res.json({
    success: true,
    plans: SAAS_PLANS,
    topups: TOPUP_PRODUCTS
  });
});

// GET /billing/wallet
app.get('/api/billing/wallet', async (req, res) => {
  const orgId = (req.query.orgId as string) || DEFAULT_ORG_ID;
  const helpers = getDbHelpers();
  const balance = await helpers.getWallet(orgId);
  res.json({
    success: true,
    organization_id: orgId,
    balance: balance
  });
});

// GET /billing/ledger
app.get('/api/billing/ledger', async (req, res) => {
  const orgId = (req.query.orgId as string) || DEFAULT_ORG_ID;
  const client = getSupabase();
  if (client) {
    const { data, error } = await client.from('credit_ledger').select('*').eq('wallet_id', orgId).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, ledger: data });
  } else {
    const orgLedger = SIM_LEDGERS.filter(l => l.wallet_id === orgId);
    return res.json({ success: true, ledger: orgLedger });
  }
});

// POST /billing/checkout/subscription
app.post('/api/billing/checkout/subscription', async (req, res) => {
  const { planKey, email, successUrl, cancelUrl } = req.body;
  const orgId = req.body.orgId || DEFAULT_ORG_ID;

  try {
    const billing = new StripeService(getSupabase());
    const redirectUrl = await billing.createSubscriptionCheckout(
      orgId,
      email || 'test@huggy.app',
      planKey || 'starter',
      successUrl || `${req.protocol}://${req.get('host')}/settings?success=true`,
      cancelUrl || `${req.protocol}://${req.get('host')}/settings?cancel=true`
    );
    res.json({ success: true, url: redirectUrl });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /billing/checkout/topup
app.post('/api/billing/checkout/topup', async (req, res) => {
  const { productId, email, successUrl, cancelUrl } = req.body;
  const orgId = req.body.orgId || DEFAULT_ORG_ID;

  try {
    const billing = new StripeService(getSupabase());
    const redirectUrl = await billing.createTopupCheckout(
      orgId,
      email || 'test@huggy.app',
      productId || 'topup_100',
      successUrl || `${req.protocol}://${req.get('host')}/settings?success=true`,
      cancelUrl || `${req.protocol}://${req.get('host')}/settings?cancel=true`
    );
    res.json({ success: true, url: redirectUrl });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /billing/portal
app.post('/api/billing/portal', async (req, res) => {
  const orgId = req.body.orgId || DEFAULT_ORG_ID;
  const client = getSupabase();
  
  if (client && process.env.STRIPE_SECRET_KEY) {
    try {
      const { data } = await client.from('stripe_customers').select('stripe_customer_id').eq('id', orgId).single();
      if (data?.stripe_customer_id) {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-18' as any });
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: data.stripe_customer_id,
          return_url: `${req.protocol}://${req.get('host')}/settings`
        });
        return res.json({ success: true, url: portalSession.url });
      }
    } catch (e: any) {
      console.warn('Billing portal setup failed, routing to simulated settings:', e.message);
    }
  }
  
  res.json({ success: true, url: '/settings?simulated_portal=true' });
});

// POST /stripe/webhook
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }) as any, async (req: any, res: any) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  try {
    const stripeService = new StripeService(getSupabase());
    const result = await stripeService.handleWebhook(req.body, sig, webhookSecret);
    res.json({ received: true, ...result });
  } catch (err: any) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// ──────────────────────────────────────────────────────────────────────
// 2. AI ENGINE ENDPOINTS
// ──────────────────────────────────────────────────────────────────────

// GET /ai/models
app.get('/api/ai/models', (req, res) => {
  const modelsInfo = AI_ALLOWED_MODELS.map(id => ({
    id,
    display_name: id === 'auto' ? 'Auto Mode' : id.split('/').pop() || id,
    tier: AI_MODEL_TIERS[id],
    capabilities: AI_MODEL_CAPABILITIES[id],
  }));

  res.json({
    success: true,
    models: modelsInfo
  });
});

// POST /ai/estimate
app.post('/api/ai/estimate', (req, res) => {
  const { openrouter_cost_usd, infra_cost_usd, storage_cost_usd, build_cost_usd, domain_operation_cost_usd, minimum_action_credits, complexity_surcharge } = req.body;
  
  const comp = {
    openrouter_cost_usd: openrouter_cost_usd || 0,
    infra_cost_usd: infra_cost_usd || 0,
    storage_cost_usd: storage_cost_usd || 0,
    build_cost_usd: build_cost_usd || 0,
    domain_operation_cost_usd: domain_operation_cost_usd || 0,
    minimum_action_credits: minimum_action_credits || 1,
    complexity_surcharge: complexity_surcharge || 0
  };

  const estimation = costEstimator.calculateRequiredCredits(comp);
  res.json({
    success: true,
    estimation
  });
});

// POST /ai/route
app.post('/api/ai/route', async (req, res) => {
  const { plan, mode, userCredits, taskComplexity, requiredCapabilities, customModelId } = req.body;

  try {
    const context: RoutingContext = {
      plan: plan || 'free',
      mode: mode || 'Auto',
      userCredits: userCredits || 10,
      taskComplexity: taskComplexity || 'medium',
      requiredCapabilities: requiredCapabilities || {}
    };

    const targetModel = await modelRouter.selectModel(context, customModelId);
    res.json({ success: true, routed_model: targetModel });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PATCH /users/me/ai-preferences
app.patch('/api/users/me/ai-preferences', (req, res) => {
  const { userId, default_routing_mode, max_credits_per_action, ask_confirm_before_premium, auto_revert_to_auto } = req.body;
  const uid = userId || '00000000-0000-0000-0000-000000000000';

  const updated = {
    default_routing_mode: default_routing_mode || 'Auto',
    max_credits_per_action: max_credits_per_action || 50.0,
    ask_confirm_before_premium: ask_confirm_before_premium !== false,
    auto_revert_to_auto: auto_revert_to_auto === true,
    updated_at: new Date().toISOString()
  };

  SIM_USER_PREFS.set(uid, updated);
  res.json({ success: true, preferences: updated });
});

// PATCH /projects/:id/ai-preferences
app.patch('/api/projects/:id/ai-preferences', (req, res) => {
  const { default_routing_mode, max_credits_per_action, ask_confirm_before_premium, auto_revert_to_auto } = req.body;
  const pid = req.params.id;

  const updated = {
    default_routing_mode: default_routing_mode || 'Auto',
    max_credits_per_action: max_credits_per_action || 50.0,
    ask_confirm_before_premium: ask_confirm_before_premium !== false,
    auto_revert_to_auto: auto_revert_to_auto === true,
    updated_at: new Date().toISOString()
  };

  SIM_PROJECT_PREFS.set(pid, updated);
  res.json({ success: true, preferences: updated });
});

// POST /projects/:id/messages (THE AI ENGINE AND CREDIT BALANCER)
app.post('/api/projects/:id/messages', async (req: any, res: any) => {
  const projectId = req.params.id;
  const { messages, mode, customModelId, userId, orgId = DEFAULT_ORG_ID, taskComplexity = 'medium' } = req.body;
  const clientHelpers = getDbHelpers();

  try {
    // 1. Check Wallet Balance
    const balance = await clientHelpers.getWallet(orgId);

    // Dynamic initial estimation component
    const actionCostComp = {
      openrouter_cost_usd: 0.00001, // default baseline
      infra_cost_usd: 0.0001,
      storage_cost_usd: 0.00002,
      build_cost_usd: 0.001,
      domain_operation_cost_usd: 0,
      minimum_action_credits: 1,
      complexity_surcharge: taskComplexity === 'complex' ? 1.5 : 0
    };

    const initialEstimate = costEstimator.calculateRequiredCredits(actionCostComp);
    if (balance < initialEstimate.finalCredits) {
      return res.status(402).json({
        success: false,
        error: 'InsufficientCreditsError',
        message: `Your balance (${balance} credits) is below the minimum required credits (${initialEstimate.finalCredits} credits) to run this task.`
      });
    }

    // 2. Select Model
    const routingCtx: RoutingContext = {
      plan: req.body.plan || 'free',
      mode: mode || 'Auto',
      userCredits: balance,
      taskComplexity: taskComplexity,
    };

    const targetModel = await modelRouter.selectModel(routingCtx, customModelId);

    // 3. Reserve Credits safely
    const refId = `req_${Math.random().toString(36).substring(2, 13)}`;
    await clientHelpers.createReservation(orgId, initialEstimate.finalCredits, refId);

    // 4. Call OpenRouter
    try {
      const completionResult = await openRouter.chat(targetModel, messages);

      // Re-estimate final cost from real OpenRouter token outputs
      const finalCostComp = {
        openrouter_cost_usd: completionResult.cost_usd,
        infra_cost_usd: 0.0001,
        storage_cost_usd: 0.00002,
        build_cost_usd: 0.001,
        domain_operation_cost_usd: 0,
        minimum_action_credits: 1,
        complexity_surcharge: taskComplexity === 'complex' ? 1.5 : 0
      };

      const finalEstimate = costEstimator.calculateRequiredCredits(finalCostComp);

      const reservationServ = new CreditReservationService(getSupabase());
      if (getSupabase()) {
        await reservationServ.releaseReservation(refId, true, finalEstimate.finalCredits);
      } else {
        // Simulated Reservation release
        const currentBalance = SIM_WALLETS.get(orgId)?.balance ?? 100;
        const refundAmount = Math.max(0, initialEstimate.finalCredits - finalEstimate.finalCredits);
        const finalBalance = currentBalance + refundAmount;
        SIM_WALLETS.set(orgId, { balance: finalBalance, updated_at: new Date().toISOString() });
        await clientHelpers.addLedger(orgId, 'usage', -finalEstimate.finalCredits, finalBalance, `AI usage on:${completionResult.model}`, refId);
      }

      res.json({
        success: true,
        model: completionResult.model,
        text: completionResult.text,
        credits_charged: finalEstimate.finalCredits,
        remaining_balance: await clientHelpers.getWallet(orgId),
        routing_mode: mode || 'Auto'
      });

    } catch (apiError: any) {
      // Platform / API service error => Refund fully!
      const reservationServ = new CreditReservationService(getSupabase());
      if (getSupabase()) {
        await reservationServ.releaseReservation(refId, false); // full refund
      } else {
        // simulated full refund
        const currentBalance = SIM_WALLETS.get(orgId)?.balance ?? 100;
        const finalBalance = currentBalance + initialEstimate.finalCredits;
        SIM_WALLETS.set(orgId, { balance: finalBalance, updated_at: new Date().toISOString() });
        await clientHelpers.addLedger(orgId, 'refund', initialEstimate.finalCredits, finalBalance, `Failed request refund: ${apiError.message}`, refId);
      }

      throw new Error(`Platform Engine Auto-Refund Triggered: ${apiError.message}`);
    }

  } catch (err: any) {
    if (err instanceof ForbiddenModelError) {
      await clientHelpers.addAudit({
        user_id: userId || 'anonymous',
        requested_model: customModelId || 'unknown',
        reason: 'Attempted use of non-whitelist model',
        source: 'chat'
      });
      return res.status(403).json({ success: false, error: 'ForbiddenModelError', message: err.message });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 3. CUSTOM DOMAINS ENDPOINTS
// ──────────────────────────────────────────────────────────────────────

// GET /projects/:id/domains
app.get('/api/projects/:id/domains', async (req, res) => {
  const projectId = req.params.id;
  const client = getSupabase();
  if (client) {
    const { data } = await client.from('domains').select('*').eq('project_id', projectId).neq('status', 'removed');
    res.json({ success: true, domains: data || [] });
  } else {
    const projDomains = SIM_DOMAINS.filter(d => d.project_id === projectId && d.status !== 'removed');
    res.json({ success: true, domains: projDomains });
  }
});

// POST /projects/:id/domains
app.post('/api/projects/:id/domains', async (req: any, res: any) => {
  const projectId = req.params.id;
  const { domain, type, orgId = DEFAULT_ORG_ID, plan = 'starter' } = req.body;

  try {
    const vercelProxy = new VercelDomainService(process.env.VERCEL_API_TOKEN || 'mock-vercel-token');
    const domainService = new DomainService(getSupabase(), vercelProxy);

    if (getSupabase()) {
      const records = await domainService.registerDomain(orgId, projectId, domain, type || 'custom', plan as any);
      return res.json({ success: true, domain: records });
    } else {
      // simulate domain additions
      const sanitized = domain.trim().toLowerCase();
      const isSub = type === 'subdomain';
      
      const parts = sanitized.split('.');
      if (isSub && PARTS_RESERVED(parts[0])) {
         return res.status(400).json({ success: false, message: `The subdomain '${parts[0]}' is reserved.` });
      }

      const verifiedStatus = isSub ? 'active' : 'pending';
      const record = {
        id: `dom_${Math.random().toString(36).substring(2, 9)}`,
        organization_id: orgId,
        project_id: projectId,
        domain: sanitized,
        type: type || 'custom',
        status: verifiedStatus,
        is_primary: false,
        verification_token: `vc-sim-verify-${Math.random().toString(36).substring(2, 10)}`,
        created_at: new Date().toISOString()
      };

      SIM_DOMAINS.push(record);
      res.json({ success: true, domain: record });
    }
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

function PARTS_RESERVED(sub: string): boolean {
  return ['admin', 'api', 'www', 'app', 'billing', 'support', 'assets', 'jobs'].includes(sub);
}

// POST /projects/:id/domains/:domainId/verify
app.post('/api/projects/:id/domains/:domainId/verify', async (req, res) => {
  const projectId = req.params.id;
  const domainId = req.params.domainId;

  try {
    const vercelProxy = new VercelDomainService(process.env.VERCEL_API_TOKEN || 'mock-vercel-token');
    const domainService = new DomainService(getSupabase(), vercelProxy);

    if (getSupabase()) {
      const result = await domainService.verifyDnsRecords(projectId, domainId);
      res.json({ success: true, ...result });
    } else {
      // simulation verification (flip pending to active)
      const domain = SIM_DOMAINS.find(d => d.id === domainId && d.project_id === projectId);
      if (domain) {
        domain.status = 'active';
        domain.verified_at = new Date().toISOString();
        res.json({ success: true, status: 'active', domain });
      } else {
        res.status(404).json({ success: false, message: 'Domain reference not found' });
      }
    }
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /projects/:id/domains/:domainId
app.delete('/api/projects/:id/domains/:domainId', async (req, res) => {
  const projectId = req.params.id;
  const domainId = req.params.domainId;

  try {
    const vercelProxy = new VercelDomainService(process.env.VERCEL_API_TOKEN || 'mock-vercel-token');
    const domainService = new DomainService(getSupabase(), vercelProxy);

    if (getSupabase()) {
      await domainService.removeDomain(projectId, domainId);
    } else {
      const domain = SIM_DOMAINS.find(d => d.id === domainId && d.project_id === projectId);
      if (domain) {
        domain.status = 'removed';
      }
    }
    res.json({ success: true, message: 'Domain deleted successfully.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /projects/:id/domains/:domainId/primary
app.patch('/api/projects/:id/domains/:domainId/primary', async (req, res) => {
  const projectId = req.params.id;
  const domainId = req.params.domainId;

  try {
    const vercelProxy = new VercelDomainService(process.env.VERCEL_API_TOKEN || 'mock-vercel-token');
    const domainService = new DomainService(getSupabase(), vercelProxy);

    if (getSupabase()) {
      await domainService.setPrimaryDomain(projectId, domainId);
    } else {
      SIM_DOMAINS.forEach(d => {
        if (d.project_id === projectId) {
          d.is_primary = (d.id === domainId);
        }
      });
    }
    res.json({ success: true, message: 'Primary domain updated.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 4. DEPLOYMENTS ENDPOINTS
// ──────────────────────────────────────────────────────────────────────

// POST /projects/:id/deploy
app.post('/api/projects/:id/deploy', (req: any, res: any) => {
  const projectId = req.params.id;
  const { commitHash, branch = 'main', userCredits = 100 } = req.body;

  if (userCredits < 2) {
    return res.status(402).json({ success: false, error: 'Insufficient credits (2 required for production deployment)' });
  }

  const deploy = {
    id: `dep_${Math.random().toString(36).substring(2, 9)}`,
    project_id: projectId,
    deployment_url: `https://proj-${projectId}-${Math.random().toString(36).substring(2, 6)}.vercel.app`,
    status: 'READY',
    commit_hash: commitHash || 'abcdef12',
    branch,
    created_at: new Date().toISOString()
  };

  SIM_DEPLOYMENTS.unshift(deploy);
  res.json({ success: true, deployment: deploy });
});

// GET /projects/:id/deployments
app.get('/api/projects/:id/deployments', (req, res) => {
  const projectId = req.params.id;
  const list = SIM_DEPLOYMENTS.filter(d => d.project_id === projectId);
  res.json({ success: true, deployments: list });
});

// Static files (frontend)
app.use(express.static(__dirname));

app.listen(port, () => {
  console.log(`Huggy SaaS backend listening at http://localhost:${port}`);
});
