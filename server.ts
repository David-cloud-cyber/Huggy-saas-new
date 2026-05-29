import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Import our custom services
import { OpenRouterService } from './src/services/openrouter-service.ts';
import { ModelRouter, type RoutingContext } from './src/services/model-router.ts';
import { ForbiddenModelError, validateAllowedModel } from './src/services/ai-validator.ts';
import { AI_ALLOWED_MODELS, AI_MODEL_TIERS, AI_MODEL_CAPABILITIES, UserPlan } from './src/config/ai-models.ts';
import { CostEstimatorService, CreditWalletService, CreditLedgerService, CreditReservationService } from './src/services/credit-system.ts';
import { DomainService, VercelDomainService } from './src/services/domain-service.ts';
import { StripeService, SAAS_PLANS, TOPUP_PRODUCTS } from './src/services/billing-service.ts';
import { AuditLogService, BillingAlertService, UsageMeteringService, MemberLimitService } from './src/services/platform-support.ts';
import { buildWorldClassUiPolicy } from './src/services/design-generation-policy.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const DEFAULT_SUPABASE_URL = 'https://notgpriaragtiahcqjoa.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rp4hpA--fkybGy0GczSMvA_KU9BitSa';
const staticRoot = path.join(__dirname, 'dist');
const MAX_PROJECT_ASSET_BYTES = 4 * 1024 * 1024;
const ALLOWED_PROJECT_ASSET_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
  'application/pdf',
  'application/octet-stream',
]);

// Standard middlewares
app.use(express.json({ limit: '8mb' }));

// ── LAZY-LOADED RESOURCES / CLIENT GAUARDS ───────────────────────────
let supabase: any = null;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      supabase = createClient(url, key);
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

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'huggy-saas',
    time: new Date().toISOString(),
    static_dist: pathExists(staticRoot),
    integrations: {
      supabase_url: Boolean(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL),
      supabase_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      vercel: Boolean(getVercelToken()),
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
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

// Runtime data must live in Supabase. The only in-memory state kept here is
// short-lived rate-limit counters, which are not product data.
const RATE_LIMITS = new Map<string, number[]>();
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000000';

// Instantiate Core Services
const openRouter = new OpenRouterService({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  siteUrl: process.env.OPENROUTER_SITE_URL || 'https://huggy.app',
  appName: process.env.OPENROUTER_APP_NAME || 'Huggy SaaS'
});

const modelRouter = new ModelRouter();
const costEstimator = new CostEstimatorService();

function requireSupabase(feature: string) {
  const client = getSupabase();
  if (!client) {
    const error = new Error(`${feature} requires SUPABASE_SERVICE_ROLE_KEY on the backend.`);
    (error as any).statusCode = 503;
    throw error;
  }
  return client;
}

function normalizeProviderError(error: any): string {
  const message = String(error?.message || error || 'Generation failed.');
  if (/OpenRouter HTTP 401|OpenRouter HTTP 403|invalid api key|unauthorized/i.test(message)) {
    return 'OpenRouter key invalid or unauthorized. Update OPENROUTER_API_KEY on Railway and redeploy.';
  }
  if (/OpenRouter HTTP 404|model.*not.*found|not found/i.test(message)) {
    return 'The selected AI model is unavailable on OpenRouter. Choose Auto or another allowed model.';
  }
  if (/OpenRouter HTTP 429|rate limit|too many requests/i.test(message)) {
    return 'OpenRouter rate limit reached. Please wait a moment and try again.';
  }
  if (/OpenRouter HTTP 5|provider|upstream|timeout|AbortError/i.test(message)) {
    return 'OpenRouter provider error. The request was not completed; try again or choose another allowed model.';
  }
  return message;
}

type GeneratedFile = {
  path: string;
  content: string;
  language?: string;
  updated_at?: string;
};

type GeneratedProject = {
  id: string;
  owner_id: string;
  organization_id: string;
  name: string;
  slug: string;
  prompt?: string;
  template?: string;
  theme?: string;
  model_id?: string;
  status: string;
  preview_status?: string;
  preview_html?: string;
  created_at: string;
  updated_at: string;
};

type AgentEvent = {
  id?: string;
  organization_id: string;
  project_id: string;
  user_id: string;
  sequence_number: number;
  event_type: string;
  message: string;
  payload?: Record<string, unknown>;
  created_at?: string;
};

type IntentDecision = {
  intent: 'conversation' | 'clarification_required' | 'plan' | 'build' | 'debug_fix' | 'external_keys_required' | 'credits_required';
  confidence: number;
  requestedMode: 'plan' | 'build';
  requiresFileChanges: boolean;
  requiresPreviewRebuild: boolean;
  requiresCredits: boolean;
  userVisibleReason: string;
  clarification?: {
    question: string;
    choices: string[];
    recommendation: string;
  };
};

type PreviewBuildResult = {
  status: 'ready' | 'failed';
  html: string;
  errors: any[];
  summary: string;
};

type ExternalApiRequirement = {
  service: string;
  variable: string;
  description: string;
  required: boolean;
  placeholder: string;
};

function getUserOrgId(req: any): string {
  return req.user?.id || DEFAULT_ORG_ID;
}

function getUserProjectRole(_req: any): 'owner' | 'admin' | 'editor' | 'viewer' {
  return 'owner';
}

function requireProjectCapability(req: any, res: any, capability: 'build' | 'deploy' | 'secrets' | 'view') {
  const role = getUserProjectRole(req);
  const allowed: Record<string, string[]> = {
    view: ['owner', 'admin', 'editor', 'viewer'],
    build: ['owner', 'admin', 'editor'],
    deploy: ['owner', 'admin'],
    secrets: ['owner', 'admin'],
  };
  if (!allowed[capability].includes(role)) {
    res.status(403).json({ success: false, error: 'Permission denied', capability });
    return false;
  }
  return true;
}

function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (RATE_LIMITS.get(key) || []).filter(ts => now - ts < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  RATE_LIMITS.set(key, recent);
  return true;
}

function isAbusivePrompt(prompt: string) {
  return /(phishing|steal password|credential harvester|malware|ransomware|keylogger)/i.test(prompt);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `project-${Date.now()}`;
}

async function uniqueSlug(base: string, ownerId: string): Promise<string> {
  const candidate = slugify(base);
  const client = requireSupabase('Project slug generation');
  const { data, error } = await client
    .from('projects')
    .select('slug')
    .eq('owner_id', ownerId)
    .ilike('slug', `${candidate}%`);
  if (error) throw new Error(`Project slug lookup failed: ${error.message}`);
  const existing = new Set((data || []).map((row: any) => row.slug));
  if (!existing.has(candidate)) return candidate;
  for (let i = 2; i < 1000; i += 1) {
    const next = `${candidate}-${i}`;
    if (!existing.has(next)) return next;
  }
  return `${candidate}-${randomUUID().slice(0, 8)}`;
}

function isSafeProjectFilePath(filePath: string): boolean {
  if (!filePath || filePath.length > 180) return false;
  if (filePath.startsWith('/') || filePath.startsWith('\\')) return false;
  if (filePath.includes('..') || filePath.includes('\\')) return false;
  const blocked = ['.env', '.env.local', 'node_modules/', '.git/', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
  return !blocked.some(prefix => filePath === prefix || filePath.startsWith(prefix));
}

function normalizeGeneratedFiles(rawFiles: any): GeneratedFile[] {
  const entries = Array.isArray(rawFiles)
    ? rawFiles
    : Object.entries(rawFiles || {}).map(([filePath, content]) => ({ path: filePath, content }));

  const files = entries
    .map((entry: any) => ({
      path: String(entry.path || entry.file || '').trim(),
      content: String(entry.content ?? entry.data ?? ''),
      language: entry.language ? String(entry.language) : undefined,
      updated_at: new Date().toISOString(),
    }))
    .filter((file: GeneratedFile) => isSafeProjectFilePath(file.path) && file.content.trim().length > 0);

  if (!files.some(file => file.path === 'index.html')) {
    files.unshift({
      path: 'index.html',
      content: buildFallbackAppHtml('Generated Huggy app', 'Your app was generated, but no index.html was returned.'),
      language: 'html',
      updated_at: new Date().toISOString(),
    });
  }

  return files.slice(0, 80);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildFallbackAppHtml(title: string, prompt: string): string {
  const safeTitle = escapeHtml(title);
  const safePrompt = escapeHtml(prompt);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: #18130d; background: #f7f4ef; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 40px 18px; background:
      radial-gradient(circle at top left, rgba(180,113,86,.15), transparent 32%),
      linear-gradient(135deg, #f7f4ef, #fffaf3 52%, #f1ece4); }
    section { width: min(960px, 100%); border: 1px solid rgba(43,35,25,.14); background: rgba(255,250,243,.86); border-radius: 18px; padding: clamp(24px, 5vw, 56px); box-shadow: 0 30px 90px rgba(43,35,25,.14); }
    .eyebrow { color: #b47156; text-transform: uppercase; letter-spacing: .14em; font-size: 12px; font-weight: 700; }
    h1 { margin: 14px 0 12px; font-size: clamp(34px, 7vw, 76px); line-height: .96; letter-spacing: 0; }
    p { max-width: 680px; color: #675f55; font-size: clamp(16px, 2.4vw, 21px); line-height: 1.7; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 28px; }
    .card { border: 1px solid rgba(43,35,25,.12); border-radius: 12px; padding: 16px; background: rgba(255,255,255,.54); }
    .card strong { display:block; margin-bottom: 6px; }
    a { display: inline-flex; margin-top: 28px; padding: 13px 18px; border-radius: 10px; color: #fffaf3; background: #b47156; text-decoration: none; font-weight: 800; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } section { border-radius: 12px; } }
  </style>
</head>
<body>
  <main>
    <section>
      <div class="eyebrow">Generated by Huggy</div>
      <h1>${safeTitle}</h1>
      <p>${safePrompt}</p>
      <div class="grid">
        <div class="card"><strong>Responsive UI</strong><span>Desktop, tablet and mobile-ready layout.</span></div>
        <div class="card"><strong>Data-ready</strong><span>Includes backend schema notes for Supabase.</span></div>
        <div class="card"><strong>Deployable</strong><span>Prepared for Vercel hosting from Huggy.</span></div>
      </div>
      <a href="#start">Start exploring</a>
    </section>
  </main>
</body>
</html>`;
}

function renderPreviewHtml(files: GeneratedFile[], projectName = 'Huggy app'): string {
  const indexFile = files.find(file => file.path === 'index.html') || files.find(file => file.path.endsWith('.html'));
  if (indexFile?.content) return indexFile.content;
  return buildFallbackAppHtml(projectName, 'Preview ready. Generate or edit this project to replace the placeholder.');
}

function createTemplateFiles(projectName: string, prompt: string): GeneratedFile[] {
  return normalizeGeneratedFiles([
    {
      path: 'index.html',
      language: 'html',
      content: buildFallbackAppHtml(projectName, prompt || 'A polished generated web application.'),
    },
    {
      path: 'supabase/schema.sql',
      language: 'sql',
      content: `-- Logical backend schema generated by Huggy\ncreate table if not exists public.app_records (\n  id uuid primary key default gen_random_uuid(),\n  project_id uuid not null,\n  payload jsonb not null default '{}'::jsonb,\n  created_at timestamptz not null default now()\n);\n`,
    },
    {
      path: 'README.md',
      language: 'markdown',
      content: `# ${projectName}\n\nGenerated from this prompt:\n\n${prompt || 'No prompt provided.'}\n\nThis MVP is static-preview ready and includes Supabase schema notes for the backend layer.\n`,
    },
  ]);
}

class AgentOrchestrator {
  decide(input: { prompt: string; requestedMode?: string; hasFiles: boolean; lastPlan?: string }): IntentDecision {
    const text = input.prompt.trim();
    const lower = text.toLowerCase();
    const requestedMode = input.requestedMode === 'plan' ? 'plan' : 'build';

    if (requestedMode === 'plan') {
      return {
        intent: 'plan',
        confidence: 1,
        requestedMode,
        requiresFileChanges: false,
        requiresPreviewRebuild: false,
        requiresCredits: true,
        userVisibleReason: 'Plan mode was selected, so Huggy will prepare a plan without touching files.',
      };
    }

    if (!text || text.length < 4) {
      return {
        intent: 'clarification_required',
        confidence: 0.62,
        requestedMode,
        requiresFileChanges: false,
        requiresPreviewRebuild: false,
        requiresCredits: false,
        userVisibleReason: 'The request is too short to safely change the app.',
        clarification: {
          question: 'What should Huggy build first?',
          choices: ['Landing page', 'SaaS dashboard', 'Auth + database', 'Admin panel'],
          recommendation: 'Start with the core screen and database needs.',
        },
      };
    }

    const conversationHints = [
      'explique', 'explain', 'c est quoi', "c'est quoi", 'what is', 'comment marche',
      'est-ce que', 'peux tu me dire', 'dis moi', 'pourquoi', 'how does'
    ];
    const buildHints = [
      'crée', 'creer', 'create', 'ajoute', 'add', 'modifie', 'change', 'corrige',
      'fix', 'build', 'implémente', 'implemente', 'generate', 'génère', 'genere',
      'page', 'component', 'dashboard', 'landing', 'formulaire', 'deploy'
    ];
    const lastPlanHints = ['ok fais', 'fais-le', 'implemente ça', 'implémente ça', 'build this plan', 'continue le plan'];

    if (lastPlanHints.some(hint => lower.includes(hint)) && input.lastPlan) {
      return {
        intent: 'build',
        confidence: 0.96,
        requestedMode,
        requiresFileChanges: true,
        requiresPreviewRebuild: true,
        requiresCredits: true,
        userVisibleReason: 'The message refers to the last approved plan, so Huggy will build that plan.',
      };
    }

    const wantsBuild = buildHints.some(hint => lower.includes(hint));
    const wantsConversation = conversationHints.some(hint => lower.includes(hint));
    if (wantsConversation && !wantsBuild) {
      return {
        intent: 'conversation',
        confidence: 0.86,
        requestedMode,
        requiresFileChanges: false,
        requiresPreviewRebuild: false,
        requiresCredits: false,
        userVisibleReason: 'This looks like a question, not an app change.',
      };
    }

    const words = text.split(/\s+/).filter(Boolean);
    const vagueBuildHints = ['app', 'application', 'site', 'dashboard', 'saas', 'projet', 'platforme', 'plateforme'];
    const isVagueBuild = requestedMode === 'build'
      && !input.hasFiles
      && words.length < 8
      && vagueBuildHints.some(hint => lower.includes(hint))
      && !/(restaurant|booking|auth|login|crm|ecommerce|e-commerce|portfolio|marketplace|admin|analytics|chat|blog|landing|payment|stripe|supabase)/i.test(text);

    if (isVagueBuild) {
      return {
        intent: 'clarification_required',
        confidence: 0.78,
        requestedMode,
        requiresFileChanges: false,
        requiresPreviewRebuild: false,
        requiresCredits: false,
        userVisibleReason: 'The request is too broad, so Huggy needs one product decision before writing files.',
        clarification: {
          question: 'What kind of first version should Huggy create?',
          choices: ['Landing page', 'SaaS dashboard', 'Marketplace', 'Admin panel'],
          recommendation: 'Choose the closest product type, then Huggy can build a focused first version.',
        },
      };
    }

    return {
      intent: 'build',
      confidence: wantsBuild ? 0.9 : 0.72,
      requestedMode,
      requiresFileChanges: true,
      requiresPreviewRebuild: true,
      requiresCredits: true,
      userVisibleReason: input.hasFiles ? 'Huggy will patch the existing project.' : 'Huggy will generate the first project version.',
    };
  }
}

const agentOrchestrator = new AgentOrchestrator();
const intentRouter = agentOrchestrator;

function createPlanResponse(project: GeneratedProject, prompt: string, files: GeneratedFile[]) {
  const fileHints = files.slice(0, 8).map(file => `- ${file.path}`).join('\n') || '- No generated files yet';
  return [
    `Plan for ${project.name}`,
    '',
    '1. Understand the requested outcome and protect the current working version.',
    '2. Identify the smallest set of files that should change.',
    '3. Update UI, data model, and preview behavior in focused steps.',
    '4. Build the preview and run the auto-fix loop if an error appears.',
    '5. Show a diff summary before the user deploys.',
    '',
    'Relevant files:',
    fileHints,
    '',
    `Request: ${prompt}`,
  ].join('\n');
}

function createConversationResponse(project: GeneratedProject, prompt: string) {
  return `I can help with ${project.name}. This message looks like a question, so I will not change files or rebuild the preview.\n\n${prompt}`;
}

function createClarificationContent(decision: IntentDecision) {
  const question = decision.clarification?.question || 'I need one more detail before I can safely build this.';
  const choices = decision.clarification?.choices || [];
  const options = choices.length ? `\n\nOptions:\n${choices.map(choice => `- ${choice}`).join('\n')}` : '';
  const recommendation = decision.clarification?.recommendation ? `\n\nRecommendation: ${decision.clarification.recommendation}` : '';
  return `${question}${options}${recommendation}`;
}

function detectExternalApiRequirements(prompt: string): ExternalApiRequirement[] {
  const lower = prompt.toLowerCase();
  const services: Array<[string, string, string, string[]]> = [
    ['Stripe', 'STRIPE_SECRET_KEY', 'Payments and billing operations', ['stripe', 'payment', 'checkout', 'abonnement']],
    ['Resend', 'RESEND_API_KEY', 'Transactional emails', ['resend', 'sendgrid', 'email', 'mail']],
    ['Google Maps', 'GOOGLE_MAPS_API_KEY', 'Maps, places and geocoding', ['google maps', 'map', 'maps', 'géolocalisation', 'geolocation']],
    ['Twilio', 'TWILIO_AUTH_TOKEN', 'SMS and WhatsApp messaging', ['twilio', 'whatsapp', 'sms']],
    ['OpenAI', 'OPENAI_API_KEY', 'External OpenAI-powered app features', ['openai api', 'chatgpt api']],
    ['Clerk', 'CLERK_SECRET_KEY', 'External auth provider integration', ['clerk']],
  ];

  return services
    .filter(([, , , hints]) => hints.some(hint => lower.includes(hint)))
    .map(([service, variable, description]) => ({
      service,
      variable,
      description,
      required: false,
      placeholder: `${variable}=configure_in_database_tab`,
    }));
}

function maskSecret(value: string) {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

function pseudoEncryptSecret(value: string) {
  const salt = randomBytes(6).toString('hex');
  const digest = createHash('sha256').update(`${salt}:${value}`).digest('hex');
  return `sha256:${salt}:${digest}`;
}

function estimateActionCost(prompt: string, intent: IntentDecision) {
  if (intent.intent === 'conversation' || intent.intent === 'clarification_required') return { finalCredits: 0, minimum_action_credits: 0 };
  if (intent.intent === 'plan') return costEstimator.calculateRequiredCredits({
    openrouter_cost_usd: 0.0005,
    infra_cost_usd: 0.0001,
    storage_cost_usd: 0,
    build_cost_usd: 0,
    domain_operation_cost_usd: 0,
    minimum_action_credits: 0.5,
    complexity_surcharge: prompt.length > 600 ? 0.5 : 0,
  });
  return costEstimator.calculateRequiredCredits({
    openrouter_cost_usd: 0.002,
    infra_cost_usd: 0.0005,
    storage_cost_usd: 0.0001,
    build_cost_usd: 0.001,
    domain_operation_cost_usd: 0,
    minimum_action_credits: 2,
    complexity_surcharge: prompt.length > 400 ? 2 : 0,
  });
}

function diffFiles(before: GeneratedFile[], after: GeneratedFile[]) {
  const beforeMap = new Map(before.map(file => [file.path, file.content]));
  const afterMap = new Map(after.map(file => [file.path, file.content]));
  const created = after.filter(file => !beforeMap.has(file.path)).map(file => file.path);
  const modified = after.filter(file => beforeMap.has(file.path) && beforeMap.get(file.path) !== file.content).map(file => file.path);
  const deleted = before.filter(file => !afterMap.has(file.path)).map(file => file.path);
  return {
    created,
    modified,
    deleted,
    summary: `${created.length} created, ${modified.length} modified, ${deleted.length} deleted`,
  };
}

function runPreviewPipeline(project: GeneratedProject, files: GeneratedFile[]): PreviewBuildResult {
  const errors: any[] = [];
  for (const file of files) {
    if (!isSafeProjectFilePath(file.path)) {
      errors.push({ file: file.path, message: 'Unsafe file path blocked.', severity: 'high' });
    }
    if (/process\.env\.[A-Z0-9_]*SECRET|sk_live_|sk_test_|api[_-]?key\s*[:=]/i.test(file.content)) {
      errors.push({ file: file.path, message: 'Potential secret exposure detected in generated code.', severity: 'high' });
    }
    if (/from\s+['"][^'"]+['"]/.test(file.content) && /__missing_import__|missing-module/i.test(file.content)) {
      errors.push({ file: file.path, message: 'Missing import detected.', severity: 'medium' });
    }
  }

  const html = renderPreviewHtml(files, project.name);
  if (!html.trim() || /__HUGGY_FORCE_ERROR__/i.test(html)) {
    errors.push({ file: 'index.html', message: 'Preview HTML is empty or intentionally failing.', severity: 'high' });
  }

  return {
    status: errors.length ? 'failed' : 'ready',
    html: errors.length ? buildFallbackAppHtml('Preview needs attention', errors[0].message) : html,
    errors,
    summary: errors.length ? errors[0].message : 'Preview build completed successfully.',
  };
}

function applyAutoFix(project: GeneratedProject, files: GeneratedFile[], errors: any[]) {
  if (!errors.length) return { files, fixed: false, patch: null as any };
  const primary = errors[0];
  const targetPath = primary.file || 'index.html';
  const patched = files.map(file => {
    if (file.path !== targetPath) return file;
    let content = file.content
      .replace(/__HUGGY_FORCE_ERROR__/g, '')
      .replace(/from\s+['"]__missing_import__['"];?/g, '')
      .replace(/sk_live_[A-Za-z0-9_]+|sk_test_[A-Za-z0-9_]+/g, 'SECRET_CONFIGURED_SERVER_SIDE');

    if (content === file.content) {
      content += `\n<!-- Huggy auto-fix note: ${escapeHtml(primary.message || 'Preview issue checked')} -->\n`;
    }

    return { ...file, content, updated_at: new Date().toISOString() };
  });

  return {
    files: patched,
    fixed: true,
    patch: {
      id: randomUUID(),
      project_id: project.id,
      target_file: targetPath,
      summary: `Applied targeted patch for ${primary.message}`,
      created_at: new Date().toISOString(),
    },
  };
}

function createZipBuffer(files: GeneratedFile[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path);
    const data = Buffer.from(file.content);
    const crc = 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0, 8);
    c.writeUInt16LE(0, 10);
    c.writeUInt32LE(0, 12);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt16LE(0, 30);
    c.writeUInt16LE(0, 32);
    c.writeUInt32LE(0, 34);
    c.writeUInt32LE(0, 38);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += local.length + name.length + data.length;
  }

  const centralStart = offset;
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuffer, end]);
}

async function generateFilesWithAi(input: {
  projectName: string;
  prompt: string;
  modelId?: string;
  existingFiles: GeneratedFile[];
}): Promise<{ files: GeneratedFile[]; summary: string; model: string; cost_usd: number }> {
  const hasLiveKey = Boolean(process.env.OPENROUTER_API_KEY);
  if (!hasLiveKey) {
    throw new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY on Railway to enable live generation.');
  }

  const selectedModel = input.modelId && input.modelId !== 'auto' ? input.modelId : 'anthropic/claude-sonnet-4.6';
  validateAllowedModel(selectedModel);

  const fileManifest = input.existingFiles
    .map(file => `${file.path} (${file.content.length} chars)`)
    .slice(0, 40)
    .join('\n');
  const uiPolicy = buildWorldClassUiPolicy({ prompt: input.prompt });

  const result = await openRouter.chat(selectedModel, [
    {
      role: 'system',
      content: [
        'You are Huggy, a senior fullstack app generator.',
        uiPolicy.systemPrompt,
        'Return only valid JSON with this exact shape: {"summary":string,"files":[{"path":string,"content":string,"language":string}],"backendSchema":string,"tests":string[]}.',
        'Generate a deployable static Vercel v1 app with a self-contained index.html for live preview.',
        'Include Supabase backend schema in supabase/schema.sql when the app needs data.',
        'Never include secrets, .env files, lockfiles, node_modules, absolute paths, or path traversal.',
        'The summary must mention the detected app type and the chosen design direction in one concise sentence.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        projectName: input.projectName,
        prompt: input.prompt,
        existingFiles: fileManifest || 'No existing files yet.',
        uiGenerationPolicy: uiPolicy.userContext,
      }),
    },
  ], 1, 90000);

  const cleaned = result.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      summary: 'The model returned non-JSON output, so Huggy wrapped it in a safe preview page.',
      files: [{ path: 'index.html', content: buildFallbackAppHtml(input.projectName, result.text), language: 'html' }],
    };
  }

  const files = normalizeGeneratedFiles(parsed.files);
  if (parsed.backendSchema && !files.some(file => file.path === 'supabase/schema.sql')) {
    files.push({ path: 'supabase/schema.sql', content: String(parsed.backendSchema), language: 'sql', updated_at: new Date().toISOString() });
  }

  return {
    files,
    summary: String(parsed.summary || 'Application files generated.'),
    model: result.model,
    cost_usd: result.cost_usd,
  };
}

function buildGenerationMessages(input: {
  projectName: string;
  prompt: string;
  existingFiles: GeneratedFile[];
}) {
  const fileManifest = input.existingFiles
    .map(file => `${file.path} (${file.content.length} chars)`)
    .slice(0, 40)
    .join('\n');
  const uiPolicy = buildWorldClassUiPolicy({ prompt: input.prompt });

  return [
    {
      role: 'system' as const,
      content: [
        'You are Huggy, a senior fullstack app generator.',
        uiPolicy.systemPrompt,
        'Return only valid JSON with this exact shape: {"summary":string,"files":[{"path":string,"content":string,"language":string}],"backendSchema":string,"tests":string[]}.',
        'Generate a deployable static Vercel v1 app with a self-contained index.html for live preview.',
        'Include Supabase backend schema in supabase/schema.sql when the app needs data.',
        'Never include secrets, .env files, lockfiles, node_modules, absolute paths, or path traversal.',
        'The summary must mention the detected app type and the chosen design direction in one concise sentence.',
      ].join(' '),
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        projectName: input.projectName,
        prompt: input.prompt,
        existingFiles: fileManifest || 'No existing files yet.',
        uiGenerationPolicy: uiPolicy.userContext,
      }),
    },
  ];
}

function parseGeneratedOutput(projectName: string, rawText: string) {
  const cleaned = rawText.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      summary: 'The model returned non-JSON output, so Huggy wrapped it in a safe preview page.',
      files: [{ path: 'index.html', content: buildFallbackAppHtml(projectName, rawText), language: 'html' }],
    };
  }

  const files = normalizeGeneratedFiles(parsed.files);
  if (parsed.backendSchema && !files.some(file => file.path === 'supabase/schema.sql')) {
    files.push({ path: 'supabase/schema.sql', content: String(parsed.backendSchema), language: 'sql', updated_at: new Date().toISOString() });
  }

  return {
    files,
    summary: String(parsed.summary || 'Application files generated.'),
  };
}

async function saveProject(project: GeneratedProject, files?: GeneratedFile[]) {
  const client = requireSupabase('Project persistence');
  const { error } = await client.from('projects').upsert([project]);
  if (error) {
    throw new Error(`Supabase project persistence failed: ${error.message}`);
  }

  if (files) {
    await client.from('project_files').delete().eq('project_id', project.id);
    const rows = files.map(file => ({
      project_id: project.id,
      path: file.path,
      content: file.content,
      language: file.language || null,
      updated_at: new Date().toISOString(),
    }));
    const { error: fileError } = await client.from('project_files').insert(rows);
    if (fileError) throw new Error(`Supabase project file persistence failed: ${fileError.message}`);
  }

  return project;
}

async function loadProject(projectId: string, userId: string): Promise<GeneratedProject | null> {
  const client = requireSupabase('Project loading');
  const { data, error } = await client.from('projects').select('*').eq('id', projectId).eq('owner_id', userId).maybeSingle();
  if (error) throw new Error(`Supabase project load failed: ${error.message}`);
  return (data as GeneratedProject) || null;
}

async function listProjectsForUser(userId: string): Promise<GeneratedProject[]> {
  const client = requireSupabase('Project listing');
  const { data, error } = await client.from('projects').select('*').eq('owner_id', userId).order('updated_at', { ascending: false });
  if (error) throw new Error(`Supabase project listing failed: ${error.message}`);
  return (data || []) as GeneratedProject[];
}

async function loadProjectFiles(projectId: string): Promise<GeneratedFile[]> {
  const client = requireSupabase('Project file loading');
  const { data, error } = await client.from('project_files').select('path, content, language, updated_at').eq('project_id', projectId).order('path');
  if (error) throw new Error(`Supabase project files load failed: ${error.message}`);
  return (data || []) as GeneratedFile[];
}

async function saveDeploymentRecord(record: any) {
  const client = requireSupabase('Deployment persistence');
  const { error } = await client.from('deployments').insert([record]);
  if (error) throw new Error(`Supabase deployment persistence failed: ${error.message}`);
}

async function saveAgentEvent(event: AgentEvent) {
  const row = {
    ...event,
    id: event.id || randomUUID(),
    payload: event.payload || {},
    created_at: event.created_at || new Date().toISOString(),
  };

  const client = requireSupabase('Agent event persistence');
  const { error } = await client.from('agent_events').insert([row]);
  if (error) throw new Error(`Supabase agent event persistence failed: ${error.message}`);
  return row;
}

async function saveProjectMessage(data: any) {
  const row = { id: data.id || randomUUID(), ...data, created_at: data.created_at || new Date().toISOString() };
  const client = requireSupabase('Project message persistence');
  const { error } = await client.from('project_messages').insert([row]);
  if (error) throw new Error(`Supabase project message persistence failed: ${error.message}`);
  return row;
}

async function listProjectMessages(projectId: string) {
  const client = requireSupabase('Project message listing');
  const { data, error } = await client.from('project_messages').select('*').eq('project_id', projectId).order('created_at');
  if (error) throw new Error(`Supabase project message listing failed: ${error.message}`);
  return data || [];
}

async function getLastProjectPlan(projectId: string): Promise<string> {
  const client = requireSupabase('Project plan lookup');
  const { data, error } = await client
    .from('project_messages')
    .select('content')
    .eq('project_id', projectId)
    .eq('intent', 'plan')
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Supabase project plan lookup failed: ${error.message}`);
  return data?.content || '';
}

async function listAgentEvents(projectId: string) {
  const client = requireSupabase('Agent event listing');
  const { data, error } = await client.from('agent_events').select('*').eq('project_id', projectId).order('sequence_number');
  if (error) throw new Error(`Supabase agent event listing failed: ${error.message}`);
  return data || [];
}

async function createProjectVersion(project: GeneratedProject, files: GeneratedFile[], reason: string, diff: any) {
  const versions = await listProjectVersions(project.id);
  const row = {
    id: randomUUID(),
    organization_id: project.organization_id,
    project_id: project.id,
    version_number: versions.length + 1,
    reason,
    files_snapshot: files,
    diff_summary: diff,
    created_at: new Date().toISOString(),
  };
  const client = requireSupabase('Project version persistence');
  const { error } = await client.from('project_versions').insert([row]);
  if (error) throw new Error(`Supabase project version persistence failed: ${error.message}`);
  return row;
}

async function listProjectVersions(projectId: string) {
  const client = requireSupabase('Project version listing');
  const { data, error } = await client.from('project_versions').select('*').eq('project_id', projectId).order('version_number', { ascending: false });
  if (error) throw new Error(`Supabase project version listing failed: ${error.message}`);
  return data || [];
}

async function saveBuildError(project: GeneratedProject, error: any) {
  const row = { id: randomUUID(), organization_id: project.organization_id, project_id: project.id, ...error, status: error.status || 'detected', created_at: new Date().toISOString() };
  const client = requireSupabase('Build error persistence');
  const { error: dbError } = await client.from('build_errors').insert([row]);
  if (dbError) throw new Error(`Supabase build error persistence failed: ${dbError.message}`);
  return row;
}

async function listBuildErrors(projectId: string) {
  const client = requireSupabase('Build error listing');
  const { data, error } = await client.from('build_errors').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw new Error(`Supabase build error listing failed: ${error.message}`);
  return data || [];
}

async function createBuildSession(project: GeneratedProject, userId: string) {
  const row = {
    id: `build_${randomUUID()}`,
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    status: 'running',
    created_at: new Date().toISOString(),
  };
  const client = requireSupabase('Build session persistence');
  const { error } = await client.from('build_sessions').insert([row]);
  if (error) throw new Error(`Supabase build session persistence failed: ${error.message}`);
  return row;
}

async function getBuildSession(buildSessionId: string) {
  const client = requireSupabase('Build session lookup');
  const { data, error } = await client.from('build_sessions').select('*').eq('id', buildSessionId).maybeSingle();
  if (error) throw new Error(`Supabase build session lookup failed: ${error.message}`);
  return data;
}

async function updateBuildSessionStatus(buildSessionId: string, status: string, extra: Record<string, unknown> = {}) {
  const client = requireSupabase('Build session update');
  const { error } = await client.from('build_sessions').update({ status, ...extra }).eq('id', buildSessionId);
  if (error) throw new Error(`Supabase build session update failed: ${error.message}`);
}

async function saveProjectPatch(project: GeneratedProject, patch: any) {
  if (!patch) return;
  const client = requireSupabase('Project patch persistence');
  const row = {
    id: randomUUID(),
    organization_id: project.organization_id,
    project_id: project.id,
    target_file: patch.target_file || patch.file || null,
    summary: patch.summary || 'Targeted patch applied.',
    created_at: new Date().toISOString(),
  };
  const { error } = await client.from('project_patches').insert([row]);
  if (error) throw new Error(`Supabase project patch persistence failed: ${error.message}`);
}

async function listProjectSecrets(projectId: string) {
  const client = requireSupabase('Project secrets listing');
  const { data, error } = await client.from('project_secrets').select('id, project_id, service, variable, masked_value, status, created_at, updated_at').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw new Error(`Supabase project secrets listing failed: ${error.message}`);
  return data || [];
}

async function saveProjectSecret(project: GeneratedProject, service: string, variable: string, value: string, status = 'configured') {
  const row = {
    id: randomUUID(),
    organization_id: project.organization_id,
    project_id: project.id,
    service,
    variable,
    encrypted_value: value ? pseudoEncryptSecret(value) : null,
    masked_value: value ? maskSecret(value) : 'not configured',
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const client = requireSupabase('Project secret persistence');
  const { error } = await client.from('project_secrets').insert([row]);
  if (error) throw new Error(`Supabase project secret persistence failed: ${error.message}`);
  return { ...row, encrypted_value: undefined };
}

function getVercelToken(): string {
  return process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || '';
}

function createVercelDomainProxy() {
  const token = getVercelToken();
  if (!token) {
    throw new Error('Vercel domain operations are not configured. Add VERCEL_TOKEN on Railway.');
  }
  return new VercelDomainService(token);
}

async function deployFilesToVercel(project: GeneratedProject, files: GeneratedFile[]) {
  const token = getVercelToken();
  if (!token) {
    throw new Error('Vercel deployment is not configured. Add VERCEL_TOKEN on Railway to publish generated apps.');
  }

  const deploymentFiles = normalizeGeneratedFiles(files).map(file => ({
    file: file.path,
    data: file.content,
  }));

  if (!deploymentFiles.some(file => file.file === 'index.html')) {
    deploymentFiles.unshift({ file: 'index.html', data: renderPreviewHtml(files, project.name) });
  }

  const params = new URLSearchParams();
  if (process.env.VERCEL_TEAM_ID) params.set('teamId', process.env.VERCEL_TEAM_ID);

  const endpoint = `https://api.vercel.com/v13/deployments${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `huggy-${project.slug}`.slice(0, 52),
      target: 'production',
      files: deploymentFiles,
      projectSettings: {
        framework: null,
        buildCommand: null,
        installCommand: null,
        outputDirectory: null,
      },
      meta: {
        huggyProjectId: project.id,
      },
    }),
  });

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `Vercel API returned ${response.status}`);
  }

  const url = payload.url ? `https://${String(payload.url).replace(/^https?:\/\//, '')}` : '';
  return {
    provider_deployment_id: payload.id || payload.uid || null,
    deployment_url: url,
    status: String(payload.readyState || payload.state || 'queued').toLowerCase(),
    raw: payload,
  };
}

// Wrapper to safely access live Supabase-backed billing state.
function getDbHelpers() {
  const client = requireSupabase('Billing and usage persistence');
  return {
    getWallet: async (orgId: string) => {
      const { data, error } = await client.from('credit_wallets').select('balance').eq('organization_id', orgId).maybeSingle();
      if (error) throw new Error(`Credit wallet lookup failed: ${error.message}`);
      return data ? parseFloat(data.balance) : 0;
    },
    updateWallet: async (orgId: string, diff: number) => {
      const { data: wallet, error: walletError } = await client.from('credit_wallets').select('balance').eq('organization_id', orgId).maybeSingle();
      if (walletError) throw new Error(`Credit wallet update lookup failed: ${walletError.message}`);
      const current = wallet ? parseFloat(wallet.balance) : 0;
      const next = current + diff;
      const { error } = await client.from('credit_wallets').upsert([{ organization_id: orgId, balance: next, updated_at: new Date().toISOString() }]);
      if (error) throw new Error(`Credit wallet update failed: ${error.message}`);
      return next;
    },
    addLedger: async (orgId: string, type: string, amount: number, balance_after: number, desc: string, refId: string) => {
      const log = { wallet_id: orgId, type, amount, balance_after, description: desc, reference_id: refId, created_at: new Date().toISOString() };
      const { error } = await client.from('credit_ledger').insert([log]);
      if (error) throw new Error(`Credit ledger insert failed: ${error.message}`);
    },
    addAudit: async (data: any) => {
      const { error } = await client.from('audit_logs').insert([{ ...data, created_at: new Date().toISOString() }]);
      if (error) console.warn(`Audit log insert failed: ${error.message}`);
    },
    createReservation: async (orgId: string, amount: number, refId: string) => {
      const expires_at = new Date(Date.now() + 15 * 60000).toISOString();
      const res = { id: randomUUID(), wallet_id: orgId, amount, status: 'reserved', reference_id: refId, expires_at };
      const { error } = await client.from('credit_reservations').insert([res]);
      if (error) throw new Error(`Credit reservation failed: ${error.message}`);
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
  const orgId = (req.query.orgId as string) || (req as any).user?.id || DEFAULT_ORG_ID;
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
  const orgId = (req.query.orgId as string) || (req as any).user?.id || DEFAULT_ORG_ID;
  const client = requireSupabase('Credit ledger listing');
  const { data, error } = await client.from('credit_ledger').select('*').eq('wallet_id', orgId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, ledger: data || [] });
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
  const client = requireSupabase('Billing portal');
  
  if (process.env.STRIPE_SECRET_KEY) {
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
      return res.status(503).json({ success: false, error: `Billing portal setup failed: ${e.message}` });
    }
  }
  
  res.status(503).json({ success: false, error: 'Stripe is not configured. Add STRIPE_SECRET_KEY on Railway.' });
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
app.patch('/api/users/me/ai-preferences', async (req: any, res) => {
  const { default_routing_mode, max_credits_per_action, ask_confirm_before_premium, auto_revert_to_auto } = req.body;
  const uid = req.user?.id || DEFAULT_ORG_ID;

  const updated = {
    user_id: uid,
    default_routing_mode: default_routing_mode || 'Auto',
    max_credits_per_action: max_credits_per_action || 50.0,
    ask_confirm_before_premium: ask_confirm_before_premium !== false,
    auto_revert_to_auto: auto_revert_to_auto === true,
    updated_at: new Date().toISOString()
  };

  const client = requireSupabase('User AI preferences');
  const { error } = await client.from('user_ai_preferences').upsert([updated]);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, preferences: updated });
});

// PATCH /projects/:id/ai-preferences
app.patch('/api/projects/:id/ai-preferences', async (req: any, res) => {
  const { default_routing_mode, max_credits_per_action, ask_confirm_before_premium, auto_revert_to_auto } = req.body;
  const pid = req.params.id;
  const userId = getUserOrgId(req);
  const project = await loadProject(pid, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const updated = {
    project_id: pid,
    default_routing_mode: default_routing_mode || 'Auto',
    max_credits_per_action: max_credits_per_action || 50.0,
    ask_confirm_before_premium: ask_confirm_before_premium !== false,
    auto_revert_to_auto: auto_revert_to_auto === true,
    updated_at: new Date().toISOString()
  };

  const client = requireSupabase('Project AI preferences');
  const { error } = await client.from('project_ai_preferences').upsert([updated]);
  if (error) return res.status(500).json({ success: false, error: error.message });
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

      const reservationServ = new CreditReservationService(requireSupabase('Credit reservation release'));
      await reservationServ.releaseReservation(refId, true, finalEstimate.finalCredits);
      const finalBalance = await clientHelpers.updateWallet(orgId, -finalEstimate.finalCredits);
      await clientHelpers.addLedger(orgId, 'usage', -finalEstimate.finalCredits, finalBalance, `AI usage on:${completionResult.model}`, refId);

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
      const reservationServ = new CreditReservationService(requireSupabase('Credit reservation refund'));
      await reservationServ.releaseReservation(refId, false);

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

app.get('/api/projects', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const projects = await listProjectsForUser(userId);
  res.json({ success: true, projects });
});

app.post('/api/projects', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const name = String(req.body?.name || '').trim();
  const prompt = String(req.body?.prompt || req.body?.description || '').trim();

  if (!name) {
    return res.status(400).json({ success: false, error: 'Project name is required.' });
  }

  const now = new Date().toISOString();
  const project: GeneratedProject = {
    id: randomUUID(),
    owner_id: userId,
    organization_id: userId,
    name,
    slug: await uniqueSlug(name, userId),
    prompt,
    template: String(req.body?.template || 'custom'),
    theme: String(req.body?.theme || 'light'),
    model_id: String(req.body?.model || req.body?.modelId || 'auto'),
    status: 'draft',
    preview_status: 'idle',
    created_at: now,
    updated_at: now,
  };

  const files = createTemplateFiles(name, prompt || `Create a polished web app named ${name}.`);
  project.preview_html = renderPreviewHtml(files, project.name);
  await saveProject(project, files);

  res.status(201).json({
    success: true,
    project,
    files,
    preview: {
      status: project.preview_status,
      html: project.preview_html,
    },
  });
});

app.get('/api/projects/:id', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const files = await loadProjectFiles(project.id);
  const messages = await listProjectMessages(project.id);
  const events = await listAgentEvents(project.id);
  res.json({
    success: true,
    project,
    files,
    messages,
    events,
    preview: {
      status: project.preview_status || 'idle',
      html: project.preview_html || renderPreviewHtml(files, project.name),
    },
  });
});

app.get('/api/projects/:id/state', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const files = await loadProjectFiles(project.id);
  const messages = await listProjectMessages(project.id);
  const events = await listAgentEvents(project.id);
  const versions = await listProjectVersions(project.id);
  const secrets = await listProjectSecrets(project.id);
  const errors = await listBuildErrors(project.id);
  const helpers = getDbHelpers();
  const balance = await helpers.getWallet(userId);
  res.json({
    success: true,
    project,
    files,
    messages,
    events,
    versions,
    secrets,
    errors,
    credits: { balance },
    preview: {
      status: project.preview_status || 'idle',
      html: project.preview_html || renderPreviewHtml(files, project.name),
    },
  });
});

app.post('/api/projects/:id/estimate', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const files = await loadProjectFiles(project.id);
  const lastPlan = await getLastProjectPlan(project.id);
  const decision = intentRouter.decide({
    prompt: String(req.body?.prompt || ''),
    requestedMode: req.body?.requestedMode || 'build',
    hasFiles: files.length > 0,
    lastPlan,
  });
  const estimate = estimateActionCost(String(req.body?.prompt || ''), decision);
  res.json({ success: true, intent: decision, estimate });
});

app.post('/api/projects/:id/agent/answer', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const originalPrompt = String(req.body?.originalPrompt || '').trim();
  const answer = String(req.body?.answer || '').trim();
  const recommendation = String(req.body?.recommendation || '').trim();
  const finalAnswer = answer || recommendation;

  if (!finalAnswer) {
    return res.status(400).json({ success: false, error: 'A clarification answer is required.' });
  }

  const resumedPrompt = [
    originalPrompt || 'Continue the current build request.',
    '',
    `Clarification answer: ${finalAnswer}`,
  ].join('\n');

  await saveProjectMessage({
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    role: 'user',
    content: `Clarification: ${finalAnswer}`,
    intent: 'clarification_required',
    requested_mode: req.body?.requestedMode === 'plan' ? 'plan' : 'build',
  });

  res.json({
    success: true,
    prompt: resumedPrompt,
    requestedMode: req.body?.requestedMode === 'plan' ? 'plan' : 'build',
  });
});

app.post('/api/projects/:id/generate', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required.' });
  if (!requireProjectCapability(req, res, 'build')) return;
  if (!enforceRateLimit(`generate:${userId}`, 12, 60_000)) {
    return res.status(429).json({ success: false, error: 'Too many build requests. Please wait a moment.' });
  }
  if (isAbusivePrompt(prompt)) {
    return res.status(400).json({ success: false, error: 'This request cannot be generated safely.' });
  }

  const helpers = getDbHelpers();
  const existingFiles = await loadProjectFiles(project.id);
  const lastPlan = await getLastProjectPlan(project.id);
  const decision = intentRouter.decide({
    prompt,
    requestedMode: req.body?.requestedMode || 'build',
    hasFiles: existingFiles.length > 0,
    lastPlan,
  });
  await saveProjectMessage({
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    role: 'user',
    content: prompt,
    intent: decision.intent,
    requested_mode: decision.requestedMode,
  });

  if (decision.intent === 'conversation' || decision.intent === 'clarification_required' || decision.intent === 'plan') {
    const content = decision.intent === 'plan'
      ? createPlanResponse(project, prompt, existingFiles)
      : decision.intent === 'clarification_required'
        ? createClarificationContent(decision)
        : createConversationResponse(project, prompt);
    await saveProjectMessage({
      organization_id: project.organization_id,
      project_id: project.id,
      user_id: userId,
      role: 'assistant',
      content,
      intent: decision.intent,
      requested_mode: decision.requestedMode,
    });
    return res.json({
      success: true,
      intent: decision,
      text: content,
      files: existingFiles,
      preview: { status: project.preview_status || 'idle', html: project.preview_html || renderPreviewHtml(existingFiles, project.name) },
      credits: { estimated: 0, charged: 0, remaining: await helpers.getWallet(userId) },
    });
  }

  const wallet = await helpers.getWallet(userId);
  const cost = estimateActionCost(prompt, decision);

  if (wallet < cost.finalCredits) {
    return res.status(200).json({
      success: false,
      event: 'credits_insufficient',
      error: 'InsufficientCreditsError',
      message: `Your balance (${wallet} credits) is below the required ${cost.finalCredits} credits.`,
      credits: { balance: wallet, required: cost.finalCredits },
    });
  }

  const refId = `gen_${randomUUID()}`;
  await helpers.createReservation(userId, cost.finalCredits, refId);

  try {
    const generation = await generateFilesWithAi({
      projectName: project.name,
      prompt: req.body?.useLastPlan && lastPlan ? `${lastPlan}\n\nUser confirmed build: ${prompt}` : prompt,
      modelId: req.body?.modelId || project.model_id || 'auto',
      existingFiles,
    });

    const mergedByPath = new Map<string, GeneratedFile>();
    existingFiles.forEach(file => mergedByPath.set(file.path, file));
    generation.files.forEach(file => mergedByPath.set(file.path, file));
    const files = Array.from(mergedByPath.values()).sort((a, b) => a.path.localeCompare(b.path));

    let pipeline = runPreviewPipeline(project, files);
    let finalFiles = files;
    let autoFix = null as any;
    if (pipeline.status === 'failed') {
      await Promise.all(pipeline.errors.map(error => saveBuildError(project, error)));
      const fix = applyAutoFix(project, files, pipeline.errors);
      autoFix = fix.patch;
      if (fix.fixed) {
        finalFiles = fix.files;
        pipeline = runPreviewPipeline(project, finalFiles);
      }
    }
    const previewHtml = pipeline.html;
    const updatedProject: GeneratedProject = {
      ...project,
      prompt,
      model_id: generation.model,
      status: 'generated',
      preview_status: pipeline.status,
      preview_html: previewHtml,
      updated_at: new Date().toISOString(),
    };

    await saveProject(updatedProject, finalFiles);
    const diff = diffFiles(existingFiles, finalFiles);
    await createProjectVersion(updatedProject, finalFiles, prompt, diff);
    if (autoFix) await saveProjectPatch(updatedProject, autoFix);

    const finalCost = costEstimator.calculateRequiredCredits({
      openrouter_cost_usd: generation.cost_usd,
      infra_cost_usd: 0.0005,
      storage_cost_usd: 0.0001,
      build_cost_usd: 0.001,
      domain_operation_cost_usd: 0,
      minimum_action_credits: 2,
      complexity_surcharge: prompt.length > 400 ? 2 : 0,
    });
    const finalBalance = await helpers.updateWallet(userId, -finalCost.finalCredits);
    await helpers.addLedger(userId, 'usage', -finalCost.finalCredits, finalBalance, `Generated app files with ${generation.model}`, refId);

    res.json({
      success: true,
      intent: decision,
      project: updatedProject,
      files: finalFiles,
      summary: generation.summary,
      model: generation.model,
      diff,
      auto_fix: autoFix,
      errors: pipeline.errors,
      preview: {
        status: pipeline.status,
        html: previewHtml,
      },
      credits: {
        estimated: cost.finalCredits,
        charged: finalCost.finalCredits,
        remaining: finalBalance,
      },
    });
  } catch (error: any) {
    await helpers.addLedger(userId, 'refund', cost.finalCredits, await helpers.getWallet(userId), `Generation failed: ${error.message}`, refId);
    await helpers.addAudit({
      user_id: userId,
      organization_id: userId,
      project_id: project.id,
      requested_model: req.body?.modelId || project.model_id || 'auto',
      reason: `Generation failed: ${error.message}`,
      source: 'builder',
    });

    res.status(error.message?.includes('not configured') ? 503 : 500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/projects/:id/generate/stream', async (req: any, res: any) => {
  try {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required.' });
  if (!requireProjectCapability(req, res, 'build')) return;
  if (!enforceRateLimit(`stream:${userId}`, 12, 60_000)) {
    return res.status(429).json({ success: false, error: 'Too many build requests. Please wait a moment.' });
  }
  if (isAbusivePrompt(prompt)) {
    return res.status(400).json({ success: false, error: 'This request cannot be generated safely.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let sequence = 0;
  const send = async (event_type: string, message: string, payload: Record<string, unknown> = {}) => {
    sequence += 1;
    const event = await saveAgentEvent({
      organization_id: project.organization_id,
      project_id: project.id,
      user_id: userId,
      sequence_number: sequence,
      event_type,
      message,
      payload,
    });

    res.write(`event: ${event_type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const helpers = getDbHelpers();
  const wallet = await helpers.getWallet(userId);
  const existingFiles = await loadProjectFiles(project.id);
  const lastPlan = await getLastProjectPlan(project.id);
  const decision = intentRouter.decide({
    prompt,
    requestedMode: req.body?.requestedMode || 'build',
    hasFiles: existingFiles.length > 0,
    lastPlan,
  });
  const estimate = estimateActionCost(prompt, decision);
  await saveProjectMessage({
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    role: 'user',
    content: prompt,
    intent: decision.intent,
    requested_mode: decision.requestedMode,
  });
  await send('intent_detected', decision.userVisibleReason, { intent: decision });

  if (wallet < estimate.finalCredits) {
    await send('credits_insufficient', 'Credits are not enough for this action.', { code: 'InsufficientCreditsError', required: estimate.finalCredits, balance: wallet });
    res.end();
    return;
  }

  if (decision.intent === 'conversation' || decision.intent === 'clarification_required' || decision.intent === 'plan') {
    const eventName = decision.intent === 'plan'
      ? 'planning'
      : decision.intent === 'clarification_required'
        ? 'clarification_required'
        : 'answering';
    const content = decision.intent === 'plan'
      ? createPlanResponse(project, prompt, existingFiles)
      : decision.intent === 'clarification_required'
        ? createClarificationContent(decision)
        : createConversationResponse(project, prompt);
    await saveProjectMessage({
      organization_id: project.organization_id,
      project_id: project.id,
      user_id: userId,
      role: 'assistant',
      content,
      intent: decision.intent,
      requested_mode: decision.requestedMode,
    });
    await send(eventName, content, {
      text: content,
      question: decision.clarification?.question,
      choices: decision.clarification?.choices || [],
      recommendation: decision.clarification?.recommendation,
      original_prompt: prompt,
      preview: { status: project.preview_status || 'idle', html: project.preview_html || renderPreviewHtml(existingFiles, project.name) },
      files: existingFiles,
      credits: { estimated: estimate.finalCredits, charged: 0, remaining: wallet },
    });
    await send('done', 'No file changes were made.', {});
    res.end();
    return;
  }

  const requirements = detectExternalApiRequirements(prompt);
  if (requirements.length && !req.body?.skipExternalKeys && !req.body?.externalKeysConfirmed) {
    await send('external_api_keys_required', 'This build can connect external APIs before continuing.', { requirements });
    await send('waiting_for_api_keys', 'Waiting for API keys or skip confirmation.', {});
    res.end();
    return;
  }
  if (requirements.length && req.body?.skipExternalKeys) {
    for (const item of requirements) {
      await saveProjectSecret(project, item.service, item.variable, '', 'skipped');
    }
    await send('api_keys_skipped', 'Continuing with safe placeholders for external APIs.', { requirements });
  }

  const refId = `gen_${randomUUID()}`;
  const buildSession = await createBuildSession(project, userId);
  const buildSessionId = buildSession.id;
  await helpers.createReservation(userId, estimate.finalCredits, refId);

  try {
    await send('queued', 'Generation queued.', { estimated_credits: estimate.finalCredits, build_session_id: buildSessionId });
    await send('routing', 'Selecting the model and preparing project context.', { mode: req.body?.modelId || project.model_id || 'auto' });

    const hasLiveKey = Boolean(process.env.OPENROUTER_API_KEY);
    let generatedText = '';
    let model = req.body?.modelId && req.body.modelId !== 'auto'
      ? String(req.body.modelId)
      : 'anthropic/claude-sonnet-4.6';
    let costUsd = 0;

    if (!hasLiveKey) {
      throw new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY on Railway to enable live generation.');
    } else {
      const selectedModel = model;
      validateAllowedModel(selectedModel);

      await send('model_started', `Streaming response from ${selectedModel}.`, { model: selectedModel });
      const messages = buildGenerationMessages({ projectName: project.name, prompt: req.body?.useLastPlan && lastPlan ? `${lastPlan}\n\nUser confirmed build: ${prompt}` : prompt, existingFiles });

      for await (const event of openRouter.streamChat(selectedModel, messages)) {
        const session = await getBuildSession(buildSessionId);
        if (session?.status === 'cancelled') {
          await send('cancelled', 'Build cancelled by user.', { build_session_id: buildSessionId });
          res.end();
          return;
        }
        if (event.type === 'token') {
          generatedText += event.text;
          model = event.model;
          await send('token', event.text, { model: event.model });
        } else {
          model = event.model;
          costUsd = event.cost_usd;
          await send('usage', 'Token usage received.', { model: event.model, usage: event.usage, cost_usd: event.cost_usd });
        }
      }
    }

    await send('build_started', 'Normalizing generated files and building preview.', {});
    const parsed = parseGeneratedOutput(project.name, generatedText);

    const mergedByPath = new Map<string, GeneratedFile>();
    existingFiles.forEach(file => mergedByPath.set(file.path, file));
    parsed.files.forEach(file => mergedByPath.set(file.path, file));
    let files = Array.from(mergedByPath.values()).sort((a, b) => a.path.localeCompare(b.path));
    await send('files_changed', 'Generated files were merged into the project.', { diff: diffFiles(existingFiles, files) });
    await send('preview_building', 'Building preview sandbox.', {});
    let pipeline = runPreviewPipeline(project, files);
    let autoFix = null as any;
    if (pipeline.status === 'failed') {
      await send('error_detected', pipeline.errors[0]?.message || 'Preview build failed.', { errors: pipeline.errors });
      await Promise.all(pipeline.errors.map(error => saveBuildError(project, error)));
      for (let attempt = 1; attempt <= 2 && pipeline.status === 'failed'; attempt += 1) {
        await send('auto_fix_started', `Auto-fix attempt ${attempt} started.`, { attempt });
        const fix = applyAutoFix(project, files, pipeline.errors);
        autoFix = fix.patch;
        if (!fix.fixed) break;
        files = fix.files;
        await send('patch_applied', fix.patch?.summary || 'Targeted patch applied.', { patch: fix.patch });
        pipeline = runPreviewPipeline(project, files);
      }
      if (pipeline.status === 'ready') {
        await send('auto_fix_succeeded', 'Auto-fix succeeded and preview is ready.', { patch: autoFix });
      } else {
        await send('auto_fix_failed', 'Auto-fix could not resolve every issue.', { errors: pipeline.errors });
      }
    }
    const previewHtml = pipeline.html;

    const updatedProject: GeneratedProject = {
      ...project,
      prompt,
      model_id: model,
      status: 'generated',
      preview_status: pipeline.status,
      preview_html: previewHtml,
      updated_at: new Date().toISOString(),
    };

    await saveProject(updatedProject, files);
    const diff = diffFiles(existingFiles, files);
    await createProjectVersion(updatedProject, files, prompt, diff);
    if (autoFix) await saveProjectPatch(updatedProject, autoFix);

    const finalCost = costEstimator.calculateRequiredCredits({
      openrouter_cost_usd: costUsd,
      infra_cost_usd: 0.0005,
      storage_cost_usd: 0.0001,
      build_cost_usd: 0.001,
      domain_operation_cost_usd: 0,
      minimum_action_credits: 2,
      complexity_surcharge: prompt.length > 400 ? 2 : 0,
    });
    const finalBalance = await helpers.updateWallet(userId, -finalCost.finalCredits);
    await helpers.addLedger(userId, 'usage', -finalCost.finalCredits, finalBalance, `Generated app files with ${model}`, refId);

    await send('preview_ready', parsed.summary, {
      project: updatedProject,
      files,
      preview: { status: pipeline.status, html: previewHtml },
      model,
      diff,
      auto_fix: autoFix,
      errors: pipeline.errors,
      credits: {
        estimated: estimate.finalCredits,
        charged: finalCost.finalCredits,
        remaining: finalBalance,
      },
    });

    await updateBuildSessionStatus(buildSessionId, 'completed');
    await send('done', 'Generation completed.', {});
    res.end();
  } catch (error: any) {
    await updateBuildSessionStatus(buildSessionId, 'failed').catch(() => null);
    await helpers.addLedger(userId, 'refund', estimate.finalCredits, await helpers.getWallet(userId), `Generation failed: ${error.message}`, refId);
    await helpers.addAudit({
      user_id: userId,
      organization_id: userId,
      project_id: project.id,
      requested_model: req.body?.modelId || project.model_id || 'auto',
      reason: `Streaming generation failed: ${error.message}`,
      source: 'builder_stream',
    });

    console.error('[huggy:generate_stream_failed]', {
      project_id: project.id,
      user_id: userId,
      model: req.body?.modelId || project.model_id || 'auto',
      message: error.message,
    });
    await send('error', normalizeProviderError(error), { code: 'GenerationFailed' });
    res.end();
  }
  } catch (error: any) {
    const message = normalizeProviderError(error);
    console.error('[huggy:generate_stream_preflight_failed]', {
      project_id: req.params?.id,
      user_id: req.user?.id,
      message: error?.message || String(error),
    });
    if (!res.headersSent) {
      const status = error?.statusCode || (String(error?.message || '').includes('requires SUPABASE_SERVICE_ROLE_KEY') ? 503 : 500);
      return res.status(status).json({ success: false, error: message, message });
    }
    res.write('event: error\n');
    res.write(`data: ${JSON.stringify({
      event_type: 'error',
      message,
      payload: { code: 'GenerationFailed' },
      created_at: new Date().toISOString(),
    })}\n\n`);
    res.end();
  }
});

app.post('/api/projects/:id/preview', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const files = await loadProjectFiles(project.id);
  const html = renderPreviewHtml(files, project.name);
  const updatedProject = {
    ...project,
    preview_status: 'ready',
    preview_html: html,
    updated_at: new Date().toISOString(),
  };
  await saveProject(updatedProject, files);

  res.json({
    success: true,
    preview: {
      status: 'ready',
      html,
    },
    files,
  });
});

app.post('/api/projects/:id/build/cancel', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const buildSessionId = String(req.body?.buildSessionId || '');
  if (buildSessionId) await updateBuildSessionStatus(buildSessionId, 'cancelled', { cancelled_at: new Date().toISOString() });
  await saveAgentEvent({
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    sequence_number: Date.now(),
    event_type: 'cancelled',
    message: 'Build cancelled by user.',
    payload: { build_session_id: buildSessionId },
  });
  res.json({ success: true, status: 'cancelled' });
});

app.post('/api/projects/:id/build/resume', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  res.json({
    success: true,
    message: 'Resume is ready. Send the original prompt again with confirmedCost or externalKeysConfirmed.',
    project_id: project.id,
  });
});

app.get('/api/projects/:id/versions', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const versions = await listProjectVersions(project.id);
  res.json({ success: true, versions });
});

app.post('/api/projects/:id/versions/:versionId/rollback', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  if (!requireProjectCapability(req, res, 'build')) return;
  const versions = await listProjectVersions(project.id);
  const version = versions.find((item: any) => item.id === req.params.versionId);
  if (!version) return res.status(404).json({ success: false, error: 'Version not found.' });
  const files = normalizeGeneratedFiles(version.files_snapshot || []);
  const pipeline = runPreviewPipeline(project, files);
  const updatedProject = { ...project, preview_status: pipeline.status, preview_html: pipeline.html, updated_at: new Date().toISOString() };
  await saveProject(updatedProject, files);
  await createProjectVersion(updatedProject, files, `Rollback to v${version.version_number}`, { rollback_to: version.id });
  res.json({ success: true, project: updatedProject, files, preview: { status: pipeline.status, html: pipeline.html } });
});

app.get('/api/projects/:id/diff', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const versions = await listProjectVersions(project.id);
  res.json({ success: true, diff: versions[0]?.diff_summary || { created: [], modified: [], deleted: [], summary: 'No diff yet' } });
});

app.get('/api/projects/:id/database', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const files = await loadProjectFiles(project.id);
  const schemaFile = files.find(file => file.path === 'supabase/schema.sql');
  const secrets = await listProjectSecrets(project.id);
  const client = requireSupabase('Project database view');
  const { data: integrations = [] } = await client.from('project_integrations').select('*').eq('project_id', project.id).order('updated_at', { ascending: false });
  const { data: assets = [] } = await client.from('project_assets').select('id, name, url, kind, created_at').eq('project_id', project.id).order('created_at', { ascending: false });
  const { data: activity = [] } = await client.from('agent_events').select('event_type, message, created_at').eq('project_id', project.id).order('created_at', { ascending: false }).limit(8);
  const tableMatches = [...(schemaFile?.content || '').matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi)];
  const tables = tableMatches.length
    ? tableMatches.map(match => ({ name: match[1], rows: 0, source: 'supabase/schema.sql', columns: [] }))
    : [{ name: 'project_files', rows: files.length, source: 'huggy_control_db', columns: ['path', 'language', 'updated_at'] }];
  res.json({
    success: true,
    database: {
      project_id: project.id,
      backend_status: schemaFile ? 'schema_generated' : 'waiting_for_schema',
      mode: 'shared_supabase_project',
      rls_status: 'enabled_required',
      last_sync_at: project.updated_at,
      tables,
      records_preview: files.slice(0, 5).map(file => ({ table: 'project_files', path: file.path, language: file.language || 'text', updated_at: file.updated_at || project.updated_at })),
      schema: schemaFile?.content || '-- No project schema generated yet.',
      secrets,
      integrations,
      assets,
      storage: { bucket: 'project-assets', assets_count: assets.length },
      activity,
      security: { rls_required: true, secrets_masked: true, service_role_server_only: true },
    },
  });
});

app.get('/api/projects/:id/database/tables', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const files = await loadProjectFiles(project.id);
  const schemaFile = files.find(file => file.path === 'supabase/schema.sql');
  res.json({ success: true, tables: schemaFile ? [{ name: 'app_records', rows: 0, schema: schemaFile.content }] : [] });
});

app.get('/api/projects/:id/database/secrets', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const secrets = await listProjectSecrets(project.id);
  res.json({ success: true, secrets });
});

app.post('/api/projects/:id/database/secrets', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  if (!requireProjectCapability(req, res, 'secrets')) return;
  if (!enforceRateLimit(`secret:${userId}`, 20, 60_000)) {
    return res.status(429).json({ success: false, error: 'Too many secret updates.' });
  }
  const row = await saveProjectSecret(project, String(req.body?.service || 'Custom'), String(req.body?.variable || 'CUSTOM_API_KEY'), String(req.body?.value || ''), 'configured');
  res.json({ success: true, secret: row });
});

app.post('/api/projects/:id/external-keys', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  if (!requireProjectCapability(req, res, 'secrets')) return;
  const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
  const saved = [];
  for (const item of keys) {
    saved.push(await saveProjectSecret(project, String(item.service || 'Custom'), String(item.variable || 'CUSTOM_API_KEY'), String(item.value || ''), item.skip ? 'skipped' : 'configured'));
  }
  res.json({ success: true, secrets: saved });
});

app.delete('/api/projects/:id/database/secrets/:secretId', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  if (!requireProjectCapability(req, res, 'secrets')) return;
  const client = requireSupabase('Project secret deletion');
  const { error } = await client.from('project_secrets').delete().eq('id', req.params.secretId).eq('project_id', project.id);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
});

function sanitizeAssetName(value: unknown) {
  const raw = String(value || 'asset').trim();
  return raw
    .replace(/[\\/]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '-')
    .slice(0, 120) || 'asset';
}

function decodeAssetPayload(contentBase64: unknown) {
  if (typeof contentBase64 !== 'string' || !contentBase64.trim()) return null;
  const clean = contentBase64.replace(/^data:[^;]+;base64,/i, '').trim();
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(clean)) {
    throw new Error('Invalid asset encoding.');
  }
  const buffer = Buffer.from(clean, 'base64');
  if (!buffer.length) throw new Error('Asset file is empty.');
  if (buffer.length > MAX_PROJECT_ASSET_BYTES) {
    throw new Error('Asset is too large. Maximum file size is 4 MB.');
  }
  return buffer;
}

app.post('/api/projects/:id/assets', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  if (!requireProjectCapability(req, res, 'build')) return;

  const client = requireSupabase('Project asset persistence');
  const id = randomUUID();
  const name = sanitizeAssetName(req.body?.name);
  const mimeType = String(req.body?.mime_type || req.body?.mimeType || 'application/octet-stream').toLowerCase();
  if (!ALLOWED_PROJECT_ASSET_MIME.has(mimeType)) {
    return res.status(400).json({ success: false, error: 'Unsupported asset type.' });
  }

  let url = String(req.body?.url || '');
  let storagePath = '';
  let sizeBytes = Number(req.body?.size_bytes || req.body?.size || 0) || 0;
  let status = url ? 'linked' : 'configured';

  try {
    const buffer = decodeAssetPayload(req.body?.content_base64 || req.body?.contentBase64);
    if (buffer) {
      sizeBytes = buffer.length;
      storagePath = `${project.id}/${id}-${name}`;
      const { error: uploadError } = await client.storage
        .from('project-assets')
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: false,
        });
      if (uploadError) {
        return res.status(500).json({
          success: false,
          error: 'Project asset storage is not configured. Create the Supabase Storage bucket "project-assets" and retry.',
        });
      }
      const { data: publicUrl } = client.storage.from('project-assets').getPublicUrl(storagePath);
      url = publicUrl?.publicUrl || '';
      status = 'uploaded';
    }
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Invalid asset payload.' });
  }

  const fullAsset = {
    id,
    organization_id: project.organization_id,
    project_id: project.id,
    name,
    url,
    kind: String(req.body?.kind || (mimeType.startsWith('image/') ? 'image' : 'file')),
    mime_type: mimeType,
    size_bytes: sizeBytes,
    status,
    storage_path: storagePath || null,
    created_at: new Date().toISOString(),
  };

  let { error } = await client.from('project_assets').insert([fullAsset]);
  if (error && /mime_type|size_bytes|status|storage_path/i.test(error.message || '')) {
    const compactAsset = {
      id: fullAsset.id,
      organization_id: fullAsset.organization_id,
      project_id: fullAsset.project_id,
      name: fullAsset.name,
      url: fullAsset.url,
      kind: fullAsset.kind,
      created_at: fullAsset.created_at,
    };
    const retry = await client.from('project_assets').insert([compactAsset]);
    error = retry.error;
  }
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, asset: fullAsset });
});

app.get('/api/projects/:id/export', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const files = await loadProjectFiles(project.id);
  const zip = createZipBuffer(files.length ? files : createTemplateFiles(project.name, project.prompt || project.name));
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${project.slug || 'huggy-app'}.zip"`);
  res.send(zip);
});

// GET /projects/:id/domains
app.get('/api/projects/:id/domains', async (req, res) => {
  const projectId = req.params.id;
  const client = requireSupabase('Domain listing');
  const { data, error } = await client.from('domains').select('*').eq('project_id', projectId).neq('status', 'removed');
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, domains: data || [] });
});

// POST /projects/:id/domains
app.post('/api/projects/:id/domains', async (req: any, res: any) => {
  const projectId = req.params.id;
  const { domain, type, orgId = DEFAULT_ORG_ID, plan = 'starter' } = req.body;

  try {
    const vercelProxy = createVercelDomainProxy();
    const domainService = new DomainService(requireSupabase('Domain creation'), vercelProxy);
    const records = await domainService.registerDomain(orgId, projectId, domain, type || 'custom', plan as any);
    return res.json({ success: true, domain: records });
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
    const vercelProxy = createVercelDomainProxy();
    const domainService = new DomainService(requireSupabase('Domain verification'), vercelProxy);
    const result = await domainService.verifyDnsRecords(projectId, domainId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /projects/:id/domains/:domainId
app.delete('/api/projects/:id/domains/:domainId', async (req, res) => {
  const projectId = req.params.id;
  const domainId = req.params.domainId;

  try {
    const vercelProxy = createVercelDomainProxy();
    const domainService = new DomainService(requireSupabase('Domain deletion'), vercelProxy);
    await domainService.removeDomain(projectId, domainId);
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
    const vercelProxy = createVercelDomainProxy();
    const domainService = new DomainService(requireSupabase('Primary domain update'), vercelProxy);
    await domainService.setPrimaryDomain(projectId, domainId);
    res.json({ success: true, message: 'Primary domain updated.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 4. DEPLOYMENTS ENDPOINTS
// ──────────────────────────────────────────────────────────────────────

// POST /projects/:id/deploy
app.post('/api/projects/:id/deploy', async (req: any, res: any) => {
  const projectId = req.params.id;
  const userId = getUserOrgId(req);
  const { commitHash, branch = 'main', userCredits = 100 } = req.body;
  if (!requireProjectCapability(req, res, 'deploy')) return;
  if (!enforceRateLimit(`deploy:${userId}`, 6, 60_000)) {
    return res.status(429).json({ success: false, error: 'Too many deploy requests. Please wait a moment.' });
  }

  if (userCredits < 2) {
    return res.status(200).json({
      success: false,
      event: 'credits_insufficient',
      error: 'Insufficient credits',
      credits: { required: 2, balance: userCredits },
    });
  }

  const project = await loadProject(projectId, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  if (project.preview_status !== 'ready') {
    return res.status(409).json({ success: false, error: 'Preview must be ready before deployment.' });
  }

  const files = await loadProjectFiles(projectId);
  if (files.length === 0) {
    return res.status(400).json({ success: false, error: 'Generate files before deploying this project.' });
  }

  try {
    const result = await deployFilesToVercel(project, files);
    const deploy = {
      id: randomUUID(),
      organization_id: project.organization_id,
      project_id: projectId,
      provider: 'vercel',
      provider_deployment_id: result.provider_deployment_id,
      deployment_url: result.deployment_url,
      status: result.status === 'ready' ? 'ready' : result.status,
      commit_hash: commitHash || null,
      branch,
      created_at: new Date().toISOString(),
    };

    await saveDeploymentRecord(deploy);
    res.json({ success: true, deployment: deploy });
  } catch (error: any) {
    res.status(error.message?.includes('not configured') ? 503 : 502).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /projects/:id/deployments
app.get('/api/projects/:id/deployments', async (req: any, res) => {
  const projectId = req.params.id;
  const client = requireSupabase('Deployment listing');
  const { data, error } = await client.from('deployments').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, deployments: data || [] });
});

// Static files (frontend)
app.use(express.static(pathExists(staticRoot) ? staticRoot : __dirname));

function pathExists(target: string): boolean {
  try {
    return Boolean(target && path.isAbsolute(target) && fs.existsSync(target));
  } catch {
    return false;
  }
}

app.listen(port, () => {
  console.log(`Huggy SaaS backend listening at http://localhost:${port}`);
});
