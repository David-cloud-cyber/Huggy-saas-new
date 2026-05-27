import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const DEFAULT_SUPABASE_URL = 'https://notgpriaragtiahcqjoa.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rp4hpA--fkybGy0GczSMvA_KU9BitSa';
const staticRoot = path.join(__dirname, 'dist');

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

// ── LOCAL IN-MEMORY BACKUP DATA STORES (For instant developer previews with zero credentials) ──
const SIM_WALLETS = new Map<string, { balance: number; updated_at: string }>();
const SIM_LEDGERS: any[] = [];
const SIM_RESERVATIONS = new Map<string, any>();
const SIM_DOMAINS: any[] = [];
const SIM_DEPLOYMENTS: any[] = [];
const SIM_USER_PREFS = new Map<string, any>();
const SIM_PROJECT_PREFS = new Map<string, any>();
const SIM_AUDITS: any[] = [];
const SIM_PROJECTS = new Map<string, GeneratedProject>();
const SIM_PROJECT_FILES = new Map<string, GeneratedFile[]>();

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

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

function allowSimulation(): boolean {
  return !isProductionRuntime() || process.env.HUGGY_ALLOW_SIMULATION === 'true';
}

function assertSimulationAllowed(feature: string) {
  if (!allowSimulation()) {
    throw new Error(`${feature} requires live configuration in production. Configure Supabase/OpenRouter/Vercel/Stripe instead of using simulated data.`);
  }
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

function getUserOrgId(req: any): string {
  return req.user?.id || DEFAULT_ORG_ID;
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

function uniqueSlug(base: string): string {
  const candidate = slugify(base);
  const existing = new Set(Array.from(SIM_PROJECTS.values()).map(project => project.slug));
  if (!existing.has(candidate)) return candidate;
  return `${candidate}-${Math.random().toString(36).slice(2, 6)}`;
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
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: #f8fafc; background: #09090b; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 40px 18px; background:
      radial-gradient(circle at top left, rgba(20,184,166,.18), transparent 32%),
      linear-gradient(135deg, #09090b, #111827 52%, #020617); }
    section { width: min(960px, 100%); border: 1px solid rgba(255,255,255,.12); background: rgba(15,23,42,.78); border-radius: 18px; padding: clamp(24px, 5vw, 56px); box-shadow: 0 30px 90px rgba(0,0,0,.45); }
    .eyebrow { color: #5eead4; text-transform: uppercase; letter-spacing: .14em; font-size: 12px; font-weight: 700; }
    h1 { margin: 14px 0 12px; font-size: clamp(34px, 7vw, 76px); line-height: .96; letter-spacing: 0; }
    p { max-width: 680px; color: #cbd5e1; font-size: clamp(16px, 2.4vw, 21px); line-height: 1.7; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 28px; }
    .card { border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 16px; background: rgba(255,255,255,.05); }
    .card strong { display:block; margin-bottom: 6px; }
    a { display: inline-flex; margin-top: 28px; padding: 13px 18px; border-radius: 10px; color: #051311; background: #5eead4; text-decoration: none; font-weight: 800; }
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

async function generateFilesWithAi(input: {
  projectName: string;
  prompt: string;
  modelId?: string;
  existingFiles: GeneratedFile[];
}): Promise<{ files: GeneratedFile[]; summary: string; model: string; cost_usd: number }> {
  const hasLiveKey = Boolean(process.env.OPENROUTER_API_KEY);
  if (!hasLiveKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY on Railway to enable live generation.');
    }
    return {
      files: createTemplateFiles(input.projectName, input.prompt),
      summary: 'Generated a local development template because OpenRouter is not configured.',
      model: 'local-template',
      cost_usd: 0,
    };
  }

  const selectedModel = input.modelId && input.modelId !== 'auto' ? input.modelId : 'anthropic/claude-sonnet-4.6';
  validateAllowedModel(selectedModel);

  const fileManifest = input.existingFiles
    .map(file => `${file.path} (${file.content.length} chars)`)
    .slice(0, 40)
    .join('\n');

  const result = await openRouter.chat(selectedModel, [
    {
      role: 'system',
      content: [
        'You are Huggy, a senior fullstack app generator.',
        'Return only valid JSON with this exact shape: {"summary":string,"files":[{"path":string,"content":string,"language":string}],"backendSchema":string,"tests":string[]}.',
        'Generate a deployable static Vercel v1 app with a self-contained index.html for live preview.',
        'Include Supabase backend schema in supabase/schema.sql when the app needs data.',
        'Never include secrets, .env files, lockfiles, node_modules, absolute paths, or path traversal.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        projectName: input.projectName,
        prompt: input.prompt,
        existingFiles: fileManifest || 'No existing files yet.',
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

  return [
    {
      role: 'system' as const,
      content: [
        'You are Huggy, a senior fullstack app generator.',
        'Return only valid JSON with this exact shape: {"summary":string,"files":[{"path":string,"content":string,"language":string}],"backendSchema":string,"tests":string[]}.',
        'Generate a deployable static Vercel v1 app with a self-contained index.html for live preview.',
        'Include Supabase backend schema in supabase/schema.sql when the app needs data.',
        'Never include secrets, .env files, lockfiles, node_modules, absolute paths, or path traversal.',
      ].join(' '),
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        projectName: input.projectName,
        prompt: input.prompt,
        existingFiles: fileManifest || 'No existing files yet.',
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
  const client = getSupabase();
  if (!client) assertSimulationAllowed('Project persistence');

  SIM_PROJECTS.set(project.id, project);
  if (files) SIM_PROJECT_FILES.set(project.id, files);

  if (!client) return project;

  const { error } = await client.from('projects').upsert([project]);
  if (error) {
    console.warn(`Supabase project persistence skipped: ${error.message}`);
    return project;
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
    if (fileError) console.warn(`Supabase project file persistence skipped: ${fileError.message}`);
  }

  return project;
}

async function loadProject(projectId: string, userId: string): Promise<GeneratedProject | null> {
  const client = getSupabase();
  if (client) {
    const { data, error } = await client.from('projects').select('*').eq('id', projectId).eq('owner_id', userId).maybeSingle();
    if (!error && data) return data as GeneratedProject;
    if (error) console.warn(`Supabase project load skipped: ${error.message}`);
  }

  assertSimulationAllowed('Project loading');

  const project = SIM_PROJECTS.get(projectId);
  if (!project || project.owner_id !== userId) return null;
  return project;
}

async function listProjectsForUser(userId: string): Promise<GeneratedProject[]> {
  const client = getSupabase();
  if (client) {
    const { data, error } = await client.from('projects').select('*').eq('owner_id', userId).order('updated_at', { ascending: false });
    if (!error && data) return data as GeneratedProject[];
    if (error) console.warn(`Supabase project listing skipped: ${error.message}`);
  }
  assertSimulationAllowed('Project listing');
  return Array.from(SIM_PROJECTS.values()).filter(project => project.owner_id === userId).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function loadProjectFiles(projectId: string): Promise<GeneratedFile[]> {
  const client = getSupabase();
  if (client) {
    const { data, error } = await client.from('project_files').select('path, content, language, updated_at').eq('project_id', projectId).order('path');
    if (!error && data) return data as GeneratedFile[];
    if (error) console.warn(`Supabase project files load skipped: ${error.message}`);
  }
  assertSimulationAllowed('Project file loading');
  return SIM_PROJECT_FILES.get(projectId) || [];
}

async function saveDeploymentRecord(record: any) {
  const client = getSupabase();
  if (!client) assertSimulationAllowed('Deployment persistence');

  SIM_DEPLOYMENTS.unshift(record);
  if (!client) return;
  const { error } = await client.from('deployments').insert([record]);
  if (error) console.warn(`Supabase deployment persistence skipped: ${error.message}`);
}

async function saveAgentEvent(event: AgentEvent) {
  const row = {
    ...event,
    id: event.id || randomUUID(),
    payload: event.payload || {},
    created_at: event.created_at || new Date().toISOString(),
  };

  const client = getSupabase();
  if (client) {
    const { error } = await client.from('agent_events').insert([row]);
    if (error) console.warn(`Supabase agent event persistence skipped: ${error.message}`);
  } else {
    assertSimulationAllowed('Agent event persistence');
  }

  return row;
}

function getVercelToken(): string {
  return process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || '';
}

function createVercelDomainProxy() {
  const token = getVercelToken();
  if (!token) {
    assertSimulationAllowed('Vercel domain operations');
    return new VercelDomainService('mock-vercel-token');
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

// Wrapper to safely access DB status or simulated state
function getDbHelpers() {
  const client = getSupabase();
  return {
    getWallet: async (orgId: string) => {
      if (client) {
        const { data } = await client.from('credit_wallets').select('balance').eq('organization_id', orgId).maybeSingle();
        return data ? parseFloat(data.balance) : 0;
      }
      assertSimulationAllowed('Credit wallet');
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
        assertSimulationAllowed('Credit wallet update');
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
        assertSimulationAllowed('Credit ledger');
        SIM_LEDGERS.unshift(log);
      }
    },
    addAudit: async (data: any) => {
      if (client) {
        await client.from('audit_logs').insert([{ ...data, created_at: new Date().toISOString() }]);
      } else {
        assertSimulationAllowed('Audit log');
        SIM_AUDITS.unshift({ ...data, id: String(SIM_AUDITS.length + 1), created_at: new Date().toISOString() });
      }
    },
    createReservation: async (orgId: string, amount: number, refId: string) => {
      const expires_at = new Date(Date.now() + 15 * 60000).toISOString();
      const res = { id: `res_${Math.random().toString(36).substring(2, 11)}`, wallet_id: orgId, amount, status: 'reserved', reference_id: refId, expires_at };
      if (client) {
        await client.from('credit_reservations').insert([res]);
      } else {
        assertSimulationAllowed('Credit reservation');
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
    slug: uniqueSlug(name),
    prompt,
    template: String(req.body?.template || 'custom'),
    theme: String(req.body?.theme || 'dark'),
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
  res.json({
    success: true,
    project,
    files,
    preview: {
      status: project.preview_status || 'idle',
      html: project.preview_html || renderPreviewHtml(files, project.name),
    },
  });
});

app.post('/api/projects/:id/generate', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required.' });

  const helpers = getDbHelpers();
  const wallet = await helpers.getWallet(userId);
  const cost = costEstimator.calculateRequiredCredits({
    openrouter_cost_usd: 0.002,
    infra_cost_usd: 0.0005,
    storage_cost_usd: 0.0001,
    build_cost_usd: 0.001,
    domain_operation_cost_usd: 0,
    minimum_action_credits: 2,
    complexity_surcharge: prompt.length > 400 ? 2 : 0,
  });

  if (wallet < cost.finalCredits) {
    return res.status(402).json({
      success: false,
      error: 'InsufficientCreditsError',
      message: `Your balance (${wallet} credits) is below the required ${cost.finalCredits} credits.`,
    });
  }

  const refId = `gen_${randomUUID()}`;
  await helpers.createReservation(userId, cost.finalCredits, refId);

  try {
    const existingFiles = await loadProjectFiles(project.id);
    const generation = await generateFilesWithAi({
      projectName: project.name,
      prompt,
      modelId: req.body?.modelId || project.model_id || 'auto',
      existingFiles,
    });

    const mergedByPath = new Map<string, GeneratedFile>();
    existingFiles.forEach(file => mergedByPath.set(file.path, file));
    generation.files.forEach(file => mergedByPath.set(file.path, file));
    const files = Array.from(mergedByPath.values()).sort((a, b) => a.path.localeCompare(b.path));

    const previewHtml = renderPreviewHtml(files, project.name);
    const updatedProject: GeneratedProject = {
      ...project,
      prompt,
      model_id: generation.model,
      status: 'generated',
      preview_status: 'ready',
      preview_html: previewHtml,
      updated_at: new Date().toISOString(),
    };

    await saveProject(updatedProject, files);

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
      project: updatedProject,
      files,
      summary: generation.summary,
      model: generation.model,
      preview: {
        status: 'ready',
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
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required.' });

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
  const estimate = costEstimator.calculateRequiredCredits({
    openrouter_cost_usd: 0.002,
    infra_cost_usd: 0.0005,
    storage_cost_usd: 0.0001,
    build_cost_usd: 0.001,
    domain_operation_cost_usd: 0,
    minimum_action_credits: 2,
    complexity_surcharge: prompt.length > 400 ? 2 : 0,
  });

  if (wallet < estimate.finalCredits) {
    await send('error', 'Insufficient credits for this generation.', { code: 'InsufficientCreditsError', required: estimate.finalCredits, balance: wallet });
    res.end();
    return;
  }

  const refId = `gen_${randomUUID()}`;
  await helpers.createReservation(userId, estimate.finalCredits, refId);

  try {
    await send('queued', 'Generation queued.', { estimated_credits: estimate.finalCredits });
    await send('routing', 'Selecting the model and preparing project context.', { mode: req.body?.modelId || project.model_id || 'auto' });

    const existingFiles = await loadProjectFiles(project.id);
    const hasLiveKey = Boolean(process.env.OPENROUTER_API_KEY);
    let generatedText = '';
    let model = 'local-template';
    let costUsd = 0;

    if (!hasLiveKey) {
      if (isProductionRuntime()) {
        throw new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY on Railway to enable live generation.');
      }

      await send('tool_call', 'OpenRouter is not configured locally; using development template.', { tool: 'local_template' });
      const local = createTemplateFiles(project.name, prompt);
      generatedText = JSON.stringify({ summary: 'Generated a local development template.', files: local });
    } else {
      const selectedModel = req.body?.modelId && req.body.modelId !== 'auto'
        ? String(req.body.modelId)
        : 'anthropic/claude-sonnet-4.6';
      validateAllowedModel(selectedModel);
      model = selectedModel;

      await send('model_started', `Streaming response from ${selectedModel}.`, { model: selectedModel });
      const messages = buildGenerationMessages({ projectName: project.name, prompt, existingFiles });

      for await (const event of openRouter.streamChat(selectedModel, messages)) {
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
    const files = Array.from(mergedByPath.values()).sort((a, b) => a.path.localeCompare(b.path));
    const previewHtml = renderPreviewHtml(files, project.name);

    const updatedProject: GeneratedProject = {
      ...project,
      prompt,
      model_id: model,
      status: 'generated',
      preview_status: 'ready',
      preview_html: previewHtml,
      updated_at: new Date().toISOString(),
    };

    await saveProject(updatedProject, files);

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
      preview: { status: 'ready', html: previewHtml },
      model,
      credits: {
        estimated: estimate.finalCredits,
        charged: finalCost.finalCredits,
        remaining: finalBalance,
      },
    });

    await send('done', 'Generation completed.', {});
    res.end();
  } catch (error: any) {
    await helpers.addLedger(userId, 'refund', estimate.finalCredits, await helpers.getWallet(userId), `Generation failed: ${error.message}`, refId);
    await helpers.addAudit({
      user_id: userId,
      organization_id: userId,
      project_id: project.id,
      requested_model: req.body?.modelId || project.model_id || 'auto',
      reason: `Streaming generation failed: ${error.message}`,
      source: 'builder_stream',
    });

    await send('error', error.message || 'Generation failed.', { code: 'GenerationFailed' });
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

// GET /projects/:id/domains
app.get('/api/projects/:id/domains', async (req, res) => {
  const projectId = req.params.id;
  const client = getSupabase();
  if (client) {
    const { data } = await client.from('domains').select('*').eq('project_id', projectId).neq('status', 'removed');
    res.json({ success: true, domains: data || [] });
  } else {
    assertSimulationAllowed('Domain listing');
    const projDomains = SIM_DOMAINS.filter(d => d.project_id === projectId && d.status !== 'removed');
    res.json({ success: true, domains: projDomains });
  }
});

// POST /projects/:id/domains
app.post('/api/projects/:id/domains', async (req: any, res: any) => {
  const projectId = req.params.id;
  const { domain, type, orgId = DEFAULT_ORG_ID, plan = 'starter' } = req.body;

  try {
    const vercelProxy = createVercelDomainProxy();
    const domainService = new DomainService(getSupabase(), vercelProxy);

    if (getSupabase()) {
      const records = await domainService.registerDomain(orgId, projectId, domain, type || 'custom', plan as any);
      return res.json({ success: true, domain: records });
    } else {
      assertSimulationAllowed('Domain creation');
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
    const vercelProxy = createVercelDomainProxy();
    const domainService = new DomainService(getSupabase(), vercelProxy);

    if (getSupabase()) {
      const result = await domainService.verifyDnsRecords(projectId, domainId);
      res.json({ success: true, ...result });
    } else {
      assertSimulationAllowed('Domain verification');
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
    const vercelProxy = createVercelDomainProxy();
    const domainService = new DomainService(getSupabase(), vercelProxy);

    if (getSupabase()) {
      await domainService.removeDomain(projectId, domainId);
    } else {
      assertSimulationAllowed('Domain deletion');
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
    const vercelProxy = createVercelDomainProxy();
    const domainService = new DomainService(getSupabase(), vercelProxy);

    if (getSupabase()) {
      await domainService.setPrimaryDomain(projectId, domainId);
    } else {
      assertSimulationAllowed('Primary domain update');
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
app.post('/api/projects/:id/deploy', async (req: any, res: any) => {
  const projectId = req.params.id;
  const userId = getUserOrgId(req);
  const { commitHash, branch = 'main', userCredits = 100 } = req.body;

  if (userCredits < 2) {
    return res.status(402).json({ success: false, error: 'Insufficient credits (2 required for production deployment)' });
  }

  const project = await loadProject(projectId, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

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
  const client = getSupabase();
  if (client) {
    const { data, error } = await client.from('deployments').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    if (!error && data) return res.json({ success: true, deployments: data });
  }
  const list = SIM_DEPLOYMENTS.filter(d => d.project_id === projectId);
  res.json({ success: true, deployments: list });
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
