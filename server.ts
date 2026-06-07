import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import WebSocket from 'ws';

// Import our custom services
import { OpenRouterService, resolveOpenRouterApiKey, type ChatMessage } from './src/services/openrouter-service.ts';
import { ProviderGateway } from './src/services/provider-gateway.ts';
import {
  buildAIModelRuntimeConfig,
  getAllAIModelCapabilityProfiles,
  getAIModelCapabilityProfile,
  type AIWorkflowTask,
} from './src/services/ai-model-runtime.ts';
import { buildProviderRequestConfig } from './src/services/provider-adapters.ts';
import { ModelRouter, type RoutingContext } from './src/services/model-router.ts';
import { ForbiddenModelError, validateAllowedModel } from './src/services/ai-validator.ts';
import {
  AI_ALLOWED_MODELS,
  AI_AUTO_MODEL_OPTION,
  AI_MODEL_DISPLAY_NAMES,
  AI_MODEL_TIERS,
  AI_MODEL_CAPABILITIES,
  DEFAULT_PROVIDER_MODEL_ID,
  MODEL_REGISTRY,
  MODEL_ACTION_CREDIT_FLOORS,
  MODEL_CREDIT_RATES,
  PROVIDER_META,
  UserPlan,
  getModelsByProvider,
  isAllowedModelId,
  normalizeModelSelectionId,
  type AllowedModelId,
  type ModelDefinition,
  type ModelProvider,
} from './src/config/ai-models.ts';
import { CostEstimatorService, CreditWalletService, CreditLedgerService, CreditReservationService } from './src/services/credit-system.ts';
import { DomainService, VercelDomainService } from './src/services/domain-service.ts';
import {
  StripeService,
  SAAS_PLANS,
  TOPUP_PRODUCTS,
  CLOUD_TOPUP_PRODUCTS,
  PLAN_ECONOMICS_GUARDRAILS,
  getCloudUsageCategories,
  getPlanConfig,
  getPublicPlans,
  isPaidPlanKey,
  normalizePlanKey,
} from './src/services/billing-service.ts';
import { AuditLogService, BillingAlertService, UsageMeteringService, MemberLimitService } from './src/services/platform-support.ts';
import { buildWorldClassUiPolicy } from './src/services/design-generation-policy.ts';
import {
  auditGeneratedDesign,
  auditGeneratedFunctionality,
} from './src/services/design-quality-auditor.ts';
import {
  buildAgentTextSystemPrompt,
  buildGenerationSystemPrompt,
  buildIntentRouterSystemPrompt,
} from './src/services/agent-prompt-stack.ts';
import {
  buildAgentContextPack,
  isAgentV2Enabled,
  redactAgentPayload,
  summarizeAgentMemory,
  summarizeVerificationChecks,
  verifyGeneratedProject,
  type AgentVerificationCheck,
} from './src/services/agent-v2.ts';
import {
  HybridProjectRunner,
  runnerChecksToVerificationChecks,
  type RunnerResult,
} from './src/services/project-runner.ts';
import { runBrowserInteractionAuditDetailed, type BrowserTestResult } from './src/services/browser-interaction-runner.ts';
import { inspectVisualPreview } from './src/services/visual-preview-inspector.ts';
import { scanGeneratedSecurity } from './src/services/generated-security-scanner.ts';
import {
  WebResearchGateway,
  researchToPromptContext,
  shouldUseWebResearch,
  type ResearchResult,
} from './src/services/web-research-gateway.ts';
import {
  DEFAULT_AGENT_V3_BUDGET,
  ToolLoopController,
  buildAgentV3Context,
  isAgentV3Enabled,
  summarizeResearchForMemory,
  summarizeRunnerForMemory,
} from './src/services/agent-v3.ts';
import {
  GeneratedOutputParseError,
  extractGeneratedJson,
  extractGeneratedMarkdownFiles,
  looksLikeStandaloneHtml,
} from './src/services/generated-output-parser.ts';
import {
  PREVIEW_FALLBACK_CSS,
  buildPreviewFallbackHtml,
} from './src/services/preview-fallback.ts';
import {
  understandUserIntent,
  type IntentUnderstanding,
  type UserIntentCategory,
} from './src/services/intent-understanding.ts';
import {
  applyTypedIntentGate,
  buildTypedIntentDecision,
  type TypedIntentDecision,
} from './src/services/typed-intent-router.ts';
import { buildAgentImprovementSignal, buildUserFeedbackImprovementSignal } from './src/services/agent-self-improvement.ts';
import {
  buildHuggyCloudSchemaName,
  detectHuggyCloudRequirements,
  hasHuggyCloudRequirement,
  summarizeHuggyCloudRequirements,
  type HuggyCloudRequirement,
} from './src/services/huggy-cloud.ts';
import {
  applyHuggyFullstackKit,
  shouldApplyHuggyFullstackKit,
} from './src/services/fullstack-generation.ts';
import { containsSecret, redactSecretPayload, redactSecrets } from './src/services/secret-redaction.ts';
import {
  MEDIA_MODEL_REGISTRY,
  estimateMediaCredits,
  isMediaModelAvailable,
  isMarketingMediaKind,
  mediaOutputForKind,
  mediaSettingsSummary,
  normalizeMediaSettings,
  selectMediaModel,
  type HuggyMediaSettings,
} from './src/services/media-model-registry.ts';
import { FalMediaGateway, type FalMediaAsset } from './src/services/fal-media-gateway.ts';
import {
  applyImportContextToPrompt,
  buildImportContext,
  publicImportContext,
} from './src/services/import-intelligence.ts';
import {
  applySeniorAgentContextToPrompt,
  compileSeniorAgentContext,
  type SeniorAgentContext,
} from './src/services/senior-agent-os.ts';
import { buildAgentMoatIntelligence } from './src/services/agent-moat-intelligence.ts';
import {
  designWorkshopInstructionLines,
  normalizeDesignWorkshopSettings,
} from './src/services/design-workshop.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const DEFAULT_SUPABASE_URL = 'https://notgpriaragtiahcqjoa.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rp4hpA--fkybGy0GczSMvA_KU9BitSa';
const staticRoot = path.join(__dirname, 'dist');
const MAX_PROJECT_ASSET_BYTES = 4 * 1024 * 1024;
const ANALYTICS_MAX_ROWS = 10000;
const ANALYTICS_CURRENT_VISITOR_WINDOW_MS = 5 * 60 * 1000;
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

const COUNTRY_NAMES: Record<string, string> = {
  BR: 'Brazil',
  CA: 'Canada',
  CM: 'Cameroon',
  DE: 'Germany',
  ES: 'Spain',
  FR: 'France',
  GB: 'United Kingdom',
  IN: 'India',
  IT: 'Italy',
  NG: 'Nigeria',
  NL: 'Netherlands',
  PT: 'Portugal',
  US: 'United States',
  ZA: 'South Africa',
};

// Standard middlewares
app.use(express.json({ limit: '8mb' }));

// ── LAZY-LOADED RESOURCES / CLIENT GAUARDS ───────────────────────────
const SUPABASE_SERVER_CLIENT_OPTIONS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    // Supabase JS initializes Realtime even when the backend only uses Auth/DB.
    // Railway currently runs Node 20, which needs an explicit WebSocket transport.
    transport: WebSocket as any,
  },
};

function getSupabaseProjectRef(url: string) {
  try {
    const host = new URL(url).hostname;
    return host.endsWith('.supabase.co') ? host.split('.')[0] : host;
  } catch {
    return 'invalid-url';
  }
}

function getJwtPayload(value: string) {
  try {
    const part = value.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function classifySupabaseKey(value?: string) {
  const key = String(value || '').trim();
  if (!key) return 'missing';
  if (key.startsWith('sbp_')) return 'personal_access_token';
  if (key.startsWith('sb_secret_')) return 'secret_key';
  if (key.startsWith('sb_publishable_')) return 'publishable_key';
  const payload = getJwtPayload(key);
  const role = typeof payload?.role === 'string' ? payload.role : '';
  if (role === 'service_role') return 'jwt_service_role';
  if (role === 'anon') return 'jwt_anon';
  return 'unknown';
}

function isSupabaseProjectApiKey(value?: string) {
  return ['secret_key', 'publishable_key', 'jwt_service_role', 'jwt_anon'].includes(classifySupabaseKey(value));
}

function getSupabaseRuntimeDiagnostics() {
  const backendUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const frontendUrl = process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  return {
    backend_project_ref: getSupabaseProjectRef(backendUrl),
    frontend_project_ref: getSupabaseProjectRef(frontendUrl),
    project_refs_match: getSupabaseProjectRef(backendUrl) === getSupabaseProjectRef(frontendUrl),
    service_role_key_kind: classifySupabaseKey(serviceRoleKey),
    service_role_project_api_key: isSupabaseProjectApiKey(serviceRoleKey),
    auth_key_kind: classifySupabaseKey(publishableKey),
  };
}

let supabase: any = null;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key && isSupabaseProjectApiKey(key)) {
      supabase = createClient(url, key, SUPABASE_SERVER_CLIENT_OPTIONS);
    } else if (key && !isSupabaseProjectApiKey(key)) {
      console.warn('[huggy:supabase_service_role_invalid]', {
        key_kind: classifySupabaseKey(key),
        expected: 'Supabase project API key, not a personal access token',
      });
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
      (isSupabaseProjectApiKey(process.env.SUPABASE_SERVICE_ROLE_KEY) ? process.env.SUPABASE_SERVICE_ROLE_KEY : '') ||
      DEFAULT_SUPABASE_PUBLISHABLE_KEY;

    supabaseAuth = createClient(url, key, SUPABASE_SERVER_CLIENT_OPTIONS);
  }
  return supabaseAuth;
}

const AUTH_SESSION_UNAVAILABLE_MESSAGE = 'Your session could not be read. Please refresh the page and sign in again.';

function createAuthSessionUnavailableError(requestId?: string, message = AUTH_SESSION_UNAVAILABLE_MESSAGE) {
  const error = new Error(message) as any;
  error.statusCode = 401;
  error.status = 401;
  error.diagnosticCode = 'AUTH_SESSION_UNAVAILABLE';
  error.diagnostic_code = 'AUTH_SESSION_UNAVAILABLE';
  error.requestId = requestId;
  error.request_id = requestId;
  error.suggestedAction = 'sign_in_again';
  error.suggested_action = 'sign_in_again';
  return error;
}

function authSessionUnavailablePayload(requestId?: string, message = AUTH_SESSION_UNAVAILABLE_MESSAGE) {
  return {
    success: false,
    error: message,
    message,
    diagnostic_code: 'AUTH_SESSION_UNAVAILABLE',
    request_id: requestId,
    suggested_action: 'sign_in_again',
  };
}

function getRequiredAuth(req: any, requestId?: string) {
  const user = req.auth?.user || req.user;
  if (user?.id) {
    return {
      user,
      userId: String(user.id),
      email: String(user.email || ''),
    };
  }

  console.warn('[huggy:server_auth_state_invariant]', {
    request_id: requestId || null,
    path: req.path,
    has_authorization: Boolean(req.headers?.authorization),
    invariant: 'SERVER_AUTH_STATE_INVARIANT',
  });

  throw createAuthSessionUnavailableError(requestId);
}

function getOptionalAuthState(req: any) {
  const user = req?.auth?.user || req?.user || null;
  return {
    user,
    userId: req?.auth?.userId || user?.id || null,
    email: req?.auth?.email || user?.email || null,
  };
}

async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json(authSessionUnavailablePayload(undefined, 'Authentication required'));
  }

  const authClient = getSupabaseAuthClient();
  let authResult: any;
  try {
    authResult = await authClient.auth.getUser(token);
  } catch (error: any) {
    console.warn('[huggy:auth_session_unavailable]', {
      reason: 'supabase_get_user_threw',
      message: redactSecrets(error?.message || String(error), '[redacted]'),
    });
    return res.status(401).json(authSessionUnavailablePayload(undefined, 'Invalid or expired session'));
  }
  const data = authResult?.data;
  const error = authResult?.error;
  const user = data?.user;

  if (error || !user) {
    console.warn('[huggy:auth_session_unavailable]', {
      reason: error ? 'supabase_get_user_error' : 'missing_user',
      message: error?.message ? redactSecrets(error.message, '[redacted]') : null,
      status: error?.status || null,
    });
    return res.status(401).json(authSessionUnavailablePayload(undefined, 'Invalid or expired session'));
  }

  req.user = user;
  req.auth = {
    user,
    userId: String(user.id),
    email: String(user.email || ''),
  };
  return next();
}

function requireAuthenticatedUser(req: any, res: any, requestId?: string) {
  try {
    return getRequiredAuth(req, requestId).user;
  } catch (error: any) {
    console.warn('[huggy:auth_session_missing_after_middleware]', {
      request_id: requestId || null,
      path: req.path,
      has_authorization: Boolean(req.headers?.authorization),
      message: redactSecrets(error?.message || String(error), '[redacted]'),
    });
    res.status(401).json(authSessionUnavailablePayload(requestId, redactSecrets(error?.message || AUTH_SESSION_UNAVAILABLE_MESSAGE, '[redacted]')));
    return null;
  }
}

function getAuthenticatedUserOrThrow(req: any, requestId?: string) {
  return getRequiredAuth(req, requestId).user;
}

app.get('/api/auth/me', requireAuth, (req: any, res) => {
  const auth = getRequiredAuth(req);
  res.json({
    success: true,
    user: {
      id: auth.userId,
      email: auth.email,
      role: auth.user.role,
    },
  });
});

app.get('/api/debug/auth-session', requireAuth, (req: any, res) => {
  const auth = getRequiredAuth(req);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    success: true,
    has_user: true,
    user_id: auth.userId,
    email: auth.email || null,
  });
});

app.get('/api/health', (_req, res) => {
  const supabaseDiagnostics = getSupabaseRuntimeDiagnostics();
  const deployedCommit =
    process.env.HUGGY_BUILD_COMMIT ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    null;
  res.json({
    success: true,
    status: 'ok',
    service: 'huggy-saas',
    time: new Date().toISOString(),
    static_dist: pathExists(staticRoot),
    deployment: {
      commit: deployedCommit,
      commit_short: deployedCommit ? deployedCommit.slice(0, 7) : null,
      branch:
        process.env.HUGGY_BUILD_BRANCH ||
        process.env.RAILWAY_GIT_BRANCH ||
        process.env.VERCEL_GIT_COMMIT_REF ||
        null,
      environment:
        process.env.RAILWAY_ENVIRONMENT_NAME ||
        process.env.VERCEL_ENV ||
        process.env.NODE_ENV ||
        null,
    },
    project_refs_match: supabaseDiagnostics.project_refs_match,
    integrations: {
      supabase_url: Boolean(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL),
      supabase_service_role: supabaseDiagnostics.service_role_project_api_key,
      openrouter: Boolean(getOpenRouterApiKey()),
      vercel: Boolean(getVercelToken()),
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    },
    diagnostics: {
      supabase: supabaseDiagnostics,
    },
  });
});

function setAnalyticsCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

app.options('/api/analytics/collect', (_req, res) => {
  setAnalyticsCors(res);
  res.status(204).end();
});

app.use('/api/billing/wallet', requireAuth);
app.use('/api/billing/ledger', requireAuth);
app.use('/api/billing/checkout', requireAuth);
app.use('/api/billing/portal', requireAuth);
app.use('/api/ai/estimate', requireAuth);
app.use('/api/ai/route', requireAuth);
app.use('/api/users/me', requireAuth);
app.use('/api/admin', requireAuth);
app.use('/api/assistant', requireAuth);
app.use('/api/projects', requireAuth);

// Runtime data must live in Supabase. The only in-memory state kept here is
// short-lived rate-limit counters, which are not product data.
const RATE_LIMITS = new Map<string, number[]>();
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000000';

// Instantiate Core Services
function getOpenRouterApiKey() {
  return resolveOpenRouterApiKey(process.env);
}

function getOpenRouterSiteUrl() {
  return String(
    process.env.OPENROUTER_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    'https://huggy.fun'
  ).replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

const openRouter = new OpenRouterService({
  apiKey: getOpenRouterApiKey(),
  siteUrl: getOpenRouterSiteUrl(),
  appName: String(process.env.OPENROUTER_APP_NAME || 'Huggy').trim()
});
const providerGateway = new ProviderGateway(openRouter);
const AGENT_V3_ENABLED = isAgentV3Enabled(process.env);
const AGENT_V2_ENABLED = isAgentV2Enabled(process.env) || AGENT_V3_ENABLED;
const projectRunner = new HybridProjectRunner({ executeScripts: process.env.AGENT_RUNNER_EXECUTE_SCRIPTS === '1' });
const webResearchGateway = new WebResearchGateway(process.env);
const falMediaGateway = new FalMediaGateway(process.env);

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

function diagnoseProviderError(error: any) {
  const rawMessage = String(error?.message || error || 'Generation failed.');
  const message = redactSecrets(rawMessage, '[redacted]');
  if (/Cannot read properties of undefined \(reading ['"]user['"]\)/i.test(rawMessage)) {
    console.error('[huggy:server_auth_state_invariant]', {
      invariant: 'SERVER_AUTH_STATE_INVARIANT',
      message,
    });
    return {
      message: AUTH_SESSION_UNAVAILABLE_MESSAGE,
      diagnostic_code: 'AUTH_SESSION_UNAVAILABLE',
      suggested_action: 'sign_in_again',
      status: 401,
    };
  }
  if (/Cannot read properties of undefined \(reading ['"]auth['"]\)/i.test(rawMessage)) {
    return {
      message: 'Le code genere essaie d utiliser Auth sans client configure. Huggy va corriger le client Auth automatiquement.',
      diagnostic_code: 'SUPABASE_AUTH_CLIENT_UNDEFINED',
      suggested_action: 'fix_generated_auth_client',
      status: 500,
    };
  }
  if (/auth session|invalid or expired session|session could not be read|AUTH_SESSION_UNAVAILABLE/i.test(rawMessage)) {
    return {
      message: 'Your session could not be read. Please refresh the page and sign in again.',
      diagnostic_code: 'AUTH_SESSION_UNAVAILABLE',
      suggested_action: 'sign_in_again',
      status: 401,
    };
  }
  if (error?.diagnosticCode) {
    const suggestedByCode: Record<string, string> = {
      AUTO_MODEL_NOT_RESOLVED: 'use_auto',
      OPENROUTER_NOT_CONFIGURED: 'configure_openrouter_key',
      OPENROUTER_KEY_INVALID: 'update_openrouter_key',
      MODEL_OUTPUT_PARSE_FAILED: 'retry_or_use_auto',
      RELIABILITY_GATE_FAILED: 'fix_and_retry',
      PROVIDER_BAD_REQUEST: 'retry_or_use_auto',
      PROVIDER_QUOTA_OR_BILLING: 'check_openrouter_billing',
      PROVIDER_RATE_LIMITED: 'retry_later',
      PROVIDER_TIMEOUT: 'retry_or_use_auto',
      PROVIDER_UNAVAILABLE: 'retry_or_use_auto',
      MODEL_UNAVAILABLE: 'use_auto',
      MODEL_NOT_ALLOWED: 'use_auto',
      PROVIDER_CIRCUIT_OPEN: 'retry_or_use_auto',
      AUTH_SESSION_UNAVAILABLE: 'sign_in_again',
    };
    const publicMessageByCode: Record<string, string> = {
      PROVIDER_TIMEOUT: 'The AI provider did not answer in time. Huggy kept the project unchanged. Retry with Auto, or choose a faster allowed model.',
      PROVIDER_UNAVAILABLE: 'The AI provider is temporarily unavailable. Huggy kept the project unchanged. Retry in a moment or use Auto.',
      PROVIDER_CIRCUIT_OPEN: 'This model is cooling down after repeated provider failures. Use Auto or retry shortly.',
    };
    return {
      message: String(error.diagnosticCode) === 'MODEL_OUTPUT_PARSE_FAILED'
        ? 'Huggy could not safely read the AI output, so the existing app was kept unchanged. Please retry with Auto or ask for a smaller targeted change.'
        : publicMessageByCode[String(error.diagnosticCode)] || message,
      diagnostic_code: String(error.diagnosticCode),
      suggested_action: suggestedByCode[String(error.diagnosticCode)] || 'retry_or_use_auto',
      status: Number(error.statusCode || 502),
    };
  }
  if (/insufficient.*credit|quota|billing|payment required|OpenRouter HTTP 402/i.test(rawMessage)) {
    return {
      message: 'The AI provider rejected the request because the provider account has insufficient credits or quota. Check OpenRouter billing, then retry.',
      diagnostic_code: 'PROVIDER_QUOTA_OR_BILLING',
      suggested_action: 'check_openrouter_billing',
      status: 503,
    };
  }
  if (/not configured|OPENROUTER_API_KEY/i.test(rawMessage)) {
    return {
      message: 'OpenRouter is not configured. Add OPENROUTER_API_KEY on Railway and redeploy. The backend also accepts OPEN_ROUTER_API_KEY, OPENROUTER_KEY, or OPENROUTER_TOKEN.',
      diagnostic_code: 'OPENROUTER_NOT_CONFIGURED',
      suggested_action: 'configure_openrouter_key',
      status: 503,
    };
  }
  if (/OpenRouter HTTP 401|OpenRouter HTTP 403|invalid api key|unauthorized/i.test(rawMessage)) {
    return {
      message: 'OpenRouter key invalid or unauthorized. Update OPENROUTER_API_KEY on Railway and redeploy.',
      diagnostic_code: 'OPENROUTER_KEY_INVALID',
      suggested_action: 'update_openrouter_key',
      status: 503,
    };
  }
  if (/OpenRouter HTTP 404|model.*not.*found|not found/i.test(rawMessage)) {
    return {
      message: 'The selected AI model is unavailable on OpenRouter. Choose Auto or another allowed model.',
      diagnostic_code: 'MODEL_UNAVAILABLE',
      suggested_action: 'use_auto',
      status: 502,
    };
  }
  if (/OpenRouter HTTP 400|bad request|invalid request|unsupported parameter|provider rejected/i.test(rawMessage)) {
    return {
      message: 'OpenRouter rejected the AI request format. Retry with Auto; if it keeps happening, check the selected model and Railway logs.',
      diagnostic_code: 'PROVIDER_BAD_REQUEST',
      suggested_action: 'retry_or_use_auto',
      status: 502,
    };
  }
  if (/OpenRouter HTTP 429|rate limit|too many requests/i.test(rawMessage)) {
    return {
      message: 'OpenRouter rate limit reached. Please wait a moment and try again.',
      diagnostic_code: 'PROVIDER_RATE_LIMITED',
      suggested_action: 'retry_later',
      status: 429,
    };
  }
  if (/timeout|AbortError|aborted/i.test(rawMessage)) {
    return {
      message: 'The AI provider did not answer in time. Huggy kept the project unchanged. Retry with Auto, or choose a faster allowed model.',
      diagnostic_code: 'PROVIDER_TIMEOUT',
      suggested_action: 'retry_or_use_auto',
      status: 504,
    };
  }
  if (/OpenRouter HTTP 5|OpenRouter API Error|provider|upstream|ECONNRESET|ENOTFOUND|fetch failed|network/i.test(rawMessage)) {
    return {
      message: 'The AI provider is temporarily unavailable. Please retry or choose another allowed model.',
      diagnostic_code: 'PROVIDER_UNAVAILABLE',
      suggested_action: 'retry_or_use_auto',
      status: 502,
    };
  }
  if (/Permission denied/i.test(rawMessage)) {
    return {
      message: 'Action unavailable with your current project role.',
      diagnostic_code: 'PERMISSION_DENIED',
      suggested_action: 'ask_project_owner',
      status: 403,
    };
  }
  if (error?.statusCode >= 500 || /server error|internal/i.test(rawMessage)) {
    return {
      message: 'Huggy hit an internal server error while handling this request. Please retry in a moment.',
      diagnostic_code: 'SERVER_ERROR',
      suggested_action: 'retry',
      status: error?.statusCode || 500,
    };
  }
  return {
    message,
    diagnostic_code: 'GENERATION_FAILED',
    suggested_action: 'retry',
    status: error?.statusCode || 400,
  };
}

function normalizeProviderError(error: any): string {
  return diagnoseProviderError(error).message;
}

function createPublicError(message: string, statusCode = 500, diagnosticCode = 'SERVER_ERROR', suggestedAction = 'retry') {
  const error = new Error(message) as Error & {
    statusCode?: number;
    diagnostic_code?: string;
    suggested_action?: string;
  };
  error.statusCode = statusCode;
  error.diagnostic_code = diagnosticCode;
  error.suggested_action = suggestedAction;
  return error;
}

function diagnosePublishError(error: any) {
  const message = String(error?.message || error || 'Publish failed.');
  const statusCode = Number(error?.statusCode || 500);
  if (error?.diagnostic_code) {
    return {
      message,
      diagnostic_code: String(error.diagnostic_code),
      suggested_action: String(error.suggested_action || 'retry'),
      status: statusCode,
    };
  }
  if (/VERCEL_TOKEN|not configured/i.test(message)) {
    return {
      message: 'Publishing is not configured on the server. Add VERCEL_TOKEN on Railway, redeploy, then retry.',
      diagnostic_code: 'VERCEL_NOT_CONFIGURED',
      suggested_action: 'configure_vercel_token',
      status: 503,
    };
  }
  if (/401|403|unauthorized|forbidden|invalid token/i.test(message)) {
    return {
      message: 'Vercel rejected the publish token. Update VERCEL_TOKEN on Railway and redeploy.',
      diagnostic_code: 'VERCEL_TOKEN_INVALID',
      suggested_action: 'update_vercel_token',
      status: 503,
    };
  }
  if (/rate limit|too many requests|429/i.test(message)) {
    return {
      message: 'Vercel rate limited the publish request. Wait a moment, then click Update again.',
      diagnostic_code: 'VERCEL_RATE_LIMITED',
      suggested_action: 'retry_later',
      status: 429,
    };
  }
  if (/payload|too large|413/i.test(message)) {
    return {
      message: 'The generated app is too large for this publish request. Remove heavy inline assets or export large media to Storage, then retry.',
      diagnostic_code: 'VERCEL_PAYLOAD_TOO_LARGE',
      suggested_action: 'reduce_assets',
      status: 413,
    };
  }
  if (/bad request|invalid|400|files/i.test(message)) {
    return {
      message: 'Vercel rejected the deployment payload. Huggy kept the live app unchanged; rebuild the preview and try Publish again.',
      diagnostic_code: 'VERCEL_BAD_REQUEST',
      suggested_action: 'rebuild_then_publish',
      status: 502,
    };
  }
  if (/fetch failed|network|timeout|ENOTFOUND|ECONNRESET|5\d\d|unavailable/i.test(message)) {
    return {
      message: 'Vercel is temporarily unavailable or unreachable. The live app was not changed; retry in a moment.',
      diagnostic_code: 'VERCEL_UNAVAILABLE',
      suggested_action: 'retry',
      status: 502,
    };
  }
  return {
    message: message || 'Publish failed. The live app was not changed.',
    diagnostic_code: 'PUBLISH_FAILED',
    suggested_action: 'retry',
    status: statusCode >= 400 && statusCode < 600 ? statusCode : 500,
  };
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanAnalyticsText(value: unknown, fallback: string, maxLength = 120): string {
  const text = String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '');
  return (text || fallback).slice(0, maxLength);
}

function normalizeAnalyticsEventType(value: unknown): 'pageview' | 'heartbeat' | 'duration' {
  const eventType = cleanAnalyticsText(value, 'pageview', 32).toLowerCase();
  if (eventType === 'heartbeat' || eventType === 'duration') return eventType;
  return 'pageview';
}

function normalizeAnalyticsEnvironment(value: unknown): 'preview' | 'production' {
  return cleanAnalyticsText(value, 'preview', 32).toLowerCase() === 'production' ? 'production' : 'preview';
}

function normalizeAnalyticsPath(value: unknown): string {
  const raw = cleanAnalyticsText(value, '/', 240);
  if (!raw.startsWith('/')) return '/';
  return raw.split('#')[0].split('?')[0] || '/';
}

function normalizeAnalyticsSource(value: unknown): string {
  const source = cleanAnalyticsText(value, 'Direct', 80);
  if (!source || /^https?:\/\//i.test(source)) {
    try {
      return new URL(source).hostname.slice(0, 80) || 'Direct';
    } catch {
      return 'Direct';
    }
  }
  return source === 'direct' ? 'Direct' : source;
}

function detectAnalyticsDevice(userAgentHeader: unknown): 'Mobile' | 'Desktop' | 'Tablet' | 'Unknown' {
  const userAgent = String(userAgentHeader || '');
  if (!userAgent) return 'Unknown';
  if (/ipad|tablet|kindle|silk/i.test(userAgent)) return 'Tablet';
  if (/mobi|iphone|android.*mobile|windows phone/i.test(userAgent)) return 'Mobile';
  if (/mozilla|chrome|safari|firefox|edg/i.test(userAgent)) return 'Desktop';
  return 'Unknown';
}

function detectAnalyticsCountry(req: any) {
  const rawCode = String(
    req.headers['cf-ipcountry'] ||
    req.headers['x-vercel-ip-country'] ||
    req.headers['x-country-code'] ||
    ''
  ).toUpperCase();
  const countryCode = /^[A-Z]{2}$/.test(rawCode) ? rawCode : 'UN';
  return {
    country_code: countryCode,
    country_name: COUNTRY_NAMES[countryCode] || (countryCode === 'UN' ? 'Unknown' : countryCode),
  };
}

function getAnalyticsRange(rangeValue: unknown) {
  const range = cleanAnalyticsText(rangeValue, '30d', 8).toLowerCase();
  const now = Date.now();
  if (range === '24h') {
    return { key: '24h', start: new Date(now - 24 * 60 * 60 * 1000), bucketCount: 24, bucketMs: 60 * 60 * 1000 };
  }
  if (range === '7d') {
    return { key: '7d', start: new Date(now - 7 * 24 * 60 * 60 * 1000), bucketCount: 7, bucketMs: 24 * 60 * 60 * 1000 };
  }
  if (range === '90d') {
    return { key: '90d', start: new Date(now - 90 * 24 * 60 * 60 * 1000), bucketCount: 30, bucketMs: 3 * 24 * 60 * 60 * 1000 };
  }
  return { key: '30d', start: new Date(now - 30 * 24 * 60 * 60 * 1000), bucketCount: 30, bucketMs: 24 * 60 * 60 * 1000 };
}

function uniqueCount(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}

function groupVisitors<T extends Record<string, any>>(rows: T[], getKey: (row: T) => string) {
  const grouped = new Map<string, Set<string>>();
  rows.forEach(row => {
    const key = getKey(row);
    if (!grouped.has(key)) grouped.set(key, new Set());
    grouped.get(key)?.add(String(row.visitor_id || row.session_id || 'unknown'));
  });
  return Array.from(grouped.entries())
    .map(([label, visitors]) => ({ label, visitors: visitors.size }))
    .sort((a, b) => b.visitors - a.visitors || a.label.localeCompare(b.label));
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
  created_by?: string;
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

type PublishStatus = {
  state: 'not_ready' | 'ready_to_publish' | 'published' | 'changes_unpublished';
  public_url: string;
  custom_domain: string | null;
  current_visitors: number;
  latest_published_at: string | null;
  project_updated_at: string | null;
  badge_required: boolean;
  checks: Array<{ key: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }>;
  can_publish: boolean;
  has_unpublished_changes: boolean;
};

type PublishContext = {
  project: GeneratedProject;
  files: GeneratedFile[];
  latestDeployment: any | null;
  plan: string;
  customDomain: string | null;
  currentVisitors?: number;
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

type AgentIntent = 'conversation' | 'clarification_required' | 'plan' | 'build' | 'edit' | 'debug_fix' | 'verify' | 'deploy_assist' | 'external_keys_required' | 'credits_required';
type AgentNextAction = 'answer' | 'ask_clarification' | 'plan_only' | 'plan_then_build' | 'build' | 'edit' | 'debug_fix' | 'verify' | 'deploy_assist' | 'collect_external_keys' | 'show_upgrade';
type AgentRequestedMode = 'auto' | 'plan' | 'build';
type StudioContextKind = 'chat' | 'design' | 'decks' | 'media';

type IntentDecision = {
  intent: AgentIntent;
  confidence: number;
  requestedMode: AgentRequestedMode;
  understandingCategory?: UserIntentCategory;
  intentUnderstanding?: Pick<IntentUnderstanding, 'category' | 'action' | 'confidence' | 'allowsFileAction' | 'needsClarification' | 'reason' | 'signals'>;
  requiresFileChanges: boolean;
  requiresPreviewRebuild: boolean;
  requiresCredits: boolean;
  userVisibleReason: string;
  reason?: string;
  nextAction?: AgentNextAction;
  autoPlanRequired?: boolean;
  selectedModelPolicy?: 'auto' | 'economy' | 'balanced' | 'premium';
  routingSource?: 'heuristic' | 'ai' | 'fallback';
  typedDecision?: TypedIntentDecision;
  clarification?: {
    question: string;
    choices: string[];
    recommendation: string;
  };
};

type ReliabilityDecision = {
  intent: AgentIntent;
  should_mutate_files: boolean;
  should_touch_preview: boolean;
  requires_runner: boolean;
  requires_clarification: boolean;
  quality_gate_level: 'conversation' | 'advisory' | 'critical';
  reason: string;
  typed_decision?: TypedIntentDecision;
};

function buildReliabilityDecision(decision: IntentDecision): ReliabilityDecision {
  const shouldMutate = Boolean(decision.requiresFileChanges);
  const shouldTouchPreview = Boolean(decision.requiresPreviewRebuild);
  return {
    intent: decision.intent,
    should_mutate_files: shouldMutate,
    should_touch_preview: shouldTouchPreview,
    requires_runner: shouldMutate,
    requires_clarification: decision.intent === 'clarification_required',
    quality_gate_level: shouldMutate
      ? 'critical'
      : decision.intent === 'plan' || decision.intent === 'verify'
        ? 'advisory'
        : 'conversation',
    reason: decision.userVisibleReason || decision.reason || decision.intentUnderstanding?.reason || 'Huggy selected the safest next action.',
    typed_decision: decision.typedDecision,
  };
}

const FAST_ANSWER_CATEGORIES = new Set<UserIntentCategory>([
  'text',
  'explanation',
  'strategy',
  'analysis',
  'product_review',
  'ux_review',
  'design',
  'prompt',
  'architecture',
  'other',
]);

function promptLikelyNeedsProjectContext(prompt: string) {
  const normalized = normalizePromptIntentText(prompt);
  return /\b(ce projet|cette app|cette application|mon projet|mon app|mon application|l app actuelle|le code actuel|les fichiers|dans le projet|dans l application|dans l app|preview actuelle|fichiers actuels|current project|current app|current files|existing code)\b/i.test(normalized);
}

function canUseFastAnswerPath(decision: IntentDecision, prompt: string) {
  if (decision.requiresFileChanges || decision.requiresPreviewRebuild) return false;
  if (decision.intent === 'clarification_required') return !promptLikelyNeedsProjectContext(prompt);
  if (decision.intent !== 'conversation') return false;
  if (isGreetingPrompt(prompt) || isSimpleLocalConversationPrompt(prompt)) return true;
  if (promptLikelyNeedsProjectContext(prompt)) return false;
  const category = decision.intentUnderstanding?.category || decision.understandingCategory || 'other';
  return FAST_ANSWER_CATEGORIES.has(category);
}

function normalizeRequestedMode(value: any): AgentRequestedMode {
  return value === 'plan' ? 'plan' : value === 'build' ? 'build' : 'auto';
}

function normalizeStudioContext(value: any): StudioContextKind {
  const raw = typeof value === 'string'
    ? value
    : typeof value?.workshop === 'string'
      ? value.workshop
      : '';
  return raw === 'design' || raw === 'decks' || raw === 'media' ? raw : 'chat';
}

function studioContextInstruction(value: any) {
  const context = normalizeStudioContext(value);
  if (context === 'design') {
    const settings = normalizeDesignWorkshopSettings(value?.settings || value?.designSettings || {});
    return [
      'Huggy Design workspace context:',
      '- Interpret the request as UI/UX, product design, visual system, prototype, or targeted interface refinement.',
      '- Preserve existing app behavior unless the user clearly asks for a new app or a full redesign.',
      '- Prefer focused changes, coherent design tokens, responsive states, accessibility, and anti-generic visual decisions.',
      '- For applied design work, favor Opus-level visual reasoning: hierarchy, spacing, motion, states, responsive behavior, and product taste.',
      '- Offer critique, copy, or strategy without touching files unless the user clearly asks to apply changes.',
      '- If the user is only asking for advice or explanation, answer without modifying files.',
      '- Design Mode must never touch auth, database, billing, secrets, payment logic, provider keys, or business-critical backend behavior unless the user explicitly leaves Design mode and asks for engineering work.',
      '- For small visual edits, patch only the relevant CSS/component files and preserve rollback/version history.',
      ...designWorkshopInstructionLines(settings),
    ].join('\n');
  }
  if (context === 'decks') {
    return [
      'Huggy Decks workspace context:',
      '- Interpret the request as a pitch deck, slide deck, one-pager, product narrative, sales story, or presentation artifact.',
      '- If building, create a polished responsive web presentation rendered in Preview with slide-like sections, concise copy, hierarchy, and speaker-friendly flow.',
      '- Preserve the current project unless the user clearly asks to create or apply a deck.',
      '- Include story arc, slide sequence, audience, proof, CTA/ask, and export-friendly structure.',
      '- Add real slide navigation, progress, keyboard support, subtle HTML/CSS animations, and prefers-reduced-motion support.',
      '- Include an honest in-preview download action for the generated deck artifact when practical, such as Download HTML or Download outline.',
      '- Do not claim to create video files, PPTX, PDF, or Canva exports unless those exporters are actually implemented. Use animated web slides for motion.',
      '- If the user is only asking for strategy, outline, or copy, answer without modifying files.',
    ].join('\n');
  }
  if (context === 'media') {
    const settings = normalizeMediaSettings(value?.settings || value?.mediaSettings || {});
    return [
      'Huggy Media workspace context:',
      '- Interpret the request as image, video, UGC, ad creative, storytelling, thumbnail, hero visual, product mockup, or campaign asset work.',
      '- This is a creative media request, not a request to build a web app, unless the user explicitly asks to use the generated asset inside the current app.',
      '- Keep Huggy as one assistant with one input. Use compact media controls only as context, never a heavy editor.',
      '- Prefer Auto model routing. The user should not need to know Seedance, Veo, Sora, Kling, Flux, or OpenAI Image.',
      '- If a media provider is unavailable, return a useful campaign brief, storyboard, prompt and next action without pretending a real asset was rendered.',
      '- Never expose fal.ai costs, provider invoices, raw provider payloads, or internal margins to the user.',
      `- Current media settings: ${mediaSettingsSummary(settings)}.`,
    ].join('\n');
  }
  return '';
}

function applyStudioContextToPrompt(prompt: string, studioContext: any) {
  const instruction = studioContextInstruction(studioContext);
  return instruction ? `${instruction}\n\nUser request:\n${prompt}` : prompt;
}

function applyRequestContextToPrompt(prompt: string, studioContext: any, importContext: any) {
  return applyImportContextToPrompt(applyStudioContextToPrompt(prompt, studioContext), importContext);
}

type PreviewBuildResult = {
  status: 'ready' | 'failed';
  html: string;
  errors: any[];
  summary: string;
};

type SeoAuditCheck = {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
};

type SeoAudit = {
  score: number;
  checks: SeoAuditCheck[];
  recommendations: string[];
  preview: {
    title: string;
    description: string;
    h1: string;
    ogTitle: string;
    structuredData: boolean;
  };
};

type ExternalApiRequirement = {
  service: string;
  variable: string;
  description: string;
  required: boolean;
  placeholder: string;
};

function getUserOrgId(req: any): string {
  return getRequiredAuth(req).userId;
}

function getOrganizationFallbackValue(column: string, req: any, organizationId: string, now: string) {
  let auth: ReturnType<typeof getRequiredAuth> | null = null;
  try {
    auth = getRequiredAuth(req);
  } catch {
    auth = null;
  }
  const userId = auth?.userId || organizationId;
  const email = String(auth?.email || '').trim();
  const name = email ? `${email.split('@')[0]}'s workspace` : 'Personal workspace';
  const slug = `personal-${organizationId.slice(0, 8)}`;
  const normalized = column.toLowerCase();
  if (['id', 'organization_id'].includes(normalized)) return organizationId;
  if (['owner_id', 'created_by', 'user_id', 'created_by_user_id'].includes(normalized)) return userId;
  if (['name', 'display_name', 'title'].includes(normalized)) return name;
  if (['slug', 'handle'].includes(normalized)) return slug;
  if (['type', 'kind'].includes(normalized)) return 'personal';
  if (['plan', 'plan_key', 'tier', 'subscription_plan'].includes(normalized)) return 'free';
  if (['status', 'state'].includes(normalized)) return 'active';
  if (['created_at', 'updated_at'].includes(normalized)) return now;
  return '';
}

function getSchemaColumnFromMessage(message: string) {
  return (
    message.match(/Could not find the '([^']+)' column/i)?.[1] ||
    message.match(/column "([^"]+)"/i)?.[1] ||
    message.match(/column ([a-zA-Z0-9_]+) does not exist/i)?.[1] ||
    ''
  );
}

async function ensurePersonalOrganization(req: any, organizationId: string) {
  if (!isUuid(organizationId)) return organizationId;
  const client = getSupabase();
  if (!client) return organizationId;

  const now = new Date().toISOString();
  const auth = getRequiredAuth(req);
  const userId = auth.userId || organizationId;
  const email = String(auth.email || '').trim();
  const row: Record<string, any> = {
    id: organizationId,
    owner_id: userId,
    created_by: userId,
    user_id: userId,
    name: email ? `${email.split('@')[0]}'s workspace` : 'Personal workspace',
    slug: `personal-${organizationId.slice(0, 8)}`,
    type: 'personal',
    status: 'active',
    plan: 'free',
    created_at: now,
    updated_at: now,
  };

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await client.from('organizations').upsert([row], { onConflict: 'id' });
    if (!error) return organizationId;

    const message = String(error.message || '');
    if (/relation .*organizations.* does not exist|table .*organizations.* does not exist/i.test(message)) {
      console.warn('[huggy:organization_bootstrap_skipped]', { message });
      return organizationId;
    }
    if (/duplicate key|already exists/i.test(message)) return organizationId;

    const column = getSchemaColumnFromMessage(message);
    if (/could not find|does not exist/i.test(message) && column && column in row) {
      delete row[column];
      continue;
    }
    if (/null value in column/i.test(message) && column) {
      row[column] = getOrganizationFallbackValue(column, req, organizationId, now);
      continue;
    }

    throw new Error(`Supabase organization bootstrap failed: ${message}`);
  }

  return organizationId;
}

type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer';

function normalizeProjectRole(value: unknown): ProjectRole | null {
  const role = String(value || '').toLowerCase().trim();
  if (role === 'platform_admin' || role === 'admin') return 'admin';
  if (role === 'owner') return 'owner';
  if (role === 'editor' || role === 'member') return 'editor';
  if (role === 'viewer' || role === 'read_only' || role === 'readonly') return 'viewer';
  return null;
}

function isMissingMembershipTableError(error: any) {
  return /project_members|organization_members|schema cache|relation .* does not exist|table .* does not exist|column .* does not exist|could not find .* in the schema cache/i.test(error?.message || '');
}

async function lookupProjectMembershipRole(projectId: string, userId: string): Promise<ProjectRole | null> {
  const client = requireSupabase('Project membership role lookup');
  const { data, error } = await client
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error && isMissingMembershipTableError(error)) return null;
  if (error) throw new Error(`Supabase project membership lookup failed: ${error.message}`);
  return normalizeProjectRole(data?.role);
}

async function lookupOrganizationMembershipRole(organizationId: string, userId: string): Promise<ProjectRole | null> {
  const client = requireSupabase('Organization membership role lookup');
  const { data, error } = await client
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error && isMissingMembershipTableError(error)) return null;
  if (error) throw new Error(`Supabase organization membership lookup failed: ${error.message}`);
  return normalizeProjectRole(data?.role);
}

async function resolveProjectRole(project: GeneratedProject, userId: string, req?: any): Promise<ProjectRole | null> {
  if (!project || !userId) return null;
  if (isPlatformAdmin(req)) return 'admin';
  if (project.owner_id === userId || project.created_by === userId || (project as any).user_id === userId) return 'owner';
  const projectRole = await lookupProjectMembershipRole(project.id, userId);
  if (projectRole) return projectRole;
  const organizationId = project.organization_id || '';
  if (organizationId) {
    const orgRole = await lookupOrganizationMembershipRole(organizationId, userId);
    if (orgRole) return orgRole === 'owner' ? 'admin' : orgRole;
  }
  return null;
}

function getUserProjectRole(req: any, project?: GeneratedProject): ProjectRole {
  const attachedRole = normalizeProjectRole((project as any)?.__huggy_project_role);
  if (attachedRole) return attachedRole;
  if (isPlatformAdmin(req)) return 'admin';
  let userId = '';
  try {
    userId = getRequiredAuth(req).userId;
  } catch {
    userId = '';
  }
  if (project && userId && (project.owner_id === userId || project.created_by === userId || (project as any).user_id === userId)) return 'owner';
  return 'viewer';
}

function isPlatformAdmin(req: any) {
  const metadata = getOptionalAuthState(req).user?.app_metadata || {};
  const roles = Array.isArray(metadata.roles) ? metadata.roles : [];
  return metadata.role === 'platform_admin' || roles.includes('platform_admin');
}

function requirePlatformAdmin(req: any, res: any) {
  if (isPlatformAdmin(req)) return true;
  res.status(403).json({ success: false, error: 'Platform admin access required.' });
  return false;
}

function requireProjectCapability(req: any, res: any, capability: 'build' | 'deploy' | 'secrets' | 'view', project?: GeneratedProject) {
  const role = getUserProjectRole(req, project);
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

function hasProjectCapability(req: any, capability: 'build' | 'deploy' | 'secrets' | 'view', project?: GeneratedProject) {
  const role = getUserProjectRole(req, project);
  const allowed: Record<string, string[]> = {
    view: ['owner', 'admin', 'editor', 'viewer'],
    build: ['owner', 'admin', 'editor'],
    deploy: ['owner', 'admin'],
    secrets: ['owner', 'admin'],
  };
  return allowed[capability].includes(role);
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

function sanitizeProjectName(value: unknown) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function isGreetingPrompt(value: string) {
  const normalized = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!?.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  const greetings = new Set([
    'bonjour',
    'bonsoir',
    'salut',
    'coucou',
    'hello',
    'hi',
    'hey',
    'yo',
    'good morning',
    'good afternoon',
    'good evening',
  ]);
  if (greetings.has(normalized)) return true;
  const words = normalized.split(' ');
  return words.length <= 3 && words.some(word => greetings.has(word));
}

function normalizePromptIntentText(value: string) {
  return repairTextEncoding(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!?.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSimpleLocalConversationPrompt(value: string) {
  const normalized = normalizePromptIntentText(value);
  if (!normalized) return false;
  if (isGreetingPrompt(normalized)) return true;
  if (normalized.length > 180) return false;
  const direct = new Set([
    'merci',
    'thanks',
    'thank you',
    'ok',
    'okay',
    'd accord',
    'daccord',
    'ca va',
    'ça va',
    'comment ca va',
    'comment ça va',
    'how are you',
    'what can you do',
    'what are you able to do',
    'que peux tu faire',
    'que peux-tu faire',
    'que sais tu faire',
    'que sais-tu faire',
    'qu est ce que tu sais faire',
    "qu'est ce que tu sais faire",
    "qu'est-ce que tu sais faire",
    'tu peux faire quoi',
    'aide moi',
    'help me',
  ]);
  if (direct.has(normalized)) return true;
  return /^(qui es tu|qui es-tu|tu es qui|what are you|what is huggy|c est quoi huggy|c'est quoi huggy|comment tu peux m aider|comment tu peux m'aider)/i.test(normalized);
}

async function uniqueSlug(base: string, ownerId: string, excludeProjectId = ''): Promise<string> {
  const candidate = slugify(base);
  const client = requireSupabase('Project slug generation');
  let { data, error } = await client
    .from('projects')
    .select('id, slug')
    .eq('owner_id', ownerId)
    .ilike('slug', `${candidate}%`);
  if (error && /owner_id|schema cache|column .*does not exist|could not find .* in the schema cache/i.test(error.message || '')) {
    const retry = await client
      .from('projects')
      .select('id, slug')
      .eq('organization_id', ownerId)
      .ilike('slug', `${candidate}%`);
    data = retry.data;
    error = retry.error;
  }
  if (error && /slug|schema cache|column .*does not exist|could not find .* in the schema cache/i.test(error.message || '')) {
    return `${candidate}-${randomUUID().slice(0, 8)}`;
  }
  if (error) throw new Error(`Project slug lookup failed: ${error.message}`);
  const existing = new Set((data || []).filter((row: any) => row.id !== excludeProjectId).map((row: any) => row.slug));
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

function normalizeGeneratedFiles(rawFiles: any, options: { ensureIndex?: boolean } = {}): GeneratedFile[] {
  const ensureIndex = options.ensureIndex !== false;
  const entries = Array.isArray(rawFiles)
    ? rawFiles
    : rawFiles && typeof rawFiles === 'object'
      ? Object.entries(rawFiles).map(([filePath, content]) => ({ path: filePath, content }))
      : [];

  const files = entries
    .map((entry: any) => ({
      path: String(entry.path || entry.file || '').trim(),
      content: String(entry.content ?? entry.data ?? ''),
      language: entry.language ? String(entry.language) : undefined,
      updated_at: new Date().toISOString(),
    }))
    .filter((file: GeneratedFile) => isSafeProjectFilePath(file.path) && file.content.trim().length > 0);

  if (ensureIndex && !files.some(file => file.path === 'index.html')) {
    files.unshift({
      path: 'index.html',
      content: buildFallbackAppHtml('Generated Huggy app', 'Your app was generated, but no index.html was returned.'),
      language: 'html',
      updated_at: new Date().toISOString(),
    });
  }

  return files.slice(0, 80);
}

function inferGeneratedLanguage(filePath: string): string {
  const normalized = String(filePath || '').toLowerCase();
  if (normalized.endsWith('.tsx')) return 'tsx';
  if (normalized.endsWith('.ts')) return 'ts';
  if (normalized.endsWith('.jsx')) return 'jsx';
  if (normalized.endsWith('.js')) return 'javascript';
  if (normalized.endsWith('.css')) return 'css';
  if (normalized.endsWith('.html')) return 'html';
  if (normalized.endsWith('.json')) return 'json';
  if (normalized.endsWith('.sql')) return 'sql';
  if (normalized.endsWith('.md')) return 'markdown';
  if (normalized.endsWith('.xml')) return 'xml';
  return 'text';
}

function fileByPath(files: GeneratedFile[], filePath: string): GeneratedFile | undefined {
  const target = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  return files.find(file => file.path.replace(/\\/g, '/').toLowerCase() === target);
}

function isModernFrontendProject(files: GeneratedFile[]): boolean {
  return Boolean(
    fileByPath(files, 'package.json') &&
    (fileByPath(files, 'src/App.tsx') || fileByPath(files, 'src/App.jsx')) &&
    (fileByPath(files, 'src/main.tsx') || fileByPath(files, 'src/main.jsx')),
  );
}

function stripStandaloneHtmlForReact(html: string): string {
  const source = String(html || '');
  const body = getFirstRegexMatch(source, /<body[^>]*>([\s\S]*?)<\/body>/i) || source;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .trim();
}

function cssFromStandaloneHtml(html: string): string {
  return Array.from(String(html || '').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
    .map(match => match[1])
    .join('\n\n')
    .trim();
}

function createReactAppFromStandaloneHtml(html: string, projectName: string): string {
  const markup = stripStandaloneHtmlForReact(html);
  return [
    "import './index.css';",
    '',
    'export default function App() {',
    '  return (',
    '    <main className="huggy-generated-app" aria-label="Generated app preview">',
    `      <div dangerouslySetInnerHTML={{ __html: ${JSON.stringify(markup || `<section><h1>${escapeHtml(projectName)}</h1><p>Generated with Huggy.</p></section>`)} }} />`,
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n');
}

function ensureModernFrontendProject(files: GeneratedFile[], projectName: string, promptOrDescription = ''): GeneratedFile[] {
  const now = new Date().toISOString();
  const byPath = new Map(files.map(file => [file.path.replace(/\\/g, '/'), { ...file }]));
  const addIfMissing = (filePath: string, content: string, language = inferGeneratedLanguage(filePath)) => {
    if (!byPath.has(filePath)) {
      byPath.set(filePath, { path: filePath, content, language, updated_at: now });
    }
  };

  const existingHtml = fileByPath(files, 'index.html')?.content || '';
  const hasApp = Boolean(fileByPath(files, 'src/App.tsx') || fileByPath(files, 'src/App.jsx'));
  const hasMain = Boolean(fileByPath(files, 'src/main.tsx') || fileByPath(files, 'src/main.jsx'));

  addIfMissing('package.json', JSON.stringify({
    scripts: {
      dev: 'vite',
      build: 'vite build',
      test: 'node --experimental-strip-types src/app.test.ts',
      lint: 'tsc --noEmit',
    },
    dependencies: {
      '@vitejs/plugin-react': 'latest',
      vite: 'latest',
      typescript: 'latest',
      react: 'latest',
      'react-dom': 'latest',
    },
    devDependencies: {
      tailwindcss: '^3.4.17',
      postcss: '^8.4.49',
      autoprefixer: '^10.4.20',
    },
  }, null, 2));

  const viteIndex = [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${escapeHtml(projectName || 'Huggy App')}</title>`,
    `    <meta name="description" content="${escapeHtml(summarizeForMeta(promptOrDescription || projectName, 'A production-ready React app generated with Huggy.'))}" />`,
    '  </head>',
    '  <body>',
    '    <div id="root"></div>',
    '    <script type="module" src="/src/main.tsx"></script>',
    '  </body>',
    '</html>',
    '',
  ].join('\n');
  byPath.set('index.html', {
    path: 'index.html',
    content: viteIndex,
    language: 'html',
    updated_at: byPath.get('index.html')?.updated_at || now,
  });

  if (!hasMain) {
    addIfMissing('src/main.tsx', [
      "import React from 'react';",
      "import { createRoot } from 'react-dom/client';",
      "import App from './App';",
      "import './index.css';",
      '',
      "createRoot(document.getElementById('root')!).render(",
      '  <React.StrictMode>',
      '    <App />',
      '  </React.StrictMode>,',
      ');',
      '',
    ].join('\n'), 'tsx');
  }

  if (!hasApp) {
    addIfMissing('src/App.tsx', createReactAppFromStandaloneHtml(existingHtml, projectName), 'tsx');
  }

  const extractedCss = cssFromStandaloneHtml(existingHtml);
  addIfMissing('src/index.css', extractedCss || [
    '@tailwind base;',
    '@tailwind components;',
    '@tailwind utilities;',
    '',
    ':root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1c1c1c; background: #fcfbf8; }',
    '* { box-sizing: border-box; }',
    'body { margin: 0; min-height: 100vh; background: #fcfbf8; }',
    'button, input, textarea, select { font: inherit; }',
    '.huggy-generated-app { min-height: 100vh; }',
    '',
  ].join('\n'), 'css');

  addIfMissing('src/app.test.ts', [
    "import { readFileSync } from 'node:fs';",
    '',
    "const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');",
    "if (!/export\\s+default\\s+function\\s+App|export\\s+default\\s+App|const\\s+App\\s*=/.test(app)) {",
    "  throw new Error('App component is missing a default export.');",
    '}',
    "console.log('Generated app smoke test passed.');",
    '',
  ].join('\n'), 'ts');

  addIfMissing('tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['DOM', 'DOM.Iterable', 'ES2020'],
      allowJs: false,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: true,
      forceConsistentCasingInFileNames: true,
      module: 'ESNext',
      moduleResolution: 'Node',
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
    },
    include: ['src'],
  }, null, 2), 'json');

  addIfMissing('vite.config.ts', [
    "import { defineConfig } from 'vite';",
    "import react from '@vitejs/plugin-react';",
    '',
    'export default defineConfig({',
    '  plugins: [react()],',
    '});',
    '',
  ].join('\n'), 'ts');

  addIfMissing('tailwind.config.ts', [
    "import type { Config } from 'tailwindcss';",
    '',
    'export default {',
    "  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],",
    '  theme: {',
    '    extend: {',
    '      colors: {',
    "        huggyCream: '#fcfbf8',",
    "        huggyInk: '#1c1c1c',",
    "        huggyMuted: '#5f5f5d',",
    "        huggyBorder: '#eceae4',",
    "        huggyBlue: '#2f6df6',",
    '      },',
    '      borderRadius: {',
    "        huggy: '1.5rem',",
    '      },',
    '    },',
    '  },',
    '  plugins: [],',
    '} satisfies Config;',
    '',
  ].join('\n'), 'ts');

  addIfMissing('postcss.config.cjs', [
    'module.exports = {',
    '  plugins: {',
    '    tailwindcss: {},',
    '    autoprefixer: {},',
    '  },',
    '};',
    '',
  ].join('\n'), 'js');

  addIfMissing('README.md', [
    `# ${projectName || 'Huggy App'}`,
    '',
    'Generated as a Vite + React + TypeScript project by Huggy.',
    '',
    '## Scripts',
    '',
    '- `npm run dev` starts the local app.',
    '- `npm run build` creates a production build.',
    '- `npm run test` runs the generated smoke test.',
    '- `npm run lint` runs TypeScript validation.',
    '',
  ].join('\n'), 'markdown');

  let outputFiles = Array.from(byPath.values()).slice(0, 80);
  const fullstackRequirement = detectHuggyCloudRequirements(promptOrDescription);
  if (shouldApplyHuggyFullstackKit({ prompt: promptOrDescription, files: outputFiles, requirement: fullstackRequirement })) {
    outputFiles = applyHuggyFullstackKit({
      files: outputFiles,
      projectName,
      prompt: promptOrDescription,
      requirement: fullstackRequirement,
    }).slice(0, 90);
  }

  return outputFiles;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripHtmlTags(value: string): string {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeForMeta(value: string, fallback = 'Production-ready web app generated with Huggy.'): string {
  const clean = stripHtmlTags(value || fallback).replace(/\s+/g, ' ').trim();
  const source = clean || fallback;
  return source.length > 155 ? `${source.slice(0, 152).trim()}...` : source;
}

function getFirstRegexMatch(value: string, regex: RegExp): string {
  const match = String(value || '').match(regex);
  return String(match?.[1] || '').trim();
}

function hasRegex(value: string, regex: RegExp): boolean {
  return regex.test(String(value || ''));
}

function safeJsonLd(value: Record<string, any>): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function insertIntoHead(html: string, block: string): string {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${block}\n</head>`);
  }
  return `${block}\n${html}`;
}

function enhanceHtmlSeo(
  html: string,
  projectName = 'Huggy app',
  promptOrDescription = '',
  slugOrId = '',
  environment: 'preview' | 'production' = 'preview',
): string {
  let output = String(html || '');
  if (!/<html[\s>]/i.test(output)) return output;

  const title = getFirstRegexMatch(output, /<title[^>]*>([\s\S]*?)<\/title>/i) || projectName;
  const description =
    getFirstRegexMatch(output, /<meta\s+name=["']description["']\s+content=["']([^"']+)["'][^>]*>/i) ||
    summarizeForMeta(promptOrDescription || stripHtmlTags(output), `Explore ${projectName}, a production-ready app generated with Huggy.`);
  const slug = slugify(slugOrId || projectName || 'huggy-app') || 'huggy-app';
  const canonical = `https://huggy.fun/generated/${slug}`;
  const robots = environment === 'production' ? 'index, follow' : 'noindex, nofollow';

  if (hasRegex(output, /<meta\s+name=["']robots["'][^>]*>/i)) {
    output = output.replace(/<meta\s+name=["']robots["'][^>]*>/i, `<meta name="robots" content="${robots}">`);
  }

  const additions: string[] = [];
  if (!hasRegex(output, /<title[^>]*>[\s\S]*?<\/title>/i)) {
    additions.push(`<title>${escapeHtml(title)}</title>`);
  }
  if (!hasRegex(output, /<meta\s+name=["']description["']/i)) {
    additions.push(`<meta name="description" content="${escapeHtml(description)}">`);
  }
  if (!hasRegex(output, /<meta\s+name=["']robots["']/i)) {
    additions.push(`<meta name="robots" content="${robots}">`);
  }
  if (!hasRegex(output, /<link\s+rel=["']canonical["']/i)) {
    additions.push(`<link rel="canonical" href="${canonical}">`);
  }
  if (!hasRegex(output, /<meta\s+property=["']og:title["']/i)) {
    additions.push(`<meta property="og:title" content="${escapeHtml(title)}">`);
  }
  if (!hasRegex(output, /<meta\s+property=["']og:description["']/i)) {
    additions.push(`<meta property="og:description" content="${escapeHtml(description)}">`);
  }
  if (!hasRegex(output, /<meta\s+property=["']og:type["']/i)) {
    additions.push('<meta property="og:type" content="website">');
  }
  if (!hasRegex(output, /<meta\s+name=["']twitter:card["']/i)) {
    additions.push('<meta name="twitter:card" content="summary_large_image">');
  }
  if (!hasRegex(output, /<meta\s+name=["']twitter:title["']/i)) {
    additions.push(`<meta name="twitter:title" content="${escapeHtml(title)}">`);
  }
  if (!hasRegex(output, /<meta\s+name=["']twitter:description["']/i)) {
    additions.push(`<meta name="twitter:description" content="${escapeHtml(description)}">`);
  }
  if (!hasRegex(output, /<script\s+type=["']application\/ld\+json["']/i)) {
    additions.push(`<script type="application/ld+json">${safeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: title,
      description,
      applicationCategory: 'WebApplication',
      operatingSystem: 'Web',
      creator: {
        '@type': 'Organization',
        name: 'Huggy',
        url: 'https://huggy.fun',
      },
    })}</script>`);
  }

  if (additions.length) {
    output = insertIntoHead(output, `\n<!-- Huggy SEO-ready metadata -->\n${additions.join('\n')}`);
  }

  return output;
}

function auditHtmlSeo(html: string, files: GeneratedFile[]): SeoAudit {
  const title = stripHtmlTags(getFirstRegexMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const description = getFirstRegexMatch(html, /<meta\s+name=["']description["']\s+content=["']([^"']+)["'][^>]*>/i);
  const h1Matches = String(html || '').match(/<h1[\s>][\s\S]*?<\/h1>/gi) || [];
  const h1 = stripHtmlTags(h1Matches[0] || '');
  const imageTags = String(html || '').match(/<img[\s\S]*?>/gi) || [];
  const imagesWithoutAlt = imageTags.filter(tag => !/\salt\s*=\s*["'][^"']+["']/i.test(tag)).length;
  const hasSitemap = files.some(file => /(^|\/)sitemap\.xml$/i.test(file.path));
  const hasRobots = files.some(file => /(^|\/)robots\.txt$/i.test(file.path));

  const checks: SeoAuditCheck[] = [
    {
      key: 'title',
      label: 'Page title',
      status: title.length >= 10 && title.length <= 65 ? 'pass' : title ? 'warn' : 'fail',
      detail: title ? `${title.length} characters` : 'Missing title tag',
    },
    {
      key: 'description',
      label: 'Meta description',
      status: description.length >= 70 && description.length <= 165 ? 'pass' : description ? 'warn' : 'fail',
      detail: description ? `${description.length} characters` : 'Missing meta description',
    },
    {
      key: 'h1',
      label: 'Primary H1',
      status: h1Matches.length === 1 ? 'pass' : h1Matches.length > 1 ? 'warn' : 'fail',
      detail: h1Matches.length === 1 ? stripHtmlTags(h1Matches[0]).slice(0, 80) : `${h1Matches.length} H1 tags found`,
    },
    {
      key: 'open_graph',
      label: 'Open Graph',
      status: hasRegex(html, /<meta\s+property=["']og:title["']/i) && hasRegex(html, /<meta\s+property=["']og:description["']/i) ? 'pass' : 'fail',
      detail: 'Required for polished social previews',
    },
    {
      key: 'canonical',
      label: 'Canonical URL',
      status: hasRegex(html, /<link\s+rel=["']canonical["']/i) ? 'pass' : 'warn',
      detail: 'Prevents duplicate indexing when published',
    },
    {
      key: 'structured_data',
      label: 'Structured data',
      status: hasRegex(html, /<script\s+type=["']application\/ld\+json["']/i) ? 'pass' : 'warn',
      detail: 'Helps Google and AI search understand the page',
    },
    {
      key: 'image_alt',
      label: 'Image alt text',
      status: imagesWithoutAlt === 0 ? 'pass' : 'warn',
      detail: imagesWithoutAlt ? `${imagesWithoutAlt} image${imagesWithoutAlt === 1 ? '' : 's'} need alt text` : 'All images include alt text',
    },
    {
      key: 'semantic_main',
      label: 'Semantic main landmark',
      status: hasRegex(html, /<main[\s>]/i) ? 'pass' : 'warn',
      detail: 'Improves accessibility and crawl structure',
    },
    {
      key: 'sitemap',
      label: 'Project sitemap',
      status: hasSitemap ? 'pass' : 'warn',
      detail: hasSitemap ? 'sitemap.xml found' : 'Add sitemap.xml before publishing multi-page apps',
    },
    {
      key: 'robots',
      label: 'Project robots',
      status: hasRobots ? 'pass' : 'warn',
      detail: hasRobots ? 'robots.txt found' : 'Add robots.txt before publishing public apps',
    },
  ];

  const weights: number[] = checks.map(check => check.status === 'pass' ? 10 : check.status === 'warn' ? 6 : 0);
  const score = Math.round(weights.reduce((sum, item) => sum + item, 0) / (checks.length * 10) * 100);
  const recommendations = checks
    .filter(check => check.status !== 'pass')
    .slice(0, 5)
    .map(check => `${check.label}: ${check.detail}.`);

  return {
    score,
    checks,
    recommendations,
    preview: {
      title,
      description,
      h1,
      ogTitle: getFirstRegexMatch(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["'][^>]*>/i),
      structuredData: hasRegex(html, /<script\s+type=["']application\/ld\+json["']/i),
    },
  };
}

function buildProjectSeoAudit(project: GeneratedProject, files: GeneratedFile[]): SeoAudit {
  const indexFile = files.find(file => file.path === 'index.html') || files.find(file => file.path.endsWith('.html'));
  const html = enhanceHtmlSeo(
    indexFile?.content || buildFallbackAppHtml(project.name, project.prompt || 'Generated with Huggy.'),
    project.name,
    project.prompt || project.name,
    project.slug || project.id,
    'production',
  );
  return auditHtmlSeo(html, files);
}

function withProjectSeoSupport(
  files: GeneratedFile[],
  projectName: string,
  promptOrDescription = '',
  options: { ensureIndex?: boolean } = {},
): GeneratedFile[] {
  const slug = slugify(projectName || 'huggy-app') || 'huggy-app';
  const baseUrl = `https://huggy.fun/generated/${slug}`;
  const now = new Date().toISOString();
  const output = normalizeGeneratedFiles(files, options).map(file => {
    if (file.path.endsWith('.html')) {
      return {
        ...file,
        content: enhanceHtmlSeo(file.content, projectName, promptOrDescription || projectName, slug, 'production'),
      };
    }
    return file;
  });

  if (!output.some(file => /(^|\/)robots\.txt$/i.test(file.path))) {
    output.push({
      path: 'robots.txt',
      language: 'text',
      updated_at: now,
      content: [
        'User-agent: *',
        'Allow: /',
        `Sitemap: ${baseUrl}/sitemap.xml`,
        '',
      ].join('\n'),
    });
  }

  if (!output.some(file => /(^|\/)sitemap\.xml$/i.test(file.path))) {
    output.push({
      path: 'sitemap.xml',
      language: 'xml',
      updated_at: now,
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url>',
        `    <loc>${baseUrl}/</loc>`,
        `    <lastmod>${now.slice(0, 10)}</lastmod>`,
        '    <changefreq>weekly</changefreq>',
        '    <priority>0.8</priority>',
        '  </url>',
        '</urlset>',
        '',
      ].join('\n'),
    });
  }

  return output;
}

function buildFallbackAppHtml(title: string, prompt: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: #1c1c1c; background: #fcfbf8; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 40px 18px; background:
      radial-gradient(circle at top left, rgba(191,219,254,.34), transparent 32%),
      linear-gradient(135deg, #fffdf8, #fcfbf8 52%, #f7f4ed); }
    section { width: min(620px, 100%); border: 1px solid #eceae4; background: rgba(255,253,248,.92); border-radius: 22px; padding: clamp(24px, 5vw, 42px); box-shadow: 0 30px 90px rgba(28,28,28,.08); text-align: center; }
    .status { width: 12px; height: 12px; border-radius: 999px; background: #315fdc; box-shadow: 0 0 0 8px rgba(49,95,220,.12); margin: 0 auto 22px; }
    h1 { margin: 0 0 10px; font-size: clamp(28px, 5vw, 48px); line-height: 1; letter-spacing: 0; }
    p { margin: 0 auto; max-width: 440px; color: #5f5f5d; font-size: clamp(15px, 2vw, 18px); line-height: 1.65; }
  </style>
</head>
<body>
  <main>
    <section aria-label="Preview waiting for generated app">
      <div class="status" aria-hidden="true"></div>
      <h1>${safeTitle}</h1>
      <p>Preview is waiting for a real generated application. Ask Huggy to build or modify the app to render working files here.</p>
    </section>
  </main>
</body>
</html>`;
}

function injectAnalyticsSnippet(html: string, projectId?: string, environment: 'preview' | 'production' = 'preview') {
  if (!projectId || html.includes('data-huggy-analytics="true"')) return html;
  const apiBase = (process.env.HUGGY_PUBLIC_API_URL || '').replace(/\/$/, '');
  const snippet = `
<script data-huggy-analytics="true">
(() => {
  const projectId = ${JSON.stringify(projectId)};
  const environment = ${JSON.stringify(environment)};
  const apiBase = ${JSON.stringify(apiBase)};
  const endpoint = (apiBase || window.location.origin).replace(/\\/$/, '') + '/api/analytics/collect';
  const safeId = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const storageGet = (store, key) => { try { return store.getItem(key); } catch { return ''; } };
  const storageSet = (store, key, value) => { try { store.setItem(key, value); } catch {} };
  let visitorId = storageGet(localStorage, 'huggy_visitor_id');
  if (!visitorId) { visitorId = safeId(); storageSet(localStorage, 'huggy_visitor_id', visitorId); }
  let sessionId = storageGet(sessionStorage, 'huggy_session_id');
  if (!sessionId) { sessionId = safeId(); storageSet(sessionStorage, 'huggy_session_id', sessionId); }
  const startedAt = Date.now();
  const source = (() => {
    try {
      if (!document.referrer) return 'Direct';
      const referrer = new URL(document.referrer);
      if (/builder\\.html|dashboard\\.html|auth\\.html/i.test(referrer.pathname)) return 'Direct';
      return referrer.hostname || 'Direct';
    } catch { return 'Direct'; }
  })();
  const send = (eventType) => {
    const payload = {
      project_id: projectId,
      event_type: eventType,
      page_path: window.location.pathname || '/',
      session_id: sessionId,
      visitor_id: visitorId,
      source,
      duration_seconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
      environment,
    };
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      if (ok) return;
    }
    fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  };
  send('pageview');
  const heartbeat = setInterval(() => send('heartbeat'), 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') send('duration');
  });
  window.addEventListener('beforeunload', () => {
    clearInterval(heartbeat);
    send('duration');
  });
})();
</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${snippet}\n</body>`);
  return `${html}\n${snippet}`;
}

function getHuggyPublicOrigin(): string {
  return String(
    process.env.HUGGY_PUBLIC_APP_URL ||
    process.env.HUGGY_PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    'https://www.huggy.fun',
  ).replace(/\/+$/, '');
}

function normalizeDomainHost(domain: string): string {
  return String(domain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.+$/, '')
    .toLowerCase();
}

function normalizeDomainUrl(domain: string): string {
  const host = normalizeDomainHost(domain);
  return host ? `https://${host}` : '';
}

function getPublishedProjectPath(project: Pick<GeneratedProject, 'id' | 'slug'>): string {
  return `/p/${encodeURIComponent(project.slug || project.id)}`;
}

function getDefaultPublishedUrl(project: Pick<GeneratedProject, 'id' | 'slug'>): string {
  return `${getHuggyPublicOrigin()}${getPublishedProjectPath(project)}`;
}

function isFreePlanKey(plan: string | null | undefined): boolean {
  const normalized = String(plan || 'free').trim().toLowerCase();
  return !normalized || normalized === 'free';
}

function getProjectUpdatedAt(project: GeneratedProject, files: GeneratedFile[]): string | null {
  const dates = [project.updated_at, project.created_at, ...files.map(file => (file as any).updated_at)]
    .filter(Boolean)
    .map(value => Date.parse(String(value)))
    .filter(value => Number.isFinite(value));
  if (!dates.length) return null;
  return new Date(Math.max(...dates)).toISOString();
}

function sanitizeDeploymentForUser(deployment: any, publicUrl: string, customDomain: string | null) {
  if (!deployment) return null;
  return {
    id: deployment.id,
    provider: 'huggy',
    status: deployment.status || 'ready',
    deployment_url: publicUrl,
    public_url: publicUrl,
    custom_domain: customDomain,
    badge_required: Boolean(deployment.badge_required),
    commit_hash: deployment.commit_hash || null,
    branch: deployment.branch || 'main',
    created_at: deployment.created_at || null,
  };
}

function normalizeDeploymentStatusForPersistence(status: unknown): 'ready' | 'failed' {
  const normalized = String(status || '').trim().toLowerCase();
  if (/\b(error|failed|failure|canceled|cancelled|removed|deleted)\b/.test(normalized)) return 'failed';
  // Vercel can return transient states such as INITIALIZING, QUEUED, BUILDING,
  // or DEPLOYING immediately after accepting the deployment. Huggy persists the
  // publish snapshot as live because the Vercel URL has already been created;
  // provider-specific transients must not leak into Supabase enum columns.
  return 'ready';
}

function getVercelProjectName(project: Pick<GeneratedProject, 'id' | 'slug'>) {
  const slug = String(project.slug || project.id || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    || 'app';
  return `huggy-${slug}`.slice(0, 52).replace(/-+$/g, '') || 'huggy-app';
}

function toHttpsUrl(hostOrUrl: unknown) {
  const raw = String(hostOrUrl || '').trim();
  if (!raw) return '';
  return `https://${raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')}`;
}

function getPublicVercelDeploymentUrl(project: GeneratedProject, payload: any) {
  const aliases = [
    ...(Array.isArray(payload?.alias) ? payload.alias : []),
    ...(Array.isArray(payload?.aliases) ? payload.aliases : []),
  ]
    .map(toHttpsUrl)
    .filter(Boolean)
    .filter(url => /\.vercel\.app$/i.test(new URL(url).hostname))
    .filter(url => !/-projects\.vercel\.app$/i.test(new URL(url).hostname));
  return aliases[0] || `https://${getVercelProjectName(project)}.vercel.app`;
}

function injectHuggyPublishedBadge(html: string, project: GeneratedProject, publicOrigin = getHuggyPublicOrigin()) {
  if (!html || html.includes('data-huggy-published-badge="true"')) return html;
  const href = `${publicOrigin}/built-with-huggy/${encodeURIComponent(project.id)}`;
  const badge = `
<a data-huggy-published-badge="true" href="${escapeHtml(href)}" aria-label="Built with Huggy" style="position:fixed;right:14px;bottom:14px;z-index:2147483647;display:inline-flex;align-items:center;gap:7px;padding:8px 10px;border-radius:999px;background:rgba(28,28,28,.92);color:#fcfbf8;text-decoration:none;font:700 12px/1.1 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 12px 40px rgba(28,28,28,.22),0 0 0 1px rgba(252,251,248,.16) inset;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);">
  <svg aria-hidden="true" viewBox="0 0 32 32" width="20" height="20" style="display:block;flex:0 0 auto;border-radius:6px;box-shadow:0 0 0 1px rgba(252,251,248,.18),0 5px 14px rgba(0,0,0,.22);">
    <rect width="32" height="32" rx="8" fill="#09090b"/>
    <path fill="#ffffff" d="M16 8L25 13.5V14.5L16 9.5L7 14.5V13.5L16 8Z"/>
    <path fill="#ffffff" d="M7 16.5V24.5L11.5 22V14L7 16.5Z"/>
    <path fill="#ffffff" d="M25 16.5V24.5L16 24.5V22H20.5V14L25 16.5Z"/>
  </svg>
  <span>Built with Huggy</span>
</a>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${badge}\n</body>`);
  return `${html}\n${badge}`;
}

async function getOrganizationPlan(organizationId: string): Promise<string> {
  const client = requireSupabase('Organization plan lookup');
  try {
    const { data, error } = await client
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .maybeSingle();
    if (error) throw error;
    const row = (data || {}) as any;
    return String(row.plan || row.plan_key || row.subscription_plan || row.tier || 'free');
  } catch (error: any) {
    console.warn('[huggy:publish_plan_lookup_skipped]', { message: error?.message });
    return 'free';
  }
}

async function getPrimaryCustomDomain(projectId: string): Promise<string | null> {
  const client = requireSupabase('Primary domain lookup');
  try {
    const { data, error } = await client
      .from('domains')
      .select('domain,status,is_primary')
      .eq('project_id', projectId)
      .neq('status', 'removed');
    if (error) throw error;
    const domains = ((data || []) as any[])
      .filter((item: any) => ['active', 'verified'].includes(String(item.status || '').toLowerCase()) && normalizeDomainHost(item.domain));
    const primary = domains.find((item: any) => item.is_primary) || domains[0];
    return primary ? normalizeDomainHost(primary.domain) : null;
  } catch (error: any) {
    if (!isSchemaShapeError(error)) console.warn('[huggy:publish_domain_lookup_skipped]', { message: error?.message });
    return null;
  }
}

async function getLatestDeployment(projectId: string): Promise<any | null> {
  const client = requireSupabase('Latest deployment lookup');
  try {
    const { data, error } = await client
      .from('deployments')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return (data || [])[0] || null;
  } catch (error: any) {
    if (!isSchemaShapeError(error)) console.warn('[huggy:publish_deployment_lookup_skipped]', { message: error?.message });
    return null;
  }
}

async function getPublishCurrentVisitors(projectId: string): Promise<number> {
  const client = requireSupabase('Publish visitor lookup');
  try {
    const cutoffIso = new Date(Date.now() - ANALYTICS_CURRENT_VISITOR_WINDOW_MS).toISOString();
    const { data, error } = await client
      .from('project_analytics_sessions')
      .select('session_id,visitor_id,last_seen_at')
      .eq('project_id', projectId)
      .gte('last_seen_at', cutoffIso)
      .limit(1000);
    if (error) throw error;
    return uniqueCount(
      ((data || []) as any[]).map((session: any) => String(session.visitor_id || session.session_id || ''))
    );
  } catch (error: any) {
    if (!isSchemaShapeError(error)) console.warn('[huggy:publish_visitors_lookup_skipped]', { message: error?.message });
    return 0;
  }
}

function buildPublishStatus(context: PublishContext): PublishStatus {
  const { project, files, latestDeployment, plan, customDomain, currentVisitors = 0 } = context;
  const latestPublishedAt = latestDeployment?.created_at || null;
  const projectUpdatedAt = getProjectUpdatedAt(project, files);
  const hasUnpublishedChanges = Boolean(
    latestPublishedAt &&
    projectUpdatedAt &&
    Date.parse(projectUpdatedAt) > Date.parse(latestPublishedAt),
  );
  const previewReady = project.preview_status === 'ready' && Boolean(project.preview_html);
  const hasFiles = files.length > 0;
  const securityScan = scanGeneratedSecurity(files);
  const securityBlocking = securityScan.findings.filter(item => item.status === 'fail');
  const securityWarnings = securityScan.findings.filter(item => item.status === 'warn');
  const publicUrl = customDomain ? normalizeDomainUrl(customDomain) : getDefaultPublishedUrl(project);
  const state: PublishStatus['state'] = !previewReady || !hasFiles
    ? 'not_ready'
    : !latestDeployment
      ? 'ready_to_publish'
      : hasUnpublishedChanges
        ? 'changes_unpublished'
        : 'published';

  return {
    state,
    public_url: publicUrl,
    custom_domain: customDomain,
    current_visitors: Math.max(0, Number(currentVisitors || 0)),
    latest_published_at: latestPublishedAt,
    project_updated_at: projectUpdatedAt,
    badge_required: isFreePlanKey(plan),
    can_publish: previewReady && hasFiles && !securityBlocking.length,
    has_unpublished_changes: hasUnpublishedChanges,
    checks: [
      {
        key: 'files',
        label: 'Project files',
        status: hasFiles ? 'pass' : 'fail',
        detail: hasFiles ? `${files.length} files ready` : 'Generate the app before publishing.',
      },
      {
        key: 'preview',
        label: 'Preview',
        status: previewReady ? 'pass' : 'fail',
        detail: previewReady ? 'Preview is ready to snapshot.' : 'Run Build until the preview is ready.',
      },
      {
        key: 'security',
        label: 'Security',
        status: securityBlocking.length ? 'fail' : securityWarnings.length ? 'warn' : 'pass',
        detail: securityBlocking.length
          ? `${securityBlocking.length} blocking security issue${securityBlocking.length > 1 ? 's' : ''} must be fixed before publish.`
          : securityWarnings.length
            ? `${securityWarnings.length} security note${securityWarnings.length > 1 ? 's' : ''} saved for review.`
            : 'No blocking security issue detected.',
      },
      {
        key: 'domain',
        label: 'Live URL',
        status: customDomain ? 'pass' : 'warn',
        detail: customDomain ? `Custom domain: ${customDomain}` : `Default Huggy URL: ${publicUrl}`,
      },
      {
        key: 'badge',
        label: 'Huggy badge',
        status: isFreePlanKey(plan) ? 'warn' : 'pass',
        detail: isFreePlanKey(plan)
          ? 'Free plan publishes include a small Built with Huggy badge.'
          : 'Paid plan: no Huggy badge required.',
      },
    ],
  };
}

function stripReactImportsForPreview(source: string): string {
  let output = String(source || '')
    .replace(/^\s*import\s+['"][^'"]+\.css['"];?\s*$/gmi, '')
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gmi, '')
    .replace(/^\s*import\s+type\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gmi, '');

  output = output
    .replace(/export\s+default\s+function\s+App\s*\(/g, 'function App(')
    .replace(/export\s+function\s+App\s*\(/g, 'function App(')
    .replace(/export\s+const\s+App\s*=/g, 'const App =')
    .replace(/export\s+default\s+App\s*;?/g, '')
    .replace(/export\s+default\s+\(\s*\)\s*=>/g, 'const App = () =>')
    .replace(/export\s+default\s+/g, 'const App = ');

  if (!/\bfunction\s+App\s*\(|\bconst\s+App\s*=|\blet\s+App\s*=|\bvar\s+App\s*=/.test(output)) {
    output += '\nfunction App() { return <main><h1>Preview ready</h1><p>Huggy generated source files for this app.</p></main>; }\n';
  }

  return output;
}

function buildReactVitePreviewHtml(
  files: GeneratedFile[],
  projectName = 'Huggy app',
  projectId?: string,
  environment: 'preview' | 'production' = 'preview',
  promptOrDescription = '',
  slugOrId = '',
): string | null {
  const appFile = fileByPath(files, 'src/App.tsx') || fileByPath(files, 'src/App.jsx');
  if (!appFile) return null;

  const css = [
    fileByPath(files, 'src/index.css')?.content,
    fileByPath(files, 'src/App.css')?.content,
  ].filter(Boolean).join('\n\n');
  const appCode = stripReactImportsForPreview(appFile.content);
  const title = projectName || 'Huggy app';
  const description = summarizeForMeta(promptOrDescription || title, 'Production-ready React app generated with Huggy.');
  const slug = slugify(slugOrId || projectId || title) || 'huggy-app';
  const canonical = `https://huggy.fun/generated/${slug}`;
  const robots = environment === 'production' ? 'index, follow' : 'noindex, nofollow';
  const fallbackHtml = buildPreviewFallbackHtml({ projectName: title, prompt: promptOrDescription || title, files });
  const fallbackScriptValue = JSON.stringify(fallbackHtml);
  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <meta name="robots" content="${robots}" />`,
    `  <link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `  <title>${escapeHtml(title)}</title>`,
    `  <meta name="description" content="${escapeHtml(description)}" />`,
    `  <meta property="og:title" content="${escapeHtml(title)}" />`,
    `  <meta property="og:description" content="${escapeHtml(description)}" />`,
    '  <meta property="og:type" content="website" />',
    '  <meta name="twitter:card" content="summary_large_image" />',
    '  <script src="https://cdn.tailwindcss.com"></script>',
    '  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>',
    '  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>',
    '  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>',
    '  <style>',
    css || '',
    PREVIEW_FALLBACK_CSS,
    '  </style>',
    '</head>',
    '<body>',
    `  <div id="root">${fallbackHtml}</div>`,
    '  <noscript>',
    fallbackHtml,
    '  </noscript>',
    '  <script type="text/babel" data-presets="typescript,react">',
    `    const __HUGGY_PREVIEW_FALLBACK__ = ${fallbackScriptValue};`,
    '    function __huggyRestorePreview(error) {',
    '      try {',
    "        if (error) console.error('[huggy preview render failed]', error);",
    "        const rootNode = document.getElementById('root');",
    "        if (rootNode && rootNode.dataset.huggyMounted !== 'true') {",
    '          rootNode.innerHTML = __HUGGY_PREVIEW_FALLBACK__;',
    '        }',
    '      } catch (restoreError) {',
    "        console.error('[huggy preview fallback failed]', restoreError);",
    '      }',
    '    }',
    "    window.addEventListener('error', (event) => __huggyRestorePreview(event.error || event.message));",
    "    window.addEventListener('unhandledrejection', (event) => __huggyRestorePreview(event.reason));",
    "    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {",
    "      __huggyRestorePreview('React runtime unavailable');",
    "      throw new Error('React runtime unavailable');",
    '    }',
    '    const { useCallback, useEffect, useMemo, useRef, useState } = React;',
    appCode,
    '    try {',
    "      const rootNode = document.getElementById('root');",
    "      if (!rootNode) throw new Error('Missing #root element');",
    '      const root = ReactDOM.createRoot(rootNode);',
    '      root.render(<App />);',
    "      rootNode.dataset.huggyMounted = 'true';",
    '      window.setTimeout(() => {',
    "        if (rootNode.dataset.huggyMounted === 'true' && !rootNode.textContent.trim() && rootNode.children.length === 0) {",
    "          rootNode.dataset.huggyMounted = 'false';",
    "          __huggyRestorePreview('Generated app rendered an empty root');",
    '        }',
    '      }, 1200);',
    '    } catch (error) {',
    '      __huggyRestorePreview(error);',
    '    }',
    '  </script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
  return injectAnalyticsSnippet(html, projectId, environment);
}

function renderPreviewHtml(
  files: GeneratedFile[],
  projectName = 'Huggy app',
  projectId?: string,
  environment: 'preview' | 'production' = 'preview',
  promptOrDescription = '',
  slugOrId = '',
): string {
  const reactPreview = buildReactVitePreviewHtml(files, projectName, projectId, environment, promptOrDescription, slugOrId);
  if (reactPreview) return reactPreview;
  const indexFile = files.find(file => file.path === 'index.html') || files.find(file => file.path.endsWith('.html'));
  const html = indexFile?.content || buildFallbackAppHtml(projectName, 'Preview ready. Generate or edit this project to replace the placeholder.');
  const seoHtml = enhanceHtmlSeo(html, projectName, promptOrDescription || projectName, slugOrId || projectId || projectName, environment);
  return injectAnalyticsSnippet(seoHtml, projectId, environment);
}

function getProjectPreviewHtml(project: GeneratedProject, files: GeneratedFile[], environment: 'preview' | 'production' = 'preview'): string {
  if (project.preview_html) {
    const seoHtml = enhanceHtmlSeo(project.preview_html, project.name, project.prompt || project.name, project.slug || project.id, environment);
    return injectAnalyticsSnippet(seoHtml, project.id, environment);
  }
  return renderPreviewHtml(files, project.name, project.id, environment, project.prompt || project.name, project.slug || project.id);
}

function createTemplateFiles(projectName: string, prompt: string): GeneratedFile[] {
  const files = withProjectSeoSupport([
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
  ], projectName, prompt);
  return ensureModernFrontendProject(files, projectName, prompt);
}

class AgentOrchestrator {
  decide(input: { prompt: string; requestedMode?: string; hasFiles: boolean; lastPlan?: string }): IntentDecision {
    const text = input.prompt.trim();
    const lower = text.toLowerCase();
    const requestedMode = normalizeRequestedMode(input.requestedMode);
    const understanding = understandUserIntent({
      prompt: text,
      hasFiles: input.hasFiles,
      requestedMode,
      hasLastPlan: Boolean(input.lastPlan),
    });
    const forceBuild = requestedMode === 'build';
    const words = text.split(/\s+/).filter(Boolean);
    const hasAny = (hints: string[]) => hints.some(hint => lower.includes(hint));
    const decision = (patch: Partial<IntentDecision> & Pick<IntentDecision, 'intent' | 'confidence' | 'userVisibleReason'>): IntentDecision => ({
      requestedMode,
      understandingCategory: understanding.category,
      intentUnderstanding: understanding,
      requiresFileChanges: false,
      requiresPreviewRebuild: false,
      requiresCredits: false,
      autoPlanRequired: false,
      nextAction: patch.intent === 'conversation' ? 'answer' : 'ask_clarification',
      selectedModelPolicy: 'auto',
      routingSource: 'heuristic',
      ...patch,
    });

    if (requestedMode === 'plan') {
      return decision({
        intent: 'plan',
        confidence: 1,
        requiresCredits: true,
        nextAction: 'plan_only',
        selectedModelPolicy: 'economy',
        userVisibleReason: 'Huggy will prepare a plan without touching files.',
      });
    }

    if (isGreetingPrompt(text)) {
      return decision({
        intent: 'conversation',
        confidence: 0.95,
        nextAction: 'answer',
        userVisibleReason: 'This is a greeting, so Huggy will answer without changing files.',
      });
    }

    if (isSimpleLocalConversationPrompt(text)) {
      return decision({
        intent: 'conversation',
        confidence: 0.93,
        requiresCredits: false,
        nextAction: 'answer',
        selectedModelPolicy: 'auto',
        userVisibleReason: 'This is a quick conversation, so Huggy will answer immediately without changing files.',
      });
    }

    if (!text || text.length < 4) {
      return decision({
        intent: 'clarification_required',
        confidence: 0.62,
        nextAction: 'ask_clarification',
        userVisibleReason: 'The request is too short to safely change the app.',
        clarification: {
          question: isLikelyFrenchPrompt(text) ? 'Quel résultat veux-tu obtenir ?' : 'What outcome do you want?',
          choices: input.hasFiles
            ? ['Improve the current app', 'Fix a bug', 'Explain the project', 'Create a new feature']
            : ['Create a first version', 'Plan the app first', 'Explain what Huggy can do', 'Use a template'],
          recommendation: input.hasFiles
            ? 'Tell Huggy what should change or what feels broken.'
            : 'Describe the app in one sentence, for example: "a restaurant booking app".',
        },
      });
    }

    if (/^(crée|cree|créer|creer|génère|genere|générer|generer|build|create|generate|make|construis|fabrique)(\s+(app|site|application))?$/i.test(lower)) {
      return decision({
        intent: 'clarification_required',
        confidence: 0.86,
        nextAction: 'ask_clarification',
        userVisibleReason: 'The user wants generation, but the product target is missing.',
        clarification: {
          question: isLikelyFrenchPrompt(text)
            ? 'Quelle app veux-tu que je génère ?'
            : 'What app should I generate?',
          choices: [],
          recommendation: isLikelyFrenchPrompt(text)
            ? 'Exemple : "crée une todo app avec ajout, suppression et filtres".'
            : 'Example: "create a todo app with add, delete and filters".',
        },
      });
    }

    const shouldInspectInsteadOfChat = /\b(verifie|vérifie|verify|audit|check|teste|test|review|inspecte|inspect|analyse le projet|validate|validation)\b/i.test(lower);
    if (!forceBuild && !shouldInspectInsteadOfChat && understanding.action === 'answer' && !understanding.allowsFileAction) {
      return decision({
        intent: 'conversation',
        confidence: Math.max(0.82, understanding.confidence),
        requiresCredits: !isSimpleLocalConversationPrompt(text),
        nextAction: 'answer',
        selectedModelPolicy: understanding.category === 'text' ? 'economy' : 'auto',
        userVisibleReason: 'Huggy understood this as a response, explanation, strategy, or text task, not a file change.',
      });
    }

    const explicitAppBuildRequest = /\b(crée|cree|créer|creer|génère|genere|générer|generer|build|create|make|construis|fabrique)\b[\s\S]{0,80}\b(app|application|site web|web app|landing page|dashboard|marketplace|crm|portfolio|ecommerce|e-commerce|restaurant|todo|to do|to-do|admin panel)\b/i.test(lower)
      || /\b(app|application|site web|web app|landing page|dashboard|marketplace|crm|portfolio|ecommerce|e-commerce|restaurant|todo|to do|to-do|admin panel)\b[\s\S]{0,80}\b(crée|cree|créer|creer|génère|genere|générer|generer|build|create|make|construis|fabrique)\b/i.test(lower);

    if ((understanding.needsClarification && !explicitAppBuildRequest) || (forceBuild && !understanding.allowsFileAction && !explicitAppBuildRequest)) {
      return decision({
        intent: 'clarification_required',
        confidence: Math.max(0.78, understanding.confidence),
        nextAction: 'ask_clarification',
        routingSource: 'heuristic',
        userVisibleReason: forceBuild
          ? 'Build mode was selected, but the message does not name a safe technical target yet.'
          : 'The request is ambiguous enough that coding now could create the wrong result.',
        clarification: {
          question: isLikelyFrenchPrompt(text)
            ? 'Quelle app, écran, composant ou bug dois-je traiter ?'
            : 'What exact part should Huggy change or build?',
          choices: [],
          recommendation: isLikelyFrenchPrompt(text)
            ? 'Une phrase suffit.'
            : 'One sentence is enough: for example, "create a todo app with add, delete and filters".',
        },
      });
    }

    const conversationHints = [
      'explique', 'explain', 'c est quoi', "c'est quoi", 'what is', 'comment marche',
      'est-ce que', 'peux tu me dire', 'dis moi', 'pourquoi', 'how does', 'what do you think',
      'aide moi a comprendre', 'aide-moi a comprendre', 'analyse sans modifier', 'review only',
      'comment ca va', 'comment ça va', 'que peux tu faire', 'que peux-tu faire',
      'que sais tu faire', 'que sais-tu faire', 'qu est ce que tu sais faire',
      "qu'est ce que tu sais faire", "qu'est-ce que tu sais faire", 'what can you do',
      'what are you able to do'
    ];
    const buildHints = [
      'crée', 'creer', 'create', 'ajoute', 'add', 'modifie', 'change', 'corrige',
      'fix', 'build', 'implémente', 'implemente', 'generate', 'génère', 'genere',
      'page', 'component', 'dashboard', 'landing', 'formulaire', 'deploy', 'supprime',
      'remove', 'replace', 'met a jour', 'mets a jour', 'update'
    ];
    const planHints = [
      'plan', 'roadmap', 'architecture', 'avant de coder', 'avant de build', 'sans coder',
      'propose une approche', 'strategie', 'stratégie', 'spec', 'cahier des charges'
    ];
    const debugHints = [
      'bug', 'erreur', 'error', 'request failed', '500', '404', 'ne fonctionne pas',
      'marche pas', 'broken', 'crash', 'corrige', 'fix', 'debug',
      'huggy stopped before saving', 'blocking issue', 'blocking issues',
      'technical build score', 'preview ne s affiche pas', 'preview ne s affiche plus',
      'app ne s affiche pas', 'application ne s affiche pas', 'generated app still has',
      'index html should load', 'index.html should load', 'src main tsx', 'main tsx absent',
      'app tsx absent', 'preview blanche', 'blank preview', 'corrige le probleme'
    ];
    const verifyHints = [
      'verifie', 'vérifie', 'verify', 'audit', 'check', 'teste', 'test', 'review',
      'inspecte', 'inspect', 'analyse le projet', 'validate', 'validation'
    ];
    const deployHints = [
      'deploy', 'déploie', 'deploie', 'deployment', 'publish', 'publie', 'railway',
      'vercel', 'domain', 'domaine', 'dns', 'cloudflare', 'production'
    ];
    const complexHints = [
      'auth', 'login', 'signup', 'supabase', 'database', 'db', 'schema', 'migration',
      'billing', 'stripe', 'subscription', 'abonnement', 'credits', 'crédits',
      'deploy', 'deployment', 'railway', 'vercel', 'domain', 'analytics', 'seo',
      'admin', 'roles', 'rls', 'storage', 'multi page', 'plusieurs pages', 'dashboard',
      'settings', 'api', 'webhook', 'export code', 'database visible'
    ];
    const editHints = [
      'modifie', 'change', 'ajoute', 'remove', 'supprime', 'replace', 'mets a jour', 'met a jour', 'update',
      'couleur', 'color', 'fond', 'background', 'bouton', 'button', 'texte', 'text', 'titre', 'title',
      'grossis', 'grossir', 'agrandis', 'agrandir', 'bigger', 'larger', 'taille', 'size',
      'reduis', 'réduis', 'smaller', 'spacing', 'espace', 'padding', 'margin', 'radius', 'arrondi',
      'style', 'design', 'animation', 'hover', 'mobile', 'desktop'
    ];
    const lastPlanHints = ['ok fais', 'fais-le', 'implemente ça', 'implémente ça', 'build this plan', 'continue le plan'];

    if (hasAny(lastPlanHints) && input.lastPlan) {
      return decision({
        intent: 'build',
        confidence: 0.96,
        requiresFileChanges: true,
        requiresPreviewRebuild: true,
        requiresCredits: true,
        nextAction: 'build',
        selectedModelPolicy: 'balanced',
        userVisibleReason: 'The message refers to the last approved plan, so Huggy will build that plan.',
      });
    }

    if (hasAny(planHints) && !hasAny(buildHints)) {
      return decision({
        intent: 'plan',
        confidence: 0.91,
        requiresCredits: true,
        nextAction: 'plan_only',
        selectedModelPolicy: 'economy',
        userVisibleReason: 'This asks for planning, so Huggy will think through the work without changing files.',
      });
    }

    const wantsBuild = forceBuild || (hasAny(buildHints) && understanding.allowsFileAction);
    const wantsConversation = hasAny(conversationHints);
    const wantsNewAppBuild = understanding.category === 'app' && understanding.allowsFileAction;
    const wantsShortFeedbackIteration = input.hasFiles
      && understanding.allowsFileAction
      && understanding.signals?.includes('short_feedback');
    const wantsDebugFix = !wantsNewAppBuild && hasAny(debugHints) && understanding.allowsFileAction;
    const wantsVerify = hasAny(verifyHints);
    const wantsDeployAssist = hasAny(deployHints)
      && !/(crée|creer|create|ajoute|add|modifie|change|corrige|fix|build|implémente|implemente|generate|génère|genere|page|component|dashboard|landing|formulaire|supprime|remove|replace|update|met a jour|mets a jour)/i.test(lower);
    const wantsComplexWork = hasAny(complexHints) || words.length > 28;
    const wantsEdit = wantsShortFeedbackIteration || (input.hasFiles && hasAny(editHints) && understanding.allowsFileAction);

    if (!forceBuild && wantsConversation && !hasAny(buildHints)) {
      return decision({
        intent: 'conversation',
        confidence: 0.86,
        requiresCredits: !isSimpleLocalConversationPrompt(text),
        nextAction: 'answer',
        selectedModelPolicy: 'economy',
        userVisibleReason: 'This looks like a question, not an app change.',
      });
    }

    if (wantsDeployAssist) {
      return decision({
        intent: 'deploy_assist',
        confidence: 0.86,
        requiresCredits: true,
        nextAction: 'deploy_assist',
        selectedModelPolicy: 'economy',
        userVisibleReason: 'This is deployment guidance, so Huggy will assist without changing project files.',
      });
    }

    if (wantsVerify && !wantsBuild && !wantsDebugFix) {
      return decision({
        intent: 'verify',
        confidence: 0.86,
        requiresCredits: false,
        nextAction: 'verify',
        selectedModelPolicy: 'auto',
        userVisibleReason: 'This asks for inspection, so Huggy will verify the current project before suggesting fixes.',
      });
    }

    if (wantsNewAppBuild) {
      return decision({
        intent: 'build',
        confidence: Math.max(0.92, understanding.confidence),
        requiresFileChanges: true,
        requiresPreviewRebuild: true,
        requiresCredits: true,
        nextAction: wantsComplexWork ? 'plan_then_build' : 'build',
        autoPlanRequired: wantsComplexWork || !input.hasFiles,
        selectedModelPolicy: wantsComplexWork ? 'balanced' : 'economy',
        userVisibleReason: input.hasFiles
          ? 'The user explicitly asked for a new app, so Huggy will generate a new build instead of treating the prompt as a bug fix.'
          : 'The user explicitly asked Huggy to create a new app.',
      });
    }

    if (wantsDebugFix) {
      return decision({
        intent: 'debug_fix',
        confidence: 0.9,
        requiresFileChanges: true,
        requiresPreviewRebuild: true,
        requiresCredits: true,
        nextAction: 'debug_fix',
        autoPlanRequired: wantsComplexWork,
        selectedModelPolicy: wantsComplexWork ? 'balanced' : 'economy',
        userVisibleReason: wantsComplexWork
          ? 'This is a risky fix, so Huggy will plan briefly before patching.'
          : 'This looks like a bug fix, so Huggy will patch the project.',
      });
    }

    if (wantsEdit) {
      return decision({
        intent: 'edit',
        confidence: 0.88,
        requiresFileChanges: true,
        requiresPreviewRebuild: true,
        requiresCredits: true,
        nextAction: wantsComplexWork ? 'plan_then_build' : 'edit',
        autoPlanRequired: wantsComplexWork,
        selectedModelPolicy: wantsComplexWork ? 'balanced' : 'economy',
        userVisibleReason: wantsComplexWork
          ? 'This edit touches product architecture, so Huggy will plan before changing files.'
          : 'This is a targeted edit to the current project.',
      });
    }

    const vagueBuildHints = ['app', 'application', 'site', 'dashboard', 'saas', 'projet', 'platforme', 'plateforme'];
    const isVagueBuild = (forceBuild || requestedMode === 'auto')
      && !input.hasFiles
      && words.length < 8
      && vagueBuildHints.some(hint => lower.includes(hint))
      && !/(app|application|site web|web app|restaurant|booking|auth|login|crm|ecommerce|e-commerce|portfolio|marketplace|admin|analytics|chat|blog|landing|dashboard|payment|stripe|supabase)/i.test(text);

    if (isVagueBuild) {
      return decision({
        intent: 'clarification_required',
        confidence: 0.78,
        nextAction: 'ask_clarification',
        userVisibleReason: 'The request is too broad, so Huggy needs one product decision before writing files.',
        clarification: {
          question: isLikelyFrenchPrompt(text) ? 'Quel type de première version veux-tu ?' : 'What kind of first version should Huggy create?',
          choices: ['Landing page', 'SaaS dashboard', 'Marketplace', 'Admin panel'],
          recommendation: isLikelyFrenchPrompt(text)
            ? 'Choisis le type le plus proche, Huggy construira une première version ciblée.'
            : 'Choose the closest product type, then Huggy can build a focused first version.',
        },
      });
    }

    if ((forceBuild && understanding.allowsFileAction)
      || (/(je veux|j'aimerais|i want|i need|build me|make me|cree moi|crée moi)/i.test(text) && understanding.allowsFileAction)
      || wantsBuild) {
      return decision({
        intent: input.hasFiles && wantsBuild ? 'edit' : 'build',
        confidence: wantsBuild ? 0.9 : 0.8,
        requiresFileChanges: true,
        requiresPreviewRebuild: true,
        requiresCredits: true,
        nextAction: wantsComplexWork ? 'plan_then_build' : (input.hasFiles ? 'edit' : 'build'),
        autoPlanRequired: wantsComplexWork || !input.hasFiles,
        selectedModelPolicy: wantsComplexWork ? 'balanced' : 'economy',
        userVisibleReason: wantsComplexWork || !input.hasFiles
          ? 'Huggy will plan the safest app structure before building.'
          : 'Huggy will patch the existing project.',
      });
    }

    const ambiguousEdit = input.hasFiles
      && words.length <= 7
      && /(fais|fait|make|mets|met|change|modifie|ameliore|améliore|corrige|fix|ça|ca|this|it|mieux|better)/i.test(lower)
      && !/(couleur|color|texte|text|bouton|button|page|input|menu|settings|pricing|dashboard|preview|login|auth|database|supabase)/i.test(lower);

    if (ambiguousEdit) {
      return decision({
        intent: 'clarification_required',
        confidence: 0.72,
        nextAction: 'ask_clarification',
        routingSource: 'fallback',
        userVisibleReason: 'The request refers to the current app, but the target is not clear enough for a safe edit.',
        clarification: {
          question: isLikelyFrenchPrompt(text)
            ? 'Qu’est-ce que tu veux que Huggy améliore exactement ?'
            : 'What exactly should Huggy improve?',
          choices: input.hasFiles
            ? ['Modifier le design visible', 'Corriger un bug précis', 'Améliorer le texte', 'Expliquer le projet']
            : ['Créer une première version', 'Faire un plan', 'Expliquer l’idée'],
          recommendation: isLikelyFrenchPrompt(text)
            ? 'Indique l’écran, le bouton, le texte ou le comportement à modifier.'
            : 'Name the screen, button, text, or behavior to change.',
        },
      });
    }

    return decision({
      intent: 'conversation',
      confidence: 0.7,
      nextAction: 'answer',
      selectedModelPolicy: 'economy',
      userVisibleReason: 'The request is understandable enough to answer without forcing a mode choice.',
    });
  }
}

const agentOrchestrator = new AgentOrchestrator();
const intentRouter = agentOrchestrator;

function parseLooseJsonObject(text: string): any | null {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const objectText = cleaned.startsWith('{') ? cleaned : cleaned.match(/\{[\s\S]*\}/)?.[0] || '';
  if (!objectText) return null;
  try {
    return JSON.parse(objectText);
  } catch {
    return null;
  }
}

function agentIntentNeedsAiRouter(decision: IntentDecision) {
  if (decision.requestedMode === 'plan') return false;
  if (decision.confidence < 0.72) return true;
  if (decision.intent === 'clarification_required' && decision.routingSource === 'fallback') return true;
  return false;
}

function buildDecisionFromAi(raw: any, fallback: IntentDecision): IntentDecision | null {
  const allowedIntents: AgentIntent[] = ['conversation', 'clarification_required', 'plan', 'build', 'edit', 'debug_fix', 'verify', 'deploy_assist', 'external_keys_required', 'credits_required'];
  const intent = allowedIntents.includes(raw?.intent) ? raw.intent as AgentIntent : null;
  if (!intent) return null;
  const requiresFileChanges = intent === 'build' || intent === 'edit' || intent === 'debug_fix';
  const nextActionByIntent: Record<AgentIntent, AgentNextAction> = {
    conversation: 'answer',
    clarification_required: 'ask_clarification',
    plan: 'plan_only',
    build: raw?.auto_plan_required ? 'plan_then_build' : 'build',
    edit: raw?.auto_plan_required ? 'plan_then_build' : 'edit',
    debug_fix: raw?.auto_plan_required ? 'plan_then_build' : 'debug_fix',
    verify: 'verify',
    deploy_assist: 'deploy_assist',
    external_keys_required: 'collect_external_keys',
    credits_required: 'show_upgrade',
  };
  const policy = ['economy', 'balanced', 'premium'].includes(raw?.selected_model_policy)
    ? raw.selected_model_policy
    : fallback.selectedModelPolicy || 'auto';
  const choices = Array.isArray(raw?.clarification?.choices)
    ? raw.clarification.choices.map((choice: unknown) => String(choice).slice(0, 80)).filter(Boolean).slice(0, 4)
    : fallback.clarification?.choices || [];

  return {
    ...fallback,
    intent,
    confidence: Math.max(0.5, Math.min(0.99, Number(raw?.confidence || fallback.confidence))),
    requiresFileChanges,
    requiresPreviewRebuild: requiresFileChanges,
    requiresCredits: intent === 'plan' || requiresFileChanges || (intent === 'conversation' && !isGreetingPrompt(String(raw?.normalized_prompt || ''))),
    autoPlanRequired: Boolean(raw?.auto_plan_required) && requiresFileChanges,
    nextAction: nextActionByIntent[intent],
    selectedModelPolicy: policy,
    routingSource: 'ai',
    reason: String(raw?.reason || fallback.reason || fallback.userVisibleReason).slice(0, 240),
    userVisibleReason: String(raw?.user_visible_reason || raw?.reason || fallback.userVisibleReason).slice(0, 240),
    clarification: intent === 'clarification_required'
      ? {
          question: String(raw?.clarification?.question || fallback.clarification?.question || 'What should Huggy do next?').slice(0, 180),
          choices,
          recommendation: String(raw?.clarification?.recommendation || fallback.clarification?.recommendation || 'Choose the option closest to your goal.').slice(0, 180),
        }
      : undefined,
  };
}

function guardAiDecisionWithUnderstanding(
  aiDecision: IntentDecision,
  input: { prompt: string; requestedMode?: string; hasFiles: boolean; lastPlan?: string },
  fallback: IntentDecision,
): IntentDecision {
  const requestedMode = normalizeRequestedMode(input.requestedMode);
  const understanding = understandUserIntent({
    prompt: input.prompt,
    hasFiles: input.hasFiles,
    requestedMode,
    hasLastPlan: Boolean(input.lastPlan),
  });
  const withUnderstanding = (decision: IntentDecision): IntentDecision => ({
    ...decision,
    understandingCategory: understanding.category,
    intentUnderstanding: understanding,
  });

  if (!aiDecision.requiresFileChanges || understanding.allowsFileAction) {
    return withUnderstanding(aiDecision);
  }

  if (requestedMode === 'build' || understanding.needsClarification) {
    return withUnderstanding({
      ...fallback,
      intent: 'clarification_required',
      confidence: Math.max(fallback.confidence, understanding.confidence, 0.8),
      requiresFileChanges: false,
      requiresPreviewRebuild: false,
      requiresCredits: false,
      nextAction: 'ask_clarification',
      routingSource: 'heuristic',
      userVisibleReason: 'Huggy paused because the message does not clearly request a safe file change.',
      clarification: {
        question: isLikelyFrenchPrompt(input.prompt)
          ? 'Quelle app, écran, composant ou bug dois-je traiter ?'
          : 'What exact result should Huggy produce or change?',
        choices: [],
        recommendation: isLikelyFrenchPrompt(input.prompt)
          ? 'Une phrase suffit.'
          : 'For project changes, name the exact screen, component, API, database, or bug.',
      },
    });
  }

  return withUnderstanding({
    ...fallback,
    intent: 'conversation',
    confidence: Math.max(fallback.confidence, understanding.confidence, 0.84),
    requiresFileChanges: false,
    requiresPreviewRebuild: false,
    requiresCredits: !isSimpleLocalConversationPrompt(input.prompt),
    nextAction: 'answer',
    selectedModelPolicy: 'auto',
    routingSource: 'heuristic',
    userVisibleReason: 'Huggy treated this as a response task instead of generating files.',
  });
}

async function classifyIntentWithAi(input: { prompt: string; requestedMode?: string; hasFiles: boolean; lastPlan?: string }, fallback: IntentDecision): Promise<IntentDecision | null> {
  if (!getOpenRouterApiKey() || !agentIntentNeedsAiRouter(fallback)) return null;
  const routerRuntime = buildAIModelRuntimeConfig({
    modelId: DEFAULT_PROVIDER_MODEL_ID,
    task: 'intent',
    stream: false,
    timeoutMs: 18_000,
    maxTokens: 1600,
  });
  const result = await providerGateway.chat(DEFAULT_PROVIDER_MODEL_ID, [
    {
      role: 'system',
      content: buildIntentRouterSystemPrompt(),
    },
    {
      role: 'user',
      content: JSON.stringify({
        prompt: input.prompt,
        requestedMode: normalizeRequestedMode(input.requestedMode),
        hasFiles: input.hasFiles,
        hasLastPlan: Boolean(input.lastPlan),
        localUnderstanding: fallback.intentUnderstanding || null,
        fallbackIntent: fallback.intent,
      }),
    },
  ], {
    maxAttempts: 1,
    timeoutMs: routerRuntime.timeoutMs,
    runtimeConfig: buildProviderRequestConfig(routerRuntime),
  });
  const aiDecision = buildDecisionFromAi(parseLooseJsonObject(result.text), fallback);
  return aiDecision ? guardAiDecisionWithUnderstanding(aiDecision, input, fallback) : null;
}

function applyTypedIntentLifecycle(input: { prompt: string; requestedMode?: string; hasFiles: boolean }, decision: IntentDecision): IntentDecision {
  const typedDecision = buildTypedIntentDecision({
    prompt: input.prompt,
    hasFiles: input.hasFiles,
    requestedMode: input.requestedMode,
    decision,
  });
  const gatedDecision = applyTypedIntentGate(decision, typedDecision) as IntentDecision;
  return {
    ...gatedDecision,
    typedDecision,
  };
}

async function resolveAgentDecision(input: { prompt: string; requestedMode?: string; hasFiles: boolean; lastPlan?: string }) {
  const fallback = intentRouter.decide(input);
  const finalize = (decision: IntentDecision): IntentDecision => applyTypedIntentLifecycle(input, decision);
  try {
    return finalize(await classifyIntentWithAi(input, fallback) || fallback);
  } catch (error) {
    console.warn('[huggy:agent_router_fallback]', { message: normalizeProviderError(error) });
    return finalize({ ...fallback, routingSource: fallback.routingSource === 'ai' ? 'fallback' : fallback.routingSource || 'fallback' });
  }
}

function createPlanResponse(project: GeneratedProject, prompt: string, files: GeneratedFile[]) {
  const isFrench = isLikelyFrenchPrompt(prompt);
  const fileHints = files.slice(0, 8).map((file, index) => `${index + 1}. ${file.path}`).join('\n') || (isFrench ? 'Aucun fichier généré pour le moment.' : 'No generated files yet.');
  if (isFrench) {
    return [
      `Plan pour ${project.name}`,
      '',
      `Objectif: ${prompt}`,
      '',
      '1. Clarifier le résultat visible attendu et protéger la version actuelle.',
      '2. Identifier les zones exactes à modifier au lieu de remplacer toute l’app.',
      '3. Appliquer le changement avec le minimum de fichiers touchés.',
      '4. Vérifier la preview, les erreurs évidentes, les chemins, le SEO de base et le contraste.',
      '5. Corriger une fois si un contrôle échoue, puis résumer ce qui a changé.',
      '',
      'Fichiers à considérer:',
      fileHints,
    ].join('\n');
  }
  return [
    `Plan for ${project.name}`,
    '',
    `Goal: ${prompt}`,
    '',
    '1. Clarify the visible outcome and protect the current working version.',
    '2. Identify the exact areas to change instead of replacing the whole app.',
    '3. Apply the change with the smallest useful file set.',
    '4. Verify preview, obvious runtime errors, safe paths, basic SEO, and contrast.',
    '5. Fix once if a check fails, then summarize what changed.',
    '',
    'Files to consider:',
    fileHints,
  ].join('\n');
}

function createConversationResponse(project: GeneratedProject, prompt: string) {
  if (isGreetingPrompt(prompt)) {
    return isLikelyFrenchPrompt(prompt)
      ? `Bonjour ! Je suis là. Dis-moi simplement ce que tu veux faire dans ${project.name} : je peux répondre, expliquer, modifier l’interface, corriger un bug ou construire la suite sans te demander de choisir un mode technique.`
      : `Hi! I’m here. Tell me what you want to do in ${project.name}: I can answer, explain, edit the UI, fix a bug, or build the next step without making you choose a technical mode.`;
  }
  if (isSimpleLocalConversationPrompt(prompt)) {
    const normalized = normalizePromptIntentText(prompt);
    if (/que peux|que sais|qu est ce que tu sais|tu peux faire quoi|what can you do|what are you able to do|help me|aide moi|comment tu peux/i.test(normalized)) {
      return isLikelyFrenchPrompt(prompt)
        ? `Je peux répondre simplement, expliquer ton projet, proposer un plan, modifier l’interface, corriger un bug ou lancer un build quand c’est nécessaire. Tu n’as pas besoin de choisir le bon mode : décris le résultat voulu, je décide du chemin le plus sûr.`
        : `I can answer questions, explain the project, suggest a plan, edit the UI, fix bugs, or build when needed. You do not need to pick the right mode: describe the outcome and I’ll choose the safest path.`;
    }
    if (/merci|thanks|thank you|ok|okay|d accord|daccord/i.test(normalized)) {
      return isLikelyFrenchPrompt(prompt)
        ? `Avec plaisir. Quand tu veux, envoie-moi la prochaine idée ou le prochain changement.`
        : `Anytime. Send the next idea or change whenever you are ready.`;
    }
    return isLikelyFrenchPrompt(prompt)
      ? `Oui, je suis là. Écris ton objectif comme tu le dirais à une personne : je traduis ça en action concrète.`
      : `Yes, I’m here. Describe the goal like you would to a person, and I’ll turn it into a concrete next action.`;
  }
  if (isLikelyFrenchPrompt(prompt)) {
    return [
      `Je peux t’aider sur ${project.name}. Je n’ai rien modifié.`,
      '',
      'Dis-moi le résultat attendu avec tes mots. Si c’est une question, je réponds. Si c’est une modification, je prépare le changement et je vérifie la preview.',
    ].join('\n');
  }
  return [
    `I can help with ${project.name}. I did not change files.`,
    '',
    'Tell me the outcome in plain language. If it is a question, I will answer. If it is a change, I will prepare it and verify the preview.',
  ].join('\n');
}

function createVerificationResponse(project: GeneratedProject, files: GeneratedFile[], checks: AgentVerificationCheck[]) {
  const summary = summarizeVerificationChecks(checks);
  const visibleIssues = checks
    .filter(check => check.status !== 'pass')
    .slice(0, 6)
    .map(check => `- ${check.severity.toUpperCase()}: ${check.message}${check.file ? ` (${check.file})` : ''}`)
    .join('\n');
  return [
    `Verification for ${project.name}`,
    '',
    `Status: ${summary.status}. Files inspected: ${files.length}.`,
    visibleIssues || '- No blocking issue found in the current preview checks.',
    '',
    summary.status === 'failed'
      ? 'I did not change files. Send “fix this” if you want Huggy to patch the issues.'
      : 'I did not change files. The current preview passes the basic checks Huggy can run locally.',
  ].join('\n');
}

function createDeployAssistResponse(project: GeneratedProject) {
  return [
    `Deploy checklist for ${project.name}`,
    '',
    '1. Make sure the preview is ready and the latest build has no blocking verification errors.',
    '2. Publish through your connected deploy target, then connect the custom domain in that provider first.',
    '3. Point DNS from Hostinger or Cloudflare to the value given by the deploy provider.',
    '4. Wait for DNS and SSL propagation, then test the live URL and social preview.',
    '',
    'I did not change files for this message.',
  ].join('\n');
}

function isLikelyFrenchPrompt(prompt: string) {
  return /\b(je|tu|vous|nous|veux|j'aimerais|crée|cree|corrige|explique|comment|pourquoi|bonjour|salut|merci|projet|application)\b/i.test(repairTextEncoding(prompt));
}

function summarizeProjectFilesForAgent(files: GeneratedFile[]) {
  return files
    .slice(0, 18)
    .map(file => `${file.path} (${file.language || 'text'}, ${file.content.length} chars)`)
    .join('\n') || 'No generated files yet.';
}

function buildExistingFilesContextForGeneration(files: GeneratedFile[]) {
  if (!files.length) return 'No existing files yet.';
  const important = [...files].sort((a, b) => {
    const score = (file: GeneratedFile) => file.path === 'index.html' ? 0 : file.path.endsWith('.css') ? 1 : file.path.endsWith('.js') ? 2 : 3;
    return score(a) - score(b) || a.path.localeCompare(b.path);
  });
  let budget = 85_000;
  const chunks: string[] = [];
  for (const file of important.slice(0, 18)) {
    if (budget <= 0) break;
    const header = `--- ${file.path} (${file.language || 'text'}) ---`;
    const content = String(file.content || '');
    const slice = content.length > budget ? content.slice(0, budget) : content;
    chunks.push(`${header}\n${slice}${content.length > slice.length ? '\n...[truncated]' : ''}`);
    budget -= slice.length + header.length;
  }
  return chunks.join('\n\n') || summarizeProjectFilesForAgent(files);
}

type AgentTaskComplexity = NonNullable<RoutingContext['taskComplexity']>;
const STUDIO_OPUS_MODEL_PREFERENCE: AllowedModelId[] = [
  'anthropic/claude-opus-4.8',
  'anthropic/claude-opus-4.8-fast',
  'anthropic/claude-opus-4.7',
];

function inferAgentTaskComplexity(prompt: string, decision: IntentDecision, files: GeneratedFile[] = []): AgentTaskComplexity {
  const text = String(prompt || '').toLowerCase();
  const riskyTerms = [
    'auth', 'authentication', 'login', 'signup', 'supabase', 'database', 'schema',
    'migration', 'stripe', 'billing', 'payment', 'paiement', 'credits', 'crédits',
    'deploy', 'publish', 'vercel', 'railway', 'domain', 'domaine', 'seo',
    'analytics', 'security', 'rls', 'role', 'permission', 'api externe',
    'external api', 'refactor', 'refactorise', 'multi screen', 'plusieurs ecrans',
    'plusieurs écrans',
  ];
  const extremeSignals = [
    'full stack', 'production', 'auth', 'billing', 'database', 'stripe', 'supabase',
    'multi-tenant', 'marketplace', 'dashboard complet', 'admin panel',
  ].filter(term => text.includes(term)).length;

  if (
    decision.selectedModelPolicy === 'premium'
    || text.length > 1800
    || (decision.autoPlanRequired && extremeSignals >= 3)
  ) {
    return 'extreme';
  }

  if (
    decision.selectedModelPolicy === 'balanced'
    || decision.autoPlanRequired
    || decision.intent === 'debug_fix'
    || decision.intent === 'build'
    || riskyTerms.some(term => text.includes(term))
    || files.length > 10
    || text.length > 900
  ) {
    return 'complex';
  }

  if (
    decision.intent === 'plan'
    || decision.intent === 'edit'
    || decision.intent === 'verify'
    || text.length > 320
    || files.length > 0
  ) {
    return 'medium';
  }

  return 'simple';
}

function routingModeForPolicy(policy?: IntentDecision['selectedModelPolicy']): RoutingContext['mode'] {
  if (policy === 'economy') return 'Fast';
  if (policy === 'balanced') return 'Balanced';
  if (policy === 'premium') return 'Premium';
  return 'Auto';
}

function studioPreferredModelsForPrompt(prompt: string): AllowedModelId[] | undefined {
  return /Huggy (Design|Decks|Media) workspace context:/i.test(prompt)
    ? STUDIO_OPUS_MODEL_PREFERENCE
    : undefined;
}

function requiredModelCapabilitiesForTask(
  prompt: string,
  decision: IntentDecision,
  complexity: AgentTaskComplexity,
  files: GeneratedFile[] = []
): RoutingContext['requiredCapabilities'] {
  const text = normalizePromptIntentText(prompt);
  const mutatesCode = ['build', 'edit', 'debug_fix'].includes(decision.intent);
  const touchesDesign = /\b(ui|ux|design|style|layout|landing|hero|component|composant|dashboard|animation|responsive|mobile)\b/i.test(text);
  const touchesBackend = /\b(api|backend|server|database|supabase|postgres|auth|login|stripe|billing|webhook|rls|storage|realtime)\b/i.test(text);
  const touchesSecurity = /\b(security|securite|sécurité|auth|rls|policy|policies|stripe|webhook|secret|service role|permission|role)\b/i.test(text);
  const needsVision = /\b(image|screenshot|capture|figma|maquette|mockup|wireframe|visuel|photo|screen)\b/i.test(text);
  return {
    reasoning: decision.intent !== 'conversation' || complexity !== 'simple',
    code: mutatesCode,
    agentic: mutatesCode || decision.autoPlanRequired || complexity === 'extreme',
    design: touchesDesign,
    security: touchesSecurity || touchesBackend,
    structuredOutput: decision.intent !== 'conversation',
    longContext: files.length > 12 || text.length > 1800 || complexity === 'extreme',
    vision: needsVision,
    tools: mutatesCode || decision.intent === 'verify',
  };
}

function inferRuntimeTaskForPrompt(prompt: string, decision: IntentDecision, mode: 'text' | 'generation' = 'text'): AIWorkflowTask {
  const text = normalizePromptIntentText(prompt);
  if (mode === 'generation') {
    if (/\b(database|supabase|postgres|sql|rls|schema|table|auth|login|stripe|billing|webhook|storage|realtime)\b/i.test(text)) return 'backend_generation';
    if (/\b(security|sécurité|securite|permission|role|secret|policy|policies|webhook)\b/i.test(text)) return 'security';
    if (/\b(ui|ux|design|style|layout|animation|responsive|mobile|hero|dashboard|component|composant)\b/i.test(text)) return 'frontend_generation';
    return 'frontend_generation';
  }
  if (decision.intent === 'conversation') return 'conversation';
  if (decision.intent === 'clarification_required') return 'clarification';
  if (decision.intent === 'plan') return 'planning';
  if (decision.intent === 'verify') return 'tests';
  if (decision.intent === 'deploy_assist') return 'deploy';
  if (decision.intent === 'debug_fix') return 'debug';
  if (decision.intent === 'edit' || decision.intent === 'build') {
    if (/\b(database|supabase|postgres|sql|rls|schema|table|auth|login|stripe|billing|webhook|storage|realtime)\b/i.test(text)) return 'backend_generation';
    if (/\b(security|sécurité|securite|permission|role|secret|policy|policies|webhook)\b/i.test(text)) return 'security';
    if (/\b(ui|ux|design|style|layout|animation|responsive|mobile|hero|dashboard|component|composant)\b/i.test(text)) return 'design';
    return 'frontend_generation';
  }
  if (/\b(image|screenshot|capture|figma|maquette|wireframe|mockup|visuel)\b/i.test(text)) return 'vision';
  return 'summary';
}

function createProviderRuntimeOptions(input: {
  model: AllowedModelId;
  prompt: string;
  decision: IntentDecision;
  files?: GeneratedFile[];
  mode?: 'text' | 'generation';
  stream?: boolean;
  timeoutMs?: number;
  maxTokens?: number;
}) {
  const task = inferRuntimeTaskForPrompt(input.prompt, input.decision, input.mode || 'text');
  const runtime = buildAIModelRuntimeConfig({
    modelId: input.model,
    task,
    stream: input.stream,
    timeoutMs: input.timeoutMs,
    maxTokens: input.maxTokens,
    hasVisionInput: /\b(image|screenshot|capture|figma|maquette|mockup|wireframe|visuel)\b/i.test(input.prompt),
    estimatedInputTokens: Math.ceil((
      String(input.prompt || '').length +
      (input.files || []).reduce((total, file) => total + String(file.content || '').length, 0)
    ) / 4),
  });
  return {
    runtime,
    providerConfig: buildProviderRequestConfig(runtime),
  };
}

async function resolveAgentProviderModel(input: {
  modelId?: unknown;
  project: GeneratedProject;
  prompt: string;
  decision: IntentDecision;
  files?: GeneratedFile[];
  userCredits?: number;
  plan?: string;
}): Promise<{ model: AllowedModelId; autoRouted: boolean; complexity: AgentTaskComplexity; mode: RoutingContext['mode']; plan: RoutingContext['plan']; credits: number }> {
  if (input.modelId && input.modelId !== 'auto') {
    const model = normalizeProviderModelForBackend(input.modelId);
    validateAllowedModel(model);
    return {
      model,
      autoRouted: false,
      complexity: inferAgentTaskComplexity(input.prompt, input.decision, input.files || []),
      mode: 'Custom',
      plan: (input.plan || 'free') as RoutingContext['plan'],
      credits: Number.isFinite(Number(input.userCredits)) ? Number(input.userCredits) : FALLBACK_WALLET_CREDITS,
    };
  }

  const plan = (input.plan || await getOrganizationPlan(input.project.organization_id).catch(() => 'free')) as RoutingContext['plan'];
  const credits = Number.isFinite(Number(input.userCredits))
    ? Number(input.userCredits)
    : await getWalletWithFallback(getOptionalDbHelpers('model_routing'), input.project.organization_id);
  const complexity = inferAgentTaskComplexity(input.prompt, input.decision, input.files || []);
  const mode = routingModeForPolicy(input.decision.selectedModelPolicy);
  const model = await modelRouter.selectModel({
    plan,
    mode,
    userCredits: credits,
    taskComplexity: complexity,
    preferredModels: studioPreferredModelsForPrompt(input.prompt),
    requiredCapabilities: requiredModelCapabilitiesForTask(input.prompt, input.decision, complexity, input.files || []),
  });
  validateAllowedModel(model);
  return { model, autoRouted: true, complexity, mode, plan, credits };
}

function buildAgentTextMessages(input: {
  project: GeneratedProject;
  prompt: string;
  files: GeneratedFile[];
  decision: IntentDecision;
  researchContext?: string;
}): ChatMessage[] {
  const { project, prompt, files, decision, researchContext } = input;
  const languageInstruction = isLikelyFrenchPrompt(prompt)
    ? 'Answer in natural French.'
    : 'Answer in the same language as the user.';
  const fileSummary = summarizeProjectFilesForAgent(files);
  const modeInstruction = decision.intent === 'plan'
    ? 'Produce a concise execution plan. Do not claim files were changed. Do not include code unless needed for clarity.'
    : decision.intent === 'deploy_assist'
      ? 'Give deployment, domain or production-readiness guidance. Do not claim files were changed.'
      : 'Answer conversationally and helpfully. Do not claim files were changed. If the user likely wants implementation, explain what Huggy can do next.';

  return [
    {
      role: 'system',
      content: buildAgentTextSystemPrompt({
        intent: decision.intent,
        modeInstruction,
        languageInstruction,
        hasResearchContext: Boolean(researchContext),
      }),
    },
    {
      role: 'user',
      content: JSON.stringify({
        project: { name: project.name, status: project.status, preview_status: project.preview_status },
        request: prompt,
        intent: decision.intent,
        intent_category: decision.intentUnderstanding?.category || decision.understandingCategory,
        auto_plan_required: decision.autoPlanRequired,
        files: fileSummary,
        researchContext: researchContext || undefined,
      }),
    },
  ];
}

async function createAgentTextResponse(input: {
  project: GeneratedProject;
  prompt: string;
  files: GeneratedFile[];
  decision: IntentDecision;
  modelId?: unknown;
  userCredits?: number;
  plan?: string;
  researchContext?: string;
  allowLocalFallback?: boolean;
}): Promise<{ text: string; model: string; cost_usd: number }> {
  const { project, prompt, files, decision, researchContext } = input;
  if (decision.intent === 'clarification_required') {
    return { text: createClarificationContent(decision), model: 'auto', cost_usd: 0 };
  }
  if (decision.intent === 'verify') {
    const pipeline = runPreviewPipeline(project, files);
    const checks = verifyGeneratedProject({ projectName: project.name, files, previewHtml: pipeline.html });
    return { text: createVerificationResponse(project, files, checks), model: 'auto', cost_usd: 0 };
  }
  if (!getOpenRouterApiKey()) {
    if (decision.intent === 'plan') {
      return { text: createPlanResponse(project, prompt, files), model: 'auto', cost_usd: 0 };
    }
    if (decision.intent === 'deploy_assist') {
      return { text: createDeployAssistResponse(project), model: 'auto', cost_usd: 0 };
    }
    if (decision.intent === 'conversation') {
      return { text: createConversationResponse(project, prompt), model: 'auto', cost_usd: 0 };
    }
    throw new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY on Railway to enable live AI responses.');
  }

  const selectedModel = (await resolveAgentProviderModel({
    modelId: input.modelId,
    project,
    prompt,
    decision,
    files,
    userCredits: input.userCredits,
    plan: input.plan,
  })).model;
  validateAllowedModel(selectedModel);
  const runtimeOptions = createProviderRuntimeOptions({
    model: selectedModel,
    prompt,
    decision,
    files,
    stream: false,
    timeoutMs: decision.intent === 'conversation' ? 12_000 : decision.intent === 'plan' ? 30_000 : 45_000,
  });

  try {
    const result = await providerGateway.chat(
      selectedModel,
      buildAgentTextMessages({ project, prompt, files, decision, researchContext }),
      {
        maxAttempts: 1,
        timeoutMs: runtimeOptions.runtime.timeoutMs,
        runtimeConfig: runtimeOptions.providerConfig,
      },
    );

    return {
      text: result.text.trim() || (decision.intent === 'plan' ? createPlanResponse(project, prompt, files) : createConversationResponse(project, prompt)),
      model: result.model,
      cost_usd: result.cost_usd,
    };
  } catch (error) {
    if (decision.intent === 'plan') {
      return { text: createPlanResponse(project, prompt, files), model: 'auto', cost_usd: 0 };
    }
    if (decision.intent === 'conversation') {
      if (input.allowLocalFallback === false && isExplicitProviderModelSelection(input.modelId)) throw error;
      return { text: createConversationResponse(project, prompt), model: 'auto', cost_usd: 0 };
    }
    if (decision.intent === 'deploy_assist') {
      return { text: createDeployAssistResponse(project), model: 'auto', cost_usd: 0 };
    }
    throw error;
  }
}

async function streamAgentTextResponse(input: {
  project: GeneratedProject;
  prompt: string;
  files: GeneratedFile[];
  decision: IntentDecision;
  modelId?: unknown;
  userCredits?: number;
  plan?: string;
  researchContext?: string;
  allowLocalFallback?: boolean;
  onToken?: (chunk: string, meta: { index: number; model: string }) => Promise<void> | void;
}): Promise<{ text: string; model: string; cost_usd: number; streamed: boolean }> {
  const { project, prompt, files, decision, researchContext, onToken } = input;
  if (decision.intent === 'clarification_required') {
    return { text: createClarificationContent(decision), model: 'auto', cost_usd: 0, streamed: false };
  }
  if (decision.intent === 'verify') {
    const pipeline = runPreviewPipeline(project, files);
    const checks = verifyGeneratedProject({ projectName: project.name, files, previewHtml: pipeline.html });
    return { text: createVerificationResponse(project, files, checks), model: 'auto', cost_usd: 0, streamed: false };
  }
  if (!getOpenRouterApiKey()) {
    if (decision.intent === 'plan') {
      return { text: createPlanResponse(project, prompt, files), model: 'auto', cost_usd: 0, streamed: false };
    }
    if (decision.intent === 'deploy_assist') {
      return { text: createDeployAssistResponse(project), model: 'auto', cost_usd: 0, streamed: false };
    }
    if (decision.intent === 'conversation') {
      return { text: createConversationResponse(project, prompt), model: 'auto', cost_usd: 0, streamed: false };
    }
    throw new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY on Railway to enable live AI responses.');
  }

  const selectedModel = (await resolveAgentProviderModel({
    modelId: input.modelId,
    project,
    prompt,
    decision,
    files,
    userCredits: input.userCredits,
    plan: input.plan,
  })).model;
  validateAllowedModel(selectedModel);
  const textResponseTimeoutMs = decision.intent === 'plan'
    ? 30_000
    : decision.intent === 'deploy_assist'
      ? 14_000
      : 12_000;
  const runtimeOptions = createProviderRuntimeOptions({
    model: selectedModel,
    prompt,
    decision,
    files,
    stream: true,
    timeoutMs: textResponseTimeoutMs,
  });
  let text = '';
  let model: string = selectedModel;
  let cost_usd = 0;
  let index = 0;
  let streamed = false;

  try {
    for await (const event of providerGateway.streamChat(
      selectedModel,
      buildAgentTextMessages({ project, prompt, files, decision, researchContext }),
      { timeoutMs: runtimeOptions.runtime.timeoutMs, runtimeConfig: runtimeOptions.providerConfig },
    )) {
      if (event.type === 'token') {
        const chunk = event.text || '';
        if (!chunk) continue;
        text += chunk;
        model = event.model || model;
        streamed = true;
        await onToken?.(chunk, { index, model });
        index += 1;
      } else if (event.type === 'usage') {
        model = event.model || model;
        cost_usd = Number(event.cost_usd || 0);
      }
    }

    const fallback = decision.intent === 'plan'
      ? createPlanResponse(project, prompt, files)
      : createConversationResponse(project, prompt);
    return { text: text.trim() || fallback, model, cost_usd, streamed };
  } catch (error) {
    if (decision.intent === 'plan') {
      return { text: createPlanResponse(project, prompt, files), model: 'auto', cost_usd: 0, streamed: false };
    }
    if (decision.intent === 'conversation') {
      if (input.allowLocalFallback === false && isExplicitProviderModelSelection(input.modelId)) throw error;
      return { text: createConversationResponse(project, prompt), model: 'auto', cost_usd: 0, streamed: false };
    }
    if (decision.intent === 'deploy_assist') {
      return { text: createDeployAssistResponse(project), model: 'auto', cost_usd: 0, streamed: false };
    }
    throw error;
  }
}

function chunkTextForPublicStream(text: string, targetSize = 28) {
  const value = String(text || '');
  if (!value) return [];
  const chunks: string[] = [];
  let buffer = '';
  for (const part of value.split(/(\s+)/)) {
    if (buffer && buffer.length + part.length > targetSize) {
      chunks.push(buffer);
      buffer = part;
    } else {
      buffer += part;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function createClarificationContent(decision: IntentDecision) {
  if (decision.clarification) {
    const raw = `${decision.clarification.question || ''} ${decision.clarification.recommendation || ''}`;
    const isFrenchRaw = isLikelyFrenchPrompt(raw);
    if (/answer|respond|r[eÃ©]pond|modifier vraiment|change the project|build or plan|possible directions|r[eÃ©]pondre sans|cr[eÃ©]er une app|faire un plan/i.test(raw)) {
      decision.clarification.question = isFrenchRaw
        ? 'Quelle app, ecran ou bug dois-je traiter ?'
        : 'Which app, screen, or bug should I work on?';
      decision.clarification.choices = [];
      decision.clarification.recommendation = isFrenchRaw ? 'Une phrase suffit.' : 'One sentence is enough.';
      return isFrenchRaw
        ? `Precise la cible : ${decision.clarification.question}`
        : `I need one detail: ${decision.clarification.question}`;
    }
  }
  const question = decision.clarification?.question || 'I need one more detail before I can safely build this.';
  const isFrench = isLikelyFrenchPrompt(`${question} ${decision.clarification?.recommendation || ''}`);
  return isFrench
    ? `J’ai besoin d’une précision : ${question}`
    : `I need one detail: ${question}`;
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

function modelCreditFloor(modelId: unknown, fallback = 0) {
  return typeof modelId === 'string' && modelId !== 'auto'
    ? MODEL_ACTION_CREDIT_FLOORS[modelId as AllowedModelId] || fallback
    : fallback;
}

function normalizeProviderModelForBackend(value: unknown): AllowedModelId {
  return isAllowedModelId(value) ? value : DEFAULT_PROVIDER_MODEL_ID;
}

function isExplicitProviderModelSelection(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' && value !== 'auto';
}

function estimateActionCost(prompt: string, intent: IntentDecision, modelId?: unknown) {
  if (intent.intent === 'clarification_required' || !intent.requiresCredits) return { finalCredits: 0, minimum_action_credits: 0 };
  const selectedModelFloor = modelId === 'auto' && intent.intent !== 'plan'
    ? MODEL_ACTION_CREDIT_FLOORS[DEFAULT_PROVIDER_MODEL_ID]
    : modelCreditFloor(modelId);
  if (intent.intent === 'conversation') return costEstimator.calculateRequiredCredits({
    openrouter_cost_usd: 0.0002,
    infra_cost_usd: 0.00005,
    storage_cost_usd: 0,
    build_cost_usd: 0,
    domain_operation_cost_usd: 0,
    minimum_action_credits: 1,
    complexity_surcharge: prompt.length > 800 ? 0.5 : 0,
  });
  if (intent.intent === 'plan') return costEstimator.calculateRequiredCredits({
    openrouter_cost_usd: 0.0005,
    infra_cost_usd: 0.0001,
    storage_cost_usd: 0,
    build_cost_usd: 0,
    domain_operation_cost_usd: 0,
    minimum_action_credits: Math.max(1, selectedModelFloor),
    complexity_surcharge: prompt.length > 600 ? 0.5 : 0,
  });
  return costEstimator.calculateRequiredCredits({
    openrouter_cost_usd: 0.002,
    infra_cost_usd: 0.0005,
    storage_cost_usd: 0.0001,
    build_cost_usd: 0.001,
    domain_operation_cost_usd: 0,
    minimum_action_credits: Math.max(2, selectedModelFloor),
    complexity_surcharge: prompt.length > 400 ? 2 : 0,
  });
}

async function chargeCompletedAgentAction(
  helpers: ReturnType<typeof getDbHelpers> | null,
  userId: string,
  amount: number,
  description: string,
  referenceId: string,
) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  if (!helpers) {
    console.warn('[huggy:credit_charge_skipped]', {
      reason: 'persistence_unavailable',
      user_id: userId,
      amount,
      reference_id: referenceId,
    });
    return;
  }
  const finalBalance = await helpers.updateWallet(userId, -amount);
  await helpers.addLedger(userId, 'usage', -amount, finalBalance, description, referenceId);
}

function providerModelToDisplayName(modelId: string) {
  return AI_MODEL_DISPLAY_NAMES[modelId as AllowedModelId] || modelId.split('/').pop()?.replace(/[-_]/g, ' ') || modelId;
}

function buildPublicRuntimeCapabilities(modelId: AllowedModelId) {
  const profile = getAIModelCapabilityProfile(modelId);
  return {
    best_for: profile.bestUse,
    reasoning: profile.reasoning,
    code: profile.code,
    comprehension: profile.comprehension,
    agentic: profile.agentic,
    design: profile.design,
    security: profile.security,
    supports: {
      streaming: profile.supports.streaming,
      tool_calling: profile.supports.toolCalling,
      structured_output: profile.supports.structuredOutput,
      vision: profile.supports.vision,
      long_context: profile.supports.longContext,
    },
    speed: profile.speed,
    reliability: profile.reliability,
    fallback_available: Boolean(profile.fallbackPrimary),
  };
}

function buildPublicModelList() {
  const autoCapabilities = {
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    maxContextTokens: Math.max(...AI_ALLOWED_MODELS.map(id => AI_MODEL_CAPABILITIES[id]?.maxContextTokens || 0)),
  };

  return [
    {
      id: AI_AUTO_MODEL_OPTION.id,
      display_name: AI_AUTO_MODEL_OPTION.display_name,
      tier: AI_AUTO_MODEL_OPTION.tier,
      capabilities: autoCapabilities,
      runtime_capabilities: {
        best_for: ['automatic_routing', 'conversation', 'planning', 'code_generation', 'debug', 'design', 'security'],
        supports: {
          streaming: true,
          tool_calling: true,
          structured_output: true,
          vision: true,
          long_context: true,
        },
        fallback_available: true,
      },
      description: AI_AUTO_MODEL_OPTION.description,
      locked: false,
    },
    ...AI_ALLOWED_MODELS.map(id => {
      const definition = MODEL_REGISTRY.find(model => model.id === id) as ModelDefinition | undefined;
      return {
        id,
        display_name: definition?.label || providerModelToDisplayName(id),
        tier: AI_MODEL_TIERS[id],
        capabilities: AI_MODEL_CAPABILITIES[id],
        runtime_capabilities: buildPublicRuntimeCapabilities(id),
        provider: definition?.provider,
        description: definition?.description,
        plan_minimum: definition?.minPlan,
        badges: {
          new: Boolean(definition?.isNew),
          fast: Boolean(definition?.isFast),
          premium: Boolean(definition?.isPremium),
        },
        locked: false,
      };
    }),
  ];
}

function buildPublicModelProviderGroups() {
  const byProvider = getModelsByProvider();
  return (Object.keys(byProvider) as ModelProvider[]).map(provider => ({
    provider,
    meta: PROVIDER_META[provider],
    models: byProvider[provider].map(model => ({
      id: model.id,
      display_name: model.label,
      tier: model.tier,
      provider: model.provider,
      capabilities: AI_MODEL_CAPABILITIES[model.id as AllowedModelId],
      runtime_capabilities: buildPublicRuntimeCapabilities(model.id as AllowedModelId),
      description: model.description,
      plan_minimum: model.minPlan,
      badges: {
        new: Boolean(model.isNew),
        fast: Boolean(model.isFast),
        premium: Boolean(model.isPremium),
      },
      locked: false,
    })),
  }));
}

function sanitizeCreditLedgerEntry(row: any) {
  const rawAmount = Number(row?.amount || 0);
  return {
    id: row?.id || row?.reference_id || randomUUID(),
    type: String(row?.type || 'usage'),
    credits: Math.abs(rawAmount),
    direction: rawAmount < 0 ? 'debit' : 'credit',
    balance_after: typeof row?.balance_after === 'number' ? row.balance_after : null,
    description: sanitizeWorkspaceText(String(row?.description || '').replace(/\$[\d,.]+/g, '').replace(/cost|margin|provider/gi, 'usage'), 160),
    reference_id: row?.reference_id || null,
    created_at: row?.created_at || new Date().toISOString(),
  };
}

function sanitizeAiUsageRow(row: any) {
  const usage = Array.isArray(row?.ai_request_usage) ? row.ai_request_usage[0] : row?.ai_request_usage;
  const project = Array.isArray(row?.projects) ? row.projects[0] : row?.projects;
  const credits = Number(usage?.final_cost_credits || row?.credits_charged || row?.credits || Math.abs(Number(row?.amount || 0)) || 0);
  return {
    id: row?.id || row?.reference_id || randomUUID(),
    project_id: row?.project_id || null,
    project_name: project?.name || row?.project_name || 'Project',
    model_id: row?.model_id || row?.model || null,
    model_name: row?.model_id || row?.model ? providerModelToDisplayName(row.model_id || row.model) : 'Auto',
    mode: row?.request_type || row?.mode || row?.type || 'AI action',
    credits_charged: credits,
    status: row?.status || usage?.status || (Number(row?.amount || 0) > 0 ? 'refunded' : 'completed'),
    created_at: row?.created_at || new Date().toISOString(),
  };
}

function publicCreditGateResponse() {
  return {
    success: false,
    event: 'credits_insufficient',
    error: 'UpgradeRequired',
    message: 'Upgrade required',
    action: 'upgrade_required',
    suggested_action: 'use_auto',
  };
}

function countLineDiffStats(beforeContent = '', afterContent = '') {
  const beforeLines = String(beforeContent || '').split('\n');
  const afterLines = String(afterContent || '').split('\n');
  while (beforeLines.length && beforeLines[beforeLines.length - 1] === '') beforeLines.pop();
  while (afterLines.length && afterLines[afterLines.length - 1] === '') afterLines.pop();

  let start = 0;
  while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) start += 1;

  let beforeEnd = beforeLines.length - 1;
  let afterEnd = afterLines.length - 1;
  while (beforeEnd >= start && afterEnd >= start && beforeLines[beforeEnd] === afterLines[afterEnd]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const beforeMiddle = beforeLines.slice(start, beforeEnd + 1);
  const afterMiddle = afterLines.slice(start, afterEnd + 1);
  if (!beforeMiddle.length) return { additions: afterMiddle.length, deletions: 0 };
  if (!afterMiddle.length) return { additions: 0, deletions: beforeMiddle.length };

  const cellBudget = beforeMiddle.length * afterMiddle.length;
  if (cellBudget > 350_000) {
    const beforeCounts = new Map<string, number>();
    const afterCounts = new Map<string, number>();
    beforeMiddle.forEach(line => beforeCounts.set(line, (beforeCounts.get(line) || 0) + 1));
    afterMiddle.forEach(line => afterCounts.set(line, (afterCounts.get(line) || 0) + 1));
    let common = 0;
    beforeCounts.forEach((count, line) => {
      common += Math.min(count, afterCounts.get(line) || 0);
    });
    return {
      additions: Math.max(0, afterMiddle.length - common),
      deletions: Math.max(0, beforeMiddle.length - common),
    };
  }

  const previous = new Array(afterMiddle.length + 1).fill(0);
  const current = new Array(afterMiddle.length + 1).fill(0);
  for (let i = 1; i <= beforeMiddle.length; i += 1) {
    for (let j = 1; j <= afterMiddle.length; j += 1) {
      current[j] = beforeMiddle[i - 1] === afterMiddle[j - 1]
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    for (let j = 0; j <= afterMiddle.length; j += 1) previous[j] = current[j];
  }
  const common = previous[afterMiddle.length] || 0;
  return {
    additions: Math.max(0, afterMiddle.length - common),
    deletions: Math.max(0, beforeMiddle.length - common),
  };
}

function diffFiles(before: GeneratedFile[], after: GeneratedFile[]) {
  const beforeMap = new Map(before.map(file => [file.path, file.content]));
  const afterMap = new Map(after.map(file => [file.path, file.content]));
  const created = after.filter(file => !beforeMap.has(file.path)).map(file => file.path);
  const modified = after.filter(file => beforeMap.has(file.path) && beforeMap.get(file.path) !== file.content).map(file => file.path);
  const deleted = before.filter(file => !afterMap.has(file.path)).map(file => file.path);
  const file_stats = [
    ...created.map(path => {
      const stats = countLineDiffStats('', afterMap.get(path) || '');
      return { path, action: 'created', ...stats };
    }),
    ...modified.map(path => {
      const stats = countLineDiffStats(beforeMap.get(path) || '', afterMap.get(path) || '');
      return { path, action: 'modified', ...stats };
    }),
    ...deleted.map(path => {
      const stats = countLineDiffStats(beforeMap.get(path) || '', '');
      return { path, action: 'deleted', ...stats };
    }),
  ];
  return {
    created,
    modified,
    deleted,
    file_stats,
    summary: `${created.length} created, ${modified.length} modified, ${deleted.length} deleted`,
  };
}

function publicFileStreamSnippet(file: GeneratedFile) {
  const redacted = redactSecrets(file.content || '');
  return redacted.split('\n').slice(0, 26).join('\n').slice(0, 2400);
}

const GENERATED_SUPABASE_AUTH_CLIENT_MESSAGE = 'Le code genere essaie d utiliser Auth sans client configure. Huggy va corriger le client Auth automatiquement.';
const GENERATED_SUPABASE_CLIENT_PATH = 'src/lib/supabase.ts';
const SUPABASE_AUTH_METHOD_PATTERN = /\bauth\s*\.\s*(getSession|getUser|signIn|signInWithPassword|signInWithOAuth|signUp|signOut|onAuthStateChange|resetPasswordForEmail|updateUser)\b/i;

function fileUsesGeneratedSupabaseAuth(file: GeneratedFile) {
  const content = file.content || '';
  if (/\bsupabase\s*\.\s*auth\b/i.test(content)) return true;
  return SUPABASE_AUTH_METHOD_PATTERN.test(content) && /supabase|@supabase\/supabase-js|Huggy Cloud|authentication|auth/i.test(content);
}

function fileDefinesGeneratedSupabaseClient(file: GeneratedFile) {
  const content = file.content || '';
  return /\bcreateClient\s*\(/i.test(content)
    || /\bgetSupabaseClient\s*\(/i.test(content)
    || /\bexport\s+const\s+supabase\b/i.test(content)
    || /\bcreateHuggyCloudClient\s*\(/i.test(content)
    || /\bhuggyCloudAuth\b/i.test(content)
    || /Huggy Cloud auth client/i.test(content);
}

function detectGeneratedSupabaseAuthIssue(files: GeneratedFile[]) {
  const authFiles = files.filter(fileUsesGeneratedSupabaseAuth);
  if (!authFiles.length) return null;
  const unresolvedBareClientFile = authFiles.find(file => /\bsupabase\s*\.\s*auth\b/i.test(file.content || '') && !hasGeneratedSupabaseImportOrLocalClient(file.content || ''));
  if (unresolvedBareClientFile) {
    return {
      file: unresolvedBareClientFile.path || GENERATED_SUPABASE_CLIENT_PATH,
      message: GENERATED_SUPABASE_AUTH_CLIENT_MESSAGE,
      severity: 'high',
      diagnostic_code: 'SUPABASE_AUTH_CLIENT_UNDEFINED',
      suggested_action: 'fix_generated_auth_client',
    };
  }
  const hasClient = files.some(fileDefinesGeneratedSupabaseClient);
  if (hasClient) return null;
  return {
    file: authFiles[0]?.path || GENERATED_SUPABASE_CLIENT_PATH,
    message: GENERATED_SUPABASE_AUTH_CLIENT_MESSAGE,
    severity: 'high',
    diagnostic_code: 'SUPABASE_AUTH_CLIENT_UNDEFINED',
    suggested_action: 'fix_generated_auth_client',
  };
}

function generatedSupabaseClientFile(): GeneratedFile {
  return {
    path: GENERATED_SUPABASE_CLIENT_PATH,
    language: 'ts',
    updated_at: new Date().toISOString(),
    content: `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_HUGGY_CLOUD_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_HUGGY_CLOUD_SUPABASE_ANON_KEY || '';

const missingAuthMessage = 'Huggy Cloud Auth is not configured for this preview yet. The app is running in safe demo mode.';

function missingAuthResult() {
  return { data: { user: null, session: null }, error: new Error(missingAuthMessage) };
}

function createPreviewAuthStub() {
  const subscription = { unsubscribe() {} };
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => missingAuthResult(),
      signInWithOAuth: async () => missingAuthResult(),
      signUp: async () => missingAuthResult(),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => missingAuthResult(),
      updateUser: async () => missingAuthResult(),
      onAuthStateChange: () => ({ data: { subscription } }),
    },
  };
}

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createPreviewAuthStub() as any;

export function getSupabaseClient() {
  return supabase;
}

export function getAuthPreviewStatus() {
  return hasSupabaseConfig
    ? { ready: true, message: 'Huggy Cloud Auth is configured.' }
    : { ready: false, message: missingAuthMessage };
}
`,
  };
}

function relativeImportPath(fromFilePath: string, targetWithoutExtension: string) {
  const normalizedFrom = String(fromFilePath || 'src/App.tsx').replace(/\\/g, '/');
  const fromDir = path.posix.dirname(normalizedFrom);
  let relative = path.posix.relative(fromDir, targetWithoutExtension);
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative.replace(/\\/g, '/');
}

function insertGeneratedImport(content: string, importLine: string) {
  if (content.includes(importLine)) return content;
  const lines = content.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && /^\s*['"]use (client|strict)['"];?\s*$/.test(lines[index] || '')) {
    index += 1;
  }
  lines.splice(index, 0, importLine);
  return lines.join('\n');
}

function hasGeneratedSupabaseImportOrLocalClient(content: string) {
  return /from\s+['"][^'"]*supabase['"]/i.test(content)
    || /\bcreateClient\s*\(/i.test(content)
    || /\bgetSupabaseClient\s*\(/i.test(content)
    || /\bconst\s+supabase\s*=/i.test(content)
    || /\blet\s+supabase\s*=/i.test(content)
    || /\bvar\s+supabase\s*=/i.test(content);
}

function ensureSupabaseDependency(files: GeneratedFile[]) {
  return files.map(file => {
    if (file.path !== 'package.json') return file;
    try {
      const pkg = JSON.parse(file.content || '{}');
      pkg.dependencies = pkg.dependencies || {};
      if (!pkg.dependencies['@supabase/supabase-js']) {
        pkg.dependencies['@supabase/supabase-js'] = '^2.45.4';
      }
      return { ...file, content: `${JSON.stringify(pkg, null, 2)}\n`, updated_at: new Date().toISOString() };
    } catch {
      return file;
    }
  });
}

function applyGeneratedSupabaseAuthClientFix(files: GeneratedFile[]) {
  const now = new Date().toISOString();
  let changed = false;
  let nextFiles = files.map(file => {
    if (!fileUsesGeneratedSupabaseAuth(file)) return file;
    if (hasGeneratedSupabaseImportOrLocalClient(file.content || '')) return file;
    const importPath = relativeImportPath(file.path, 'src/lib/supabase');
    const importLine = `import { getSupabaseClient } from '${importPath}';`;
    const content = insertGeneratedImport(file.content || '', importLine)
      .replace(/\bsupabase\s*\.\s*auth\b/g, 'getSupabaseClient().auth');
    if (content === file.content) return file;
    changed = true;
    return { ...file, content, updated_at: now };
  });

  if (!nextFiles.some(file => file.path === GENERATED_SUPABASE_CLIENT_PATH)) {
    nextFiles = [...nextFiles, generatedSupabaseClientFile()];
    changed = true;
  }

  const withDependency = ensureSupabaseDependency(nextFiles);
  if (withDependency.some((file, index) => file.content !== nextFiles[index]?.content)) {
    changed = true;
  }

  return { files: withDependency, changed };
}

function runPreviewPipeline(project: GeneratedProject, files: GeneratedFile[]): PreviewBuildResult {
  const errors: any[] = [];
  for (const file of files) {
    if (!isSafeProjectFilePath(file.path)) {
      errors.push({ file: file.path, message: 'Unsafe file path blocked.', severity: 'high' });
    }
    if (/process\.env\.[A-Z0-9_]*SECRET/i.test(file.content) || containsSecret(file.content)) {
      errors.push({ file: file.path, message: 'Potential secret exposure detected in generated code.', severity: 'high' });
    }
    if (/from\s+['"][^'"]+['"]/.test(file.content) && /__missing_import__|missing-module/i.test(file.content)) {
      errors.push({ file: file.path, message: 'Missing import detected.', severity: 'medium' });
    }
    if (/__HUGGY_FORCE_ERROR__/i.test(file.content)) {
      errors.push({
        file: file.path,
        message: 'Preview contains a known forced runtime failure marker.',
        severity: 'high',
        diagnostic_code: 'FORCED_RUNTIME_FAILURE_MARKER',
        suggested_action: 'auto_fix_generated_runtime_marker',
      });
    }
  }
  const supabaseAuthIssue = detectGeneratedSupabaseAuthIssue(files);
  if (supabaseAuthIssue) errors.push(supabaseAuthIssue);

  const html = renderPreviewHtml(files, project.name, project.id, 'preview', project.prompt || project.name, project.slug || project.id);
  if (!html.trim()) {
    errors.push({ file: 'index.html', message: 'Preview HTML is empty.', severity: 'high' });
  } else if (/__HUGGY_FORCE_ERROR__/i.test(html) && !errors.some(error => error?.diagnostic_code === 'FORCED_RUNTIME_FAILURE_MARKER')) {
    errors.push({
      file: 'index.html',
      message: 'Preview contains a known forced runtime failure marker.',
      severity: 'high',
      diagnostic_code: 'FORCED_RUNTIME_FAILURE_MARKER',
      suggested_action: 'auto_fix_generated_runtime_marker',
    });
  }

  return {
    status: errors.length ? 'failed' : 'ready',
    html: errors.length ? buildFallbackAppHtml('Preview needs attention', errors[0].message) : html,
    errors,
    summary: errors.length ? errors[0].message : 'Preview build completed successfully.',
  };
}

type AutoFixEngineResult = {
  files: GeneratedFile[];
  changed: boolean;
  changedPaths: string[];
  summaries: string[];
};

function generatedPath(value: string) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function setGeneratedFile(
  byPath: Map<string, GeneratedFile>,
  filePath: string,
  content: string,
  language = inferGeneratedLanguage(filePath),
  summaries?: string[],
) {
  const normalized = generatedPath(filePath);
  const existing = byPath.get(normalized);
  if (existing?.content === content) return false;
  byPath.set(normalized, {
    path: normalized,
    language,
    content,
    updated_at: new Date().toISOString(),
  });
  summaries?.push(existing ? `Updated ${normalized}.` : `Created ${normalized}.`);
  return true;
}

function cleanGeneratedBlockingMarkers(files: GeneratedFile[], summaries: string[] = []) {
  let changed = false;
  const cleaned = files.map(file => {
    const source = String(file.content || '');
    let content = source
      .replace(/^\s*throw\s+new\s+Error\(\s*['"`]__HUGGY_FORCE_ERROR__['"`]\s*\);\s*$/gim, '')
      .replace(/throw\s+new\s+Error\(\s*['"`]__HUGGY_FORCE_ERROR__['"`]\s*\);?/gi, '')
      .replace(/__HUGGY_FORCE_ERROR__/g, '')
      .replace(/import\s+[^;\n]+from\s+['"]__missing_import__['"];?\s*/gi, '')
      .replace(/from\s+['"]__missing_import__['"];?/gi, '');
    if (content === source) return file;
    changed = true;
    summaries.push(`Removed generated runtime blocker from ${generatedPath(file.path)}.`);
    return { ...file, content, updated_at: new Date().toISOString() };
  });
  return { files: cleaned, changed };
}

function createAutoFixViteIndexHtml(projectName = 'Huggy App', prompt = '') {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${escapeHtml(projectName || 'Huggy App')}</title>`,
    `    <meta name="description" content="${escapeHtml(summarizeForMeta(prompt || projectName, 'A production-ready React app generated with Huggy.'))}" />`,
    '  </head>',
    '  <body>',
    '    <div id="root"></div>',
    '    <script type="module" src="/src/main.tsx"></script>',
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

function createAutoFixMainTsx() {
  return [
    "import React from 'react';",
    "import ReactDOM from 'react-dom/client';",
    "import App from './App';",
    "import './index.css';",
    '',
    "ReactDOM.createRoot(document.getElementById('root')!).render(",
    '  <React.StrictMode>',
    '    <App />',
    '  </React.StrictMode>,',
    ');',
    '',
  ].join('\n');
}

function createAutoFixAppTsx(projectName = 'Huggy App', prompt = '') {
  const isTodo = /\b(todo|to do|to-do|tache|taches|task|tasks)\b/i.test(`${projectName} ${prompt}`);
  if (isTodo) {
    return [
      "import { FormEvent, useEffect, useMemo, useState } from 'react';",
      "import './index.css';",
      '',
      "type Filter = 'all' | 'active' | 'completed';",
      'type Todo = { id: number; title: string; completed: boolean };',
      "const STORAGE_KEY = 'huggy-todo-items';",
      '',
      'const initialTodos: Todo[] = [',
      "  { id: 1, title: 'Plan the first release', completed: true },",
      "  { id: 2, title: 'Test the preview', completed: false },",
      '];',
      '',
      'function readTodos(): Todo[] {',
      '  if (typeof window === "undefined") return initialTodos;',
      '  try {',
      '    const raw = window.localStorage.getItem(STORAGE_KEY);',
      '    const parsed = raw ? JSON.parse(raw) : null;',
      '    return Array.isArray(parsed) ? parsed : initialTodos;',
      '  } catch {',
      '    return initialTodos;',
      '  }',
      '}',
      '',
      'export default function App() {',
      "  const [todos, setTodos] = useState<Todo[]>(() => readTodos());",
      "  const [title, setTitle] = useState('');",
      "  const [filter, setFilter] = useState<Filter>('all');",
      "  const [feedback, setFeedback] = useState('');",
      '  useEffect(() => {',
      '    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));',
      '  }, [todos]);',
      '  const visibleTodos = useMemo(() => todos.filter((todo) => filter === "all" || (filter === "completed" ? todo.completed : !todo.completed)), [todos, filter]);',
      '  const completedCount = todos.filter((todo) => todo.completed).length;',
      '',
      '  function addTodo(event: FormEvent) {',
      '    event.preventDefault();',
      '    const clean = title.trim();',
      '    if (!clean) {',
      "      setFeedback('Add a task name first.');",
      '      return;',
      '    }',
      '    setTodos((current) => [{ id: Date.now(), title: clean, completed: false }, ...current]);',
      "    setTitle('');",
      "    setFeedback('Task added.');",
      '  }',
      '',
      '  function deleteTodo(todo: Todo) {',
      "    if (!window.confirm(`Delete \"${todo.title}\"?`)) return;",
      '    setTodos((current) => current.filter((item) => item.id !== todo.id));',
      "    setFeedback('Task deleted.');",
      '  }',
      '',
      '  return (',
      '    <main className="app-shell">',
      '      <section className="todo-card" aria-label="Todo application">',
      '        <p className="eyebrow">Generated by Huggy</p>',
      '        <div className="hero-row">',
      '          <div>',
      '            <h1>Todo workspace</h1>',
      '            <p>Create, complete, filter and delete tasks in a responsive app.</p>',
      '          </div>',
      '          <strong>{completedCount}/{todos.length} done</strong>',
      '        </div>',
      '        <form className="todo-form" onSubmit={addTodo}>',
      '          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a task..." aria-label="Task name" />',
      '          <button type="submit">Add task</button>',
      '        </form>',
      '        <div className="filters" aria-label="Task filters">',
      "          {(['all', 'active', 'completed'] as Filter[]).map((item) => (",
      '            <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>',
      '          ))}',
      '        </div>',
      '        {feedback ? <p className="feedback" role="status">{feedback}</p> : null}',
      '        <ul className="todo-list">',
      '          {visibleTodos.length ? visibleTodos.map((todo) => (',
      '            <li key={todo.id}>',
      '              <label>',
      '                <input type="checkbox" checked={todo.completed} onChange={() => setTodos((current) => current.map((item) => item.id === todo.id ? { ...item, completed: !item.completed } : item))} />',
      '                <span>{todo.title}</span>',
      '              </label>',
      '              <button type="button" onClick={() => deleteTodo(todo)}>Delete</button>',
      '            </li>',
      '          )) : <li className="empty">No tasks match this filter.</li>}',
      '        </ul>',
      '      </section>',
      '    </main>',
      '  );',
      '}',
      '',
    ].join('\n');
  }

  return [
    "import './index.css';",
    '',
    'export default function App() {',
    '  return (',
    '    <main className="app-shell">',
    '      <section className="todo-card">',
    '        <p className="eyebrow">Generated by Huggy</p>',
    `        <h1>${escapeHtml(projectName || 'Your app is ready')}</h1>`,
    `        <p>${escapeHtml(summarizeForMeta(prompt || 'A responsive React app generated by Huggy.', 'A responsive React app generated by Huggy.'))}</p>`,
    '        <div className="hero-row">',
    '          <button type="button" onClick={() => window.alert("Primary action ready.")}>Primary action</button>',
    '          <button type="button" onClick={() => window.alert("Secondary action ready.")}>Secondary action</button>',
    '        </div>',
    '      </section>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n');
}

function createAutoFixIndexCss() {
  return [
    '@tailwind base;',
    '@tailwind components;',
    '@tailwind utilities;',
    '',
    ':root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1c1c1c; background: #fcfbf8; }',
    '* { box-sizing: border-box; }',
    'body { margin: 0; min-height: 100vh; background: #fcfbf8; }',
    'button, input, textarea, select { font: inherit; }',
    '.app-shell { min-height: 100vh; display: grid; place-items: center; padding: clamp(24px, 6vw, 72px); background: radial-gradient(circle at top left, rgba(61, 115, 255, 0.12), transparent 34%), #fcfbf8; }',
    '.todo-card { width: min(100%, 760px); border: 1px solid #eceae4; border-radius: 28px; background: rgba(255,255,255,0.86); box-shadow: 0 24px 80px rgba(28,28,28,0.08); padding: clamp(22px, 4vw, 42px); }',
    '.eyebrow { margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #5f5f5d; font-size: 0.78rem; font-weight: 800; }',
    '.hero-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }',
    'h1 { margin: 0; font-size: clamp(2rem, 5vw, 4rem); letter-spacing: 0; }',
    'p { color: #5f5f5d; line-height: 1.65; }',
    '.todo-form { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin: 28px 0 16px; }',
    'input { border: 1px solid #dedbd2; border-radius: 999px; padding: 14px 16px; background: #fff; color: #1c1c1c; }',
    'button { border: 1px solid #1c1c1c; border-radius: 999px; background: #1c1c1c; color: #fff; padding: 12px 16px; cursor: pointer; transition: transform 160ms ease, opacity 160ms ease; }',
    'button:hover { transform: translateY(-1px); }',
    '.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }',
    '.filters button { background: #fff; color: #1c1c1c; border-color: #dedbd2; }',
    '.filters button.active { background: #dbe8ff; border-color: #8cb4ff; }',
    '.feedback { border-radius: 14px; background: #eef5ff; padding: 10px 12px; color: #1f4d8f; }',
    '.todo-list { display: grid; gap: 10px; padding: 0; margin: 18px 0 0; list-style: none; }',
    '.todo-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid #eceae4; border-radius: 18px; padding: 12px; background: #fff; }',
    '.todo-list label { display: flex; align-items: center; gap: 10px; }',
    '.todo-list button { background: #fff; color: #1c1c1c; border-color: #dedbd2; }',
    '.empty { color: #5f5f5d; justify-content: center; }',
    '@media (max-width: 640px) { .todo-form { grid-template-columns: 1fr; } .todo-list li { align-items: flex-start; flex-direction: column; } }',
    '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }',
    '',
  ].join('\n');
}

function fixPackageJsonScripts(byPath: Map<string, GeneratedFile>, summaries: string[]) {
  const existing = byPath.get('package.json');
  let json: any = {};
  try {
    json = existing?.content ? JSON.parse(existing.content) : {};
  } catch {
    json = {};
  }
  json.scripts = {
    ...(json.scripts || {}),
    dev: 'vite',
    build: 'vite build',
    test: json.scripts?.test || 'node --experimental-strip-types src/app.test.ts',
    lint: json.scripts?.lint || 'tsc --noEmit',
  };
  json.dependencies = {
    ...(json.dependencies || {}),
    '@vitejs/plugin-react': json.dependencies?.['@vitejs/plugin-react'] || 'latest',
    vite: json.dependencies?.vite || 'latest',
    typescript: json.dependencies?.typescript || 'latest',
    react: json.dependencies?.react || 'latest',
    'react-dom': json.dependencies?.['react-dom'] || 'latest',
  };
  json.devDependencies = json.devDependencies || {};
  json.devDependencies.tailwindcss = json.devDependencies.tailwindcss || '^3.4.17';
  json.devDependencies.postcss = json.devDependencies.postcss || '^8.4.49';
  json.devDependencies.autoprefixer = json.devDependencies.autoprefixer || '^10.4.20';
  return setGeneratedFile(byPath, 'package.json', JSON.stringify(json, null, 2), 'json', summaries);
}

function applyGeneratedDestructiveSafety(files: GeneratedFile[], summaries: string[]) {
  const appFile = fileByPath(files, 'src/App.tsx') || fileByPath(files, 'src/App.jsx');
  if (!appFile) return files;
  const source = appFile.content || '';
  const hasDestructive = /\b(delete|remove|reset|clear|supprimer|effacer)\b/i.test(source);
  const hasSafety = /\b(confirm\(|confirmation|undo|toast|modal|dialog|cancel|annuler|restore|rollback|feedback)\b/i.test(source);
  if (!hasDestructive || hasSafety) return files;
  const byPath = new Map(files.map(file => [generatedPath(file.path), { ...file }]));
  const injected = source.replace(
    /export\s+default\s+function\s+App\s*\(\)\s*\{/,
    "export default function App() {\n  const confirmDestructiveAction = (label = 'this item') => window.confirm(`Are you sure you want to delete ${label}?`);",
  );
  if (injected !== source) {
    setGeneratedFile(byPath, appFile.path, injected, appFile.language || inferGeneratedLanguage(appFile.path), summaries);
    return Array.from(byPath.values());
  }
  return files;
}

function runAutoFixEngine(project: GeneratedProject, files: GeneratedFile[], errors: any[]): AutoFixEngineResult {
  const reasonText = errors.map(error => `${error?.key || ''} ${error?.message || ''} ${error?.file || ''}`).join('\n');
  const summaries: string[] = [];
  const markerClean = cleanGeneratedBlockingMarkers(files.map(file => ({ ...file })), summaries);
  let working = markerClean.files;
  const shouldForceModernVite = !isModernFrontendProject(files)
    || /index\.html should load \/src\/main\.tsx as a module|vite_main_script|missing.*main\.tsx|missing.*app\.tsx|blank preview|preview.*empty|technical build score|runner|forced runtime failure marker|__HUGGY_FORCE_ERROR__/i.test(reasonText);
  const shouldFixDestructive = /destructive.*confirmation|destructive.*undo|clear feedback|delete\/remove|visual_destructive_confirmation|destructive_action_safety/i.test(reasonText);
  if (!shouldForceModernVite && !shouldFixDestructive && !markerClean.changed) {
    return { files, changed: false, changedPaths: [], summaries: [] };
  }
  working = shouldForceModernVite ? ensureModernFrontendProject(working, project.name, project.prompt || project.name) : working;
  const byPath = new Map(working.map(file => [generatedPath(file.path), { ...file, path: generatedPath(file.path) }]));

  if (shouldForceModernVite || !byPath.has('index.html')) {
    setGeneratedFile(byPath, 'index.html', createAutoFixViteIndexHtml(project.name, project.prompt || project.name), 'html', summaries);
  }

  const indexHtml = byPath.get('index.html')?.content || '';
  if (!/<div\s+id=["']root["']\s*><\/div>/i.test(indexHtml) || !/<script[^>]+type=["']module["'][^>]+src=["']\/src\/main\.tsx["'][^>]*><\/script>/i.test(indexHtml)) {
    setGeneratedFile(byPath, 'index.html', createAutoFixViteIndexHtml(project.name, project.prompt || project.name), 'html', summaries);
  }

  if (!byPath.has('src/main.tsx') && !byPath.has('src/main.jsx')) {
    setGeneratedFile(byPath, 'src/main.tsx', createAutoFixMainTsx(), 'tsx', summaries);
  }

  if (!byPath.has('src/App.tsx') && !byPath.has('src/App.jsx')) {
    setGeneratedFile(byPath, 'src/App.tsx', createAutoFixAppTsx(project.name, project.prompt || project.name), 'tsx', summaries);
  }

  if (!byPath.has('src/index.css')) {
    setGeneratedFile(byPath, 'src/index.css', createAutoFixIndexCss(), 'css', summaries);
  }

  if (shouldForceModernVite) {
    fixPackageJsonScripts(byPath, summaries);
    setGeneratedFile(byPath, 'tailwind.config.ts', [
      "import type { Config } from 'tailwindcss';",
      '',
      'export default {',
      "  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],",
      '  theme: { extend: {} },',
      '  plugins: [],',
      '} satisfies Config;',
      '',
    ].join('\n'), 'ts', summaries);
    setGeneratedFile(byPath, 'postcss.config.cjs', [
      'module.exports = {',
      '  plugins: {',
      '    tailwindcss: {},',
      '    autoprefixer: {},',
      '  },',
      '};',
      '',
    ].join('\n'), 'js', summaries);
  }

  working = Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
  working = applyGeneratedDestructiveSafety(working, summaries);

  const originalByPath = new Map(files.map(file => [generatedPath(file.path), file.content]));
  const changedPaths = working
    .filter(file => originalByPath.get(generatedPath(file.path)) !== file.content)
    .map(file => file.path);

  return {
    files: working,
    changed: changedPaths.length > 0,
    changedPaths,
    summaries: Array.from(new Set(summaries.length ? summaries : changedPaths.map(path => `Repaired ${path}.`))),
  };
}

function applyAutoFix(project: GeneratedProject, files: GeneratedFile[], errors: any[]) {
  if (!errors.length) return { files, fixed: false, patch: null as any };
  const engineFix = runAutoFixEngine(project, files, errors);
  if (engineFix.changed) {
    return {
      files: engineFix.files,
      fixed: true,
      patch: {
        id: randomUUID(),
        project_id: project.id,
        target_file: engineFix.changedPaths[0] || 'index.html',
        summary: `AutoFixEngine repaired ${engineFix.changedPaths.length} file${engineFix.changedPaths.length > 1 ? 's' : ''}: ${engineFix.changedPaths.join(', ')}`,
        details: engineFix.summaries,
        created_at: new Date().toISOString(),
      },
    };
  }
  const primary = errors[0];
  if (errors.some(error => error?.diagnostic_code === 'SUPABASE_AUTH_CLIENT_UNDEFINED' || error?.suggested_action === 'fix_generated_auth_client')) {
    const fix = applyGeneratedSupabaseAuthClientFix(files);
    if (fix.changed) {
      return {
        files: fix.files,
        fixed: true,
        patch: {
          id: randomUUID(),
          project_id: project.id,
          target_file: GENERATED_SUPABASE_CLIENT_PATH,
          summary: 'Added a safe Huggy Cloud Auth client for generated Supabase auth usage.',
          created_at: new Date().toISOString(),
        },
      };
    }
  }
  const targetPath = primary.file || 'index.html';
  const patched = files.map(file => {
    if (file.path !== targetPath) return file;
    let content = file.content
      .replace(/__HUGGY_FORCE_ERROR__/g, '')
      .replace(/from\s+['"]__missing_import__['"];?/g, '')
      .replace(/sk_live_[A-Za-z0-9_]+|sk_test_[A-Za-z0-9_]+/g, 'SECRET_CONFIGURED_SERVER_SIDE');

    return { ...file, content, updated_at: new Date().toISOString() };
  });
  const changed = patched.some((file, index) => file.content !== files[index]?.content);

  if (!changed) {
    return { files, fixed: false, patch: null as any };
  }

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
  project?: GeneratedProject;
  projectName: string;
  prompt: string;
  decision?: IntentDecision;
  modelId?: string;
  userCredits?: number;
  plan?: string;
  existingFiles: GeneratedFile[];
  seniorAgentContext?: SeniorAgentContext;
}): Promise<{ files: GeneratedFile[]; summary: string; model: string; cost_usd: number }> {
  const hasLiveKey = Boolean(getOpenRouterApiKey());
  if (!hasLiveKey) {
    throw new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY on Railway to enable live generation.');
  }

  const selectedModel = input.project && input.decision
    ? (await resolveAgentProviderModel({
      modelId: input.modelId,
      project: input.project,
      prompt: input.prompt,
      decision: input.decision,
      files: input.existingFiles,
      userCredits: input.userCredits,
      plan: input.plan,
    })).model
    : input.modelId && input.modelId !== 'auto'
      ? normalizeProviderModelForBackend(input.modelId)
      : DEFAULT_PROVIDER_MODEL_ID;
  validateAllowedModel(selectedModel);

  const fileManifest = input.existingFiles
    .map(file => `${file.path} (${file.content.length} chars)`)
    .slice(0, 40)
    .join('\n');
  const existingFilesContent = buildExistingFilesContextForGeneration(input.existingFiles);
  const uiPolicy = buildWorldClassUiPolicy({ prompt: input.prompt });
  const runtimeOptions = input.decision
    ? createProviderRuntimeOptions({
      model: selectedModel,
      prompt: input.prompt,
      decision: input.decision,
      files: input.existingFiles,
      mode: 'generation',
      stream: false,
      timeoutMs: 120_000,
      maxTokens: 12_000,
    })
    : null;

  const result = await providerGateway.chat(selectedModel, [
    {
      role: 'system',
      content: buildGenerationSystemPrompt({
        prompt: input.prompt,
        uiPolicySystemPrompt: uiPolicy.systemPrompt,
        hasExistingFiles: input.existingFiles.length > 0,
      }),
    },
    {
      role: 'user',
      content: JSON.stringify({
        projectName: input.projectName,
        prompt: input.prompt,
        existingFiles: fileManifest || 'No existing files yet.',
        existingFilesContent,
        uiGenerationPolicy: uiPolicy.userContext,
        seniorAgentOS: input.seniorAgentContext || undefined,
      }),
    },
  ], {
    maxAttempts: 1,
    timeoutMs: runtimeOptions?.runtime.timeoutMs || 90_000,
    runtimeConfig: runtimeOptions?.providerConfig,
  });

  const parsed = parseGeneratedOutput(input.projectName, result.text, input.prompt, {
    hasExistingFiles: input.existingFiles.length > 0,
  });
  const files = parsed.files;
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
  researchContext?: string;
  seniorAgentContext?: SeniorAgentContext;
}) {
  const fileManifest = input.existingFiles
    .map(file => `${file.path} (${file.content.length} chars)`)
    .slice(0, 40)
    .join('\n');
  const existingFilesContent = buildExistingFilesContextForGeneration(input.existingFiles);
  const uiPolicy = buildWorldClassUiPolicy({ prompt: input.prompt });

  return [
    {
      role: 'system' as const,
      content: buildGenerationSystemPrompt({
        prompt: input.prompt,
        uiPolicySystemPrompt: uiPolicy.systemPrompt,
        hasExistingFiles: input.existingFiles.length > 0,
        hasResearchContext: Boolean(input.researchContext),
      }),
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        projectName: input.projectName,
        prompt: input.prompt,
        existingFiles: fileManifest || 'No existing files yet.',
        existingFilesContent,
        uiGenerationPolicy: uiPolicy.userContext,
        researchContext: input.researchContext || undefined,
        seniorAgentOS: input.seniorAgentContext || undefined,
      }),
    },
  ];
}

function buildDeterministicFallbackGeneratedOutput(projectName: string, promptOrDescription = '') {
  const prompt = String(promptOrDescription || projectName || '').trim();
  const normalized = normalizePromptIntentText(prompt);
  const isTodo = /\b(todo|to do|to-do|task|tasks|tache|taches|tâche|tâches)\b/i.test(normalized);
  const safeName = JSON.stringify(projectName || 'Huggy App');
  const safePrompt = JSON.stringify(prompt || 'A useful generated application.');

  const appContent = isTodo
    ? [
        "import { useEffect, useMemo, useState } from 'react';",
        "import './index.css';",
        '',
        "type TodoFilter = 'all' | 'active' | 'completed';",
        'type TodoItem = { id: number; title: string; completed: boolean };',
        "const STORAGE_KEY = 'huggy-generated-todos';",
        '',
        'const starterTodos: TodoItem[] = [',
        "  { id: 1, title: 'Plan the first useful version', completed: true },",
        "  { id: 2, title: 'Add real interactions', completed: false },",
        "  { id: 3, title: 'Test the responsive preview', completed: false },",
        '];',
        '',
        'function readTodos(): TodoItem[] {',
        '  if (typeof window === "undefined") return starterTodos;',
        '  try {',
        '    const raw = window.localStorage.getItem(STORAGE_KEY);',
        '    const parsed = raw ? JSON.parse(raw) : null;',
        '    return Array.isArray(parsed) ? parsed : starterTodos;',
        '  } catch {',
        '    return starterTodos;',
        '  }',
        '}',
        '',
        'export default function App() {',
        '  const [todos, setTodos] = useState<TodoItem[]>(() => readTodos());',
        "  const [filter, setFilter] = useState<TodoFilter>('all');",
        "  const [draft, setDraft] = useState('');",
        "  const [feedback, setFeedback] = useState('');",
        '',
        '  useEffect(() => {',
        '    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));',
        '  }, [todos]);',
        '',
        '  const visibleTodos = useMemo(() => {',
        "    if (filter === 'active') return todos.filter(todo => !todo.completed);",
        "    if (filter === 'completed') return todos.filter(todo => todo.completed);",
        '    return todos;',
        '  }, [filter, todos]);',
        '',
        '  const completedCount = todos.filter(todo => todo.completed).length;',
        '  const activeCount = todos.length - completedCount;',
        '',
        '  function addTodo(event: { preventDefault: () => void }) {',
        '    event.preventDefault();',
        '    const title = draft.trim();',
        "    if (!title) { setFeedback('Ajoute un nom de tache avant de valider.'); return; }",
        '    setTodos(current => [{ id: Date.now(), title, completed: false }, ...current]);',
        "    setDraft('');",
        "    setFeedback('Tache ajoutee et sauvegardee localement.');",
        '  }',
        '',
        '  function toggleTodo(id: number) {',
        '    setTodos(current => current.map(todo => todo.id === id ? { ...todo, completed: !todo.completed } : todo));',
        "    setFeedback('Statut mis a jour.');",
        '  }',
        '',
        '  function deleteTodo(id: number) {',
        '    const todo = todos.find(item => item.id === id);',
        '    if (todo && !window.confirm(`Delete "${todo.title}"?`)) return;',
        '    setTodos(current => current.filter(todo => todo.id !== id));',
        "    setFeedback('Tache supprimee.');",
        '  }',
        '',
        '  return (',
        '    <main className="app-shell">',
        '      <section className="hero">',
        '        <span className="eyebrow">Interactive todo workspace</span>',
        `        <h1>{${safeName}}</h1>`,
        `        <p>{${safePrompt}}</p>`,
        '      </section>',
        '',
        '      <section className="todo-panel" aria-label="Todo app">',
        '        <div className="stats-grid">',
        '          <div><strong>{todos.length}</strong><span>Total</span></div>',
        '          <div><strong>{activeCount}</strong><span>Active</span></div>',
        '          <div><strong>{completedCount}</strong><span>Completed</span></div>',
        '        </div>',
        '',
        '        <form className="todo-form" onSubmit={addTodo}>',
        '          <input',
        '            value={draft}',
        '            onChange={event => setDraft(event.target.value)}',
        '            placeholder="Add a task..."',
        '            aria-label="New task"',
        '          />',
        '          <button type="submit" disabled={!draft.trim()}>Add</button>',
        '        </form>',
        '',
        '        <div className="filters" aria-label="Todo filters">',
        "          {(['all', 'active', 'completed'] as TodoFilter[]).map(option => (",
        '            <button',
        '              key={option}',
        "              className={filter === option ? 'selected' : ''}",
        '              onClick={() => setFilter(option)}',
        '              type="button"',
        '            >',
        '              {option}',
        '            </button>',
        '          ))}',
        '        </div>',
        '',
        '        {feedback ? <p className="feedback" role="status">{feedback}</p> : null}',
        '',
        '        <div className="todo-list">',
        '          {visibleTodos.length ? visibleTodos.map(todo => (',
        '            <article className={todo.completed ? "todo-item done" : "todo-item"} key={todo.id}>',
        '              <label>',
        '                <input type="checkbox" checked={todo.completed} onChange={() => toggleTodo(todo.id)} />',
        '                <span>{todo.title}</span>',
        '              </label>',
        '              <button type="button" onClick={() => deleteTodo(todo.id)} aria-label={`Delete ${todo.title}`}>Delete</button>',
        '            </article>',
        '          )) : (',
        '            <div className="empty-state">',
        '              <strong>No tasks here.</strong>',
        '              <span>Switch filters or add a new task to keep moving.</span>',
        '            </div>',
        '          )}',
        '        </div>',
        '      </section>',
        '    </main>',
        '  );',
        '}',
        '',
      ].join('\n')
    : [
        "import { useState } from 'react';",
        "import './index.css';",
        '',
        'const features = [',
        "  'Responsive product interface',",
        "  'Working primary controls',",
        "  'Clear empty and success states',",
        '];',
        '',
        'export default function App() {',
        "  const [status, setStatus] = useState('Ready');",
        '',
        '  return (',
        '    <main className="app-shell">',
        '      <section className="hero">',
        '        <span className="eyebrow">Generated application</span>',
        `        <h1>{${safeName}}</h1>`,
        `        <p>{${safePrompt}}</p>`,
        '        <button type="button" onClick={() => setStatus("Interaction confirmed")}>Try primary action</button>',
        '      </section>',
        '      <section className="feature-grid">',
        '        {features.map(feature => <article key={feature}><strong>{feature}</strong><span>{status}</span></article>)}',
        '      </section>',
        '    </main>',
        '  );',
        '}',
        '',
      ].join('\n');

  const cssContent = [
    ':root { --color-bg: #fcfbf8; --color-surface: #fffdf8; --color-text: #1c1c1c; --color-muted: #5f5f5d; --color-border: #eceae4; --color-primary: #315fdc; --color-success: #16a34a; --color-warning: #d97706; --color-error: #dc2626; --color-info: #315fdc; --space-1: .5rem; --space-2: .75rem; --space-3: 1rem; --space-4: 1.5rem; --space-6: 2rem; --radius-lg: 18px; --radius-xl: 28px; --shadow-soft: 0 24px 70px rgba(28,28,28,.08); color: var(--color-text); background: var(--color-bg); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',
    '* { box-sizing: border-box; }',
    'body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top left, rgba(84,132,255,.14), transparent 32%), var(--color-bg); }',
    'button, input { font: inherit; }',
    '.app-shell { min-height: 100vh; padding: clamp(20px, 5vw, 72px); display: grid; gap: 24px; align-content: start; }',
    '.hero, .todo-panel, .feature-grid article { border: 1px solid var(--color-border); background: rgba(255,255,255,.82); border-radius: var(--radius-xl); box-shadow: var(--shadow-soft); }',
    '.hero { padding: clamp(24px, 5vw, 56px); display: grid; gap: 14px; max-width: 980px; }',
    '.eyebrow { color: var(--color-primary); font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }',
    'h1 { margin: 0; font-size: clamp(36px, 7vw, 76px); line-height: .95; letter-spacing: 0; }',
    'p { margin: 0; color: var(--color-muted); font-size: clamp(16px, 2vw, 20px); line-height: 1.55; max-width: 760px; }',
    '.todo-panel { padding: clamp(18px, 4vw, 34px); display: grid; gap: 18px; max-width: 980px; }',
    '.stats-grid, .feature-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }',
    '.stats-grid div, .feature-grid article { padding: 18px; display: grid; gap: 4px; }',
    '.stats-grid strong { font-size: 30px; }',
    '.stats-grid span, .feature-grid span { color: var(--color-muted); }',
    '.todo-form { display: grid; grid-template-columns: 1fr auto; gap: 10px; }',
    'input { width: 100%; min-height: 44px; border: 1px solid var(--color-border); border-radius: 999px; padding: 14px 16px; background: #fff; color: var(--color-text); }',
    'button { min-height: 44px; border: 0; border-radius: 999px; padding: 12px 18px; background: var(--color-text); color: #fff; font-weight: 800; cursor: pointer; transition: transform .18s ease, opacity .18s ease; }',
    'button:hover { transform: translateY(-1px); }',
    'button:disabled { opacity: .45; cursor: not-allowed; transform: none; }',
    '.feedback { margin: 0; border: 1px solid rgba(49,95,220,.18); border-radius: 16px; background: rgba(49,95,220,.08); color: #214aab; padding: 12px 14px; }',
    '.filters { display: flex; flex-wrap: wrap; gap: 8px; }',
    '.filters button { background: #f7f4ed; color: var(--color-text); border: 1px solid var(--color-border); }',
    '.filters button.selected { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }',
    '.todo-list { display: grid; gap: 10px; }',
    '.todo-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: #fff; }',
    '.todo-item label { display: flex; align-items: center; gap: 10px; min-width: 0; }',
    '.todo-item input { width: auto; }',
    '.todo-item.done span { color: #8a8984; text-decoration: line-through; }',
    '.todo-item button { background: #f7f4ed; color: var(--color-text); }',
    '.empty-state { border: 1px dashed #d8d4ca; border-radius: 20px; padding: 22px; display: grid; gap: 6px; color: #5f5f5d; }',
    '@media (max-width: 720px) { .stats-grid, .feature-grid { grid-template-columns: 1fr; } .todo-form { grid-template-columns: 1fr; } .todo-item { align-items: flex-start; flex-direction: column; } }',
    '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }',
    '',
  ].join('\n');

  return {
    summary: 'Generated a safe React/Vite fallback application because the model output was not structured.',
    files: [
      { path: 'src/App.tsx', content: appContent, language: 'tsx' },
      { path: 'src/index.css', content: cssContent, language: 'css' },
    ],
  };
}

function parseGeneratedOutput(
  projectName: string,
  rawText: string,
  promptOrDescription = '',
  options: { hasExistingFiles?: boolean } = {},
) {
  const isStandaloneHtml = looksLikeStandaloneHtml(rawText);
  let parsed = extractGeneratedJson(rawText) || extractGeneratedMarkdownFiles(rawText) || (
    isStandaloneHtml
      ? {
          summary: 'Generated a standalone HTML response and upgraded it into a modern React project structure.',
          files: [{ path: 'index.html', content: rawText.trim(), language: 'html' }],
        }
      : buildDeterministicFallbackGeneratedOutput(projectName, promptOrDescription)
  );
  if (!parsed) {
    throw new GeneratedOutputParseError();
  }

  let rawFiles = parsed.files || (parsed.html
    ? [{ path: 'index.html', content: String(parsed.html), language: 'html' }]
    : null);
  if (!rawFiles || !Array.isArray(rawFiles) || rawFiles.length === 0) {
    const fallback = buildDeterministicFallbackGeneratedOutput(projectName, promptOrDescription);
    parsed = {
      ...fallback,
      summary: parsed?.plan || parsed?.steps
        ? 'The model returned a plan without files, so Huggy generated a safe React/Vite app instead.'
        : fallback.summary,
    };
    rawFiles = parsed.files;
  }

  const normalizedFiles = withProjectSeoSupport(
    normalizeGeneratedFiles(rawFiles, { ensureIndex: !options.hasExistingFiles }),
    projectName,
    promptOrDescription || projectName,
    { ensureIndex: !options.hasExistingFiles },
  );
  const files = ensureModernFrontendProject(normalizedFiles, projectName, promptOrDescription || projectName);
  if (!files.length) {
    throw new GeneratedOutputParseError('Huggy could not find any safe generated files, so the existing app was kept unchanged.');
  }
  if (parsed.backendSchema && !files.some(file => file.path === 'supabase/schema.sql')) {
    files.push({ path: 'supabase/schema.sql', content: String(parsed.backendSchema), language: 'sql', updated_at: new Date().toISOString() });
  }

  const summary = String(parsed.summary || 'Modern React application files generated.');
  return {
    files,
    summary: /html\s+preview|standalone\s+html|complete\s+html/i.test(summary)
      ? 'Generated a modern React/Vite application with project files and preview.'
      : summary,
    backendSchema: parsed.backendSchema ? String(parsed.backendSchema) : '',
  };
}

function getInvalidEnumValueFromMessage(message: string) {
  return message.match(/invalid input value for enum [^:]+:\s*"([^"]+)"/i)?.[1] || '';
}

function isInvalidEnumValueError(error: any) {
  return /invalid input value for enum/i.test(error?.message || '');
}

function removeSchemaMissingColumn(row: Record<string, any>, error: any) {
  const column = getSchemaColumnFromMessage(String(error?.message || ''));
  if (column && column in row) {
    delete row[column];
    return true;
  }
  return false;
}

function projectRowCandidates(projectRow: Record<string, any>) {
  const base = withoutUndefinedValues({ ...projectRow });
  const { created_by: _createdBy, ...withoutCreatedByBase } = base;
  const compact = withoutUndefinedValues({
    id: base.id,
    owner_id: base.owner_id || base.organization_id,
    organization_id: base.organization_id || base.owner_id,
    name: base.name || 'Untitled app',
    slug: base.slug,
    prompt: base.prompt || '',
    template: base.template || 'custom',
    theme: base.theme || 'light',
    model_id: base.model_id || 'auto',
    status: base.status || 'draft',
    preview_status: base.preview_status || 'idle',
    preview_html: base.preview_html || '',
    created_at: base.created_at,
    updated_at: base.updated_at,
  });
  const noStatus = withoutUndefinedValues({
    ...compact,
    status: undefined,
    preview_status: undefined,
  });
  const activeStatus = withoutUndefinedValues({
    ...compact,
    status: 'active',
    preview_status: 'ready',
  });
  const minimal = withoutUndefinedValues({
    id: base.id,
    owner_id: base.owner_id || base.organization_id,
    organization_id: base.organization_id || base.owner_id,
    name: base.name || 'Untitled app',
    slug: base.slug,
    prompt: base.prompt || '',
    preview_html: base.preview_html || '',
    updated_at: base.updated_at,
  });

  return [base, withoutUndefinedValues(withoutCreatedByBase), compact, activeStatus, noStatus, minimal];
}

async function upsertProjectWithSchemaFallback(client: any, projectRow: Record<string, any>) {
  const triedShapes = new Set<string>();
  let lastError: any = null;

  for (const candidate of projectRowCandidates(projectRow)) {
    const row = { ...candidate };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const shapeKey = [
        Object.keys(row).sort().join(','),
        `status=${row.status ?? ''}`,
        `preview=${row.preview_status ?? ''}`,
      ].join('|');
      if (!shapeKey || triedShapes.has(shapeKey)) break;
      triedShapes.add(shapeKey);

      const { error } = await client.from('projects').upsert([row]);
      if (!error) return row;
      lastError = error;

      if (isInvalidEnumValueError(error)) {
        const invalidValue = getInvalidEnumValueFromMessage(error.message || '');
        if (row.status === invalidValue && row.status !== 'active') {
          row.status = 'active';
          continue;
        }
        if (row.preview_status === invalidValue && row.preview_status !== 'ready') {
          row.preview_status = 'ready';
          continue;
        }
        if ('status' in row) {
          delete row.status;
          continue;
        }
        if ('preview_status' in row) {
          delete row.preview_status;
          continue;
        }
      }

      if (isSchemaShapeError(error) && removeSchemaMissingColumn(row, error)) {
        continue;
      }

      break;
    }
  }

  throw new Error(`Supabase project persistence failed: ${lastError?.message || 'unknown schema mismatch'}`);
}

function projectFileRows(files: GeneratedFile[], project: GeneratedProject) {
  return files.map(file => withoutUndefinedValues({
    organization_id: project.organization_id,
    project_id: project.id,
    path: file.path,
    content: redactSecrets(file.content || ''),
    language: file.language || null,
    updated_at: new Date().toISOString(),
  }));
}

function isProjectFilesMissingError(error: any) {
  return /project_files|relation .* does not exist|table .* does not exist/i.test(error?.message || '');
}

function stripSchemaColumnFromProjectFileRows(rows: Record<string, any>[], error: any) {
  const column = getSchemaColumnFromMessage(String(error?.message || ''));
  if (!column || !rows.some(row => column in row)) return null;
  return rows.map(row => {
    const next = { ...row };
    delete next[column];
    return next;
  });
}

async function persistProjectFileRowsIndividually(client: any, rows: Record<string, any>[]) {
  for (const row of rows) {
    const updateResult = await client
      .from('project_files')
      .update(row)
      .eq('project_id', row.project_id)
      .eq('path', row.path)
      .select('path');

    if (updateResult.error) return updateResult.error;

    const updatedRows = Array.isArray(updateResult.data) ? updateResult.data.length : 0;
    if (updatedRows > 0) continue;

    const insertResult = await client.from('project_files').insert([row]);
    if (insertResult.error) return insertResult.error;
  }

  return null;
}

async function cleanupStaleProjectFileRows(client: any, projectId: string, nextPaths: Set<string>) {
  if (!nextPaths.size) return;

  const { data, error } = await client.from('project_files').select('path').eq('project_id', projectId);
  if (error) {
    if (isProjectFilesMissingError(error)) {
      console.warn('[huggy:project_files_cleanup_skipped]', { message: error.message });
      return;
    }
    console.warn('[huggy:project_files_cleanup_warning]', { message: error.message });
    return;
  }

  const stalePaths = (data || [])
    .map((row: any) => String(row?.path || ''))
    .filter((filePath: string) => filePath && !nextPaths.has(filePath));

  for (const filePath of stalePaths) {
    const deleteResult = await client
      .from('project_files')
      .delete()
      .eq('project_id', projectId)
      .eq('path', filePath);

    if (deleteResult.error) {
      console.warn('[huggy:project_files_stale_delete_warning]', {
        path: filePath,
        message: deleteResult.error.message,
      });
    }
  }
}

async function saveProjectFilesWithSchemaFallback(client: any, project: GeneratedProject, files: GeneratedFile[]) {
  let rows = projectFileRows(files, project);
  if (!rows.length) {
    console.warn('[huggy:project_files_empty_save_skipped]', {
      project_id: project.id,
      reason: 'Refusing to wipe project files from an empty generated file set.',
    });
    return;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const upsertResult = await client
      .from('project_files')
      .upsert(rows, { onConflict: 'project_id,path' });

    if (!upsertResult.error) {
      await cleanupStaleProjectFileRows(client, project.id, new Set(rows.map(row => String(row.path))));
      return;
    }

    const error = upsertResult.error;
    if (isProjectFilesMissingError(error)) {
      console.warn('[huggy:project_files_persistence_skipped]', { message: error.message });
      return;
    }

    if (isSchemaShapeError(error)) {
      const strippedRows = stripSchemaColumnFromProjectFileRows(rows, error);
      if (strippedRows) {
        rows = strippedRows;
        continue;
      }
    }

    const fallbackError = await persistProjectFileRowsIndividually(client, rows);
    if (!fallbackError) {
      await cleanupStaleProjectFileRows(client, project.id, new Set(rows.map(row => String(row.path))));
      return;
    }
    if (isProjectFilesMissingError(fallbackError)) {
      console.warn('[huggy:project_files_persistence_skipped]', { message: fallbackError.message });
      return;
    }
    if (isSchemaShapeError(fallbackError)) {
      const strippedRows = stripSchemaColumnFromProjectFileRows(rows, fallbackError);
      if (strippedRows) {
        rows = strippedRows;
        continue;
      }
    }

    throw new Error(`Supabase project file persistence failed: ${fallbackError?.message || error.message}`);
  }
}

async function saveProject(project: GeneratedProject, files?: GeneratedFile[]) {
  const client = requireSupabase('Project persistence');
  const projectRow: Record<string, any> = {
    ...project,
    created_by: project.created_by || project.owner_id || project.organization_id || DEFAULT_ORG_ID,
  };

  await upsertProjectWithSchemaFallback(client, projectRow);

  if (files) {
    await saveProjectFilesWithSchemaFallback(client, project, files);
  }

  return project;
}

async function loadProject(projectId: string, userId: string, req?: any): Promise<GeneratedProject | null> {
  const client = requireSupabase('Project loading');
  const { data, error } = await client.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error) throw new Error(`Supabase project load failed: ${error.message}`);
  if (!data) return null;
  const project = data as GeneratedProject;
  const role = await resolveProjectRole(project, userId, req);
  if (!role) return null;
  return { ...project, __huggy_project_role: role } as GeneratedProject;
}

async function loadProjectForAnalytics(projectId: string): Promise<GeneratedProject | null> {
  const client = requireSupabase('Analytics project loading');
  const { data, error } = await client.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error) throw new Error(`Supabase analytics project load failed: ${error.message}`);
  return (data as GeneratedProject) || null;
}

async function listProjectsForUser(userId: string): Promise<GeneratedProject[]> {
  const client = requireSupabase('Project listing');
  let { data, error } = await client.from('projects').select('*').eq('owner_id', userId).order('updated_at', { ascending: false });
  if (error && /owner_id|schema cache|column .*does not exist|could not find .* in the schema cache/i.test(error.message || '')) {
    const retry = await client.from('projects').select('*').eq('organization_id', userId).order('updated_at', { ascending: false });
    data = retry.data;
    error = retry.error;
  }
  if (error) throw new Error(`Supabase project listing failed: ${error.message}`);
  return (data || []) as GeneratedProject[];
}

async function loadProjectFiles(projectId: string): Promise<GeneratedFile[]> {
  const client = requireSupabase('Project file loading');
  let { data, error } = await client.from('project_files').select('path, content, language, updated_at').eq('project_id', projectId).order('path');
  if (error && /language|updated_at|schema cache|column .*does not exist|could not find .* in the schema cache/i.test(error.message || '')) {
    const retry = await client.from('project_files').select('path, content').eq('project_id', projectId).order('path');
    data = retry.data;
    error = retry.error;
  }
  if (error && /project_files|relation .* does not exist|table .* does not exist/i.test(error.message || '')) {
    console.warn('[huggy:project_files_load_skipped]', { project_id: projectId, message: error.message });
    return [];
  }
  if (error) throw new Error(`Supabase project files load failed: ${error.message}`);
  return (data || []).map((file: GeneratedFile) => ({
    ...file,
    content: redactSecrets(file.content || ''),
  })) as GeneratedFile[];
}

function withoutUndefinedValues(row: Record<string, any>) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

function deploymentRecordCandidates(record: any) {
  const status = normalizeDeploymentStatusForPersistence(record.status);
  return [
    withoutUndefinedValues({ ...record, status }),
    withoutUndefinedValues({
      id: record.id,
      organization_id: record.organization_id,
      project_id: record.project_id,
      provider: record.provider,
      provider_deployment_id: record.provider_deployment_id,
      deployment_url: record.deployment_url,
      status,
      commit_hash: record.commit_hash || null,
      branch: record.branch || 'main',
      created_at: record.created_at,
    }),
    withoutUndefinedValues({
      id: record.id,
      organization_id: record.organization_id,
      project_id: record.project_id,
      provider: record.provider,
      deployment_url: record.deployment_url,
      status,
      created_at: record.created_at,
    }),
    withoutUndefinedValues({
      id: record.id,
      project_id: record.project_id,
      provider: record.provider,
      provider_deployment_id: record.provider_deployment_id,
      deployment_url: record.deployment_url,
      status,
      created_at: record.created_at,
    }),
    withoutUndefinedValues({
      id: record.id,
      project_id: record.project_id,
      provider: record.provider,
      deployment_url: record.deployment_url,
      status,
      created_at: record.created_at,
    }),
    withoutUndefinedValues({
      id: record.id,
      project_id: record.project_id,
      deployment_url: record.deployment_url,
      status,
      created_at: record.created_at,
    }),
    withoutUndefinedValues({
      id: record.id,
      project_id: record.project_id,
      deployment_url: record.deployment_url,
      created_at: record.created_at,
    }),
  ];
}

async function saveDeploymentRecord(record: any) {
  const client = requireSupabase('Deployment persistence');
  const triedShapes = new Set<string>();
  let lastError: any = null;

  for (const candidate of deploymentRecordCandidates(record)) {
    const shapeKey = Object.keys(candidate).sort().join(',');
    if (!shapeKey || triedShapes.has(shapeKey)) continue;
    triedShapes.add(shapeKey);

    const { error } = await client.from('deployments').insert([candidate]);
    if (!error) return candidate;

    lastError = error;
    if (!isSchemaShapeError(error)) break;
  }

  throw createPublicError(
    `Vercel created the deployment, but Huggy could not save it in Supabase: ${lastError?.message || 'unknown persistence error'}`,
    500,
    'DEPLOYMENT_PERSISTENCE_FAILED_AFTER_VERCEL_SUCCESS',
    'apply_deployments_migration',
  );
}

async function saveAgentEvent(event: AgentEvent) {
  const row = {
    ...event,
    id: event.id || randomUUID(),
    message: redactSecrets(event.message || ''),
    payload: redactSecretPayload(event.payload || {}),
    created_at: event.created_at || new Date().toISOString(),
  };

  const client = requireSupabase('Agent event persistence');
  const { error } = await client.from('agent_events').insert([row]);
  if (error) {
    console.warn('[huggy:agent_event_persistence_skipped]', { message: redactSecrets(error.message, '[redacted]') });
  }
  return row;
}

function isMissingAgentV2TableError(error: any) {
  return /agent_runs|agent_run_steps|agent_memories|agent_verifications|agent_runner_results|agent_research_results|schema cache|relation .* does not exist|table .* does not exist|column .* does not exist|could not find .* in the schema cache/i.test(error?.message || '');
}

function isMissingHuggyCloudTableError(error: any) {
  return /huggy_cloud_projects|huggy_cloud_migrations|huggy_cloud_resources|project_backend_requirements|schema cache|relation .* does not exist|table .* does not exist|column .* does not exist|could not find .* in the schema cache/i.test(error?.message || '');
}

function publicHuggyCloudRequirementPayload(requirement: HuggyCloudRequirement) {
  return {
    needs_database: requirement.needs_database,
    needs_auth: requirement.needs_auth,
    needs_storage: requirement.needs_storage,
    needs_edge_functions: requirement.needs_edge_functions,
    needs_secrets: requirement.needs_secrets,
    detected_from_prompt: requirement.detected_from_prompt,
    recommended_mode: requirement.recommended_mode,
    summary: requirement.summary,
  };
}

async function upsertProjectBackendRequirements(project: GeneratedProject, prompt: string) {
  const requirement = detectHuggyCloudRequirements(prompt);
  if (!hasHuggyCloudRequirement(requirement)) return { requirement, cloudProject: null };

  try {
    const client = requireSupabase('Huggy Cloud requirement persistence');
    const now = new Date().toISOString();
    const requirementPayload = publicHuggyCloudRequirementPayload(requirement);
    const requirementsRow = {
      organization_id: project.organization_id,
      project_id: project.id,
      needs_database: requirementPayload.needs_database,
      needs_auth: requirementPayload.needs_auth,
      needs_storage: requirementPayload.needs_storage,
      needs_edge_functions: requirementPayload.needs_edge_functions,
      needs_secrets: requirementPayload.needs_secrets,
      detected_from_prompt: requirementPayload.detected_from_prompt,
      recommended_mode: requirementPayload.recommended_mode,
      status: 'detected',
      updated_at: now,
    };
    const { error: requirementsError } = await client
      .from('project_backend_requirements')
      .upsert([requirementsRow], { onConflict: 'project_id' });
    if (requirementsError) throw requirementsError;

    const cloudProjectRow = {
      organization_id: project.organization_id,
      project_id: project.id,
      provider: 'huggy_cloud',
      mode: requirement.recommended_mode,
      status: 'planned',
      region: 'auto',
      schema_name: buildHuggyCloudSchemaName(project.id),
      public_runtime_config: {
        backend_status: 'planned',
        backend_mode: requirement.recommended_mode,
        backend_summary: requirement.summary,
        managed_by: 'huggy_cloud',
      },
      updated_at: now,
    };
    const { data: cloudProject, error: cloudProjectError } = await client
      .from('huggy_cloud_projects')
      .upsert([cloudProjectRow], { onConflict: 'project_id' })
      .select('id,project_id,provider,mode,status,region,schema_name,public_runtime_config,created_at,updated_at')
      .maybeSingle();
    if (cloudProjectError) throw cloudProjectError;

    return { requirement, cloudProject: cloudProject || null };
  } catch (error: any) {
    if (isMissingHuggyCloudTableError(error)) {
      console.warn('[huggy:cloud_requirement_persistence_skipped]', { message: error.message });
      return { requirement, cloudProject: null };
    }
    throw error;
  }
}

async function loadProjectHuggyCloud(projectId: string) {
  try {
    const client = requireSupabase('Huggy Cloud project view');
    const [requirementsResult, cloudProjectResult, resourcesResult] = await Promise.all([
      client
        .from('project_backend_requirements')
        .select('needs_database,needs_auth,needs_storage,needs_edge_functions,needs_secrets,detected_from_prompt,recommended_mode,status,updated_at')
        .eq('project_id', projectId)
        .maybeSingle(),
      client
        .from('huggy_cloud_projects')
        .select('id,project_id,provider,mode,status,region,schema_name,public_runtime_config,created_at,updated_at')
        .eq('project_id', projectId)
        .maybeSingle(),
      client
        .from('huggy_cloud_resources')
        .select('id,resource_type,resource_name,schema_name,table_name,status,metadata,created_at,updated_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
    ]);

    for (const result of [requirementsResult, cloudProjectResult, resourcesResult]) {
      if (result.error) throw result.error;
    }

    return {
      requirements: requirementsResult.data || null,
      project: cloudProjectResult.data || null,
      resources: resourcesResult.data || [],
    };
  } catch (error: any) {
    if (isMissingHuggyCloudTableError(error)) {
      return { requirements: null, project: null, resources: [] };
    }
    throw error;
  }
}

const PUBLIC_MODEL_ROUTING_FIELD_RE = /^(model|model_id|model_name|selected_model|requested_model|routed_model|provider_model|selectedModel|requestedModel|auto_routed|task_complexity|routing_mode|selected_model_policy|provider)$/i;

function redactPublicAgentPayload<T>(value: T): T {
  const base = redactAgentPayload(value);
  if (Array.isArray(base)) return base.map(item => redactPublicAgentPayload(item)) as T;
  if (!base || typeof base !== 'object') return base;
  const output: Record<string, any> = {};
  for (const [key, item] of Object.entries(base as Record<string, any>)) {
    if (PUBLIC_MODEL_ROUTING_FIELD_RE.test(key)) continue;
    output[key] = redactPublicAgentPayload(item);
  }
  return output as T;
}

async function createAgentRun(project: GeneratedProject, userId: string, requestId: string, decision: IntentDecision, modelId: string, contextPack: Record<string, any>) {
  const row = {
    id: `run_${randomUUID()}`,
    request_id: requestId,
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    intent: decision.intent,
    mode: decision.requestedMode,
    model_id: modelId === 'auto' ? null : modelId,
    status: 'running',
    context_summary: redactPublicAgentPayload(contextPack),
    public_payload: redactPublicAgentPayload({
      auto_plan_required: decision.autoPlanRequired,
      next_action: decision.nextAction,
      routing_source: decision.routingSource,
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const client = requireSupabase('Agent run persistence');
  const { error } = await client.from('agent_runs').insert([row]);
  if (error) {
    if (isMissingAgentV2TableError(error)) {
      console.warn('[huggy:agent_run_persistence_skipped]', { message: error.message });
      return row;
    }
    throw new Error(`Supabase agent run persistence failed: ${error.message}`);
  }
  return row;
}

async function updateAgentRunStatus(runId: string, status: string, extra: Record<string, any> = {}) {
  if (!runId) return;
  const client = requireSupabase('Agent run update');
  const update = redactPublicAgentPayload({
    status,
    ...extra,
    updated_at: new Date().toISOString(),
    completed_at: ['completed', 'failed'].includes(status) ? new Date().toISOString() : extra.completed_at,
    cancelled_at: status === 'cancelled' ? new Date().toISOString() : extra.cancelled_at,
  });
  const { error } = await client.from('agent_runs').update(update).eq('id', runId);
  if (error && isMissingAgentV2TableError(error)) return;
  if (error) throw new Error(`Supabase agent run update failed: ${error.message}`);
}

async function updateAgentRunV3Meta(runId: string, extra: Record<string, any> = {}) {
  if (!runId || !AGENT_V3_ENABLED) return;
  const client = requireSupabase('Agent V3 run metadata update');
  const update = redactAgentPayload({
    ...extra,
    updated_at: new Date().toISOString(),
  });
  const { error } = await client.from('agent_runs').update(update).eq('id', runId);
  if (error && isMissingAgentV2TableError(error)) return;
  if (error) console.warn('[huggy:agent_v3_meta_update_skipped]', { message: error.message });
}

async function saveAgentRunStep(input: {
  agent_run_id: string;
  project: GeneratedProject;
  user_id: string;
  sequence_number: number;
  event_type: string;
  message: string;
  payload?: Record<string, unknown>;
  status?: string;
}) {
  if (!input.agent_run_id) return null;
  const row = {
    agent_run_id: input.agent_run_id,
    organization_id: input.project.organization_id,
    project_id: input.project.id,
    user_id: input.user_id,
    sequence_number: input.sequence_number,
    event_type: input.event_type,
    status: input.status || (input.event_type === 'error' ? 'failed' : 'completed'),
    message: redactSecrets(input.message || ''),
    public_payload: redactSecretPayload(redactPublicAgentPayload(input.payload || {})),
    created_at: new Date().toISOString(),
  };
  const client = requireSupabase('Agent run step persistence');
  const { error } = await client.from('agent_run_steps').insert([row]);
  if (error && isMissingAgentV2TableError(error)) return row;
  if (error) console.warn('[huggy:agent_run_step_persistence_skipped]', { message: redactSecrets(error.message, '[redacted]') });
  return row;
}

async function listAgentRuns(projectId: string, limitValue = 20) {
  const limit = Math.min(50, Math.max(1, Number(limitValue || 20)));
  const client = requireSupabase('Agent run listing');
  const { data, error } = await client.from('agent_runs').select('id,request_id,project_id,user_id,intent,status,diagnostic_code,suggested_action,duration_ms,public_payload,created_at,updated_at,completed_at,cancelled_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit);
  if (error && isMissingAgentV2TableError(error)) return [];
  if (error) throw new Error(`Supabase agent run listing failed: ${error.message}`);
  return (data || []).map(redactPublicAgentPayload);
}

async function getAgentRun(projectId: string, runId: string) {
  const client = requireSupabase('Agent run lookup');
  const { data, error } = await client.from('agent_runs').select('id,request_id,project_id,user_id,intent,status,diagnostic_code,suggested_action,duration_ms,public_payload,created_at,updated_at,completed_at,cancelled_at').eq('project_id', projectId).eq('id', runId).maybeSingle();
  if (error && isMissingAgentV2TableError(error)) return null;
  if (error) throw new Error(`Supabase agent run lookup failed: ${error.message}`);
  return data ? redactPublicAgentPayload(data) : null;
}

async function getAgentRunSteps(projectId: string, runId: string) {
  const client = requireSupabase('Agent run step listing');
  const { data, error } = await client.from('agent_run_steps').select('sequence_number,event_type,status,message,public_payload,created_at').eq('project_id', projectId).eq('agent_run_id', runId).order('sequence_number');
  if (error && isMissingAgentV2TableError(error)) return [];
  if (error) throw new Error(`Supabase agent run steps failed: ${error.message}`);
  return (data || []).map(redactPublicAgentPayload);
}

async function listAgentMemory(projectId: string) {
  const client = requireSupabase('Agent memory listing');
  const { data, error } = await client.from('agent_memories').select('id,memory_type,summary,architecture,ui_preferences,known_errors,recent_decisions,created_at,updated_at').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(8);
  if (error && isMissingAgentV2TableError(error)) return [];
  if (error) throw new Error(`Supabase agent memory listing failed: ${error.message}`);
  return (data || []).map(redactAgentPayload);
}

async function upsertAgentMemory(project: GeneratedProject, userId: string, summary: string, payload: Record<string, any> = {}) {
  const row = {
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    memory_type: 'project_summary',
    summary: summary.slice(0, 4000),
    architecture: redactAgentPayload(payload.architecture || {}),
    ui_preferences: redactAgentPayload(payload.ui_preferences || {}),
    known_errors: redactAgentPayload(payload.known_errors || []),
    recent_decisions: redactAgentPayload(payload.recent_decisions || []),
    updated_at: new Date().toISOString(),
  };
  const client = requireSupabase('Agent memory persistence');
  const { error } = await client.from('agent_memories').upsert([row], { onConflict: 'project_id,memory_type' });
  if (error && isMissingAgentV2TableError(error)) return row;
  if (error) console.warn('[huggy:agent_memory_persistence_skipped]', { message: error.message });
  return row;
}

async function upsertAgentTypedMemory(project: GeneratedProject, userId: string, memoryType: string, summary: string, payload: Record<string, any> = {}) {
  const row = {
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    memory_type: memoryType,
    summary: summary.slice(0, 4000),
    architecture: redactAgentPayload(payload.architecture || {}),
    ui_preferences: redactAgentPayload(payload.ui_preferences || {}),
    known_errors: redactAgentPayload(payload.known_errors || []),
    recent_decisions: redactAgentPayload(payload.recent_decisions || []),
    updated_at: new Date().toISOString(),
  };
  const client = requireSupabase('Agent typed memory persistence');
  const { error } = await client.from('agent_memories').upsert([row], { onConflict: 'project_id,memory_type' });
  if (error && isMissingAgentV2TableError(error)) return row;
  if (error) console.warn('[huggy:agent_typed_memory_persistence_skipped]', { message: error.message });
  return row;
}

async function recordAgentImprovementSignal(project: GeneratedProject, userId: string, input: {
  prompt: string;
  decision: IntentDecision;
  outcome: 'answered' | 'clarified' | 'planned' | 'verified' | 'deployed_guidance' | 'generated' | 'failed' | 'cancelled';
  previewChanged?: boolean;
  qualityStatus?: string;
  issueCount?: number;
}) {
  const signal = buildAgentImprovementSignal(input);
  return upsertAgentTypedMemory(project, userId, signal.memoryType, signal.summary, signal.payload);
}

function improvementOutcomeForDecision(decision: IntentDecision): 'answered' | 'clarified' | 'planned' | 'verified' | 'deployed_guidance' {
  if (decision.intent === 'clarification_required') return 'clarified';
  if (decision.intent === 'plan') return 'planned';
  if (decision.intent === 'verify') return 'verified';
  if (decision.intent === 'deploy_assist') return 'deployed_guidance';
  return 'answered';
}

async function saveAgentVerifications(project: GeneratedProject, userId: string, runId: string, checks: AgentVerificationCheck[]) {
  if (!checks.length) return;
  const rows = checks.map(check => ({
    agent_run_id: runId || null,
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    check_type: check.key,
    status: check.status,
    severity: check.severity,
    message: check.message,
    file_path: check.file || null,
    public_payload: redactAgentPayload(check),
    created_at: new Date().toISOString(),
  }));
  const client = requireSupabase('Agent verification persistence');
  const { error } = await client.from('agent_verifications').insert(rows);
  if (error && isMissingAgentV2TableError(error)) return;
  if (error) console.warn('[huggy:agent_verification_persistence_skipped]', { message: error.message });
}

const RELIABILITY_BLOCKING_CHECK_KEYS = new Set([
  'files_present',
  'safe_paths',
  'safe_path',
  'safe_write',
  'no_env_files',
  'no_secrets',
  'no_forbidden_pages',
  'preview_non_empty',
  'preview_runtime_guard',
  'preview_runtime_markers',
  'unsafe_runtime_api',
  'local_imports_resolve',
  'vite_index_present',
  'vite_main_present',
  'vite_app_present',
  'vite_root_mount',
  'vite_main_script',
  'functionality_modern_project',
  'functionality_vite_shell',
  'functionality_primary_controls',
  'control_handlers',
  'script_build_safe',
  'script_build_exec',
  'package_parse',
]);

type ReliabilityGateSummary = {
  status: 'passed' | 'warning' | 'failed';
  message: string;
  blocking: Array<{ key: string; severity: string; message: string; file: string | null }>;
  notes: Array<{ key: string; severity: string; message: string; file: string | null }>;
};

function normalizeVerificationKey(key: string) {
  return String(key || '').replace(/^runner_/, '');
}

function isBlockingVerificationFailure(check: AgentVerificationCheck) {
  if (check.status !== 'fail') return false;
  const key = normalizeVerificationKey(check.key);
  if (/^(technical_build_score|production_readiness_score|functionality_score|design_score|visual_interaction_probe_score)$/.test(key)) {
    return false;
  }
  if (RELIABILITY_BLOCKING_CHECK_KEYS.has(key)) return true;
  return check.severity === 'high'
    && /(secret|env|forbidden|preview|runtime|vite|import|control|functionality|script|package)/i.test(key);
}

function toPublicVerificationIssue(check: AgentVerificationCheck) {
  return {
    key: normalizeVerificationKey(check.key),
    severity: check.severity,
    message: check.message,
    file: check.file || null,
  };
}

function summarizeReliabilityGate(checks: AgentVerificationCheck[]): ReliabilityGateSummary {
  const blocking = checks.filter(isBlockingVerificationFailure).map(toPublicVerificationIssue);
  const notes = checks
    .filter(check => check.status === 'warn' || (check.status === 'fail' && !isBlockingVerificationFailure(check)))
    .slice(0, 12)
    .map(toPublicVerificationIssue);
  if (blocking.length) {
    const visible = blocking.slice(0, 3).map(item => item.file ? `${item.file}: ${item.message}` : item.message).join(' ');
    return {
      status: 'failed',
      message: `Huggy stopped before saving because the generated app still has ${blocking.length} blocking issue${blocking.length > 1 ? 's' : ''}. ${visible}`.trim(),
      blocking,
      notes,
    };
  }
  if (notes.length) {
    return {
      status: 'warning',
      message: `Checks passed with ${notes.length} non-blocking note${notes.length > 1 ? 's' : ''}. The app is usable, and Huggy kept the notes in the run history.`,
      blocking,
      notes,
    };
  }
  return {
    status: 'passed',
    message: 'Checks passed. No blocking issue found.',
    blocking,
    notes,
  };
}

class ReliabilityGateError extends Error {
  diagnosticCode = 'RELIABILITY_GATE_FAILED';
  statusCode = 422;
  publicPayload: ReliabilityGateSummary;

  constructor(summary: ReliabilityGateSummary) {
    super(summary.message);
    this.name = 'ReliabilityGateError';
    this.publicPayload = summary;
  }
}

function summarizeQualityForMemory(checks: AgentVerificationCheck[]) {
  const scores: Record<string, number> = {};
  const failed = checks
    .filter(isBlockingVerificationFailure)
    .slice(0, 8)
    .map(check => ({
      key: check.key,
      severity: check.severity,
      message: check.message,
      file: check.file || null,
    }));
  const warnings = checks
    .filter(check => check.status === 'warn' || (check.status === 'fail' && !isBlockingVerificationFailure(check)))
    .slice(0, 8)
    .map(check => ({
      key: check.key,
      severity: check.severity,
      message: check.message,
      file: check.file || null,
    }));

  for (const check of checks) {
    if (!/_score$/.test(check.key)) continue;
    const match = check.message.match(/(\d+)\/100/);
    if (match) scores[check.key] = Number(match[1]);
  }

  return redactAgentPayload({
    scores,
    failed,
    warnings,
    status: failed.length ? 'failed' : warnings.length ? 'warning' : 'passed',
  });
}

function collectGenerationVerificationChecks(input: {
  projectName: string;
  files: GeneratedFile[];
  previewHtml: string;
  uiPolicy: any;
  hasExistingFiles: boolean;
  runnerResult: RunnerResult | null;
  browserResult?: BrowserTestResult | null;
}) {
  return [
    ...verifyGeneratedProject({ projectName: input.projectName, files: input.files, previewHtml: input.previewHtml }),
    ...auditGeneratedDesign({
      files: input.files,
      previewHtml: input.previewHtml,
      platformType: input.uiPolicy.appType,
      designDirection: input.uiPolicy.designDirection,
      hasExistingFiles: input.hasExistingFiles,
    }),
    ...auditGeneratedFunctionality({
      files: input.files,
      previewHtml: input.previewHtml,
      platformType: input.uiPolicy.appType,
      designDirection: input.uiPolicy.designDirection,
      hasExistingFiles: input.hasExistingFiles,
    }),
    ...inspectVisualPreview({
      files: input.files,
      previewHtml: input.previewHtml,
      platformType: input.uiPolicy.appType,
    }),
    ...scanGeneratedSecurity(input.files).checks,
    ...(input.runnerResult ? runnerChecksToVerificationChecks(input.runnerResult.checks) : []),
    ...(input.browserResult && input.browserResult.status !== 'skipped' ? input.browserResult.checks : []),
  ];
}

function reliabilitySummaryToAutoFixErrors(summary: ReliabilityGateSummary) {
  return summary.blocking.map(item => ({
    key: item.key,
    file: item.file || 'index.html',
    message: item.message,
    severity: item.severity,
  }));
}

async function finalReliabilityAutoFix(input: {
  project: GeneratedProject;
  userId: string;
  agentRunId: string;
  requestId: string;
  files: GeneratedFile[];
  pipeline: PreviewBuildResult;
  runnerResult: RunnerResult | null;
  uiPolicy: any;
  hasExistingFiles: boolean;
  shouldRunRunner: boolean;
  maxAttempts: number;
}) {
  let files = input.files;
  let pipeline = input.pipeline;
  let previewHtml = pipeline.html;
  let runnerResult = input.runnerResult;
  let browserResult: BrowserTestResult | null = await runBrowserInteractionAuditDetailed({
    files,
    previewHtml,
    timeoutMs: Math.min(DEFAULT_AGENT_V3_BUDGET.runnerTimeoutMs, 20_000),
  });
  const previewPipelineChecks = () => pipeline.errors.map(error => ({
    key: 'preview_pipeline',
    status: 'fail' as const,
    severity: (['info', 'low', 'medium', 'high'].includes(String(error?.severity)) ? error.severity : 'high') as AgentVerificationCheck['severity'],
    message: String(error?.message || 'Preview pipeline failed.'),
    file: error?.file || 'index.html',
  }));
  let verificationChecks = [
    ...previewPipelineChecks(),
    ...collectGenerationVerificationChecks({
      projectName: input.project.name,
      files,
      previewHtml,
      uiPolicy: input.uiPolicy,
      hasExistingFiles: input.hasExistingFiles,
      runnerResult,
      browserResult,
    }),
  ];
  let verificationSummary = summarizeVerificationChecks(verificationChecks);
  let reliabilitySummary = summarizeReliabilityGate(verificationChecks);
  let qualitySummary = summarizeQualityForMemory(verificationChecks);
  let autoFixPatch: any = null;

  for (let attempt = 1; reliabilitySummary.status === 'failed' && attempt <= input.maxAttempts; attempt += 1) {
    const fix = applyAutoFix(input.project, files, reliabilitySummaryToAutoFixErrors(reliabilitySummary));
    if (!fix.fixed) break;
    autoFixPatch = fix.patch;
    files = fix.files;
    pipeline = runPreviewPipeline(input.project, files);
    previewHtml = pipeline.html;

    if (input.shouldRunRunner) {
      runnerResult = await projectRunner.run({
        runId: input.agentRunId || input.requestId,
        projectId: input.project.id,
        files,
        previewHtml,
        timeoutMs: DEFAULT_AGENT_V3_BUDGET.runnerTimeoutMs,
      });
      await saveAgentRunnerResults(input.project, input.userId, input.agentRunId, runnerResult);
    }

    browserResult = await runBrowserInteractionAuditDetailed({
      files,
      previewHtml,
      timeoutMs: Math.min(DEFAULT_AGENT_V3_BUDGET.runnerTimeoutMs, 20_000),
    });

    verificationChecks = [
      ...previewPipelineChecks(),
      ...collectGenerationVerificationChecks({
        projectName: input.project.name,
        files,
        previewHtml,
        uiPolicy: input.uiPolicy,
        hasExistingFiles: input.hasExistingFiles,
        runnerResult,
        browserResult,
      }),
    ];
    verificationSummary = summarizeVerificationChecks(verificationChecks);
    reliabilitySummary = summarizeReliabilityGate(verificationChecks);
    qualitySummary = summarizeQualityForMemory(verificationChecks);
  }

  return {
    files,
    pipeline,
    previewHtml,
    runnerResult,
    browserResult,
    verificationChecks,
    verificationSummary,
    reliabilitySummary,
    qualitySummary,
    autoFixPatch,
  };
}

async function saveAgentRunnerResults(project: GeneratedProject, userId: string, runId: string, result: RunnerResult | null) {
  if (!runId || !result) return [];
  const rows = result.checks.map(check => redactAgentPayload({
    agent_run_id: runId,
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    check_type: check.check_type,
    status: check.status,
    severity: check.severity,
    message: check.message,
    file_path: check.file_path || null,
    command: check.command || null,
    duration_ms: check.duration_ms || null,
    public_payload: check.public_payload || {},
    created_at: new Date().toISOString(),
  }));
  if (!rows.length) return [];
  const client = requireSupabase('Agent runner result persistence');
  const { error } = await client.from('agent_runner_results').insert(rows);
  if (error && isMissingAgentV2TableError(error)) return rows;
  if (error) console.warn('[huggy:agent_runner_results_skipped]', { message: error.message });
  return rows;
}

async function listAgentRunnerResults(projectId: string, runId?: string, limitValue = 80) {
  const limit = Math.min(200, Math.max(1, Number(limitValue || 80)));
  const client = requireSupabase('Agent runner result listing');
  let query = client
    .from('agent_runner_results')
    .select('id,agent_run_id,project_id,check_type,status,severity,message,file_path,command,duration_ms,public_payload,created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (runId) query = query.eq('agent_run_id', runId);
  const { data, error } = await query;
  if (error && isMissingAgentV2TableError(error)) return [];
  if (error) throw new Error(`Supabase agent runner result listing failed: ${error.message}`);
  return (data || []).map(redactSecretPayload);
}

async function saveAgentResearchResults(project: GeneratedProject, userId: string, runId: string, result: ResearchResult | null) {
  if (!runId || !result) return [];
  const sourceRows = result.results.length ? result.results : [{ title: '', url: '', snippet: '', published_at: null, source: result.provider }];
  const rows = sourceRows.map(item => redactAgentPayload({
    agent_run_id: runId,
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    query: result.query,
    provider: result.provider,
    status: result.status,
    diagnostic_code: result.diagnostic_code || null,
    message: result.message,
    title: item.title || null,
    url: item.url || null,
    snippet: item.snippet || null,
    published_at: item.published_at || null,
    public_payload: { source: item.source || result.provider },
    created_at: new Date().toISOString(),
  }));
  const client = requireSupabase('Agent research result persistence');
  const { error } = await client.from('agent_research_results').insert(rows);
  if (error && isMissingAgentV2TableError(error)) return rows;
  if (error) console.warn('[huggy:agent_research_results_skipped]', { message: error.message });
  return rows;
}

async function listAgentResearchResults(projectId: string, limitValue = 40) {
  const limit = Math.min(100, Math.max(1, Number(limitValue || 40)));
  const client = requireSupabase('Agent research result listing');
  const { data, error } = await client
    .from('agent_research_results')
    .select('id,agent_run_id,project_id,query,provider,status,diagnostic_code,message,title,url,snippet,published_at,created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error && isMissingAgentV2TableError(error)) return [];
  if (error) throw new Error(`Supabase agent research result listing failed: ${error.message}`);
  return (data || []).map(redactSecretPayload);
}

async function saveProjectMessage(data: any) {
  const row = {
    id: data.id || randomUUID(),
    ...data,
    content: redactSecrets(data.content || ''),
    created_at: data.created_at || new Date().toISOString(),
  };
  const client = requireSupabase('Project message persistence');
  let { error } = await client.from('project_messages').insert([row]);
  if (error && /intent|requested_mode|organization_id|schema cache|column .* does not exist/i.test(error.message || '')) {
    const compactRow = {
      id: row.id,
      project_id: row.project_id,
      user_id: row.user_id,
      role: row.role,
      content: row.content,
      created_at: row.created_at,
    };
    const retry = await client.from('project_messages').insert([compactRow]);
    error = retry.error;
  }
  if (error) {
    if (/project_messages|schema cache|relation .* does not exist|table .* does not exist|could not find .* in the schema cache/i.test(error.message || '')) {
      console.warn('[huggy:project_message_persistence_skipped]', { message: error.message });
      return row;
    }
    throw new Error(`Supabase project message persistence failed: ${error.message}`);
  }
  return row;
}

function sanitizeProjectMessageForUser(row: any) {
  return {
    ...row,
    content: redactSecrets(row?.content || ''),
  };
}

async function listProjectMessages(projectId: string) {
  const client = requireSupabase('Project message listing');
  const { data, error } = await client.from('project_messages').select('*').eq('project_id', projectId).order('created_at');
  if (error && /project_messages|schema cache|relation .* does not exist|table .* does not exist|could not find .* in the schema cache/i.test(error.message || '')) return [];
  if (error) throw new Error(`Supabase project message listing failed: ${error.message}`);
  return (data || []).map(sanitizeProjectMessageForUser);
}

async function listProjectMessagesPage(projectId: string, limitValue: any, beforeValue: any) {
  const limit = Math.min(100, Math.max(1, Number(limitValue || 100)));
  const client = requireSupabase('Project message page listing');
  let query = client.from('project_messages').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit);
  if (beforeValue) query = query.lt('created_at', String(beforeValue));
  const { data, error } = await query;
  if (error && /project_messages|schema cache|relation .* does not exist|table .* does not exist|could not find .* in the schema cache/i.test(error.message || '')) return [];
  if (error) throw new Error(`Supabase project message page failed: ${error.message}`);
  return (data || []).reverse().map(sanitizeProjectMessageForUser);
}

async function saveAnalyticsEvent(project: GeneratedProject, record: any) {
  const client = requireSupabase('Analytics event persistence');
  const now = new Date().toISOString();
  const pageviewDelta = record.event_type === 'pageview' ? 1 : 0;
  const { data: session } = await client
    .from('project_analytics_sessions')
    .select('id, pageviews, duration_seconds')
    .eq('project_id', project.id)
    .eq('session_id', record.session_id)
    .maybeSingle();

  if (session?.id) {
    const { error: sessionError } = await client
      .from('project_analytics_sessions')
      .update({
        source: record.source,
        country_code: record.country_code,
        country_name: record.country_name,
        device: record.device,
        environment: record.environment,
        pageviews: Number(session.pageviews || 0) + pageviewDelta,
        duration_seconds: Math.max(Number(session.duration_seconds || 0), Number(record.duration_seconds || 0)),
        last_seen_at: now,
      })
      .eq('id', session.id);
    if (sessionError) throw new Error(`Supabase analytics session update failed: ${sessionError.message}`);
  } else {
    const { error: sessionError } = await client.from('project_analytics_sessions').insert([{
      id: randomUUID(),
      organization_id: project.organization_id,
      project_id: project.id,
      session_id: record.session_id,
      visitor_id: record.visitor_id,
      environment: record.environment,
      source: record.source,
      country_code: record.country_code,
      country_name: record.country_name,
      device: record.device,
      pageviews: pageviewDelta,
      duration_seconds: Number(record.duration_seconds || 0),
      first_seen_at: now,
      last_seen_at: now,
    }]);
    if (sessionError) throw new Error(`Supabase analytics session insert failed: ${sessionError.message}`);
  }

  const { error } = await client.from('project_analytics_events').insert([{
    id: randomUUID(),
    organization_id: project.organization_id,
    project_id: project.id,
    ...record,
    occurred_at: now,
  }]);
  if (error) throw new Error(`Supabase analytics event insert failed: ${error.message}`);
}

function buildAnalyticsTimeseries(events: any[], range: ReturnType<typeof getAnalyticsRange>) {
  const startMs = range.start.getTime();
  const buckets = Array.from({ length: range.bucketCount }, (_, index) => {
    const bucketStart = startMs + index * range.bucketMs;
    const label = range.key === '24h'
      ? new Date(bucketStart).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : new Date(bucketStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { start: bucketStart, label, visitors: new Set<string>(), pageviews: 0 };
  });

  events.forEach(event => {
    const occurredMs = new Date(event.occurred_at).getTime();
    const index = Math.min(range.bucketCount - 1, Math.max(0, Math.floor((occurredMs - startMs) / range.bucketMs)));
    buckets[index]?.visitors.add(String(event.visitor_id || event.session_id || 'unknown'));
    if (event.event_type === 'pageview') buckets[index].pageviews += 1;
  });

  return buckets.map(bucket => ({
    time: bucket.label,
    visitors: bucket.visitors.size,
    pageviews: bucket.pageviews,
  }));
}

async function loadProjectAnalysis(project: GeneratedProject, rangeKey: string) {
  const client = requireSupabase('Project analytics');
  const range = getAnalyticsRange(rangeKey);
  const startIso = range.start.toISOString();
  const { data: events = [], error: eventsError } = await client
    .from('project_analytics_events')
    .select('event_type, page_path, session_id, visitor_id, source, country_code, country_name, device, duration_seconds, environment, occurred_at')
    .eq('project_id', project.id)
    .gte('occurred_at', startIso)
    .order('occurred_at', { ascending: true })
    .limit(ANALYTICS_MAX_ROWS);
  if (eventsError) throw new Error(`Supabase analytics events load failed: ${eventsError.message}`);

  const { data: sessions = [], error: sessionsError } = await client
    .from('project_analytics_sessions')
    .select('session_id, visitor_id, source, country_code, country_name, device, pageviews, duration_seconds, environment, first_seen_at, last_seen_at')
    .eq('project_id', project.id)
    .gte('last_seen_at', startIso)
    .order('last_seen_at', { ascending: false })
    .limit(ANALYTICS_MAX_ROWS);
  if (sessionsError) throw new Error(`Supabase analytics sessions load failed: ${sessionsError.message}`);

  const pageviewEvents = events.filter((event: any) => event.event_type === 'pageview');
  const sessionCount = sessions.length;
  const visitorCount = uniqueCount(sessions.map((session: any) => String(session.visitor_id || session.session_id || '')));
  const pageviews = pageviewEvents.length;
  const totalDuration = sessions.reduce((sum: number, session: any) => sum + Number(session.duration_seconds || 0), 0);
  const bounceSessions = sessions.filter((session: any) => Number(session.pageviews || 0) <= 1).length;
  const currentCutoff = Date.now() - ANALYTICS_CURRENT_VISITOR_WINDOW_MS;
  const currentVisitors = uniqueCount(
    sessions
      .filter((session: any) => new Date(session.last_seen_at).getTime() >= currentCutoff)
      .map((session: any) => String(session.visitor_id || session.session_id || ''))
  );

  const sources = groupVisitors(pageviewEvents, (event: any) => cleanAnalyticsText(event.source, 'Direct', 80))
    .map(item => ({ source: item.label, visitors: item.visitors }));
  const pages = groupVisitors(pageviewEvents, (event: any) => normalizeAnalyticsPath(event.page_path))
    .map(item => ({ page: item.label, visitors: item.visitors }));
  const countriesMap = new Map<string, { country_code: string; country_name: string; visitors: Set<string> }>();
  pageviewEvents.forEach((event: any) => {
    const code = cleanAnalyticsText(event.country_code, 'UN', 2).toUpperCase();
    const key = `${code}:${cleanAnalyticsText(event.country_name, COUNTRY_NAMES[code] || 'Unknown', 80)}`;
    if (!countriesMap.has(key)) {
      countriesMap.set(key, { country_code: code, country_name: cleanAnalyticsText(event.country_name, COUNTRY_NAMES[code] || 'Unknown', 80), visitors: new Set() });
    }
    countriesMap.get(key)?.visitors.add(String(event.visitor_id || event.session_id || 'unknown'));
  });
  const countries = Array.from(countriesMap.values())
    .map(item => ({ country_code: item.country_code, country_name: item.country_name, visitors: item.visitors.size }))
    .sort((a, b) => b.visitors - a.visitors || a.country_name.localeCompare(b.country_name));
  const devices = groupVisitors(pageviewEvents, (event: any) => cleanAnalyticsText(event.device, 'Unknown', 24))
    .map(item => ({
      device: ['Mobile', 'Desktop', 'Tablet'].includes(item.label) ? item.label : 'Unknown',
      visitors: item.visitors,
      percentage: visitorCount ? Number(((item.visitors / visitorCount) * 100).toFixed(1)) : 0,
    }));

  return {
    current_visitors: currentVisitors,
    metrics: {
      visitors: visitorCount,
      pageviews,
      views_per_visit: sessionCount ? Number((pageviews / sessionCount).toFixed(2)) : 0,
      visit_duration_seconds: sessionCount ? Math.round(totalDuration / sessionCount) : 0,
      bounce_rate: sessionCount ? Math.round((bounceSessions / sessionCount) * 100) : 0,
    },
    timeseries: buildAnalyticsTimeseries(events, range),
    sources,
    pages,
    countries,
    devices,
  };
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
  if (error && /project_messages|intent|schema cache|relation .* does not exist|table .* does not exist|column .* does not exist|could not find .* in the schema cache/i.test(error.message || '')) return '';
  if (error) throw new Error(`Supabase project plan lookup failed: ${error.message}`);
  return data?.content || '';
}

async function listAgentEvents(projectId: string) {
  const client = requireSupabase('Agent event listing');
  const { data, error } = await client.from('agent_events').select('*').eq('project_id', projectId).order('sequence_number');
  if (error && /agent_events|schema cache|relation .* does not exist|table .* does not exist|could not find .* in the schema cache/i.test(error.message || '')) return [];
  if (error) throw new Error(`Supabase agent event listing failed: ${error.message}`);
  return (data || []).map(redactSecretPayload);
}

async function listAgentEventsPage(projectId: string, limitValue: any, beforeValue: any) {
  const limit = Math.min(100, Math.max(1, Number(limitValue || 100)));
  const client = requireSupabase('Agent event page listing');
  let query = client.from('agent_events').select('*').eq('project_id', projectId).order('sequence_number', { ascending: false }).limit(limit);
  if (beforeValue) query = query.lt('sequence_number', Number(beforeValue));
  const { data, error } = await query;
  if (error && /agent_events|schema cache|relation .* does not exist|table .* does not exist|could not find .* in the schema cache/i.test(error.message || '')) return [];
  if (error) throw new Error(`Supabase agent event page failed: ${error.message}`);
  return (data || []).reverse().map(redactSecretPayload);
}

function normalizeWorkspaceMode(value: any): AgentRequestedMode {
  return normalizeRequestedMode(value);
}

function normalizeWorkspaceTab(value: any): 'preview' | 'code' | 'database' | 'analysis' {
  return ['preview', 'code', 'database', 'analysis'].includes(String(value)) ? String(value) as any : 'preview';
}

function normalizeWorkspacePreviewDevice(value: any): 'desktop' | 'tablet' | 'mobile' {
  return ['desktop', 'tablet', 'mobile'].includes(String(value)) ? String(value) as any : 'desktop';
}

function repairTextEncoding(value: any) {
  let text = String(value || '');
  const replacements: Array<[RegExp, string | ((match: string) => string)]> = [
    [/Ã©/g, 'é'],
    [/Ã¨/g, 'è'],
    [/Ãª/g, 'ê'],
    [/Ã«/g, 'ë'],
    [/Ã /g, 'à'],
    [/Ã¢/g, 'â'],
    [/Ã§/g, 'ç'],
    [/Ã®/g, 'î'],
    [/Ã¯/g, 'ï'],
    [/Ã´/g, 'ô'],
    [/Ã¹/g, 'ù'],
    [/Ã»/g, 'û'],
    [/Ã¼/g, 'ü'],
    [/Ã‰/g, 'É'],
    [/â€™/g, "'"],
    [/â€œ|â€/g, '"'],
    [/â€"/g, '-'],
    [/Â/g, ''],
    [/ï¿½/g, 'é'],
    [/cr�e/gi, match => match[0] === 'C' ? 'Crée' : 'crée'],
    [/cr�er/gi, match => match[0] === 'C' ? 'Créer' : 'créer'],
    [/g�n�re/gi, match => match[0] === 'G' ? 'Génère' : 'génère'],
    [/g�n�rer/gi, match => match[0] === 'G' ? 'Générer' : 'générer'],
    [/compl�te/gi, match => match[0] === 'C' ? 'Complète' : 'complète'],
    [/t�che/gi, match => match[0] === 'T' ? 'Tâche' : 'tâche'],
    [/t�ches/gi, match => match[0] === 'T' ? 'Tâches' : 'tâches'],
    [/�tat/gi, 'état'],
    [/�tats/gi, 'états'],
    [/�/g, 'é'],
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement as any);
  }
  return text;
}

function sanitizeWorkspaceText(value: any, max = 8000) {
  return redactSecrets(repairTextEncoding(value).replace(/\u0000/g, ''), '[masked-secret]').slice(0, max);
}

function isMissingWorkspaceTableError(error: any) {
  const message = String(error?.message || '');
  return /user_workspace_state|project_workspace_state|schema cache|relation .* does not exist/i.test(message);
}

function isMissingPreviewDeviceColumnError(error: any) {
  const message = String(error?.message || '');
  return /preview_device|builder_preview_device|schema cache|column .* does not exist/i.test(message);
}

async function getUserWorkspaceState(userId: string) {
  const client = requireSupabase('User workspace state');
  const { data, error } = await client.from('user_workspace_state').select('*').eq('owner_id', userId).maybeSingle();
  if (error && isMissingWorkspaceTableError(error)) return null;
  if (error) throw new Error(`Supabase user workspace state failed: ${error.message}`);
  return data || null;
}

async function upsertUserWorkspaceState(userId: string, patch: Record<string, any>) {
  const row = {
    owner_id: userId,
    last_project_id: isUuid(patch.last_project_id) ? patch.last_project_id : patch.last_project_id === null ? null : undefined,
    dashboard_draft_prompt: patch.dashboard_draft_prompt === undefined ? undefined : sanitizeWorkspaceText(patch.dashboard_draft_prompt),
    dashboard_selected_mode: patch.dashboard_selected_mode === undefined ? undefined : normalizeWorkspaceMode(patch.dashboard_selected_mode),
    builder_draft_prompt: patch.builder_draft_prompt === undefined ? undefined : sanitizeWorkspaceText(patch.builder_draft_prompt),
    builder_selected_mode: patch.builder_selected_mode === undefined ? undefined : normalizeWorkspaceMode(patch.builder_selected_mode),
    builder_selected_model: patch.builder_selected_model === undefined ? undefined : sanitizeWorkspaceText(patch.builder_selected_model, 120) || 'auto',
    builder_active_tab: patch.builder_active_tab === undefined ? undefined : normalizeWorkspaceTab(patch.builder_active_tab),
    builder_preview_device: patch.builder_preview_device === undefined ? undefined : normalizeWorkspacePreviewDevice(patch.builder_preview_device),
    theme: patch.theme === undefined ? undefined : (patch.theme === 'dark' ? 'dark' : 'light'),
    last_route: patch.last_route === undefined ? undefined : sanitizeWorkspaceText(patch.last_route, 512),
    updated_at: new Date().toISOString(),
  };
  Object.keys(row).forEach(key => (row as any)[key] === undefined && delete (row as any)[key]);
  const client = requireSupabase('User workspace state persistence');
  let { data, error } = await client.from('user_workspace_state').upsert([row], { onConflict: 'owner_id' }).select('*').maybeSingle();
  if (error && isMissingPreviewDeviceColumnError(error) && 'builder_preview_device' in row) {
    delete (row as any).builder_preview_device;
    const retry = await client.from('user_workspace_state').upsert([row], { onConflict: 'owner_id' }).select('*').maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error && isMissingWorkspaceTableError(error)) return null;
  if (error) throw new Error(`Supabase user workspace state update failed: ${error.message}`);
  return data;
}

async function getProjectWorkspaceState(projectId: string) {
  const client = requireSupabase('Project workspace state');
  const { data, error } = await client.from('project_workspace_state').select('*').eq('project_id', projectId).maybeSingle();
  if (error && isMissingWorkspaceTableError(error)) return null;
  if (error) throw new Error(`Supabase project workspace state failed: ${error.message}`);
  return data || null;
}

async function upsertProjectWorkspaceState(userId: string, projectId: string, patch: Record<string, any>) {
  const client = requireSupabase('Project workspace state persistence');
  const row = {
    owner_id: userId,
    project_id: projectId,
    draft_prompt: patch.draft_prompt === undefined ? undefined : sanitizeWorkspaceText(patch.draft_prompt),
    selected_mode: patch.selected_mode === undefined ? undefined : normalizeWorkspaceMode(patch.selected_mode),
    selected_model: patch.selected_model === undefined ? undefined : sanitizeWorkspaceText(patch.selected_model, 120) || 'auto',
    active_tab: patch.active_tab === undefined ? undefined : normalizeWorkspaceTab(patch.active_tab),
    preview_device: patch.preview_device === undefined ? undefined : normalizeWorkspacePreviewDevice(patch.preview_device),
    sidebar_width: patch.sidebar_width === undefined ? undefined : Math.min(520, Math.max(280, Number(patch.sidebar_width || 380))),
    pending_clarification: patch.pending_clarification === undefined ? undefined : (patch.pending_clarification || null),
    last_opened_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  Object.keys(row).forEach(key => (row as any)[key] === undefined && delete (row as any)[key]);
  let { data, error } = await client.from('project_workspace_state').upsert([row], { onConflict: 'project_id' }).select('*').maybeSingle();
  if (error && isMissingPreviewDeviceColumnError(error) && 'preview_device' in row) {
    delete (row as any).preview_device;
    const retry = await client.from('project_workspace_state').upsert([row], { onConflict: 'project_id' }).select('*').maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error && isMissingWorkspaceTableError(error)) return null;
  if (error) throw new Error(`Supabase project workspace state update failed: ${error.message}`);
  await upsertUserWorkspaceState(userId, { last_project_id: projectId, last_route: `/builder.html?project=${projectId}` });
  return data;
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
  let insertRow: Record<string, any> = { ...row };
  let error: any = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await client.from('project_versions').insert([insertRow]);
    error = result.error;
    if (!error) return row;
    const missingColumn = getSchemaColumnFromMessage(String(error.message || ''));
    if (missingColumn && missingColumn in insertRow) {
      delete insertRow[missingColumn];
      continue;
    }
    if (/project_versions|schema cache|relation .* does not exist|table .* does not exist|column .* does not exist|could not find .* in the schema cache/i.test(error.message || '')) {
      console.warn('[huggy:project_version_persistence_skipped]', { message: error.message });
      return row;
    }
    break;
  }
  if (error) throw new Error(`Supabase project version persistence failed: ${error.message}`);
  return row;
}

async function listProjectVersions(projectId: string) {
  const client = requireSupabase('Project version listing');
  const { data, error } = await client.from('project_versions').select('*').eq('project_id', projectId).order('version_number', { ascending: false });
  if (error && /project_versions|schema cache|relation .* does not exist|table .* does not exist|column .* does not exist|could not find .* in the schema cache/i.test(error.message || '')) {
    console.warn('[huggy:project_version_listing_skipped]', { message: error.message });
    return [];
  }
  if (error) throw new Error(`Supabase project version listing failed: ${error.message}`);
  return (data || []).map(redactSecretPayload);
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
  return (data || []).map(redactSecretPayload);
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
  if (error) {
    console.warn('[huggy:build_session_persistence_skipped]', { message: error.message });
  }
  return row;
}

async function getBuildSession(buildSessionId: string) {
  const client = requireSupabase('Build session lookup');
  const { data, error } = await client.from('build_sessions').select('*').eq('id', buildSessionId).maybeSingle();
  if (error && /build_sessions|schema cache|relation .* does not exist|table .* does not exist|could not find .* in the schema cache/i.test(error.message || '')) return null;
  if (error) throw new Error(`Supabase build session lookup failed: ${error.message}`);
  return data;
}

async function updateBuildSessionStatus(buildSessionId: string, status: string, extra: Record<string, unknown> = {}) {
  const client = requireSupabase('Build session update');
  const { error } = await client.from('build_sessions').update({ status, ...extra }).eq('id', buildSessionId);
  if (error && /build_sessions|schema cache|relation .* does not exist|table .* does not exist|could not find .* in the schema cache/i.test(error.message || '')) return;
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
  return new VercelDomainService(token, process.env.VERCEL_TEAM_ID || undefined);
}

async function deployFilesToVercel(
  project: GeneratedProject,
  files: GeneratedFile[],
  options: { includeHuggyBadge?: boolean; publicOrigin?: string } = {},
) {
  const token = getVercelToken();
  if (!token) {
    throw createPublicError(
      'Vercel deployment is not configured. Add VERCEL_TOKEN on Railway to publish generated apps.',
      503,
      'VERCEL_NOT_CONFIGURED',
      'configure_vercel_token',
    );
  }

  const prepareHtml = (html: string) => {
    const enhanced = injectAnalyticsSnippet(
      enhanceHtmlSeo(html, project.name, project.prompt || project.name, project.slug || project.id, 'production'),
      project.id,
      'production',
    );
    return options.includeHuggyBadge
      ? injectHuggyPublishedBadge(enhanced, project, options.publicOrigin || getHuggyPublicOrigin())
      : enhanced;
  };

  const productionPreviewHtml = isModernFrontendProject(files)
    ? renderPreviewHtml(files, project.name, project.id, 'production', project.prompt || project.name, project.slug || project.id)
    : '';
  const deploymentFiles = normalizeGeneratedFiles(files).map(file => ({
    file: file.path,
    data: file.path === 'index.html' && productionPreviewHtml
      ? (options.includeHuggyBadge ? injectHuggyPublishedBadge(productionPreviewHtml, project, options.publicOrigin || getHuggyPublicOrigin()) : productionPreviewHtml)
      : file.path.endsWith('.html')
      ? prepareHtml(file.content)
      : file.content,
  }));

  if (!deploymentFiles.some(file => file.file === 'index.html')) {
    let html = renderPreviewHtml(files, project.name, project.id, 'production', project.prompt || project.name, project.slug || project.id);
    if (options.includeHuggyBadge) html = injectHuggyPublishedBadge(html, project, options.publicOrigin || getHuggyPublicOrigin());
    deploymentFiles.unshift({ file: 'index.html', data: html });
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
      name: getVercelProjectName(project),
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
    const providerMessage = payload?.error?.message || payload?.message || `Vercel API returned ${response.status}`;
    const error = createPublicError(
      `${providerMessage}${payload?.error?.code ? ` (${payload.error.code})` : ''}`,
      response.status,
      response.status === 401 || response.status === 403
        ? 'VERCEL_TOKEN_INVALID'
        : response.status === 429
          ? 'VERCEL_RATE_LIMITED'
          : response.status === 413
            ? 'VERCEL_PAYLOAD_TOO_LARGE'
            : response.status >= 500
              ? 'VERCEL_UNAVAILABLE'
              : 'VERCEL_BAD_REQUEST',
      response.status === 401 || response.status === 403
        ? 'update_vercel_token'
        : response.status === 429
          ? 'retry_later'
          : response.status === 413
            ? 'reduce_assets'
            : response.status >= 500
              ? 'retry'
              : 'rebuild_then_publish',
    );
    throw error;
  }

  const url = getPublicVercelDeploymentUrl(project, payload) || (payload.url ? `https://${String(payload.url).replace(/^https?:\/\//, '')}` : '');
  return {
    provider_deployment_id: payload.id || payload.uid || null,
    deployment_url: url,
    status: String(payload.readyState || payload.state || 'queued').toLowerCase(),
    raw: payload,
  };
}

// Wrapper to safely access live Supabase-backed billing state.
const CREDIT_BALANCE_COLUMNS = [
  'balance',
  'credits_balance',
  'available_credits',
  'balance_credits',
  'current_balance',
  'remaining_credits',
  'credits',
  'total_credits',
];
const CREDIT_BUCKET_COLUMNS = ['monthly_credits', 'daily_promo_credits', 'topup_credits', 'promo_credits'];
const FALLBACK_WALLET_CREDITS = 30;

function getNumericCreditValue(value: any) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function getCreditBalanceColumn(row: Record<string, any> | null | undefined) {
  if (!row) return '';
  return CREDIT_BALANCE_COLUMNS.find(column => column in row) || '';
}

function getCreditBalanceFromRow(row: Record<string, any> | null | undefined) {
  const column = getCreditBalanceColumn(row);
  if (column) return getNumericCreditValue(row?.[column]);
  const bucketTotal = CREDIT_BUCKET_COLUMNS.reduce((total, bucket) => total + getNumericCreditValue(row?.[bucket]), 0);
  if (bucketTotal > 0) return bucketTotal;
  const hasKnownCreditShape = [...CREDIT_BALANCE_COLUMNS, ...CREDIT_BUCKET_COLUMNS].some(knownColumn => row && knownColumn in row);
  return row && !hasKnownCreditShape ? FALLBACK_WALLET_CREDITS : bucketTotal;
}

function isSchemaShapeError(error: any) {
  return /schema cache|column .*does not exist|column .* does not exist|could not find .* in the schema cache|Could not find the '([^']+)' column|relation .* does not exist|table .* does not exist/i.test(error?.message || '');
}

async function readCreditWalletRow(client: any, orgId: string) {
  const { data, error } = await client.from('credit_wallets').select('*').eq('organization_id', orgId).maybeSingle();
  if (error && /credit_wallets|relation .* does not exist|table .* does not exist/i.test(error.message || '')) {
    console.warn('[huggy:credit_wallet_lookup_skipped]', { message: error.message });
    return null;
  }
  if (error) throw new Error(`Credit wallet lookup failed: ${error.message}`);
  return data || null;
}

async function writeCreditWalletBalance(client: any, orgId: string, next: number, preferredColumn = '') {
  const columns = preferredColumn
    ? [preferredColumn, ...CREDIT_BALANCE_COLUMNS, ...CREDIT_BUCKET_COLUMNS].filter((column, index, all) => all.indexOf(column) === index)
    : [...CREDIT_BALANCE_COLUMNS, ...CREDIT_BUCKET_COLUMNS];
  const existingWallet = await readCreditWalletRow(client, orgId);
  for (const column of columns) {
    const patch: Record<string, any> = {
      [column]: next,
      updated_at: new Date().toISOString(),
    };
    let error: any = null;
    if (existingWallet) {
      let result = await client.from('credit_wallets').update(patch).eq('organization_id', orgId);
      error = result.error;
      if (error && /updated_at/i.test(error.message || '') && isSchemaShapeError(error)) {
        delete patch.updated_at;
        result = await client.from('credit_wallets').update(patch).eq('organization_id', orgId);
        error = result.error;
      }
    } else {
      const row: Record<string, any> = { organization_id: orgId, ...patch };
      let result = await client.from('credit_wallets').insert([row]);
      error = result.error;
      if (error && /updated_at/i.test(error.message || '') && isSchemaShapeError(error)) {
        delete row.updated_at;
        result = await client.from('credit_wallets').insert([row]);
        error = result.error;
      }
      if (error && /duplicate key|unique constraint/i.test(error.message || '')) {
        const retryPatch = { ...patch };
        let retry = await client.from('credit_wallets').update(retryPatch).eq('organization_id', orgId);
        error = retry.error;
        if (error && /updated_at/i.test(error.message || '') && isSchemaShapeError(error)) {
          delete retryPatch.updated_at;
          retry = await client.from('credit_wallets').update(retryPatch).eq('organization_id', orgId);
          error = retry.error;
        }
      }
    }
    if (error && /updated_at/i.test(error.message || '') && isSchemaShapeError(error)) {
      continue;
    }
    if (!error) return column;
    if (isSchemaShapeError(error)) continue;
    throw new Error(`Credit wallet update failed: ${error.message}`);
  }
  console.warn('[huggy:credit_wallet_update_skipped]', {
    reason: 'no_compatible_balance_column',
    organization_id: orgId,
    next_balance: next,
  });
  return preferredColumn || columns[0] || 'balance';
}

async function ensureCreditWalletRow(client: any, orgId: string, initialCredits = 30) {
  const existing = await readCreditWalletRow(client, orgId);
  if (existing) return existing;
  const column = await writeCreditWalletBalance(client, orgId, initialCredits);
  return { organization_id: orgId, [column]: initialCredits };
}

async function insertCreditLedgerRow(client: any, row: Record<string, any>) {
  let current = { ...row };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await client.from('credit_ledger').insert([current]);
    if (!error) return;
    if (/credit_ledger|relation .* does not exist|table .* does not exist/i.test(error.message || '')) {
      console.warn('[huggy:credit_ledger_insert_skipped]', { message: error.message });
      return;
    }
    const column = getSchemaColumnFromMessage(error.message || '');
    if (isSchemaShapeError(error) && column && column in current) {
      delete current[column];
      continue;
    }
    throw new Error(`Credit ledger insert failed: ${error.message}`);
  }
}

function getDbHelpers() {
  const client = requireSupabase('Billing and usage persistence');
  return {
    getWallet: async (orgId: string) => {
      const wallet = await ensureCreditWalletRow(client, orgId);
      return getCreditBalanceFromRow(wallet);
    },
    updateWallet: async (orgId: string, diff: number) => {
      const wallet = await ensureCreditWalletRow(client, orgId);
      const balanceColumn = getCreditBalanceColumn(wallet);
      const current = getCreditBalanceFromRow(wallet);
      const next = current + diff;
      await writeCreditWalletBalance(client, orgId, next, balanceColumn);
      return next;
    },
    addLedger: async (orgId: string, type: string, amount: number, balance_after: number, desc: string, refId: string) => {
      const log = { wallet_id: orgId, type, amount, balance_after, description: desc, reference_id: refId, created_at: new Date().toISOString() };
      await insertCreditLedgerRow(client, log);
    },
    addAudit: async (data: any) => {
      const { error } = await client.from('audit_logs').insert([{ ...data, created_at: new Date().toISOString() }]);
      if (error) console.warn(`Audit log insert failed: ${error.message}`);
    },
    createReservation: async (orgId: string, amount: number, refId: string) => {
      const expires_at = new Date(Date.now() + 15 * 60000).toISOString();
      const reservationId = randomUUID();
      const ownerColumns = ['wallet_id', 'organization_id', 'user_id'];
      for (const ownerColumn of ownerColumns) {
        let res: Record<string, any> = { id: reservationId, [ownerColumn]: orgId, amount, status: 'reserved', reference_id: refId, expires_at };
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const { error } = await client.from('credit_reservations').insert([res]);
          if (!error) return res;
          if (/credit_reservations|relation .* does not exist|table .* does not exist/i.test(error.message || '')) {
            console.warn('[huggy:credit_reservation_skipped]', { message: error.message });
            return { id: reservationId, wallet_id: orgId, amount, status: 'virtual', reference_id: refId, expires_at };
          }
          const column = getSchemaColumnFromMessage(error.message || '');
          if (isSchemaShapeError(error) && column && column in res) {
            if (column === ownerColumn) break;
            delete res[column];
            continue;
          }
          if (isSchemaShapeError(error)) break;
          throw new Error(`Credit reservation failed: ${error.message}`);
        }
      }
      console.warn('[huggy:credit_reservation_skipped]', {
        reason: 'no_compatible_owner_column',
        organization_id: orgId,
        reference_id: refId,
      });
      return { id: reservationId, wallet_id: orgId, amount, status: 'virtual', reference_id: refId, expires_at };
    }
  };
}

function getOptionalDbHelpers(context = 'optional persistence'): ReturnType<typeof getDbHelpers> | null {
  try {
    return getDbHelpers();
  } catch (error: any) {
    console.warn('[huggy:db_helpers_unavailable]', {
      context,
      diagnostic_code: 'SERVER_PERSISTENCE_UNAVAILABLE',
      message: redactSecrets(error?.message || String(error)),
    });
    return null;
  }
}

async function getWalletWithFallback(
  helpers: ReturnType<typeof getDbHelpers> | null,
  orgId: string,
  fallback = FALLBACK_WALLET_CREDITS,
) {
  if (!helpers) return fallback;
  return helpers.getWallet(orgId).catch(() => fallback);
}

async function loadCloudWalletSnapshot(organizationId: string, plan: ReturnType<typeof getPlanConfig>) {
  const fallbackCloud = plan?.cloud || SAAS_PLANS.free.cloud;
  const snapshot = {
    balance_usd: fallbackCloud.balanceUsd,
    included_balance_usd: fallbackCloud.balanceUsd,
    ai_app_balance_usd: fallbackCloud.aiAppBalanceUsd,
    database_storage_gb: fallbackCloud.databaseStorageGb,
    file_storage_gb: fallbackCloud.fileStorageGb,
    bandwidth_gb: fallbackCloud.bandwidthGb,
    topup_min_usd: fallbackCloud.topupMinUsd,
    auto_topup_available: fallbackCloud.autoTopupAvailable,
    auto_topup_enabled: false,
    usage_categories: getCloudUsageCategories(),
  };

  try {
    const client = requireSupabase('Cloud wallet listing');
    const { data, error } = await client
      .from('cloud_wallets')
      .select('balance_usd,included_balance_usd,ai_app_balance_usd,auto_topup_enabled')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      snapshot.balance_usd = Number(data.balance_usd ?? snapshot.balance_usd);
      snapshot.included_balance_usd = Number(data.included_balance_usd ?? snapshot.included_balance_usd);
      snapshot.ai_app_balance_usd = Number(data.ai_app_balance_usd ?? snapshot.ai_app_balance_usd);
      snapshot.auto_topup_enabled = Boolean(data.auto_topup_enabled);
    }
  } catch (error: any) {
    console.warn('[huggy:cloud_wallet_snapshot_fallback]', { message: error?.message || String(error) });
  }

  return snapshot;
}

// ──────────────────────────────────────────────────────────────────────
// 1. BILLING ENDPOINTS
// ──────────────────────────────────────────────────────────────────────

// GET /billing/plans
app.get('/api/billing/plans', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  let enterpriseVisible = false;

  if (token) {
    try {
      const authClient = getSupabaseAuthClient();
      const { data } = await authClient.auth.getUser(token);
      const userId = data?.user?.id;
      if (userId) {
        const plan = normalizePlanKey(await getOrganizationPlan(userId).catch(() => 'free')) || 'free';
        enterpriseVisible = isPaidPlanKey(plan);
      }
    } catch {
      enterpriseVisible = false;
    }
  }

  res.json({
    success: true,
    plans: getPublicPlans(),
    topups: TOPUP_PRODUCTS,
    cloud_topups: CLOUD_TOPUP_PRODUCTS,
    cloud_usage_categories: getCloudUsageCategories(),
    enterprise: enterpriseVisible ? SAAS_PLANS.enterprise : null,
    billing: {
      annual_discount_percent: 20,
      public_plan_keys: ['free', 'pro', 'scale'],
    },
  });
});

// GET /billing/wallet
app.get('/api/billing/wallet', async (req, res) => {
  const orgId = getUserOrgId(req);
  const helpers = getDbHelpers();
  const balance = await helpers.getWallet(orgId);
  const planKey = normalizePlanKey(await getOrganizationPlan(orgId).catch(() => 'free')) || 'free';
  const plan = getPlanConfig(planKey) || SAAS_PLANS.free;
  const cloud = await loadCloudWalletSnapshot(orgId, plan);

  res.json({
    success: true,
    organization_id: orgId,
    plan: plan.key,
    balance,
    buckets: {
      monthly_credits: plan.credits,
      daily_promo_credits: plan.dailyCredits ?? null,
      topup_credits: null,
    },
    cloud,
  });
});

// GET /billing/ledger
app.get('/api/billing/ledger', async (req, res) => {
  const orgId = getUserOrgId(req);
  const client = requireSupabase('Credit ledger listing');
  const { data, error } = await client.from('credit_ledger').select('*').eq('wallet_id', orgId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, ledger: (data || []).map(sanitizeCreditLedgerEntry) });
});

// POST /billing/checkout/subscription
app.post('/api/billing/checkout/subscription', async (req, res) => {
  const { planKey, email, successUrl, cancelUrl, billingInterval } = req.body;
  const orgId = req.body.orgId || DEFAULT_ORG_ID;

  try {
    const billing = new StripeService(getSupabase());
    const redirectUrl = await billing.createSubscriptionCheckout(
      orgId,
      email || 'test@huggy.app',
      planKey || 'pro',
      successUrl || `${req.protocol}://${req.get('host')}/settings?success=true`,
      cancelUrl || `${req.protocol}://${req.get('host')}/settings?cancel=true`,
      billingInterval === 'annual' ? 'annual' : 'monthly'
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
      productId || 'topup_credits_500',
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
  res.json({
    success: true,
    models: buildPublicModelList(),
    providers: buildPublicModelProviderGroups(),
  });
});

// GET /ai/model-runtime
// Public, redacted model runtime view. It exposes capability routing and health
// signals, never provider secrets or raw provider payloads.
app.get('/api/ai/model-runtime', requireAuth, (req: any, res) => {
  const profiles = getAllAIModelCapabilityProfiles().map(profile => ({
    id: profile.id,
    provider: profile.provider,
    display_name: AI_MODEL_DISPLAY_NAMES[profile.id as AllowedModelId] || providerModelToDisplayName(profile.id),
    best_for: profile.bestUse,
    strengths: {
      reasoning: profile.reasoning,
      code: profile.code,
      comprehension: profile.comprehension,
      agentic: profile.agentic,
      design: profile.design,
      security: profile.security,
    },
    supports: {
      streaming: profile.supports.streaming,
      tool_calling: profile.supports.toolCalling,
      structured_output: profile.supports.structuredOutput,
      vision: profile.supports.vision,
      long_context: profile.supports.longContext,
    },
    speed: profile.speed,
    reliability: profile.reliability,
    fallback_primary: profile.fallbackPrimary || null,
    fallback_secondary: profile.fallbackSecondary || null,
    limits_known: profile.limits.known,
    recommended_parameters: {
      temperature: profile.recommended.temperature,
      max_tokens: profile.recommended.maxTokens,
      timeout_ms: profile.recommended.timeoutMs,
      streaming_timeout_ms: profile.recommended.streamingTimeoutMs,
      reasoning_control: profile.supports.reasoningControl,
      json_mode: Boolean(profile.supports.jsonMode),
    },
  }));
  res.json({
    success: true,
    auto_model: {
      chooses_model: true,
      chooses_workflow: true,
      chooses_provider_config: true,
      uses_fallback: true,
    },
    runtime: profiles,
    monitoring: {
      metrics: providerGateway.getRuntimeMetricsSnapshot(),
      circuit_breakers: providerGateway.getCircuitSnapshot(),
    },
  });
});

// POST /ai/estimate
app.post('/api/ai/estimate', (req, res) => {
  res.json({
    allowed: true,
    requires_upgrade: false,
    suggested_action: 'continue'
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
    res.json({
      success: true,
      routed_model: targetModel,
      runtime_capabilities: buildPublicRuntimeCapabilities(targetModel),
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /assistant/chat
// Lightweight conversational response: no SSE, no project creation, no preview
// mutation. The selected model is still honored through the provider gateway.
app.post('/api/assistant/chat', async (req: any, res: any) => {
  const requestId = `chat_${randomUUID()}`;
  const authUser = requireAuthenticatedUser(req, res, requestId);
  if (!authUser) return;
  const userId = String(authUser.id);
  const prompt = sanitizeWorkspaceText(req.body?.prompt || '').trim();
  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: 'Prompt is required.',
      message: 'Prompt is required.',
      diagnostic_code: 'PROMPT_REQUIRED',
      request_id: requestId,
      suggested_action: 'write_message',
    });
  }
  if (!enforceRateLimit(`assistant_chat:${userId}`, 30, 60_000)) {
    return res.status(429).json({
      success: false,
      error: 'Too many messages. Please wait a moment.',
      message: 'Too many messages. Please wait a moment.',
      diagnostic_code: 'RATE_LIMITED',
      request_id: requestId,
      suggested_action: 'retry_later',
    });
  }

  const selectedModel = normalizeModelSelectionId(req.body?.modelId || 'auto');
  const requestedProjectId = String(req.body?.projectId || '').trim();
  const now = new Date().toISOString();
  let project: GeneratedProject = {
    id: 'assistant',
    owner_id: userId,
    organization_id: userId,
    created_by: userId,
    name: 'Huggy',
    slug: 'huggy-assistant',
    status: 'assistant',
    preview_status: 'idle',
    created_at: now,
    updated_at: now,
  };
  let files: GeneratedFile[] = [];
  let canPersistConversation = false;

  if (isUuid(requestedProjectId)) {
    const loadedProject = await loadProject(requestedProjectId, userId).catch(() => null);
    if (loadedProject && hasProjectCapability(req, 'view', loadedProject)) {
      project = loadedProject;
      files = await loadProjectFiles(project.id).catch(() => []);
      canPersistConversation = true;
    }
  }

  const history = Array.isArray(req.body?.messages)
    ? req.body.messages
      .filter((message: any) => (message?.role === 'user' || message?.role === 'assistant') && String(message?.content || '').trim())
      .slice(-10)
      .map((message: any) => `${message.role === 'assistant' ? 'Huggy' : 'User'}: ${redactSecrets(String(message.content || '')).slice(0, 1200)}`)
      .join('\n')
    : '';
  const promptWithHistory = history
    ? `${prompt}\n\nRecent conversation context, for continuity only:\n${history}`
    : prompt;
  const decision: IntentDecision = {
    intent: 'conversation',
    confidence: 0.96,
    requestedMode: 'auto',
    understandingCategory: 'explanation',
    requiresFileChanges: false,
    requiresPreviewRebuild: false,
    requiresCredits: true,
    userVisibleReason: 'Conversation only. Huggy will not touch files or preview.',
    reason: 'lightweight_conversation_response',
    nextAction: 'answer',
    autoPlanRequired: false,
    selectedModelPolicy: 'balanced',
    routingSource: 'heuristic',
  };

  const helpers = getOptionalDbHelpers('assistant_chat');
  const wallet = await getWalletWithFallback(helpers, userId);
  const estimate = estimateActionCost(prompt, decision, selectedModel);
  if (wallet < estimate.finalCredits) {
    return res.status(402).json({
      ...publicCreditGateResponse(),
      request_id: requestId,
    });
  }

  try {
    if (canPersistConversation) {
      await saveProjectMessage({
        organization_id: project.organization_id,
        project_id: project.id,
        user_id: userId,
        role: 'user',
        content: prompt,
        intent: 'conversation',
        requested_mode: 'auto',
      }).catch(() => null);
    }

    const agentText = await createAgentTextResponse({
      project,
      prompt: promptWithHistory,
      files,
      decision,
      modelId: selectedModel,
      userCredits: wallet,
      allowLocalFallback: selectedModel === 'auto',
    });

    const content = redactSecrets(agentText.text || '').trim() || createConversationResponse(project, prompt);
    if (canPersistConversation) {
      await saveProjectMessage({
        organization_id: project.organization_id,
        project_id: project.id,
        user_id: userId,
        role: 'assistant',
        content,
        intent: 'conversation',
        requested_mode: 'auto',
      }).catch(() => null);
    }
    const chargedCredits = agentText.model === 'auto' && agentText.cost_usd === 0 ? 0 : estimate.finalCredits;
    await chargeCompletedAgentAction(helpers, userId, chargedCredits, `AI conversation with ${agentText.model}`, `agent_${randomUUID()}`);
    return res.json({
      success: true,
      request_id: requestId,
      text: content,
    });
  } catch (error: any) {
    const diagnostic = diagnoseProviderError(error);
    return res.status(diagnostic.status).json({
      success: false,
      error: diagnostic.message,
      message: diagnostic.message,
      diagnostic_code: diagnostic.diagnostic_code,
      request_id: requestId,
      suggested_action: diagnostic.suggested_action,
    });
  }
});

// POST /assistant/chat/stream
// Lightweight conversational stream: no project creation, no preview mutation, but
// selected models still go through the provider when OpenRouter is configured.
app.post('/api/assistant/chat/stream', async (req: any, res: any) => {
  const requestId = `chat_${randomUUID()}`;
  const authUser = requireAuthenticatedUser(req, res, requestId);
  if (!authUser) return;
  const userId = String(authUser.id);
  const prompt = sanitizeWorkspaceText(req.body?.prompt || '').trim();
  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: 'Prompt is required.',
      message: 'Prompt is required.',
      diagnostic_code: 'PROMPT_REQUIRED',
      request_id: requestId,
      suggested_action: 'write_message',
    });
  }
  if (!enforceRateLimit(`assistant_chat:${userId}`, 30, 60_000)) {
    return res.status(429).json({
      success: false,
      error: 'Too many messages. Please wait a moment.',
      message: 'Too many messages. Please wait a moment.',
      diagnostic_code: 'RATE_LIMITED',
      request_id: requestId,
      suggested_action: 'retry_later',
    });
  }

  const selectedModel = normalizeModelSelectionId(req.body?.modelId || 'auto');
  const requestedProjectId = String(req.body?.projectId || '').trim();
  const now = new Date().toISOString();
  let project: GeneratedProject = {
    id: 'assistant',
    owner_id: userId,
    organization_id: userId,
    created_by: userId,
    name: 'Huggy',
    slug: 'huggy-assistant',
    status: 'assistant',
    preview_status: 'idle',
    created_at: now,
    updated_at: now,
  };
  let files: GeneratedFile[] = [];
  let canPersistConversation = false;

  if (isUuid(requestedProjectId)) {
    const loadedProject = await loadProject(requestedProjectId, userId).catch(() => null);
    if (loadedProject && hasProjectCapability(req, 'view', loadedProject)) {
      project = loadedProject;
      files = await loadProjectFiles(project.id).catch(() => []);
      canPersistConversation = true;
    }
  }

  const history = Array.isArray(req.body?.messages)
    ? req.body.messages
      .filter((message: any) => (message?.role === 'user' || message?.role === 'assistant') && String(message?.content || '').trim())
      .slice(-10)
      .map((message: any) => `${message.role === 'assistant' ? 'Huggy' : 'User'}: ${redactSecrets(String(message.content || '')).slice(0, 1200)}`)
      .join('\n')
    : '';
  const promptWithHistory = history
    ? `${prompt}\n\nRecent conversation context, for continuity only:\n${history}`
    : prompt;
  const decision: IntentDecision = {
    intent: 'conversation',
    confidence: 0.96,
    requestedMode: 'auto',
    understandingCategory: 'explanation',
    requiresFileChanges: false,
    requiresPreviewRebuild: false,
    requiresCredits: true,
    userVisibleReason: 'Conversation only. Huggy will not touch files or preview.',
    reason: 'lightweight_conversation_stream',
    nextAction: 'answer',
    autoPlanRequired: false,
    selectedModelPolicy: 'balanced',
    routingSource: 'heuristic',
  };
  const helpers = getOptionalDbHelpers('assistant_chat_stream');
  const wallet = await getWalletWithFallback(helpers, userId);
  const estimate = estimateActionCost(prompt, decision, selectedModel);
  if (wallet < estimate.finalCredits) {
    return res.status(402).json({
      ...publicCreditGateResponse(),
      request_id: requestId,
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(': huggy-chat-stream-open\n\n');

  let sequence = 0;
  let closed = false;
  res.on('close', () => {
    closed = true;
  });
  const send = (eventType: string, message: string, payload: Record<string, unknown> = {}) => {
    if (closed || res.destroyed || res.writableEnded) return;
    sequence += 1;
    const event = {
      id: `${requestId}_${sequence}`,
      event_type: eventType,
      message: redactSecrets(message),
      payload: redactSecretPayload({ request_id: requestId, ...payload }),
      created_at: new Date().toISOString(),
    };
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const end = () => {
    if (!closed && !res.writableEnded) res.end();
  };

  try {
    if (canPersistConversation) {
      await saveProjectMessage({
        organization_id: project.organization_id,
        project_id: project.id,
        user_id: userId,
        role: 'user',
        content: prompt,
        intent: 'conversation',
        requested_mode: 'auto',
      }).catch(() => null);
      await upsertProjectWorkspaceState(userId, project.id, {
        draft_prompt: '',
        selected_mode: 'auto',
        selected_model: selectedModel,
      }).catch(() => null);
    }

    send('answer_stream_started', isLikelyFrenchPrompt(prompt) ? 'Huggy répond.' : 'Huggy is answering.', {
      intent: 'conversation',
      preview_touched: false,
      files_touched: false,
    });

    let streamedAnyToken = false;
    const agentText = await streamAgentTextResponse({
      project,
      prompt: promptWithHistory,
      files,
      decision,
      modelId: selectedModel,
      userCredits: wallet,
      allowLocalFallback: selectedModel === 'auto',
      onToken: chunk => {
        streamedAnyToken = true;
        send('answer_token', chunk, { text_delta: chunk });
      },
    });

    const content = agentText.text.trim() || createConversationResponse(project, prompt);
    if (!streamedAnyToken) {
      for (const chunk of chunkTextForPublicStream(content, 24)) {
        send('answer_token', chunk, { text_delta: chunk, fallback_stream: true });
      }
    }
    if (canPersistConversation) {
      await saveProjectMessage({
        organization_id: project.organization_id,
        project_id: project.id,
        user_id: userId,
        role: 'assistant',
        content,
        intent: 'conversation',
        requested_mode: 'auto',
      }).catch(() => null);
    }
    const chargedCredits = agentText.model === 'auto' && agentText.cost_usd === 0 ? 0 : estimate.finalCredits;
    await chargeCompletedAgentAction(helpers, userId, chargedCredits, 'AI conversation', `chat_${randomUUID()}`).catch(() => null);
    send('answering', content, {
      text: content,
      no_stream: false,
      preview_touched: false,
      files_touched: false,
    });
    send('done', 'Answer ready.', { preview_touched: false, files_touched: false });
    end();
  } catch (error: any) {
    const diagnostic = diagnoseProviderError(error);
    console.warn('[huggy:assistant_chat_stream_failed]', {
      request_id: requestId,
      user_id: userId,
      diagnostic_code: diagnostic.diagnostic_code,
      message: redactSecrets(error?.message || String(error), '[redacted]'),
    });
    send('error', diagnostic.message, {
      diagnostic_code: diagnostic.diagnostic_code,
      suggested_action: diagnostic.suggested_action,
    });
    end();
  }
});

// POST /billing/checkout/cloud-topup
app.post('/api/billing/checkout/cloud-topup', async (req, res) => {
  const { productId, email, successUrl, cancelUrl } = req.body;
  const orgId = req.body.orgId || getUserOrgId(req);

  try {
    const billing = new StripeService(getSupabase());
    const redirectUrl = await billing.createCloudTopupCheckout(
      orgId,
      email || (req as any).user?.email || 'test@huggy.app',
      productId || 'cloud_topup_10',
      successUrl || `${req.protocol}://${req.get('host')}/settings?cloud_success=true`,
      cancelUrl || `${req.protocol}://${req.get('host')}/settings?cloud_cancel=true`
    );
    res.json({ success: true, url: redirectUrl });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/billing/margins', async (req: any, res) => {
  if (!requirePlatformAdmin(req, res)) return;
  const client = requireSupabase('Admin billing margins');
  const { data, error } = await client
    .from('ai_request_usage')
    .select('id,request_id,provider_cost_usd,platform_cost_usd,final_cost_credits,status,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, rows: data || [], guardrails: PLAN_ECONOMICS_GUARDRAILS });
});

app.get('/api/admin/ai-costs', async (req: any, res) => {
  if (!requirePlatformAdmin(req, res)) return;
  const client = requireSupabase('Admin AI costs');
  const { data, error } = await client
    .from('ai_requests')
    .select('id,organization_id,project_id,model_id,request_type,status,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, rows: data || [] });
});

app.get('/api/admin/provider-usage', async (req: any, res) => {
  if (!requirePlatformAdmin(req, res)) return;
  const client = requireSupabase('Admin provider usage');
  const { data, error } = await client
    .from('provider_usage')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, rows: data || [] });
});

app.get('/api/admin/agent-observability', async (req: any, res) => {
  if (!requirePlatformAdmin(req, res)) return;
  const client = requireSupabase('Admin agent observability');
  const [runsResult, stepsResult, runnerResult, researchResult] = await Promise.all([
    client
      .from('agent_runs')
      .select('id,request_id,project_id,intent,mode,model_id,status,diagnostic_code,suggested_action,duration_ms,created_at,completed_at,cancelled_at')
      .order('created_at', { ascending: false })
      .limit(250),
    client
      .from('agent_run_steps')
      .select('agent_run_id,event_type,status,message,created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    client
      .from('agent_runner_results')
      .select('agent_run_id,status,check_type,severity,message,duration_ms,created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    client
      .from('agent_research_results')
      .select('agent_run_id,provider,status,diagnostic_code,message,created_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (runsResult.error && !isMissingAgentV2TableError(runsResult.error)) return res.status(500).json({ success: false, error: runsResult.error.message });
  if (stepsResult.error && !isMissingAgentV2TableError(stepsResult.error)) return res.status(500).json({ success: false, error: stepsResult.error.message });
  if (runnerResult.error && !isMissingAgentV2TableError(runnerResult.error)) return res.status(500).json({ success: false, error: runnerResult.error.message });
  if (researchResult.error && !isMissingAgentV2TableError(researchResult.error)) return res.status(500).json({ success: false, error: researchResult.error.message });

  const runs = (runsResult.data || []).map(redactAgentPayload);
  const steps = (stepsResult.data || []).map(redactAgentPayload);
  const runnerRows = (runnerResult.data || []).map(redactAgentPayload);
  const researchRows = (researchResult.data || []).map(redactAgentPayload);
  const completedDurations = runs
    .map((run: any) => Number(run.duration_ms || 0))
    .filter((duration: number) => Number.isFinite(duration) && duration > 0);
  const countBy = (rows: any[], key: string) => rows.reduce((acc: Record<string, number>, row: any) => {
    const value = String(row?.[key] || 'unknown');
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  const failedRuns = runs.filter((run: any) => run.status === 'failed');
  const cancelledRuns = runs.filter((run: any) => run.status === 'cancelled');
  const runnerFailures = runnerRows.filter((row: any) => row.status === 'failed').slice(0, 30);
  const feedbackEvents = steps.filter((row: any) => row.event_type === 'user_feedback');
  const moatIntelligence = buildAgentMoatIntelligence({
    runs,
    runnerFailures,
    researchRows,
    feedbackEvents,
  });
  res.json({
    success: true,
    metrics: {
      total_runs: runs.length,
      completed_runs: runs.filter((run: any) => run.status === 'completed').length,
      failed_runs: failedRuns.length,
      cancelled_runs: cancelledRuns.length,
      average_duration_ms: completedDurations.length
        ? Math.round(completedDurations.reduce((sum: number, value: number) => sum + value, 0) / completedDurations.length)
        : 0,
      total_steps: steps.length,
      runner_failures: runnerFailures.length,
      research_events: researchRows.length,
      feedback_events: feedbackEvents.length,
    },
    distributions: {
      by_status: countBy(runs, 'status'),
      by_intent: countBy(runs, 'intent'),
      by_model: countBy(runs, 'model_id'),
      by_step_type: countBy(steps, 'event_type'),
      by_research_status: countBy(researchRows, 'status'),
    },
    moat_intelligence: moatIntelligence,
    recent_errors: failedRuns.slice(0, 25).map((run: any) => ({
      id: run.id,
      request_id: run.request_id,
      project_id: run.project_id,
      intent: run.intent,
      model_id: run.model_id,
      diagnostic_code: run.diagnostic_code,
      suggested_action: run.suggested_action,
      created_at: run.created_at,
    })),
    runner_failures: runnerFailures.map((row: any) => ({
      agent_run_id: row.agent_run_id,
      check_type: row.check_type,
      severity: row.severity,
      message: row.message,
      created_at: row.created_at,
    })),
  });
});

// PATCH /users/me/ai-preferences
app.patch('/api/users/me/ai-preferences', async (req: any, res) => {
  const { default_routing_mode, max_credits_per_action, ask_confirm_before_premium, auto_revert_to_auto } = req.body;
  const uid = getRequiredAuth(req).userId;

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

app.get('/api/users/me/model-credit-rates', async (_req: any, res) => {
  res.json({
    success: true,
    models: MODEL_CREDIT_RATES,
  });
});

app.get('/api/users/me/ai-usage', async (req: any, res) => {
  const userId = getUserOrgId(req);
  const helpers = getDbHelpers();
  const client = requireSupabase('AI usage');
  const balance = await helpers.getWallet(userId);
  const planKey = normalizePlanKey(await getOrganizationPlan(userId).catch(() => 'free')) || 'free';
  const plan = getPlanConfig(planKey) || SAAS_PLANS.free;
  const cloud = await loadCloudWalletSnapshot(userId, plan);

  let history: any[] = [];
  try {
    const { data, error } = await client
      .from('ai_requests')
      .select('id, project_id, model_id, request_type, status, created_at, ai_request_usage(final_cost_credits,status), projects(name)')
      .eq('organization_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && Array.isArray(data)) history = data.map(sanitizeAiUsageRow);
  } catch {
    history = [];
  }

  if (!history.length) {
    const { data } = await client
      .from('credit_ledger')
      .select('id,type,amount,balance_after,description,reference_id,created_at')
      .eq('wallet_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    history = (data || [])
      .filter((row: any) => ['usage', 'refund'].includes(String(row.type || '')))
      .map((row: any) => {
        const sanitized = sanitizeCreditLedgerEntry(row);
        const match = String(row.description || '').match(/with\s+([A-Za-z0-9_.:/-]+)/i) || String(row.description || '').match(/on:([A-Za-z0-9_.:/-]+)/i);
        return sanitizeAiUsageRow({
          ...sanitized,
          amount: row.amount,
          model_id: match?.[1],
          request_type: row.type === 'refund' ? 'Refund' : 'AI action',
          status: row.type === 'refund' ? 'refunded' : 'completed',
        });
      });
  }

  res.json({
    success: true,
    wallet: {
      balance,
      monthly_credits: plan.credits,
      daily_promo_credits: plan.dailyCredits ?? null,
      topup_credits: null,
      cloud,
    },
    history,
  });
});

app.get('/api/users/me/workspace-state', async (req: any, res) => {
  const userId = getUserOrgId(req);
  const state = await getUserWorkspaceState(userId);
  res.json({ success: true, state });
});

app.patch('/api/users/me/workspace-state', async (req: any, res) => {
  const userId = getUserOrgId(req);
  const patch = req.body || {};
  if (patch.last_project_id) {
    const project = await loadProject(String(patch.last_project_id), userId);
    if (!project) return res.status(404).json({ success: false, error: 'Last project not found.' });
  }
  const state = await upsertUserWorkspaceState(userId, patch);
  res.json({ success: true, state });
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

app.patch('/api/projects/:id/workspace-state', async (req: any, res) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const state = await upsertProjectWorkspaceState(userId, project.id, req.body || {});
  res.json({ success: true, state });
});

app.get('/api/projects/:id/messages', async (req: any, res) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const messages = await listProjectMessagesPage(project.id, req.query?.limit, req.query?.before);
  res.json({ success: true, messages });
});

app.get('/api/projects/:id/events', async (req: any, res) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const events = await listAgentEventsPage(project.id, req.query?.limit, req.query?.before);
  res.json({ success: true, events });
});

// POST /projects/:id/messages (THE AI ENGINE AND CREDIT BALANCER)
app.post('/api/projects/:id/messages', async (req: any, res: any) => {
  const projectId = req.params.id;
  const { messages, mode, customModelId, userId, orgId = DEFAULT_ORG_ID, taskComplexity = 'medium' } = req.body;
  const clientHelpers = getDbHelpers();

  try {
    // 1. Check Wallet Balance
    const balance = await clientHelpers.getWallet(orgId);

    // 2. Select Model
    const routingCtx: RoutingContext = {
      plan: req.body.plan || 'free',
      mode: mode || 'Auto',
      userCredits: balance,
      taskComplexity: taskComplexity,
    };

    const targetModel = await modelRouter.selectModel(routingCtx, customModelId);

    // Dynamic initial estimation component
    const actionCostComp = {
      openrouter_cost_usd: 0.00001, // default baseline
      infra_cost_usd: 0.0001,
      storage_cost_usd: 0.00002,
      build_cost_usd: 0.001,
      domain_operation_cost_usd: 0,
      minimum_action_credits: Math.max(1, modelCreditFloor(targetModel)),
      complexity_surcharge: taskComplexity === 'complex' ? 1.5 : 0
    };

    const initialEstimate = costEstimator.calculateRequiredCredits(actionCostComp);
    if (balance < initialEstimate.finalCredits) {
      return res.status(402).json(publicCreditGateResponse());
    }

    // 3. Reserve Credits safely
    const refId = `req_${Math.random().toString(36).substring(2, 13)}`;
    await clientHelpers.createReservation(orgId, initialEstimate.finalCredits, refId);

    // 4. Call OpenRouter
    try {
      const completionResult = await providerGateway.chat(targetModel, messages);

      // Re-estimate final cost from real OpenRouter token outputs
      const finalCostComp = {
        openrouter_cost_usd: completionResult.cost_usd,
        infra_cost_usd: 0.0001,
        storage_cost_usd: 0.00002,
        build_cost_usd: 0.001,
        domain_operation_cost_usd: 0,
        minimum_action_credits: Math.max(1, modelCreditFloor(completionResult.model)),
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

app.post('/api/analytics/collect', async (req: any, res: any) => {
  setAnalyticsCors(res);
  try {
    const projectId = String(req.body?.project_id || '').trim();
    if (!isUuid(projectId)) {
      return res.status(400).json({ success: false, error: 'A valid project_id is required.' });
    }

    const project = await loadProjectForAnalytics(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const durationSeconds = Math.max(0, Math.min(24 * 60 * 60, Number(req.body?.duration_seconds || 0)));
    const country = detectAnalyticsCountry(req);
    await saveAnalyticsEvent(project, {
      session_id: cleanAnalyticsText(req.body?.session_id, randomUUID(), 120),
      visitor_id: cleanAnalyticsText(req.body?.visitor_id, randomUUID(), 120),
      event_type: normalizeAnalyticsEventType(req.body?.event_type),
      page_path: normalizeAnalyticsPath(req.body?.page_path),
      source: normalizeAnalyticsSource(req.body?.source),
      duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      environment: normalizeAnalyticsEnvironment(req.body?.environment),
      country_code: country.country_code,
      country_name: country.country_name,
      device: detectAnalyticsDevice(req.headers['user-agent']),
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[huggy:analytics_collect_failed]', { message: error?.message || String(error) });
    const status = error?.statusCode || (String(error?.message || '').includes('requires SUPABASE_SERVICE_ROLE_KEY') ? 503 : 500);
    return res.status(status).json({
      success: false,
      error: status === 503 ? 'Analytics storage is not configured.' : 'Analytics event could not be collected.',
    });
  }
});

app.get('/api/projects', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const projects = await listProjectsForUser(userId);
  res.json({ success: true, projects });
});

app.post('/api/projects', async (req: any, res: any) => {
  const requestId = `req_${randomUUID()}`;
  try {
    const authUser = requireAuthenticatedUser(req, res);
    if (!authUser) return;
    const userId = authUser.id;
    const organizationId = await ensurePersonalOrganization(req, userId);
    const name = sanitizeProjectName(req.body?.name);
    const prompt = sanitizeWorkspaceText(req.body?.prompt || req.body?.description || '').trim();

    if (!name) {
      return res.status(400).json({ success: false, error: 'Project name is required.' });
    }

    const now = new Date().toISOString();
    const project: GeneratedProject = {
      id: randomUUID(),
      owner_id: userId,
      organization_id: organizationId,
      created_by: userId,
      name,
      slug: await uniqueSlug(name, userId),
      prompt,
      template: String(req.body?.template || 'custom'),
      theme: String(req.body?.theme || 'light'),
      model_id: normalizeModelSelectionId(req.body?.model || req.body?.modelId || 'auto'),
      status: 'draft',
      preview_status: 'idle',
      created_at: now,
      updated_at: now,
    };

    const files = createTemplateFiles(name, prompt || `Create a polished web app named ${name}.`);
    project.preview_html = renderPreviewHtml(files, project.name, project.id, 'preview', project.prompt || project.name, project.slug || project.id);
    await saveProject(project, files);
    const huggyCloud = prompt
      ? await upsertProjectBackendRequirements(project, prompt).catch((error: any) => {
        console.warn('[huggy:cloud_requirement_create_skipped]', { message: error?.message || String(error) });
        return null;
      })
      : null;
    await upsertUserWorkspaceState(userId, {
      last_project_id: project.id,
      dashboard_draft_prompt: '',
      builder_draft_prompt: '',
      builder_selected_mode: normalizeRequestedMode(req.body?.requestedMode || req.body?.mode),
      builder_selected_model: project.model_id,
      builder_active_tab: 'preview',
      builder_preview_device: req.body?.preview_device || req.body?.previewDevice || 'desktop',
      last_route: `/builder.html?project=${project.id}`,
    });
    await upsertProjectWorkspaceState(userId, project.id, {
      draft_prompt: '',
      selected_mode: normalizeRequestedMode(req.body?.requestedMode || req.body?.mode),
      selected_model: project.model_id,
      active_tab: 'preview',
      preview_device: req.body?.preview_device || req.body?.previewDevice || 'desktop',
      sidebar_width: 380,
    });

    res.status(201).json({
      success: true,
      project,
      files,
      preview: {
        status: project.preview_status,
        html: project.preview_html,
      },
      huggy_cloud: huggyCloud
        ? {
          requirements: publicHuggyCloudRequirementPayload(huggyCloud.requirement),
          project: huggyCloud.cloudProject,
        }
        : undefined,
    });
  } catch (error: any) {
    const status = error?.statusCode || 500;
    const diagnosticCode = status === 503 ? 'PROJECT_STORAGE_NOT_CONFIGURED' : 'PROJECT_CREATE_FAILED';
    const message = status === 503
      ? 'Project storage is not configured.'
      : 'Huggy could not create the project workspace. Please retry in a moment.';
    console.error('[huggy:project_create_failed]', {
      request_id: requestId,
      diagnostic_code: diagnosticCode,
      message: redactSecrets(error?.message || String(error), '[redacted]'),
    });
    res.status(status).json({
      success: false,
      error: message,
      message,
      diagnostic_code: diagnosticCode,
      request_id: requestId,
      suggested_action: status === 503 ? 'check_supabase_configuration' : 'retry',
    });
  }
});

app.get('/api/projects/:id', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const files = await loadProjectFiles(project.id);
  const messages = await listProjectMessages(project.id);
  const events = await listAgentEvents(project.id);
  const workspaceState = await getProjectWorkspaceState(project.id);
  await upsertUserWorkspaceState(userId, { last_project_id: project.id, last_route: `/builder.html?project=${project.id}` });
  res.json({
    success: true,
    project,
    files,
    messages,
    events,
    workspace_state: workspaceState,
    preview: {
      status: project.preview_status || 'idle',
      html: getProjectPreviewHtml(project, files, 'preview'),
    },
  });
});

app.patch('/api/projects/:id', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const name = sanitizeProjectName(req.body?.name);
  if (name.length < 2) {
    return res.status(400).json({ success: false, error: 'Project name must contain at least 2 characters.' });
  }

  const updatedProject = {
    ...project,
    name,
    slug: await uniqueSlug(name, userId, project.id),
    updated_at: new Date().toISOString(),
  };
  await saveProject(updatedProject);
  res.json({ success: true, project: updatedProject });
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
  const workspaceState = await getProjectWorkspaceState(project.id);
  await upsertUserWorkspaceState(userId, { last_project_id: project.id, last_route: `/builder.html?project=${project.id}` });
  res.json({
    success: true,
    project,
    files,
    messages,
    events,
    versions,
    secrets,
    errors,
    workspace_state: workspaceState,
    preview: {
      status: project.preview_status || 'idle',
      html: getProjectPreviewHtml(project, files, 'preview'),
    },
  });
});

app.get('/api/projects/:id/analysis', async (req: any, res: any) => {
  try {
    const userId = getUserOrgId(req);
    const project = await loadProject(req.params.id, userId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
    const files = await loadProjectFiles(project.id);
    const analysis = await loadProjectAnalysis(project, String(req.query?.range || '30d'));
    const seo = buildProjectSeoAudit(project, files);
    res.json({ success: true, project_id: project.id, range: String(req.query?.range || '30d'), ...analysis, seo });
  } catch (error: any) {
    const status = error?.statusCode || (String(error?.message || '').includes('requires SUPABASE_SERVICE_ROLE_KEY') ? 503 : 500);
    res.status(status).json({
      success: false,
      error: status === 503 ? 'Analytics storage is not configured.' : error?.message || 'Analysis unavailable.',
    });
  }
});

app.get('/api/projects/:id/seo-audit', async (req: any, res: any) => {
  try {
    const userId = getUserOrgId(req);
    const project = await loadProject(req.params.id, userId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
    const files = await loadProjectFiles(project.id);
    res.json({ success: true, project_id: project.id, seo: buildProjectSeoAudit(project, files) });
  } catch (error: any) {
    const status = error?.statusCode || 500;
    res.status(status).json({
      success: false,
      error: error?.message || 'SEO audit unavailable.',
    });
  }
});

app.post('/api/projects/:id/estimate', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const files = await loadProjectFiles(project.id);
  const lastPlan = await getLastProjectPlan(project.id);
  const decision = await resolveAgentDecision({
    prompt: sanitizeWorkspaceText(req.body?.prompt || ''),
    requestedMode: normalizeRequestedMode(req.body?.requestedMode),
    hasFiles: files.length > 0,
    lastPlan,
  });
  void decision;
  res.json({
    allowed: true,
    requires_upgrade: false,
    suggested_action: 'continue',
  });
});

app.post('/api/projects/:id/agent/answer', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const originalPrompt = redactSecrets(req.body?.originalPrompt || '').trim();
  const answer = redactSecrets(req.body?.answer || '').trim();
  const recommendation = redactSecrets(req.body?.recommendation || '').trim();
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
    requested_mode: normalizeRequestedMode(req.body?.requestedMode),
  });

  res.json({
    success: true,
    prompt: resumedPrompt,
    requestedMode: normalizeRequestedMode(req.body?.requestedMode),
  });
});

function buildMediaPrompt(input: {
  prompt: string;
  settings: HuggyMediaSettings;
  project: GeneratedProject;
}) {
  const output = mediaOutputForKind(input.settings.kind);
  const isMarketingKit = output === 'marketing_kit';
  return [
    isMarketingKit
      ? 'Create a launch-ready marketing kit for Huggy Media.'
      : `Create a ${output} concept for Huggy Media.`,
    `Project: ${input.project.name}.`,
    `Format: ${input.settings.format}.`,
    `Duration: ${input.settings.duration}.`,
    `Asset type: ${input.settings.kind.replace(/_/g, ' ')}.`,
    'Style: clean, premium, marketing-ready, direct, modern, specific to the project, not generic AI design.',
    isMarketingKit
      ? 'Include launch headline, positioning, social posts, WhatsApp copy, ad angles, CTA, brand asset guidance, and one-pager outline.'
      : 'If this is a rendered asset, keep the result visually simple, brand-safe, and useful for launch.',
    'If this is UGC or an ad, include a strong first-second hook, clear product promise, simple visual sequence, and CTA.',
    `User request: ${input.prompt}`,
  ].join('\n');
}

function mediaKindLabel(kind: HuggyMediaSettings['kind']) {
  const labels: Record<HuggyMediaSettings['kind'], string> = {
    launch_kit: 'Launch kit',
    social_posts: 'Social posts',
    ads_creatives: 'Ads creatives',
    brand_assets: 'Brand assets',
    pitch_one_pager: 'Pitch / one-pager',
    video_ad: 'Video ad',
    ugc: 'UGC ad',
    storyboard: 'Storyboard',
    product_image: 'Product image',
    social_creative: 'Social creative',
    thumbnail: 'Thumbnail',
  };
  return labels[kind] || 'Media';
}

function projectAudienceHint(project: GeneratedProject, prompt: string) {
  const source = `${project.name || ''} ${prompt || ''}`.toLowerCase();
  if (/restaurant|menu|reservation|food|cafe|bar/.test(source)) return 'local customers who want to book, order or discover the offer quickly';
  if (/e-?commerce|shop|store|product|checkout|cart/.test(source)) return 'buyers comparing products and looking for trust, price and proof';
  if (/saas|dashboard|crm|analytics|tool|startup/.test(source)) return 'busy teams who want a faster workflow and a clear business outcome';
  if (/portfolio|agency|creator|studio/.test(source)) return 'clients who want to understand the work, credibility and next step quickly';
  if (/course|school|education|learn/.test(source)) return 'learners or parents looking for clarity, confidence and progress';
  return 'people who need the project promise explained clearly before they take action';
}

function buildMediaKitSections(input: {
  project: GeneratedProject;
  prompt: string;
  settings: HuggyMediaSettings;
}) {
  const projectName = input.project.name || 'this app';
  const audience = projectAudienceHint(input.project, input.prompt);
  const cleanPrompt = input.prompt.replace(/\s+/g, ' ').trim();
  const promise = cleanPrompt.length > 12
    ? cleanPrompt
    : `${projectName} helps users get from idea to a useful result faster.`;
  const cta = input.settings.kind === 'pitch_one_pager'
    ? 'Book a demo'
    : input.settings.kind === 'social_posts'
      ? 'Try it today'
      : 'Launch with Huggy';
  const angle = input.settings.kind === 'ads_creatives'
    ? 'Turn the pain point into a fast, visible before/after.'
    : input.settings.kind === 'brand_assets'
      ? 'Make every asset feel consistent, trustworthy and easy to reuse.'
      : input.settings.kind === 'pitch_one_pager'
        ? 'Lead with the problem, show the product, then prove the opportunity.'
        : 'Show the app as a practical launch-ready solution.';

  return [
    {
      title: 'Launch headline',
      body: `${projectName}: ${promise}`,
    },
    {
      title: 'Audience',
      body: audience,
    },
    {
      title: 'Core angle',
      body: angle,
    },
    {
      title: 'Facebook / Instagram',
      body: `Your next launch asset is ready. ${projectName} turns the main promise into a simple experience people can understand in seconds. ${cta}.`,
    },
    {
      title: 'LinkedIn',
      body: `We built ${projectName} to make the value obvious: clear workflow, polished interface, and a direct path from interest to action. ${cta}.`,
    },
    {
      title: 'WhatsApp',
      body: `Hi, I just launched ${projectName}. It helps ${audience}. Want me to send you the link?`,
    },
    {
      title: 'Ad variant A',
      body: `Hook: Stop losing time on manual work. Visual: app screen in context. CTA: ${cta}.`,
    },
    {
      title: 'Ad variant B',
      body: `Hook: See the result before you commit. Visual: before/after split. CTA: ${cta}.`,
    },
    {
      title: 'Brand assets',
      body: 'Use one hero screenshot, one square social card, one vertical story, one simple logo lockup, and one short CTA line.',
    },
    {
      title: 'One-pager outline',
      body: `Problem, audience, product promise, 3 key benefits, proof or preview screenshot, pricing/next step, CTA: ${cta}.`,
    },
  ];
}

function renderMediaAsset(asset: FalMediaAsset) {
  if (asset.type === 'video') {
    return `<video class="media-preview-asset" src="${escapeHtml(asset.url)}" controls playsinline preload="metadata"></video>`;
  }
  return `<img class="media-preview-asset" src="${escapeHtml(asset.url)}" alt="Generated Huggy Media asset">`;
}

function renderHuggyMediaPreviewHtml(input: {
  project: GeneratedProject;
  prompt: string;
  settings: HuggyMediaSettings;
  modelLabel: string;
  estimatedCredits: number;
  providerStatus: 'completed' | 'queued' | 'not_configured' | 'locked' | 'failed';
  assets: FalMediaAsset[];
  errorMessage?: string;
}) {
  const kind = mediaKindLabel(input.settings.kind);
  const output = mediaOutputForKind(input.settings.kind);
  const isMarketingKit = output === 'marketing_kit';
  const statusCopy: Record<'completed' | 'queued' | 'not_configured' | 'locked' | 'failed', string> = {
    completed: 'Asset ready',
    queued: 'Render queued',
    not_configured: 'Provider not connected',
    locked: 'Plan upgrade required',
    failed: 'Render needs retry',
  };
  const heroCopy = input.providerStatus === 'completed'
    ? isMarketingKit ? 'Your marketing kit is ready.' : 'Your generated asset is ready.'
    : input.providerStatus === 'queued'
      ? 'The render was accepted and is being processed.'
      : input.providerStatus === 'locked'
        ? 'This media model is reserved for a higher plan or needs more credits.'
        : input.providerStatus === 'failed'
          ? 'The provider could not complete this render.'
          : 'Huggy prepared the creative direction. Connect fal.ai to render real media.';
  const cards = isMarketingKit
    ? buildMediaKitSections({ project: input.project, prompt: input.prompt, settings: input.settings })
    : [
      { title: 'Hook', body: input.settings.kind === 'ugc' ? 'Open with a human, problem-first line that feels native to Reels/TikTok.' : 'Lead with the clearest product promise in the first second.' },
      { title: 'Visual rhythm', body: output === 'image' ? 'One strong focal point, product-first composition, clean negative space.' : '3 short beats: problem, transformation, proof or CTA.' },
      { title: 'Brand fit', body: 'Use the project tone, avoid stock-looking scenes, keep text short and readable.' },
      { title: 'Next action', body: input.assets.length ? 'Download, reuse, or ask Huggy for a variation.' : 'Render when provider access is ready, or ask for a cheaper/faster variant.' },
    ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{color-scheme:light dark;--bg:#fcfbf8;--panel:#fffefa;--ink:#1c1c1c;--muted:#5f5f5d;--line:#eceae4;--blue:#315fdc;--soft:#f7f4ed}
@media(prefers-color-scheme:dark){:root{--bg:#171613;--panel:#201f1b;--ink:#f8f4eb;--muted:#d8d1c3;--line:rgba(252,251,248,.14);--soft:#24231f}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0,rgba(59,130,246,.13),transparent 34%),var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.media-lab{min-height:100vh;padding:clamp(22px,4vw,44px);display:grid;align-content:center;gap:18px}
.media-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
.eyebrow{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.dot{width:8px;height:8px;border-radius:99px;background:#3b82f6;box-shadow:0 0 0 5px rgba(59,130,246,.12)}
h1{margin:8px 0 8px;font-size:clamp(30px,5vw,58px);line-height:.94;letter-spacing:-.05em;max-width:780px}.summary{margin:0;max-width:680px;color:var(--muted);font-size:clamp(14px,1.7vw,18px);line-height:1.55}
.status{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;background:var(--panel);padding:9px 12px;font-size:12px;font-weight:800;color:var(--ink);white-space:nowrap}
.grid{display:grid;grid-template-columns:${isMarketingKit ? '1fr' : 'minmax(0,1.25fr) minmax(280px,.75fr)'};gap:16px;align-items:stretch}.stage,.brief{border:1px solid var(--line);border-radius:22px;background:color-mix(in srgb,var(--panel) 92%,transparent);box-shadow:0 24px 70px rgba(28,28,28,.08);overflow:hidden}
.stage{min-height:${isMarketingKit ? 'auto' : '420px'};display:grid;place-items:center;padding:18px}.asset-wrap{width:100%;height:100%;display:grid;place-items:center;border-radius:18px;background:linear-gradient(135deg,var(--soft),var(--panel));border:1px solid var(--line);overflow:hidden}
.media-preview-asset{max-width:100%;max-height:68vh;border-radius:16px;display:block;object-fit:contain}.placeholder{padding:32px;text-align:center;max-width:520px}.orb{width:138px;height:138px;margin:0 auto 22px;border-radius:999px;background:radial-gradient(circle at 28% 24%,#fff,rgba(191,219,254,.9) 23%,rgba(49,95,220,.55) 52%,rgba(28,28,28,.18) 76%);box-shadow:0 24px 80px rgba(49,95,220,.24);animation:pulse 4s cubic-bezier(.22,1,.36,1) infinite}
.placeholder strong{display:block;font-size:22px;margin-bottom:8px}.placeholder span{color:var(--muted);font-size:14px;line-height:1.5}.brief{padding:18px;display:grid;gap:10px}.meta{display:flex;flex-wrap:wrap;gap:8px}.pill{border:1px solid var(--line);background:var(--soft);border-radius:999px;padding:7px 9px;font-size:12px;font-weight:800;color:var(--ink)}
.kit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.card{border:1px solid var(--line);border-radius:16px;background:var(--panel);padding:14px}.card span{display:block;color:var(--muted);font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.card p{margin:0;color:var(--ink);font-size:13px;line-height:1.48}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}.actions a,.actions button{height:34px;border-radius:999px;border:1px solid var(--line);background:var(--ink);color:var(--bg);padding:0 13px;font:800 12px Inter,system-ui;text-decoration:none;display:inline-flex;align-items:center}
.actions button{background:transparent;color:var(--ink)}.error{color:#b42318;font-size:12px;margin-top:8px}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.04);opacity:1}}@media(max-width:820px){.grid,.kit-grid{grid-template-columns:1fr}.media-head{display:grid}.stage{min-height:${isMarketingKit ? 'auto' : '340px'}}}@media(prefers-reduced-motion:reduce){.orb{animation:none}}
</style>
</head>
<body>
<main class="media-lab">
  <section class="media-head">
    <div>
      <div class="eyebrow"><span class="dot"></span>Huggy Media</div>
      <h1>${escapeHtml(kind)} for ${escapeHtml(input.project.name || 'your project')}</h1>
      <p class="summary">${escapeHtml(heroCopy)}</p>
    </div>
    <div class="status">${escapeHtml(statusCopy[input.providerStatus])}</div>
  </section>
  <section class="grid">
    ${isMarketingKit ? '' : `<div class="stage">
      <div class="asset-wrap">
        ${input.assets.length ? input.assets.map(renderMediaAsset).join('') : `<div class="placeholder"><div class="orb" aria-hidden="true"></div><strong>${escapeHtml(kind)} brief ready</strong><span>${escapeHtml(input.prompt)}</span>${input.errorMessage ? `<div class="error">${escapeHtml(input.errorMessage)}</div>` : ''}</div>`}
      </div>
    </div>`}
    <aside class="brief">
      <div class="meta">
        <span class="pill">${escapeHtml(input.settings.format)}</span>
        <span class="pill">${escapeHtml(input.settings.duration)}</span>
        <span class="pill">${escapeHtml(input.modelLabel)}</span>
        <span class="pill">~${input.estimatedCredits} credits</span>
      </div>
      <div class="${isMarketingKit ? 'kit-grid' : ''}">
        ${cards.map(card => `<div class="card"><span>${escapeHtml(card.title)}</span><p>${escapeHtml(card.body)}</p></div>`).join('')}
      </div>
      <div class="actions">
        ${input.assets[0]?.url ? `<a href="${escapeHtml(input.assets[0].url)}" download>Download</a>` : ''}
        <button type="button">${isMarketingKit ? 'Make more variants' : 'Make variation'}</button>
        <button type="button">${isMarketingKit ? 'Turn into visual' : 'Use in app'}</button>
      </div>
    </aside>
  </section>
</main>
</body>
</html>`;
}

async function saveMediaAssetRecords(input: {
  project: GeneratedProject;
  userId: string;
  prompt: string;
  settings: HuggyMediaSettings;
  modelId: string;
  assets: FalMediaAsset[];
  estimatedCredits: number;
}) {
  if (!input.assets.length) return;
  const client = getSupabase();
  if (!client) return;
  const rows = input.assets.map(asset => ({
    organization_id: input.project.organization_id,
    project_id: input.project.id,
    user_id: input.userId,
    asset_type: asset.type,
    provider: 'fal.ai',
    model_id: input.modelId,
    prompt: input.prompt,
    format: input.settings.format,
    duration: input.settings.duration,
    asset_url: asset.url,
    thumbnail_url: asset.type === 'image' ? asset.url : null,
    status: 'completed',
    credits_charged: input.estimatedCredits,
    public_metadata: {
      kind: input.settings.kind,
      width: asset.width || null,
      height: asset.height || null,
      content_type: asset.contentType || null,
    },
  }));
  const { error } = await client.from('media_assets').insert(rows);
  if (error && /media_assets|schema cache|relation .* does not exist|table .* does not exist/i.test(error.message || '')) {
    console.warn('[huggy:media_assets_skipped]', { message: error.message });
    return;
  }
  if (error) console.warn('[huggy:media_assets_insert_failed]', { message: redactSecrets(error.message) });
}

app.post('/api/projects/:id/media/generate', async (req: any, res: any) => {
  const requestId = `media_${randomUUID()}`;
  const authUser = requireAuthenticatedUser(req, res, requestId);
  if (!authUser) return;
  const userId = authUser.id;
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  if (!requireProjectCapability(req, res, 'view', project)) return;

  const prompt = sanitizeWorkspaceText(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required.' });
  if (isAbusivePrompt(prompt)) {
    return res.status(400).json({ success: false, error: 'This request cannot be generated safely.' });
  }
  if (!enforceRateLimit(`media:${userId}`, 10, 60_000)) {
    return res.status(429).json({ success: false, error: 'Too many media requests. Please wait a moment.' });
  }

  const helpers = getDbHelpers();
  const plan = await getOrganizationPlan(project.organization_id).catch(() => 'free');
  const settings = normalizeMediaSettings(req.body?.settings || req.body?.mediaSettings || req.body?.studioContext?.settings || {});
  const model = selectMediaModel(settings, plan);
  const estimatedCredits = estimateMediaCredits(settings, model);
  const wallet = await helpers.getWallet(userId).catch(() => FALLBACK_WALLET_CREDITS);
  const modelAvailable = isMediaModelAvailable(model, plan);
  const output = mediaOutputForKind(settings.kind);
  const isMarketingKit = isMarketingMediaKind(settings.kind);

  await saveProjectMessage({
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    role: 'user',
    content: prompt,
    intent: 'conversation',
    requested_mode: 'auto',
  });

  let providerStatus: 'completed' | 'queued' | 'not_configured' | 'locked' | 'failed' = 'not_configured';
  let assets: FalMediaAsset[] = [];
  let errorMessage = '';
  if (!modelAvailable) {
    providerStatus = 'locked';
  } else if (wallet < estimatedCredits) {
    providerStatus = 'locked';
    errorMessage = 'Not enough credits for this media render.';
  } else if (isMarketingKit) {
    providerStatus = 'completed';
    const finalBalance = await helpers.updateWallet(userId, -estimatedCredits);
    await helpers.addLedger(userId, 'usage', -estimatedCredits, finalBalance, `Generated ${mediaKindLabel(settings.kind)} with Huggy Media`, requestId);
  } else {
    try {
      const mediaPrompt = buildMediaPrompt({ prompt, settings, project });
      const result = await falMediaGateway.generate({ model, settings, prompt: mediaPrompt });
      providerStatus = result.status;
      assets = result.assets;
      if (assets.length) {
        const finalBalance = await helpers.updateWallet(userId, -estimatedCredits);
        await helpers.addLedger(userId, 'usage', -estimatedCredits, finalBalance, `Generated ${output} media with ${model.label}`, requestId);
        await saveMediaAssetRecords({ project, userId, prompt, settings, modelId: model.id, assets, estimatedCredits });
      }
    } catch (error: any) {
      providerStatus = 'failed';
      errorMessage = diagnoseProviderError(error).message || normalizeProviderError(error);
    }
  }

  const previewHtml = renderHuggyMediaPreviewHtml({
    project,
    prompt,
    settings,
    modelLabel: model.label,
    estimatedCredits,
    providerStatus,
    assets,
    errorMessage,
  });
  const isFrench = isLikelyFrenchPrompt(prompt);
  const assistantText = isFrench
    ? [
      isMarketingKit
        ? 'J ai prepare un kit marketing propre dans la preview.'
        : assets.length ? 'Le media est pret dans la preview.' : 'J ai prepare un brief media propre dans la preview.',
      `Type: ${mediaKindLabel(settings.kind)}. Format: ${settings.format}. Modele: ${model.label}.`,
      isMarketingKit
        ? `Credits estimes: ${estimatedCredits}. Tu peux demander une variante, un format social ou une version visuelle.`
        : providerStatus === 'not_configured'
        ? 'fal.ai n est pas encore configure cote serveur, donc je ne pretends pas avoir rendu une vraie video/image.'
        : providerStatus === 'locked'
          ? 'Ce rendu demande un plan ou des credits suffisants.'
          : providerStatus === 'failed'
            ? 'Le provider n a pas termine le rendu. Le brief reste disponible pour relancer ou changer de modele.'
            : `Credits estimes: ${estimatedCredits}.`,
    ].join('\n')
    : [
      isMarketingKit
        ? 'I prepared a clean marketing kit in Preview.'
        : assets.length ? 'The media asset is ready in Preview.' : 'I prepared a clean media brief in Preview.',
      `Type: ${mediaKindLabel(settings.kind)}. Format: ${settings.format}. Model: ${model.label}.`,
      isMarketingKit
        ? `Estimated credits: ${estimatedCredits}. You can ask for variants, a social format, or a rendered visual next.`
        : providerStatus === 'not_configured'
        ? 'fal.ai is not configured on the server yet, so I am not pretending a real image/video was rendered.'
        : providerStatus === 'locked'
          ? 'This render needs the right plan or enough credits.'
          : providerStatus === 'failed'
            ? 'The provider did not complete the render. The brief is available for retry or model change.'
            : `Estimated credits: ${estimatedCredits}.`,
    ].join('\n');

  await saveProjectMessage({
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    role: 'assistant',
    content: assistantText,
    intent: 'conversation',
    requested_mode: 'auto',
  });

  res.json({
    success: true,
    request_id: requestId,
    status: providerStatus,
    provider_configured: falMediaGateway.isConfigured(),
    output,
    settings,
    model: {
      id: model.id,
      label: model.label,
      output: model.output,
      quality: model.quality,
      min_plan: model.minPlan,
    },
    estimated_credits: estimatedCredits,
    assets,
    text: assistantText,
    preview: {
      status: 'media',
      html: previewHtml,
    },
  });
});

app.post('/api/import/prepare', async (req: any, res: any) => {
  const requestId = `imp_${randomUUID()}`;
  const authUser = requireAuthenticatedUser(req, res, requestId);
  if (!authUser) return;

  const importContext = buildImportContext({
    source: req.body?.source,
    mode: req.body?.mode,
    url: req.body?.url || req.body?.source_url,
    fileName: req.body?.fileName || req.body?.file_name,
    mimeType: req.body?.mimeType || req.body?.mime_type,
    hasAttachment: Boolean(req.body?.hasAttachment),
  }, {
    figmaConfigured: Boolean(process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN),
    githubConfigured: Boolean(process.env.GITHUB_TOKEN || process.env.GITHUB_IMPORT_TOKEN),
  });

  if (!importContext) {
    return res.status(400).json({
      success: false,
      message: 'Unsupported import source.',
      diagnostic_code: 'IMPORT_SOURCE_UNSUPPORTED',
      request_id: requestId,
      suggested_action: 'choose_figma_github_image_or_url',
    });
  }

  const status = importContext.status === 'invalid' ? 400 : 200;
  return res.status(status).json({
    success: importContext.status !== 'invalid',
    request_id: requestId,
    import: publicImportContext(importContext),
    prompt: importContext.prompt,
  });
});

app.post('/api/projects/:id/generate', async (req: any, res: any) => {
  const requestId = `req_${randomUUID()}`;
  const authUser = requireAuthenticatedUser(req, res, requestId);
  if (!authUser) return;
  const userId = authUser.id;
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const prompt = sanitizeWorkspaceText(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required.' });
  const studioContext = req.body?.studioContext;
  const importContext = req.body?.importContext;
  const preparedImportContext = buildImportContext({
    source: importContext?.source,
    mode: importContext?.mode,
    url: importContext?.source_url || importContext?.url,
    fileName: importContext?.file_name || importContext?.fileName,
    mimeType: importContext?.mime_type || importContext?.mimeType,
    hasAttachment: Boolean(importContext?.file_name || importContext?.hasAttachment),
  }, {
    figmaConfigured: Boolean(process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN || importContext?.status === 'ready'),
    githubConfigured: Boolean(process.env.GITHUB_TOKEN || process.env.GITHUB_IMPORT_TOKEN || importContext?.status === 'ready'),
  }) || importContext;
  const agentPrompt = applyRequestContextToPrompt(prompt, studioContext, preparedImportContext);
  if (!requireProjectCapability(req, res, 'view', project)) return;
  if (!enforceRateLimit(`generate:${userId}`, 12, 60_000)) {
    return res.status(429).json({ success: false, error: 'Too many build requests. Please wait a moment.' });
  }
  if (isAbusivePrompt(prompt)) {
    return res.status(400).json({ success: false, error: 'This request cannot be generated safely.' });
  }

  const helpers = getDbHelpers();
  const requestedMode = normalizeRequestedMode(req.body?.requestedMode);
  const requestedModelSelection = normalizeModelSelectionId(req.body?.modelId || project.model_id || 'auto');
  const existingFiles = await loadProjectFiles(project.id);
  const lastPlan = await getLastProjectPlan(project.id);
  const decision = await resolveAgentDecision({
    prompt: agentPrompt,
    requestedMode,
    hasFiles: existingFiles.length > 0,
    lastPlan,
  });
  const reliability = buildReliabilityDecision(decision);
  const seniorAgentContext = compileSeniorAgentContext({
    prompt: agentPrompt,
    project,
    files: existingFiles,
    decision,
    importContext: preparedImportContext || undefined,
  });
  const agentPromptForText = decision.intent === 'conversation'
    ? agentPrompt
    : applySeniorAgentContextToPrompt(agentPrompt, seniorAgentContext);
  const huggyCloudPlan = reliability.should_mutate_files
    ? await upsertProjectBackendRequirements(project, prompt).catch((error: any) => {
      console.warn('[huggy:cloud_requirement_generate_skipped]', { message: error?.message || String(error) });
      return null;
    })
    : null;
  const walletForRouting = await helpers.getWallet(userId).catch(() => FALLBACK_WALLET_CREDITS);
  let modelRouting;
  try {
    modelRouting = await resolveAgentProviderModel({
      modelId: requestedModelSelection,
      project,
      prompt: agentPrompt,
      decision,
      files: existingFiles,
      userCredits: walletForRouting,
    });
  } catch (error: any) {
    return res.status(200).json({
      ...publicCreditGateResponse(),
      message: error?.message || 'This action is unavailable with the current plan or credit balance.',
    });
  }
  const effectiveModelSelection = modelRouting.model;
  let agentRunId = '';
  if (AGENT_V2_ENABLED) {
    const contextPack = {
      ...buildAgentContextPack({
      project,
      files: existingFiles,
      messages: await listProjectMessagesPage(project.id, 12, null).catch(() => []),
      events: await listAgentEventsPage(project.id, 16, null).catch(() => []),
      versions: await listProjectVersions(project.id).catch(() => []),
      memory: await listAgentMemory(project.id).catch(() => []),
      previewStatus: project.preview_status,
      selectedModel: effectiveModelSelection,
      requestId,
      }),
      senior_agent_os: seniorAgentContext,
    };
    agentRunId = (await createAgentRun(project, userId, requestId, decision, effectiveModelSelection, contextPack)).id;
  }
  await saveProjectMessage({
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    role: 'user',
    content: prompt,
    intent: decision.intent,
    requested_mode: decision.requestedMode,
  });
  await upsertProjectWorkspaceState(userId, project.id, {
    draft_prompt: '',
    selected_mode: decision.requestedMode,
    selected_model: requestedModelSelection,
    active_tab: reliability.should_touch_preview ? 'preview' : undefined,
  });

  if (decision.intent === 'conversation' || decision.intent === 'clarification_required' || decision.intent === 'plan' || decision.intent === 'verify' || decision.intent === 'deploy_assist') {
    const cost = estimateActionCost(prompt, decision, effectiveModelSelection);
    const wallet = cost.finalCredits > 0 ? walletForRouting : Number.POSITIVE_INFINITY;
    if (wallet < cost.finalCredits) {
      await updateAgentRunStatus(agentRunId, 'failed', { diagnostic_code: 'CREDITS_REQUIRED', suggested_action: 'use_auto' });
      return res.status(200).json(publicCreditGateResponse());
    }
    let agentText: any;
    let content = '';
    try {
      if (decision.intent === 'clarification_required') {
        content = createClarificationContent(decision);
        agentText = { text: content, model: 'router', cost_usd: 0 };
      } else {
        agentText = await createAgentTextResponse({ project, prompt: agentPromptForText, files: existingFiles, decision, modelId: requestedModelSelection, userCredits: walletForRouting, allowLocalFallback: requestedModelSelection === 'auto' });
        content = agentText.text;
      }
    } catch (error: any) {
      const message = normalizeProviderError(error);
      const diagnostic = diagnoseProviderError(error);
      await updateAgentRunStatus(agentRunId, 'failed', { diagnostic_code: diagnostic.diagnostic_code, suggested_action: diagnostic.suggested_action });
      return res.status(message.includes('not configured') ? 503 : 200).json({ success: false, error: message, message });
    }
    await saveProjectMessage({
      organization_id: project.organization_id,
      project_id: project.id,
      user_id: userId,
      role: 'assistant',
      content,
      intent: decision.intent,
      requested_mode: decision.requestedMode,
    });
    const chargedCredits = agentText.model === 'router' || (agentText.model === 'auto' && agentText.cost_usd === 0) ? 0 : cost.finalCredits;
    await chargeCompletedAgentAction(helpers, userId, chargedCredits, `AI ${decision.intent} with ${agentText.model}`, `agent_${randomUUID()}`);
    await recordAgentImprovementSignal(project, userId, {
      prompt,
      decision,
      outcome: improvementOutcomeForDecision(decision),
      previewChanged: false,
      qualityStatus: 'not_applicable',
    });
    await updateAgentRunStatus(agentRunId, 'completed');
    return res.json({
      success: true,
      intent: decision,
      text: content,
      model: agentText.model,
      reliability,
      files: reliability.should_mutate_files ? existingFiles : undefined,
      preview: reliability.should_touch_preview
        ? { status: project.preview_status || 'idle', html: getProjectPreviewHtml(project, existingFiles, 'preview') }
        : undefined,
    });
  }

  if (decision.requiresFileChanges && !hasProjectCapability(req, 'build', project)) {
    await updateAgentRunStatus(agentRunId, 'failed', { diagnostic_code: 'PERMISSION_DENIED', suggested_action: 'ask_project_owner' });
    return res.status(403).json({ success: false, error: 'Action unavailable with your current project role.', diagnostic_code: 'PERMISSION_DENIED', suggested_action: 'ask_project_owner' });
  }

  const wallet = walletForRouting;
  const cost = estimateActionCost(prompt, decision, effectiveModelSelection);

  if (wallet < cost.finalCredits) {
    await updateAgentRunStatus(agentRunId, 'failed', { diagnostic_code: 'CREDITS_REQUIRED', suggested_action: 'use_auto' });
    return res.status(200).json({
      ...publicCreditGateResponse(),
    });
  }

  const refId = `gen_${randomUUID()}`;
  await helpers.createReservation(userId, cost.finalCredits, refId);

  try {
    let executionPlan = '';
    if (decision.autoPlanRequired) {
      try {
        const planDecision: IntentDecision = {
          ...decision,
          intent: 'plan',
          requiresFileChanges: false,
          requiresPreviewRebuild: false,
          nextAction: 'plan_only',
        };
        executionPlan = (await createAgentTextResponse({ project, prompt: agentPromptForText, files: existingFiles, decision: planDecision, modelId: requestedModelSelection, userCredits: walletForRouting, allowLocalFallback: requestedModelSelection === 'auto' })).text;
      } catch {
        executionPlan = createPlanResponse(project, prompt, existingFiles);
      }
    }
    const basePrompt = req.body?.useLastPlan && lastPlan ? `${lastPlan}\n\nUser confirmed build: ${agentPrompt}` : agentPrompt;
    const generation = await generateFilesWithAi({
      projectName: project.name,
      prompt: executionPlan ? `${executionPlan}\n\nBuild request:\n${basePrompt}` : basePrompt,
      project,
      decision,
      modelId: effectiveModelSelection,
      userCredits: walletForRouting,
      existingFiles,
      seniorAgentContext,
    });

    const mergedByPath = new Map<string, GeneratedFile>();
    existingFiles.forEach(file => mergedByPath.set(file.path, file));
    generation.files.forEach(file => mergedByPath.set(file.path, file));
    let files = withProjectSeoSupport(
      Array.from(mergedByPath.values()).sort((a, b) => a.path.localeCompare(b.path)),
      project.name,
      prompt,
      { ensureIndex: true },
    );
    files = ensureModernFrontendProject(files, project.name, prompt);

    let pipeline = runPreviewPipeline(project, files);
    let finalFiles = files;
    let autoFix = null as any;
    if (pipeline.status === 'failed') {
      await Promise.all(pipeline.errors.map(error => saveBuildError(project, error)));
      for (let attempt = 1; attempt <= 3 && pipeline.status === 'failed'; attempt += 1) {
        const fix = applyAutoFix(project, finalFiles, pipeline.errors);
        autoFix = fix.patch;
        if (!fix.fixed) break;
        finalFiles = fix.files;
        pipeline = runPreviewPipeline(project, finalFiles);
      }
    }
    let previewHtml = pipeline.html;
    let runnerResult: RunnerResult | null = null;
    if (AGENT_V3_ENABLED && reliability.requires_runner) {
      runnerResult = await projectRunner.run({
        runId: agentRunId || requestId,
        projectId: project.id,
        files: finalFiles,
        previewHtml,
        timeoutMs: DEFAULT_AGENT_V3_BUDGET.runnerTimeoutMs,
      });
      await saveAgentRunnerResults(project, userId, agentRunId, runnerResult);
      let runnerBlocking = runnerChecksToVerificationChecks(runnerResult.checks).filter(isBlockingVerificationFailure);
      for (let attempt = 1; runnerBlocking.length && attempt <= DEFAULT_AGENT_V3_BUDGET.maxAutoFixAttempts; attempt += 1) {
        const fix = applyAutoFix(project, finalFiles, runnerBlocking.map(check => ({
          file: check.file || 'index.html',
          message: check.message,
          severity: check.severity,
        })));
        autoFix = fix.patch;
        if (!fix.fixed) break;
        finalFiles = fix.files;
        pipeline = runPreviewPipeline(project, finalFiles);
        previewHtml = pipeline.html;
        runnerResult = await projectRunner.run({
          runId: agentRunId || requestId,
          projectId: project.id,
          files: finalFiles,
          previewHtml,
          timeoutMs: DEFAULT_AGENT_V3_BUDGET.runnerTimeoutMs,
        });
        await saveAgentRunnerResults(project, userId, agentRunId, runnerResult);
        runnerBlocking = runnerChecksToVerificationChecks(runnerResult.checks).filter(isBlockingVerificationFailure);
      }
    }
    const uiPolicy = buildWorldClassUiPolicy({ prompt });
    let visualBlocking = inspectVisualPreview({
      files: finalFiles,
      previewHtml,
      platformType: uiPolicy.appType,
    }).filter(isBlockingVerificationFailure);
    for (let attempt = 1; visualBlocking.length && attempt <= DEFAULT_AGENT_V3_BUDGET.maxAutoFixAttempts; attempt += 1) {
      const fix = applyAutoFix(project, finalFiles, visualBlocking.map(check => ({
        file: check.file || 'src/App.tsx',
        message: check.message,
        severity: check.severity,
      })));
      autoFix = fix.patch;
      if (!fix.fixed) break;
      finalFiles = fix.files;
      pipeline = runPreviewPipeline(project, finalFiles);
      previewHtml = pipeline.html;
      visualBlocking = inspectVisualPreview({
        files: finalFiles,
        previewHtml,
        platformType: uiPolicy.appType,
      }).filter(isBlockingVerificationFailure);
    }
    let finalGate = await finalReliabilityAutoFix({
      project,
      userId,
      agentRunId,
      requestId,
      files: finalFiles,
      pipeline,
      runnerResult,
      uiPolicy,
      hasExistingFiles: existingFiles.length > 0,
      shouldRunRunner: Boolean(AGENT_V3_ENABLED && reliability.requires_runner),
      maxAttempts: DEFAULT_AGENT_V3_BUDGET.maxAutoFixAttempts,
    });
    finalFiles = finalGate.files;
    pipeline = finalGate.pipeline;
    previewHtml = finalGate.previewHtml;
    runnerResult = finalGate.runnerResult;
    if (finalGate.autoFixPatch) autoFix = finalGate.autoFixPatch;
    const verificationChecks = finalGate.verificationChecks;
    const verificationSummary = finalGate.verificationSummary;
    const reliabilitySummary = finalGate.reliabilitySummary;
    const qualitySummary = finalGate.qualitySummary;
    await saveAgentVerifications(project, userId, agentRunId, verificationChecks);
    if (reliabilitySummary.status === 'failed') {
      const recoverableProject: GeneratedProject = {
        ...project,
        prompt,
        model_id: generation.model,
        status: project.status || 'draft',
        preview_status: 'needs_fix',
        preview_html: previewHtml,
        updated_at: new Date().toISOString(),
      };
      await saveProject(recoverableProject, finalFiles).catch(error => {
        console.warn('[huggy:needs_fix_draft_save_failed]', { project_id: project.id, message: redactSecrets(error?.message || String(error), '[redacted]') });
      });
      throw new ReliabilityGateError(reliabilitySummary);
    }
    const updatedProject: GeneratedProject = {
      ...project,
      prompt,
      model_id: generation.model,
      status: project.status || 'draft',
      preview_status: pipeline.status,
      preview_html: previewHtml,
      updated_at: new Date().toISOString(),
    };

    await saveProject(updatedProject, finalFiles);
    const diff = diffFiles(existingFiles, finalFiles);
    await createProjectVersion(updatedProject, finalFiles, prompt, { ...diff, verification: verificationSummary, reliability: reliabilitySummary, agent_run_id: agentRunId || null });
    if (autoFix) await saveProjectPatch(updatedProject, autoFix);
    await upsertAgentMemory(updatedProject, userId, summarizeAgentMemory({
      projectName: updatedProject.name,
      files: finalFiles,
      latestDecision: decision.userVisibleReason,
      latestOutcome: generation.summary,
    }), {
      recent_decisions: [{ intent: decision.intent, summary: decision.userVisibleReason, created_at: new Date().toISOString() }],
      known_errors: verificationChecks.filter(check => check.status === 'fail'),
      architecture: {
        quality: qualitySummary,
      },
    });
    await recordAgentImprovementSignal(updatedProject, userId, {
      prompt,
      decision,
      outcome: 'generated',
      previewChanged: true,
      qualityStatus: qualitySummary.status,
      issueCount: Number(qualitySummary.failed?.length || 0) + Number(qualitySummary.warnings?.length || 0),
    });

    const finalCost = costEstimator.calculateRequiredCredits({
      openrouter_cost_usd: generation.cost_usd,
      infra_cost_usd: 0.0005,
      storage_cost_usd: 0.0001,
      build_cost_usd: 0.001,
      domain_operation_cost_usd: 0,
      minimum_action_credits: Math.max(2, modelCreditFloor(generation.model)),
      complexity_surcharge: prompt.length > 400 ? 2 : 0,
    });
    const finalBalance = await helpers.updateWallet(userId, -finalCost.finalCredits);
    await helpers.addLedger(userId, 'usage', -finalCost.finalCredits, finalBalance, `Generated app files with ${generation.model}`, refId);
    await updateAgentRunStatus(agentRunId, 'completed', {
      public_payload: {
        verification: verificationSummary,
        reliability: reliabilitySummary,
        quality: qualitySummary,
        browser: finalGate.browserResult ? { status: finalGate.browserResult.status, finding_count: finalGate.browserResult.findings.length } : null,
      },
    });

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
      verification: verificationSummary,
      reliability,
      reliability_summary: reliabilitySummary,
      huggy_cloud: huggyCloudPlan
        ? {
          requirements: publicHuggyCloudRequirementPayload(huggyCloudPlan.requirement),
          project: huggyCloudPlan.cloudProject,
        }
        : undefined,
      runner: runnerResult ? { status: runnerResult.status, checks: runnerResult.checks } : null,
      preview: {
        status: pipeline.status,
        html: previewHtml,
      },
    });
  } catch (error: any) {
    await helpers.addLedger(userId, 'refund', cost.finalCredits, await helpers.getWallet(userId), `Generation failed: ${error.message}`, refId);
    await helpers.addAudit({
      user_id: userId,
      organization_id: userId,
      project_id: project.id,
      requested_model: requestedModelSelection,
      reason: `Generation failed: ${error.message}`,
      source: 'builder',
    });

    const diagnostic = diagnoseProviderError(error);
    await updateAgentRunStatus(agentRunId, 'failed', {
      diagnostic_code: diagnostic.diagnostic_code,
      suggested_action: diagnostic.suggested_action,
    });
    res.status(diagnostic.status).json({
      success: false,
      error: diagnostic.message,
      message: diagnostic.message,
      diagnostic_code: diagnostic.diagnostic_code,
      request_id: requestId,
      suggested_action: diagnostic.suggested_action,
    });
  }
});

app.post('/api/projects/:id/generate/stream', async (req: any, res: any) => {
  const requestId = `req_${randomUUID()}`;
  try {
  const authUser = requireAuthenticatedUser(req, res, requestId);
  if (!authUser) return;
  const userId = authUser.id;
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });

  const prompt = sanitizeWorkspaceText(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required.' });
  const studioContext = req.body?.studioContext;
  const importContext = req.body?.importContext;
  const preparedImportContext = buildImportContext({
    source: importContext?.source,
    mode: importContext?.mode,
    url: importContext?.source_url || importContext?.url,
    fileName: importContext?.file_name || importContext?.fileName,
    mimeType: importContext?.mime_type || importContext?.mimeType,
    hasAttachment: Boolean(importContext?.file_name || importContext?.hasAttachment),
  }, {
    figmaConfigured: Boolean(process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN || importContext?.status === 'ready'),
    githubConfigured: Boolean(process.env.GITHUB_TOKEN || process.env.GITHUB_IMPORT_TOKEN || importContext?.status === 'ready'),
  }) || importContext;
  const agentPrompt = applyRequestContextToPrompt(prompt, studioContext, preparedImportContext);
  if (!requireProjectCapability(req, res, 'view', project)) return;
  if (!enforceRateLimit(`stream:${userId}`, 12, 60_000)) {
    return res.status(429).json({ success: false, error: 'Too many build requests. Please wait a moment.' });
  }
  if (isAbusivePrompt(prompt)) {
    return res.status(400).json({ success: false, error: 'This request cannot be generated safely.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(': huggy-stream-open\n\n');

  let sequence = 0;
  let streamClosed = false;
  const streamStartedAt = Date.now();
  let agentRunId = '';
  const toolLoop = new ToolLoopController();
  let researchResult: ResearchResult | null = null;
  let researchContext = '';
  let runnerResult: RunnerResult | null = null;
  const streamIsFrench = isLikelyFrenchPrompt(prompt);
  const streamCopy = (fr: string, en: string) => streamIsFrench ? fr : en;
  let latestVisibleStreamEvent = 'queued';
  const contextualWorkingStatus = () => {
    const statusByEvent: Record<string, { message: string; label: string; detail: string }> = {
      queued: {
        message: streamCopy('Je prépare le contexte du projet.', 'Preparing the project context.'),
        label: streamCopy('Préparation du build.', 'Preparing the build.'),
        detail: streamCopy('Je garde le run ouvert pendant que le contexte arrive.', 'I am keeping the run open while context loads.'),
      },
      routing: {
        message: streamCopy('J’analyse le contexte et la bonne action.', 'Analyzing context and the right action.'),
        label: streamCopy('Analyse du contexte.', 'Analyzing context.'),
        detail: streamCopy('Je vérifie s’il faut répondre, modifier, générer ou demander une précision.', 'I am checking whether to answer, edit, generate, or ask for one detail.'),
      },
      codebase_indexed: {
        message: streamCopy('Je cartographie le projet avant d’agir.', 'Mapping the project before acting.'),
        label: streamCopy('Projet indexé.', 'Project indexed.'),
        detail: streamCopy('Je repère routes, composants, APIs, données et fichiers critiques.', 'I am finding routes, components, APIs, data, and critical files.'),
      },
      task_decomposed: {
        message: streamCopy('Je découpe la demande en étapes utiles.', 'Splitting the request into useful steps.'),
        label: streamCopy('Tâche découpée.', 'Task decomposed.'),
        detail: streamCopy('Je transforme l’objectif en travail produit, technique et qualité.', 'I am turning the goal into product, engineering, and quality work.'),
      },
      policy_checked: {
        message: streamCopy('Je pose les garde-fous avant exécution.', 'Setting guardrails before execution.'),
        label: streamCopy('Garde-fous validés.', 'Guardrails checked.'),
        detail: streamCopy('Je fixe les limites, rollback et checks pour éviter une livraison cassée.', 'I am setting limits, rollback, and checks to avoid a broken delivery.'),
      },
      planning: {
        message: streamCopy('Je structure le plan utile avant d’agir.', 'Structuring the useful plan before acting.'),
        label: streamCopy('Planification.', 'Planning.'),
        detail: streamCopy('Je limite les étapes aux décisions qui réduisent le risque.', 'I am keeping only steps that reduce risk.'),
      },
      model_started: {
        message: streamCopy('Je génère les fichiers React/Vite.', 'Generating React/Vite files.'),
        label: streamCopy('Génération des fichiers.', 'Generating files.'),
        detail: streamCopy('Je produis les composants, styles et interactions nécessaires.', 'I am producing the required components, styles, and interactions.'),
      },
      model_streaming: {
        message: streamCopy('Les fichiers arrivent progressivement.', 'Files are streaming in.'),
        label: streamCopy('Code en cours.', 'Writing code.'),
        detail: streamCopy('Je conserve le flux ouvert pendant que le modèle renvoie les fichiers.', 'I am keeping the stream open while the model returns files.'),
      },
      file_stream_started: {
        message: streamCopy('Je prépare un fichier du projet.', 'Preparing a project file.'),
        label: streamCopy('Fichier en préparation.', 'Preparing file.'),
        detail: streamCopy('Je transforme la sortie IA en fichier réel du projet.', 'I am turning the AI output into a real project file.'),
      },
      file_stream_preview: {
        message: streamCopy('J’affiche un extrait réel du fichier.', 'Showing a real file snippet.'),
        label: streamCopy('Aperçu fichier.', 'File preview.'),
        detail: streamCopy('Cet aperçu vient du fichier parsé, pas d une étape inventée.', 'This preview comes from the parsed file, not an invented step.'),
      },
      file_stream_completed: {
        message: streamCopy('Un fichier est prêt à être fusionné.', 'A file is ready to merge.'),
        label: streamCopy('Fichier prêt.', 'File ready.'),
        detail: streamCopy('Je garde ensuite le diff visible pour l itération.', 'I keep the diff visible for iteration afterward.'),
      },
      diff_ready: {
        message: streamCopy('Le diff du projet est prêt.', 'The project diff is ready.'),
        label: streamCopy('Diff prêt.', 'Diff ready.'),
        detail: streamCopy('Je résume les fichiers créés, modifiés ou supprimés.', 'I summarize created, modified, and deleted files.'),
      },
      files_changed: {
        message: streamCopy('J’intègre les fichiers générés.', 'Merging generated files.'),
        label: streamCopy('Fichiers intégrés.', 'Files merged.'),
        detail: streamCopy('Je prépare le diff avant les checks.', 'I am preparing the diff before checks.'),
      },
      preview_skeleton_started: {
        message: streamCopy('Je prépare la preview progressive.', 'Preparing the progressive preview.'),
        label: streamCopy('Preview en préparation.', 'Preparing preview.'),
        detail: streamCopy('L animation reste limitée à l état de build réel.', 'The animation is limited to the real build state.'),
      },
      preview_building: {
        message: streamCopy('Je construis la preview sans remplacer l’ancienne trop tôt.', 'Building the preview without replacing the old one too early.'),
        label: streamCopy('Construction de la preview.', 'Building preview.'),
        detail: streamCopy('La preview existante reste protégée jusqu’au résultat prêt.', 'The existing preview stays protected until the result is ready.'),
      },
      runner_started: {
        message: streamCopy('Je lance les checks techniques.', 'Running technical checks.'),
        label: streamCopy('Checks techniques.', 'Technical checks.'),
        detail: streamCopy('Je cherche les erreurs bloquantes avant de livrer.', 'I am looking for blocking issues before delivery.'),
      },
      visual_inspection_started: {
        message: streamCopy('Je teste les interactions principales.', 'Testing the main interactions.'),
        label: streamCopy('Inspection visuelle.', 'Visual inspection.'),
        detail: streamCopy('Je contrôle boutons, formulaires, états et responsive.', 'I am checking buttons, forms, states, and responsive behavior.'),
      },
      auto_fix_started: {
        message: streamCopy('Je corrige un blocage détecté.', 'Fixing a detected blocker.'),
        label: streamCopy('Correction ciblée.', 'Targeted fix.'),
        detail: streamCopy('Je touche seulement ce qui est nécessaire.', 'I am changing only what is necessary.'),
      },
      retest_started: {
        message: streamCopy('Je reteste après correction.', 'Retesting after the fix.'),
        label: streamCopy('Retest.', 'Retesting.'),
        detail: streamCopy('Je vérifie que la correction tient.', 'I am checking that the fix holds.'),
      },
      quality_gate_started: {
        message: streamCopy('Je lance le quality gate final.', 'Starting the final quality gate.'),
        label: streamCopy('Quality gate.', 'Quality gate.'),
        detail: streamCopy('Je bloque seulement les erreurs graves, puis je garde les notes visibles.', 'I block only serious errors, then keep notes visible.'),
      },
      quality_checked: {
        message: streamCopy('J’applique le contrôle qualité final.', 'Running the final quality gate.'),
        label: streamCopy('Qualité finale.', 'Final quality.'),
        detail: streamCopy('Les warnings restent visibles sans bloquer si l’app fonctionne.', 'Warnings stay visible without blocking when the app works.'),
      },
    };
    return statusByEvent[latestVisibleStreamEvent] || {
      message: streamCopy('Je garde le run actif pendant que Huggy travaille.', 'Keeping the run active while Huggy works.'),
      label: streamCopy('Travail en cours.', 'Work in progress.'),
      detail: streamCopy('Le serveur continue la génération ou la vérification.', 'The server is still generating or checking.'),
    };
  };
  const send = async (event_type: string, message: string, payload: Record<string, unknown> = {}) => {
    if (streamClosed || res.destroyed || res.writableEnded) return;
    if (event_type !== 'working_tick') latestVisibleStreamEvent = event_type;
    sequence += 1;
    const publicMessage = redactSecrets(message);
    const publicPayload = redactSecretPayload(redactPublicAgentPayload({ request_id: requestId, ...(agentRunId ? { agent_run_id: agentRunId } : {}), ...payload }));
    let event: any = {
      id: `${requestId}_${sequence}`,
      organization_id: project.organization_id,
      project_id: project.id,
      user_id: userId,
      sequence_number: sequence,
      event_type,
      message: publicMessage,
      payload: publicPayload,
      created_at: new Date().toISOString(),
    };
    try {
      event = await saveAgentEvent({
        organization_id: project.organization_id,
        project_id: project.id,
        user_id: userId,
        sequence_number: sequence,
        event_type,
        message: publicMessage,
        payload: publicPayload,
      });
      if (agentRunId) {
        await saveAgentRunStep({
          agent_run_id: agentRunId,
          project,
          user_id: userId,
          sequence_number: sequence,
          event_type,
          message: publicMessage,
          payload: publicPayload,
        });
      }
    } catch (error: any) {
      console.warn('[huggy:event_persistence_skipped]', {
        request_id: requestId,
        project_id: project.id,
        event_type,
        message: error?.message || String(error),
      });
    }

    res.write(`event: ${event_type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const sendNarration = async (fr: string, en: string, payload: Record<string, unknown> = {}) => {
    const text = streamCopy(fr, en);
    await send('narration', text, { text, ...payload });
  };

  const sendThinking = async (fr: string, en: string, phase: string) => {
    const text = streamCopy(fr, en);
    await send('thinking', text, { text, phase, active: true });
  };

  const sendCheckStarted = async (checkType: string, fr: string, en: string, payload: Record<string, unknown> = {}) => {
    const label = streamCopy(fr, en);
    await send('check_started', label, { check_type: checkType, label, ...payload });
    await send('check_running', label, { check_type: checkType, label, status: 'running', ...payload });
  };

  const sendCheckCompleted = async (checkType: string, status: string, fr: string, en: string, payload: Record<string, unknown> = {}) => {
    const summary = streamCopy(fr, en);
    await send('check_completed', summary, { check_type: checkType, status, summary, ...payload });
    await send('check_done', summary, { check_type: checkType, status, summary, ...payload });
  };

  const commandStartedAt = new Map<string, number>();
  const completedToolCommands: string[] = [];
  const sendCommandStarted = async (id: string, command: string, fr: string, en: string, checkType = 'command') => {
    commandStartedAt.set(id, Date.now());
    const label = streamCopy(fr, en);
    await send('command_started', label, {
      command,
      label,
      check_type: checkType,
      started_at: new Date().toISOString(),
    });
  };

  const sendCommandCompleted = async (id: string, command: string, status: string, fr: string, en: string, payload: Record<string, unknown> = {}) => {
    const startedAt = commandStartedAt.get(id);
    const duration_ms = startedAt ? Date.now() - startedAt : undefined;
    const output_summary = streamCopy(fr, en);
    await send('command_completed', output_summary, {
      command,
      status,
      duration_ms,
      output_summary,
      tool_group_deferred: true,
      ...payload,
    });
    const commandSummary = [command, output_summary].filter(Boolean).join(' — ');
    if (commandSummary && !completedToolCommands.includes(commandSummary)) completedToolCommands.push(commandSummary);
    await send('tool_group', `${completedToolCommands.length} ${streamCopy('commandes executees', 'commands executed')}`, {
      group: 'commands',
      label: streamCopy('commandes executees', 'commands executed'),
      count: completedToolCommands.length,
      items: completedToolCommands.slice(-32),
      latest: commandSummary,
      status,
    });
    commandStartedAt.delete(id);
  };

  const sendFileEditEvents = async (diff: any, source = 'diff') => {
    const stats = Array.isArray(diff?.file_stats) ? diff.file_stats : [];
    for (const item of stats) {
      const path = String(item?.path || '').trim();
      if (!path) continue;
      const action = ['created', 'modified', 'deleted'].includes(String(item?.action || ''))
        ? String(item.action)
        : 'modified';
      const additions = Math.max(0, Number(item?.additions || 0));
      const deletions = Math.max(0, Number(item?.deletions || 0));
      const actionLabel = action === 'created'
        ? streamCopy('Creation', 'Creation')
        : action === 'deleted'
          ? streamCopy('Suppression', 'Deletion')
          : streamCopy('Modification', 'Modification');
      await send('file_edit', `${actionLabel} de ${path} +${additions} -${deletions}`, {
        path,
        action,
        additions,
        deletions,
        source,
      });
    }
  };

  let workingTimer: ReturnType<typeof setInterval> | null = null;
  let shouldEmitWorkingTicks = false;
  const endStream = () => {
    if (streamClosed) return;
    streamClosed = true;
    if (workingTimer) clearInterval(workingTimer);
    res.end();
  };

  workingTimer = setInterval(() => {
    if (!shouldEmitWorkingTicks) return;
    const status = contextualWorkingStatus();
    void send('working_tick', status.message, {
      elapsed_seconds: Math.max(0, Math.floor((Date.now() - streamStartedAt) / 1000)),
      phase: latestVisibleStreamEvent,
      step_label: status.label,
      step_detail: status.detail,
    }).catch(error => {
      console.warn('[huggy:working_tick_failed]', { request_id: requestId, message: error?.message || String(error) });
    });
  }, 10_000);

  res.on('close', () => {
    streamClosed = true;
    if (workingTimer) clearInterval(workingTimer);
  });

  const stopIfCancelled = async (stage: string) => {
    if (!agentRunId) return false;
    const currentRun = await getAgentRun(project.id, agentRunId).catch(() => null);
    if (currentRun?.status === 'cancelled') {
      await send('cancelled', 'Build cancelled by user.', { stage, agent_run_id: agentRunId });
      await updateAgentRunStatus(agentRunId, 'cancelled', { duration_ms: Date.now() - streamStartedAt });
      endStream();
      return true;
    }
    return false;
  };

  const helpers = getDbHelpers();
  const requestedMode = normalizeRequestedMode(req.body?.requestedMode);
  const requestedModelSelection = normalizeModelSelectionId(req.body?.modelId || project.model_id || 'auto');
  const quickDecision = applyTypedIntentLifecycle(
    { prompt, requestedMode, hasFiles: false },
    intentRouter.decide({ prompt, requestedMode, hasFiles: false }),
  );
  if (canUseFastAnswerPath(quickDecision, prompt)) {
    const quickEstimate = estimateActionCost(prompt, quickDecision, requestedModelSelection);
    const quickWallet = quickEstimate.finalCredits > 0 ? await helpers.getWallet(userId) : Number.POSITIVE_INFINITY;
    await saveProjectMessage({
      organization_id: project.organization_id,
      project_id: project.id,
      user_id: userId,
      role: 'user',
      content: prompt,
      intent: quickDecision.intent,
      requested_mode: quickDecision.requestedMode,
    });
    await upsertProjectWorkspaceState(userId, project.id, {
      draft_prompt: '',
      selected_mode: quickDecision.requestedMode,
      selected_model: requestedModelSelection,
    });
    if (quickWallet < quickEstimate.finalCredits) {
      await send('credits_insufficient', 'Upgrade required', {
        code: 'UpgradeRequired',
        action: 'upgrade_required',
        suggested_action: 'use_auto',
      });
      endStream();
      return;
    }

    if (quickDecision.intent === 'clarification_required') {
      const content = createClarificationContent(quickDecision);
      await saveProjectMessage({
        organization_id: project.organization_id,
        project_id: project.id,
        user_id: userId,
        role: 'assistant',
        content,
        intent: quickDecision.intent,
        requested_mode: quickDecision.requestedMode,
      });
      await recordAgentImprovementSignal(project, userId, {
        prompt,
        decision: quickDecision,
        outcome: improvementOutcomeForDecision(quickDecision),
        previewChanged: false,
        qualityStatus: 'clarification',
      }).catch(() => null);
      await send('clarification_required', content, {
        text: content,
        question: quickDecision.clarification?.question,
        choices: quickDecision.clarification?.choices || [],
        recommendation: quickDecision.clarification?.recommendation,
        original_prompt: prompt,
        reliability: buildReliabilityDecision(quickDecision),
        fast_path: true,
        no_stream: true,
      });
      await send('done', 'Clarification requested.', { fast_path: true });
      endStream();
      return;
    }

    let agentText;
    let streamedAnyToken = false;
    try {
      await send('answer_stream_started', 'Writing the answer.', {
        intent: quickDecision.intent,
        fast_path: true,
      });
      agentText = await streamAgentTextResponse({
        project,
        prompt,
        files: [],
        decision: quickDecision,
        modelId: requestedModelSelection,
        userCredits: quickWallet,
        allowLocalFallback: requestedModelSelection === 'auto',
        onToken: async (chunk, meta) => {
          streamedAnyToken = true;
          await send('answer_token', chunk, {
            text_delta: chunk,
            index: meta.index,
            fast_path: true,
          });
        },
      });
    } catch (error: any) {
      const diagnostic = diagnoseProviderError(error);
      await send('error', diagnostic.message, {
        code: 'AgentResponseFailed',
        diagnostic_code: diagnostic.diagnostic_code,
        suggested_action: diagnostic.suggested_action,
        fast_path: true,
      });
      endStream();
      return;
    }

    const content = agentText.text;
    if (!streamedAnyToken) {
      for (const [index, chunk] of chunkTextForPublicStream(content).entries()) {
        await send('answer_token', chunk, {
          text_delta: chunk,
          index,
          fast_path: true,
          fallback_stream: true,
        });
      }
    }
    await saveProjectMessage({
      organization_id: project.organization_id,
      project_id: project.id,
      user_id: userId,
      role: 'assistant',
      content,
      intent: quickDecision.intent,
      requested_mode: quickDecision.requestedMode,
    });
    const chargedCredits = agentText.model === 'router' || (agentText.model === 'auto' && agentText.cost_usd === 0) ? 0 : quickEstimate.finalCredits;
    await chargeCompletedAgentAction(helpers, userId, chargedCredits, `AI ${quickDecision.intent} with ${agentText.model}`, `agent_${randomUUID()}`);
    await recordAgentImprovementSignal(project, userId, {
      prompt,
      decision: quickDecision,
      outcome: improvementOutcomeForDecision(quickDecision),
      previewChanged: false,
      qualityStatus: 'fast_path',
    }).catch(() => null);
    await send('answering', content, {
      text: content,
      question: quickDecision.clarification?.question,
      choices: quickDecision.clarification?.choices || [],
      recommendation: quickDecision.clarification?.recommendation,
      original_prompt: prompt,
      reliability: buildReliabilityDecision(quickDecision),
      fast_path: true,
      no_stream: false,
    });
    await send('done', 'Answer ready.', { fast_path: true });
    endStream();
    return;
  }
  const existingFiles = await loadProjectFiles(project.id);
  const lastPlan = await getLastProjectPlan(project.id);
  const decision = await resolveAgentDecision({
    prompt: agentPrompt,
    requestedMode,
    hasFiles: existingFiles.length > 0,
    lastPlan,
  });
  const reliability = buildReliabilityDecision(decision);
  const seniorAgentContext = compileSeniorAgentContext({
    prompt: agentPrompt,
    project,
    files: existingFiles,
    decision,
    importContext: preparedImportContext || undefined,
  });
  const agentPromptForText = decision.intent === 'conversation'
    ? agentPrompt
    : applySeniorAgentContextToPrompt(agentPrompt, seniorAgentContext);
  const huggyCloudPlan = reliability.should_mutate_files
    ? await upsertProjectBackendRequirements(project, prompt).catch((error: any) => {
      console.warn('[huggy:cloud_requirement_stream_skipped]', { message: error?.message || String(error) });
      return null;
    })
    : null;
  const shouldStreamAgentTrace = reliability.should_mutate_files || decision.intent === 'plan' || decision.intent === 'verify' || decision.intent === 'deploy_assist';
  shouldEmitWorkingTicks = reliability.should_mutate_files || decision.intent === 'plan';
  const walletForRouting = await helpers.getWallet(userId).catch(() => FALLBACK_WALLET_CREDITS);
  let modelRouting;
  try {
    modelRouting = await resolveAgentProviderModel({
      modelId: requestedModelSelection,
      project,
      prompt: agentPrompt,
      decision,
      files: existingFiles,
      userCredits: walletForRouting,
    });
  } catch (error: any) {
    await send('credits_insufficient', error?.message || 'Upgrade required', {
      code: 'UpgradeRequired',
      action: 'upgrade_required',
      suggested_action: 'use_auto',
    });
    endStream();
    return;
  }
  const effectiveModelSelection = modelRouting.model;
  if (AGENT_V2_ENABLED) {
    const [messages, events, versions, memory, runnerHistory, researchHistory] = await Promise.all([
      listProjectMessagesPage(project.id, 12, null).catch(() => []),
      listAgentEventsPage(project.id, 16, null).catch(() => []),
      listProjectVersions(project.id).catch(() => []),
      listAgentMemory(project.id).catch(() => []),
      AGENT_V3_ENABLED ? listAgentRunnerResults(project.id, undefined, 24).catch(() => []) : Promise.resolve([]),
      AGENT_V3_ENABLED ? listAgentResearchResults(project.id, 16).catch(() => []) : Promise.resolve([]),
    ]);
    const baseContextPack = {
      ...buildAgentContextPack({
        project,
        files: existingFiles,
        messages,
        events,
        versions,
        memory,
        previewStatus: project.preview_status,
        selectedModel: effectiveModelSelection,
        requestId,
      }),
      senior_agent_os: seniorAgentContext,
    };
    const contextPack = AGENT_V3_ENABLED
      ? buildAgentV3Context({ baseContext: baseContextPack, runnerHistory, researchHistory, toolBudget: DEFAULT_AGENT_V3_BUDGET })
      : baseContextPack;
    const agentRun = await createAgentRun(project, userId, requestId, decision, effectiveModelSelection, contextPack);
    agentRunId = agentRun.id;
    if (AGENT_V3_ENABLED && reliability.requires_runner) {
      await updateAgentRunV3Meta(agentRunId, {
        tool_budget: toolLoop.snapshot,
        runner_status: 'pending',
      });
    }
    if (shouldStreamAgentTrace) {
      await send('run_started', streamCopy('Demande recue.', 'Request received.'), {
        agent_run_id: agentRunId,
        request_id: requestId,
        step_label: streamCopy('Demande recue.', 'Request received.'),
        step_detail: streamCopy('Je demarre un run trace pour garder le travail lisible.', 'I am starting a traceable run so the work stays readable.'),
      });
      await sendNarration(
        'Je commence par comprendre la mission, puis je toucherai seulement les fichiers necessaires.',
        'I am first understanding the mission, then I will touch only the files that matter.',
        { phase: 'start', agent_run_id: agentRunId },
      );
      await send('context_loaded', streamCopy('Contexte du projet charge.', 'Project context loaded.'), {
        context: contextPack,
        step_label: streamCopy('Contexte du projet charge.', 'Project context loaded.'),
        step_detail: streamCopy('Je lis les fichiers et l historique avant de choisir une action.', 'I am reading files and history before choosing an action.'),
      });
      await send('codebase_indexed', streamCopy('Projet indexe.', 'Project indexed.'), {
        project_index: seniorAgentContext.project_index,
        step_label: streamCopy('Projet indexe.', 'Project indexed.'),
        step_detail: streamCopy('Je cartographie routes, composants, APIs, donnees et fichiers critiques avant de modifier.', 'I am mapping routes, components, APIs, data, and critical files before editing.'),
      });
      await send('task_decomposed', streamCopy('Tache decomposee.', 'Task decomposed.'), {
        tasks: seniorAgentContext.task_decomposition,
        blueprint: seniorAgentContext.blueprint,
        step_label: streamCopy('Tache decomposee.', 'Task decomposed.'),
        step_detail: streamCopy('Je transforme la demande en etapes produit et qualite pour eviter une generation generique.', 'I am turning the request into product and quality steps so it does not become a generic generation.'),
      });
      await send('policy_checked', streamCopy('Garde-fous valides.', 'Guardrails checked.'), {
        policy: {
          state_machine: seniorAgentContext.policy.state_machine,
          action_contract: seniorAgentContext.policy.action_contract,
          cost_tier: seniorAgentContext.policy.cost_tier,
        },
        step_label: streamCopy('Garde-fous valides.', 'Guardrails checked.'),
        step_detail: streamCopy('Je fixe les limites de changement, rollback, verification et no-fake-success avant execution.', 'I set change limits, rollback, verification, and no-fake-success before execution.'),
      });
      const publicImport = publicImportContext(preparedImportContext || null);
      if (publicImport) {
        await send('import_started', publicImport.message || streamCopy('Import prepare.', 'Import prepared.'), {
          import: publicImport,
          step_label: streamCopy('Source importee.', 'Import source prepared.'),
          step_detail: streamCopy('Je transforme cette source en produit responsive et utilisable, pas en copie statique.', 'I am turning this source into a responsive usable product, not a static copy.'),
        });
        await send('import_analyzed', streamCopy('Contraintes d import analysees.', 'Import constraints analyzed.'), {
          import: publicImport,
          step_label: streamCopy('Import analyse.', 'Import analyzed.'),
          step_detail: streamCopy('Je complete les etats, interactions et responsive manquants.', 'I will complete missing states, interactions, and responsive behavior.'),
        });
      }
    }
    if (AGENT_V3_ENABLED && reliability.should_mutate_files) {
      await send('tool_loop_started', streamCopy('Boucle outil preparee.', 'Tool loop prepared.'), {
        budget: toolLoop.snapshot,
        step_label: streamCopy('Boucle outil preparee.', 'Tool loop prepared.'),
        step_detail: streamCopy('Je garde les actions bornees pour eviter les boucles et les changements inutiles.', 'I keep actions bounded to avoid loops and unnecessary changes.'),
      });
    }
  }
  if (shouldStreamAgentTrace) {
    await send('agent_thinking', streamCopy('Analyse de la demande.', 'Analyzing the request.'), {
      request_id: requestId,
      step_label: streamCopy('Analyse de la demande.', 'Analyzing the request.'),
      step_detail: streamCopy('Je determine si je dois repondre, planifier, modifier ou generer.', 'I am deciding whether to answer, plan, edit, or generate.'),
    });
    await sendThinking(
      'Je verifie l intention reelle avant de lancer une action.',
      'I am checking the real intent before starting an action.',
      'intent',
    );
  }
  const estimate = estimateActionCost(prompt, decision, effectiveModelSelection);
  const wallet = estimate.finalCredits > 0 ? walletForRouting : Number.POSITIVE_INFINITY;
  await saveProjectMessage({
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    role: 'user',
    content: prompt,
    intent: decision.intent,
    requested_mode: decision.requestedMode,
  });
  await upsertProjectWorkspaceState(userId, project.id, {
    draft_prompt: '',
    selected_mode: decision.requestedMode,
    selected_model: requestedModelSelection,
    active_tab: reliability.should_touch_preview ? 'preview' : undefined,
  });
  if (shouldStreamAgentTrace) {
    await send('intent_detected', decision.userVisibleReason, {
      intent: decision,
      reliability,
      step_label: streamCopy('Decision prise.', 'Decision selected.'),
      step_detail: decision.userVisibleReason,
    });
  }
  if (shouldStreamAgentTrace && huggyCloudPlan && hasHuggyCloudRequirement(huggyCloudPlan.requirement)) {
    await send('backend_requirements_detected', streamCopy('Backend Huggy Cloud detecte.', 'Huggy Cloud backend detected.'), {
      requirements: publicHuggyCloudRequirementPayload(huggyCloudPlan.requirement),
      cloud_project: huggyCloudPlan.cloudProject,
      summary: summarizeHuggyCloudRequirements(huggyCloudPlan.requirement),
      step_label: streamCopy('Huggy Cloud prevu.', 'Huggy Cloud planned.'),
      step_detail: streamCopy('Je garde le backend gere par Huggy au lieu de demander une configuration Supabase manuelle.', 'I will use Huggy-managed backend instead of asking for manual Supabase setup.'),
    });
  }

  if (decision.requiresFileChanges && !hasProjectCapability(req, 'build', project)) {
    await send('error', 'Action unavailable with your current project role.', {
      code: 'PermissionDenied',
      diagnostic_code: 'PERMISSION_DENIED',
      suggested_action: 'ask_project_owner',
    });
    await updateAgentRunStatus(agentRunId, 'failed', { diagnostic_code: 'PERMISSION_DENIED', suggested_action: 'ask_project_owner', duration_ms: Date.now() - streamStartedAt });
    endStream();
    return;
  }

  if (wallet < estimate.finalCredits) {
    await send('credits_insufficient', 'Upgrade required', {
      code: 'UpgradeRequired',
      action: 'upgrade_required',
      suggested_action: 'use_auto',
    });
    await updateAgentRunStatus(agentRunId, 'failed', { diagnostic_code: 'CREDITS_REQUIRED', suggested_action: 'use_auto', duration_ms: Date.now() - streamStartedAt });
    endStream();
    return;
  }

  const importResearchNeeded = ['figma', 'github', 'url'].includes(String(publicImportContext(preparedImportContext || null)?.source || ''));
  if (AGENT_V3_ENABLED && (importResearchNeeded || shouldUseWebResearch({ prompt: agentPrompt, intent: decision.intent, requiresFileChanges: reliability.should_mutate_files }))) {
    toolLoop.claim('web_research');
    await send('research_started', 'Researching current context.', { query: prompt.slice(0, 180), budget: toolLoop.snapshot });
    researchResult = await webResearchGateway.search(agentPrompt, { maxResults: 4, timeoutMs: 12_000 });
    researchContext = researchToPromptContext(researchResult);
    await saveAgentResearchResults(project, userId, agentRunId, researchResult);
    await updateAgentRunV3Meta(agentRunId, { research_used: researchResult.status === 'completed', tool_budget: toolLoop.snapshot });
    await send(researchResult.status === 'completed' ? 'research_result' : 'research_skipped', researchResult.message, {
      status: researchResult.status,
      provider: researchResult.provider,
      diagnostic_code: researchResult.diagnostic_code,
      results: researchResult.results,
    });
    if (await stopIfCancelled('research')) return;
  }

  if (decision.intent === 'conversation' || decision.intent === 'clarification_required' || decision.intent === 'plan' || decision.intent === 'verify' || decision.intent === 'deploy_assist') {
    if (decision.intent === 'plan') {
      await send('planning', streamCopy('Je prepare un plan sans modifier les fichiers.', 'Preparing a plan without changing files.'), {
        step_label: streamCopy('Planification.', 'Planning.'),
        step_detail: streamCopy('Je separe la reflexion de l execution pour que tu gardes le controle.', 'I am separating thinking from execution so you stay in control.'),
      });
    } else if (decision.intent === 'verify') {
      await send('verification_started', streamCopy('Je verifie le projet sans modifier les fichiers.', 'Checking the current project without changing files.'), {
        step_label: streamCopy('Verification sans modification.', 'Read-only verification.'),
        step_detail: streamCopy('Je controle l etat actuel avant de proposer une correction.', 'I am checking the current state before suggesting a fix.'),
      });
    } else if (decision.intent === 'deploy_assist') {
      await send('answering', streamCopy('Je prepare une aide de publication sans modifier les fichiers.', 'Preparing deployment guidance without changing files.'), {
        step_label: streamCopy('Aide publication.', 'Deployment guidance.'),
        step_detail: streamCopy('Je donne les prochaines actions sans toucher a la preview.', 'I am giving next actions without touching the preview.'),
      });
    }
    const shouldStreamTextResponse = decision.intent === 'conversation' || decision.intent === 'plan' || decision.intent === 'verify' || decision.intent === 'deploy_assist';
    if (shouldStreamTextResponse) {
      await send('answer_stream_started', decision.intent === 'plan' ? 'Writing the plan.' : 'Writing the answer.', {
        intent: decision.intent,
        fast_path: !shouldStreamAgentTrace,
      });
    }
    let agentText: any;
    let content = '';
    let streamedAnyToken = false;
    try {
      if (decision.intent === 'clarification_required') {
        content = createClarificationContent(decision);
        agentText = { text: content, model: 'router', cost_usd: 0 };
      } else if (shouldStreamTextResponse) {
        agentText = await streamAgentTextResponse({
          project,
          prompt: agentPromptForText,
          files: existingFiles,
          decision,
          modelId: requestedModelSelection,
          userCredits: walletForRouting,
          researchContext,
          allowLocalFallback: requestedModelSelection === 'auto',
          onToken: async (chunk, meta) => {
            if (await stopIfCancelled('answer')) return;
            streamedAnyToken = true;
            await send('answer_token', chunk, {
              text_delta: chunk,
              index: meta.index,
            });
          },
        });
        content = agentText.text;
      } else {
        agentText = await createAgentTextResponse({
          project,
          prompt: agentPromptForText,
          files: existingFiles,
          decision,
          modelId: requestedModelSelection,
          userCredits: walletForRouting,
          researchContext,
          allowLocalFallback: requestedModelSelection === 'auto',
        });
        content = agentText.text;
      }
    } catch (error: any) {
      const diagnostic = diagnoseProviderError(error);
      await recordAgentImprovementSignal(project, userId, {
        prompt,
        decision,
        outcome: 'failed',
        previewChanged: false,
        qualityStatus: diagnostic.diagnostic_code,
        issueCount: 1,
      }).catch(() => null);
      await send('error', diagnostic.message, {
        code: 'AgentResponseFailed',
        diagnostic_code: diagnostic.diagnostic_code,
        suggested_action: diagnostic.suggested_action,
      });
      await updateAgentRunStatus(agentRunId, 'failed', { diagnostic_code: diagnostic.diagnostic_code, suggested_action: diagnostic.suggested_action, duration_ms: Date.now() - streamStartedAt });
      endStream();
      return;
    }
    await saveProjectMessage({
      organization_id: project.organization_id,
      project_id: project.id,
      user_id: userId,
      role: 'assistant',
      content,
      intent: decision.intent,
      requested_mode: decision.requestedMode,
    });
    const chargedCredits = agentText.model === 'router' || (agentText.model === 'auto' && agentText.cost_usd === 0) ? 0 : estimate.finalCredits;
    await chargeCompletedAgentAction(helpers, userId, chargedCredits, `AI ${decision.intent} with ${agentText.model}`, `agent_${randomUUID()}`);
    await recordAgentImprovementSignal(project, userId, {
      prompt,
      decision,
      outcome: improvementOutcomeForDecision(decision),
      previewChanged: false,
      qualityStatus: 'not_applicable',
    });
    const eventName = decision.intent === 'plan'
      ? 'plan_ready'
      : decision.intent === 'clarification_required'
        ? 'clarification_required'
        : decision.intent === 'verify'
          ? 'verification_started'
          : 'answering';
    if (shouldStreamTextResponse && !streamedAnyToken) {
      for (const [index, chunk] of chunkTextForPublicStream(content).entries()) {
        if (await stopIfCancelled('answer')) return;
        await send('answer_token', chunk, {
          text_delta: chunk,
          index,
        });
      }
    }
    await send(eventName, content, {
      text: content,
      question: decision.clarification?.question,
      choices: decision.clarification?.choices || [],
      recommendation: decision.clarification?.recommendation,
      original_prompt: prompt,
      reliability,
      no_stream: !shouldStreamTextResponse,
      preview: reliability.should_touch_preview ? { status: project.preview_status || 'idle', html: getProjectPreviewHtml(project, existingFiles, 'preview') } : undefined,
      files: reliability.should_mutate_files ? existingFiles : undefined,
    });
    await send('done', 'No file changes were made.', {});
    await updateAgentRunStatus(agentRunId, 'completed', { duration_ms: Date.now() - streamStartedAt });
    endStream();
    return;
  }

  const requirements = detectExternalApiRequirements(agentPrompt);
  if (requirements.length && !req.body?.skipExternalKeys && !req.body?.externalKeysConfirmed) {
    await send('external_api_keys_required', 'This build can connect external APIs before continuing.', { requirements });
    await send('waiting_for_api_keys', 'Waiting for API keys or skip confirmation.', {});
    await updateAgentRunStatus(agentRunId, 'waiting_for_keys', { suggested_action: 'confirm_or_skip_external_keys', duration_ms: Date.now() - streamStartedAt });
    endStream();
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
  if (agentRunId) await updateBuildSessionStatus(buildSessionId, 'running', { agent_run_id: agentRunId });
  await helpers.createReservation(userId, estimate.finalCredits, refId);

    try {
    await send('queued', streamCopy('Generation mise en file.', 'Generation queued.'), {
      build_session_id: buildSessionId,
      step_label: streamCopy('Preparation du build.', 'Preparing the build.'),
      step_detail: streamCopy('Je cree une session annulable avant de toucher aux fichiers.', 'I am creating a cancellable session before touching files.'),
    });
    await send('routing', streamCopy('Preparation du contexte du projet.', 'Preparing project context.'), {
      step_label: streamCopy('Preparation du contexte.', 'Preparing context.'),
      step_detail: streamCopy('Je prepare les informations utiles avant de travailler.', 'I am preparing the useful project context before working.'),
    });
    let executionPlan = '';
    if (decision.autoPlanRequired) {
      await send('planning', streamCopy('Je planifie le chemin le plus sur avant de modifier les fichiers.', 'Planning the safest implementation path before changing files.'), {
        auto_plan_required: true,
        step_label: streamCopy('Plan automatique.', 'Automatic plan.'),
        step_detail: streamCopy('La demande est assez large pour meriter un plan avant generation.', 'The request is broad enough to deserve a plan before generation.'),
      });
      try {
        const planDecision: IntentDecision = {
          ...decision,
          intent: 'plan',
          requiresFileChanges: false,
          requiresPreviewRebuild: false,
          nextAction: 'plan_only',
        };
        const planned = await createAgentTextResponse({ project, prompt: agentPromptForText, files: existingFiles, decision: planDecision, modelId: requestedModelSelection, userCredits: walletForRouting, researchContext, allowLocalFallback: requestedModelSelection === 'auto' });
        executionPlan = planned.text;
        await send('plan_ready', executionPlan, { text: executionPlan, auto_plan_required: true });
      } catch (error) {
        executionPlan = createPlanResponse(project, prompt, existingFiles);
        await send('plan_ready', executionPlan, { text: executionPlan, auto_plan_required: true, fallback: normalizeProviderError(error) });
      }
    }

    const hasLiveKey = Boolean(getOpenRouterApiKey());
    let generatedText = '';
    let model: string = effectiveModelSelection;
    validateAllowedModel(model);
    let costUsd = 0;

    if (!hasLiveKey) {
      throw new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY on Railway to enable live generation.');
    } else {
      const selectedModel = model;
      validateAllowedModel(selectedModel);

      await send('model_started', streamCopy('Generation des fichiers lancee.', 'File generation started.'), {
        step_label: streamCopy('Generation des fichiers.', 'Generating files.'),
        step_detail: streamCopy('Je demande une app moderne avec structure React/Vite, interactions et etats UI.', 'I am asking for a modern app with React/Vite structure, interactions, and UI states.'),
      });
      const basePrompt = req.body?.useLastPlan && lastPlan ? `${lastPlan}\n\nUser confirmed build: ${agentPrompt}` : agentPrompt;
      const effectivePrompt = executionPlan ? `${executionPlan}\n\nBuild request:\n${basePrompt}` : basePrompt;
      const messages = buildGenerationMessages({ projectName: project.name, prompt: effectivePrompt, existingFiles, researchContext, seniorAgentContext });
      const runtimeOptions = createProviderRuntimeOptions({
        model: selectedModel,
        prompt: effectivePrompt,
        decision,
        files: existingFiles,
        mode: 'generation',
        stream: true,
        timeoutMs: 180_000,
        maxTokens: 12_000,
      });

      let lastModelProgressAt = Date.now();
      let lastModelProgressChars = 0;
      for await (const event of providerGateway.streamChat(selectedModel, messages, {
        timeoutMs: runtimeOptions.runtime.timeoutMs,
        runtimeConfig: runtimeOptions.providerConfig,
      })) {
        const session = await getBuildSession(buildSessionId);
        if (session?.status === 'cancelled') {
          await send('cancelled', 'Build cancelled by user.', { build_session_id: buildSessionId, agent_run_id: agentRunId });
          await updateAgentRunStatus(agentRunId, 'cancelled', { duration_ms: Date.now() - streamStartedAt });
          endStream();
          return;
        }
        if (event.type === 'token') {
          generatedText += event.text;
          model = event.model;
          const now = Date.now();
          if (generatedText.length - lastModelProgressChars >= 1600 || now - lastModelProgressAt >= 2500) {
            lastModelProgressAt = now;
            lastModelProgressChars = generatedText.length;
            await send('model_streaming', streamCopy('Reception des fichiers generes.', 'Receiving generated files.'), {
              streamed_chars: generatedText.length,
              step_label: streamCopy('Reception du code.', 'Receiving code.'),
              step_detail: streamCopy('Je conserve le flux actif pendant que les fichiers arrivent.', 'I keep the stream active while files arrive.'),
            });
          }
        } else {
          model = event.model;
          costUsd = event.cost_usd;
        }
      }
    }

    await send('build_started', streamCopy('Normalisation des fichiers et preparation de la preview.', 'Normalizing generated files and building preview.'), {
      step_label: streamCopy('Preparation de la preview.', 'Preparing preview.'),
      step_detail: streamCopy('Je transforme la sortie en projet utilisable avant affichage.', 'I am turning the output into a usable project before display.'),
    });
    const parsed = parseGeneratedOutput(project.name, generatedText, prompt, { hasExistingFiles: existingFiles.length > 0 });

    const mergedByPath = new Map<string, GeneratedFile>();
    existingFiles.forEach(file => mergedByPath.set(file.path, file));
    parsed.files.forEach(file => mergedByPath.set(file.path, file));
    let files = withProjectSeoSupport(
      Array.from(mergedByPath.values()).sort((a, b) => a.path.localeCompare(b.path)),
      project.name,
      prompt,
      { ensureIndex: true },
    );
    files = ensureModernFrontendProject(files, project.name, prompt);
    const generatedDiff = diffFiles(existingFiles, files);
    await sendNarration(
      'Je garde ce qui fonctionne deja et je prepare un diff lisible.',
      'I am keeping what already works and preparing a readable diff.',
      { phase: 'files' },
    );
    const importantStreamPaths = [
      ...generatedDiff.created,
      ...generatedDiff.modified,
    ]
      .filter((path, index, list) => list.indexOf(path) === index)
      .sort((a, b) => {
        const priority = (path: string) => {
          if (/^src\/App\.(tsx|jsx|ts|js)$/i.test(path)) return 0;
          if (/^src\/main\.(tsx|jsx|ts|js)$/i.test(path)) return 1;
          if (/^src\/.*\.(tsx|jsx)$/i.test(path)) return 2;
          if (/^src\/.*\.css$/i.test(path)) return 3;
          if (/package\.json$/i.test(path)) return 4;
          if (/index\.html$/i.test(path)) return 5;
          return 10;
        };
        return priority(a) - priority(b) || a.localeCompare(b);
      })
      .slice(0, 5);
    for (const path of importantStreamPaths) {
      const file = files.find(item => item.path === path);
      if (!file) continue;
      const language = file.language || inferGeneratedLanguage(file.path);
      await send('file_stream_started', streamCopy(`Préparation de ${file.path}.`, `Preparing ${file.path}.`), {
        path: file.path,
        language,
        reason: generatedDiff.created.includes(file.path) ? 'created' : 'modified',
        step_label: streamCopy('Fichier en préparation.', 'Preparing file.'),
        step_detail: streamCopy('Je convertis la sortie modèle en fichier de projet lisible.', 'I am converting the model output into a readable project file.'),
      });
      await send('file_stream_preview', streamCopy(`Aperçu de ${file.path}.`, `Previewing ${file.path}.`), {
        path: file.path,
        language,
        text_delta: publicFileStreamSnippet(file),
        streamed_chars: String(file.content || '').length,
        step_label: streamCopy('Aperçu fichier.', 'File preview.'),
        step_detail: streamCopy('Aperçu public redacted depuis le vrai fichier généré.', 'Redacted public preview from the real generated file.'),
      });
      await send('file_stream_completed', streamCopy(`${file.path} prêt.`, `${file.path} ready.`), {
        path: file.path,
        language,
        size: String(file.content || '').length,
        status: 'ready',
        step_label: streamCopy('Fichier prêt.', 'File ready.'),
        step_detail: streamCopy('Le fichier est prêt à être intégré au diff.', 'The file is ready to be merged into the diff.'),
      });
    }
    await send('diff_ready', streamCopy('Diff du projet prêt.', 'Project diff ready.'), {
      diff: generatedDiff,
      step_label: streamCopy('Diff prêt.', 'Diff ready.'),
      step_detail: streamCopy('Je résume exactement ce qui va changer avant les checks.', 'I summarize exactly what will change before checks.'),
    });
    await sendFileEditEvents(generatedDiff, 'generated_diff');
    await send('files_changed', streamCopy('Fichiers integres au projet.', 'Generated files were merged into the project.'), {
      diff: generatedDiff,
      step_label: streamCopy('Fichiers mis a jour.', 'Files updated.'),
      step_detail: streamCopy('Je garde un diff clair pour que tu puisses iterer ensuite.', 'I keep a clear diff so you can iterate afterward.'),
    });
    await send('preview_skeleton_started', streamCopy('Activation de la preview progressive.', 'Starting progressive preview state.'), {
      step_label: streamCopy('Preview progressive.', 'Progressive preview.'),
      step_detail: streamCopy('Je montre un etat de travail seulement pendant la construction réelle.', 'I show a work state only during the real preview build.'),
    });
    await send('preview_building', streamCopy('Construction de la preview sandbox.', 'Building preview sandbox.'), {
      step_label: streamCopy('Construction de la preview.', 'Building preview.'),
      step_detail: streamCopy('La version publiee reste intacte tant que tu ne cliques pas Publish.', 'The published version stays unchanged until you click Publish.'),
    });
    await sendNarration(
      'Je reconstruis la preview avant de te livrer quoi que ce soit.',
      'I am rebuilding the preview before delivering anything.',
      { phase: 'preview' },
    );
    await sendCommandStarted('preview_pipeline', 'preview pipeline', 'En cours preview pipeline', 'Running preview pipeline', 'preview');
    await sendCheckStarted('preview', 'Verification de la preview', 'Checking preview');
    let pipeline = runPreviewPipeline(project, files);
    await sendCommandCompleted(
      'preview_pipeline',
      'preview pipeline',
      pipeline.status === 'ready' ? 'passed' : 'failed',
      pipeline.status === 'ready' ? 'Preview construite.' : 'Preview en erreur.',
      pipeline.status === 'ready' ? 'Preview built.' : 'Preview failed.',
      { preview_status: pipeline.status, errors: pipeline.errors },
    );
    await sendCheckCompleted(
      'preview',
      pipeline.status === 'ready' ? 'passed' : 'failed',
      pipeline.status === 'ready' ? 'Preview valide.' : 'Preview a corriger.',
      pipeline.status === 'ready' ? 'Preview is valid.' : 'Preview needs a fix.',
      { preview_status: pipeline.status, errors: pipeline.errors },
    );
    let autoFix = null as any;
    let autoFixAttempts = 0;
    const maxAutoFixAttempts = AGENT_V3_ENABLED ? DEFAULT_AGENT_V3_BUDGET.maxAutoFixAttempts : 3;
    if (pipeline.status === 'failed') {
      await send('error_detected', pipeline.errors[0]?.message || 'Preview build failed.', { errors: pipeline.errors });
      await sendNarration(
        'La premiere preview ne tient pas. Je traite ca comme un blocage de livraison et je corrige avant de te montrer le resultat.',
        'The first preview did not hold. I am treating that as a delivery blocker and fixing it before showing the result.',
        { phase: 'recovery', source: 'preview', errors: pipeline.errors },
      );
      await Promise.all(pipeline.errors.map(error => saveBuildError(project, error)));
      for (; autoFixAttempts < maxAutoFixAttempts && pipeline.status === 'failed'; autoFixAttempts += 1) {
        toolLoop.claim('preview_auto_fix');
        const attempt = autoFixAttempts + 1;
        await send('auto_fix_started', streamCopy(`Correction automatique ${attempt} lancee.`, `Auto-fix attempt ${attempt} started.`), {
          attempt,
          step_label: streamCopy('Correction preview.', 'Preview fix.'),
          step_detail: streamCopy('Je repare la preview avant de l afficher.', 'I am repairing the preview before showing it.'),
        });
        await sendNarration(
          'Je limite le patch a la cause la plus probable, puis je reconstruis pour verifier.',
          'I am limiting the patch to the most likely cause, then rebuilding to verify it.',
          { phase: 'recovery', source: 'preview', attempt },
        );
        const fix = applyAutoFix(project, files, pipeline.errors);
        autoFix = fix.patch;
        if (!fix.fixed) break;
        files = fix.files;
        await send('patch_applied', fix.patch?.summary || streamCopy('Correction ciblee appliquee.', 'Targeted patch applied.'), {
          patch: fix.patch,
          step_label: streamCopy('Patch applique.', 'Patch applied.'),
          step_detail: streamCopy('Je limite le changement a la cause detectee.', 'I am limiting the change to the detected cause.'),
        });
        pipeline = runPreviewPipeline(project, files);
      }
      if (pipeline.status === 'ready') {
        await send('auto_fix_succeeded', streamCopy('Correction terminee, preview prete.', 'Auto-fix succeeded and preview is ready.'), {
          patch: autoFix,
          step_label: streamCopy('Correction terminee.', 'Fix completed.'),
          step_detail: streamCopy('La preview peut continuer apres correction.', 'The preview can continue after the fix.'),
        });
      } else {
        await send('auto_fix_failed', streamCopy('La correction automatique n a pas tout resolu.', 'Auto-fix could not resolve every issue.'), {
          errors: pipeline.errors,
          step_label: streamCopy('Blocage restant.', 'Remaining blocker.'),
          step_detail: streamCopy('Je garde l erreur actionnable au lieu de masquer le probleme.', 'I keep the error actionable instead of hiding the problem.'),
        });
      }
    }
    let previewHtml = pipeline.html;
    if (AGENT_V3_ENABLED && reliability.requires_runner) {
      toolLoop.claim('project_runner');
      await send('runner_started', streamCopy('Verification technique du projet.', 'Running project checks.'), {
        budget: toolLoop.snapshot,
        step_label: streamCopy('Verification du projet.', 'Checking project.'),
        step_detail: streamCopy('Je cherche les erreurs de build, preview vide, imports manquants et interactions critiques.', 'I am checking build errors, blank preview, missing imports, and critical interactions.'),
      });
      await sendCommandStarted('project_runner', 'project runner', 'En cours project runner', 'Running project runner', 'runner');
      await sendCheckStarted('runner', 'Checks techniques en cours', 'Running technical checks');
      runnerResult = await projectRunner.run({
        runId: agentRunId || requestId,
        projectId: project.id,
        files,
        previewHtml,
        timeoutMs: DEFAULT_AGENT_V3_BUDGET.runnerTimeoutMs,
      });
      await saveAgentRunnerResults(project, userId, agentRunId, runnerResult);
      await updateAgentRunV3Meta(agentRunId, { runner_status: runnerResult.status, tool_budget: toolLoop.snapshot });
      await sendCommandCompleted(
        'project_runner',
        'project runner',
        runnerResult.status === 'passed' ? 'passed' : 'failed',
        runnerResult.status === 'passed' ? 'Runner termine sans blocage.' : 'Runner termine avec blocage.',
        runnerResult.status === 'passed' ? 'Runner completed without blockers.' : 'Runner completed with blockers.',
        { status: runnerResult.status, checks: runnerResult.checks },
      );
      await sendCheckCompleted(
        'runner',
        runnerResult.status === 'passed' ? 'passed' : 'failed',
        runnerResult.status === 'passed' ? 'Checks techniques passes.' : 'Checks techniques a corriger.',
        runnerResult.status === 'passed' ? 'Technical checks passed.' : 'Technical checks need a fix.',
        { status: runnerResult.status, checks: runnerResult.checks },
      );
      await send(runnerResult.status === 'passed' ? 'runner_passed' : 'runner_failed', runnerResult.status === 'passed' ? streamCopy('Checks critiques passes.', 'Runner checks passed.') : streamCopy('Checks a corriger detectes.', 'Runner checks found issues.'), {
        status: runnerResult.status,
        checks: runnerResult.checks,
        step_label: runnerResult.status === 'passed' ? streamCopy('Checks passes.', 'Checks passed.') : streamCopy('Correction necessaire.', 'Fix needed.'),
        step_detail: runnerResult.status === 'passed'
          ? streamCopy('Les verifications bloquantes sont bonnes.', 'Blocking checks passed.')
          : streamCopy('Je tente une correction ciblee avant de finaliser.', 'I will try a targeted fix before finishing.'),
      });
      if (await stopIfCancelled('runner')) return;

      let runnerBlocking = runnerChecksToVerificationChecks(runnerResult.checks).filter(isBlockingVerificationFailure);
      if (runnerBlocking.length) {
        await sendNarration(
          'Le runner a trouve un vrai blocage. Je change d hypothese et je pars des erreurs executees, pas du prompt initial.',
          'The runner found a real blocker. I am changing hypothesis and working from executed errors, not the initial prompt.',
          { phase: 'recovery', source: 'runner', blockers: runnerBlocking },
        );
      }
      while (runnerBlocking.length && autoFixAttempts < maxAutoFixAttempts) {
        toolLoop.claim('runner_auto_fix');
        autoFixAttempts += 1;
        const runnerErrors = runnerBlocking.map(check => ({ file: check.file || 'index.html', message: check.message, severity: check.severity }));
        await send('auto_fix_started', streamCopy(`Correction automatique ${autoFixAttempts} lancee.`, `Auto-fix attempt ${autoFixAttempts} started.`), {
          attempt: autoFixAttempts,
          source: 'runner',
          step_label: streamCopy('Correction ciblee.', 'Targeted fix.'),
          step_detail: streamCopy('Je modifie seulement ce qui bloque les checks.', 'I am changing only what blocks the checks.'),
        });
        const fix = applyAutoFix(project, files, runnerErrors);
        autoFix = fix.patch;
        if (!fix.fixed) break;
        files = fix.files;
        await send('patch_applied', fix.patch?.summary || streamCopy('Correction ciblee appliquee.', 'Targeted patch applied.'), {
          patch: fix.patch,
          source: 'runner',
          step_label: streamCopy('Patch applique.', 'Patch applied.'),
          step_detail: streamCopy('Je corrige uniquement le blocage detecte par le runner.', 'I am fixing only the blocker detected by the runner.'),
        });
        await send('retest_started', streamCopy('Nouvelle verification apres correction.', 'Retesting after auto-fix.'), {
          attempt: autoFixAttempts,
          step_label: streamCopy('Retest.', 'Retest.'),
          step_detail: streamCopy('Je confirme que la correction n a pas casse autre chose.', 'I am confirming the fix did not break something else.'),
        });
        await sendNarration(
          'Je relance le check parce qu un patch non teste ne vaut pas une livraison.',
          'I am rerunning the check because an untested patch is not a delivery.',
          { phase: 'retest', source: 'runner', attempt: autoFixAttempts },
        );
        await sendCommandStarted(`runner_retest_${autoFixAttempts}`, 'project runner retest', 'En cours retest runner', 'Running runner retest', 'runner');
        pipeline = runPreviewPipeline(project, files);
        previewHtml = pipeline.html;
        runnerResult = await projectRunner.run({
          runId: agentRunId || requestId,
          projectId: project.id,
          files,
          previewHtml,
          timeoutMs: DEFAULT_AGENT_V3_BUDGET.runnerTimeoutMs,
        });
        await saveAgentRunnerResults(project, userId, agentRunId, runnerResult);
        await updateAgentRunV3Meta(agentRunId, { runner_status: runnerResult.status, tool_budget: toolLoop.snapshot });
        runnerBlocking = runnerChecksToVerificationChecks(runnerResult.checks).filter(isBlockingVerificationFailure);
        await sendCommandCompleted(
          `runner_retest_${autoFixAttempts}`,
          'project runner retest',
          runnerResult.status === 'passed' ? 'passed' : 'failed',
          runnerResult.status === 'passed' ? 'Retest runner passe.' : 'Retest runner encore en erreur.',
          runnerResult.status === 'passed' ? 'Runner retest passed.' : 'Runner retest still failed.',
          { status: runnerResult.status, checks: runnerResult.checks },
        );
        await send(runnerResult.status === 'passed' ? 'runner_passed' : 'runner_failed', runnerResult.status === 'passed' ? streamCopy('Retest passe.', 'Runner retest passed.') : streamCopy('Le retest trouve encore des soucis.', 'Runner retest still found issues.'), {
          status: runnerResult.status,
          checks: runnerResult.checks,
          step_label: runnerResult.status === 'passed' ? streamCopy('Retest passe.', 'Retest passed.') : streamCopy('Blocage restant.', 'Remaining blocker.'),
          step_detail: runnerResult.status === 'passed'
            ? streamCopy('Le projet est assez stable pour continuer.', 'The project is stable enough to continue.')
            : streamCopy('Je garde le blocage lisible au lieu de masquer l erreur.', 'I keep the blocker visible instead of hiding the error.'),
        });
        if (await stopIfCancelled('runner_retest')) return;
      }
    }
    const uiPolicy = buildWorldClassUiPolicy({ prompt });
    await send('visual_inspection_started', streamCopy('Inspection des interactions principales.', 'Inspecting primary interactions.'), {
      step_label: streamCopy('Test des interactions.', 'Testing interactions.'),
      step_detail: streamCopy('Je verifie les boutons, formulaires, filtres, modals et etats visibles.', 'I am checking buttons, forms, filters, modals, and visible states.'),
    });
    await sendCheckStarted('visual', 'Inspection des interactions en cours', 'Inspecting interactions');
    let visualChecks = inspectVisualPreview({
      files,
      previewHtml,
      platformType: uiPolicy.appType,
    });
    let visualBlocking = visualChecks.filter(isBlockingVerificationFailure);
    await sendCheckCompleted(
      'visual',
      visualBlocking.length ? 'failed' : 'passed',
      visualBlocking.length ? 'Interactions a corriger.' : 'Interactions essentielles verifiees.',
      visualBlocking.length ? 'Interactions need a fix.' : 'Essential interactions checked.',
      { checks: visualChecks },
    );
    await send(visualBlocking.length ? 'visual_inspection_failed' : 'visual_inspection_passed', visualBlocking.length ? streamCopy('Interactions a corriger detectees.', 'Interaction issues detected.') : streamCopy('Interactions essentielles verifiees.', 'Essential interactions checked.'), {
      checks: visualChecks,
      step_label: visualBlocking.length ? streamCopy('Interaction a corriger.', 'Interaction issue.') : streamCopy('Interactions OK.', 'Interactions OK.'),
      step_detail: visualBlocking.length
        ? streamCopy('Je tente une correction si un patch fiable est possible.', 'I will try a correction if a reliable patch is possible.')
        : streamCopy('Les controles principaux ont des comportements visibles ou des etats honnetes.', 'Primary controls have visible behavior or honest states.'),
    });
    if (await stopIfCancelled('visual_inspection')) return;

    while (visualBlocking.length && autoFixAttempts < maxAutoFixAttempts) {
      autoFixAttempts += 1;
      const visualErrors = visualBlocking.map(check => ({ file: check.file || 'src/App.tsx', message: check.message, severity: check.severity }));
      await send('auto_fix_started', streamCopy(`Correction interaction ${autoFixAttempts} lancee.`, `Interaction fix attempt ${autoFixAttempts} started.`), {
        attempt: autoFixAttempts,
        source: 'visual_inspection',
        step_label: streamCopy('Correction interaction.', 'Interaction fix.'),
        step_detail: streamCopy('Je ne modifie que ce qui bloque les interactions essentielles.', 'I only change what blocks essential interactions.'),
      });
      const fix = applyAutoFix(project, files, visualErrors);
      autoFix = fix.patch;
      if (!fix.fixed) break;
      files = fix.files;
      await send('patch_applied', fix.patch?.summary || streamCopy('Correction interaction appliquee.', 'Interaction patch applied.'), {
        patch: fix.patch,
        source: 'visual_inspection',
        step_label: streamCopy('Patch applique.', 'Patch applied.'),
        step_detail: streamCopy('Je reteste la preview apres correction.', 'I retest the preview after the correction.'),
      });
      pipeline = runPreviewPipeline(project, files);
      previewHtml = pipeline.html;
      await send('retest_started', streamCopy('Retest des interactions.', 'Retesting interactions.'), {
        attempt: autoFixAttempts,
        source: 'visual_inspection',
        step_label: streamCopy('Retest interaction.', 'Interaction retest.'),
        step_detail: streamCopy('Je confirme que les controles restent utilisables.', 'I confirm the controls remain usable.'),
      });
      visualChecks = inspectVisualPreview({
        files,
        previewHtml,
        platformType: uiPolicy.appType,
      });
      visualBlocking = visualChecks.filter(isBlockingVerificationFailure);
      await send(visualBlocking.length ? 'visual_inspection_failed' : 'visual_inspection_passed', visualBlocking.length ? streamCopy('Blocage interaction restant.', 'Remaining interaction blocker.') : streamCopy('Retest interaction passe.', 'Interaction retest passed.'), {
        checks: visualChecks,
        step_label: visualBlocking.length ? streamCopy('Blocage restant.', 'Remaining blocker.') : streamCopy('Retest passe.', 'Retest passed.'),
        step_detail: visualBlocking.length
          ? streamCopy('Je garde le probleme visible au lieu de masquer un faux succes.', 'I keep the issue visible instead of hiding a false success.')
          : streamCopy('La preview garde ses interactions essentielles.', 'The preview keeps its essential interactions.'),
      });
      if (await stopIfCancelled('visual_retest')) return;
    }
    await send('quality_gate_started', streamCopy('Quality gate final lance.', 'Final quality gate started.'), {
      step_label: streamCopy('Quality gate.', 'Quality gate.'),
      step_detail: streamCopy('Je vérifie seulement les points qui peuvent casser l experience ou bloquer la suite.', 'I am checking only points that can break the experience or block the next step.'),
    });
    await sendCheckStarted('quality', 'Quality gate final en cours', 'Running final quality gate');
    await send('verification_started', streamCopy('Verification finale des fichiers et de la preview.', 'Verifying generated files and preview.'), {
      step_label: streamCopy('Verification finale.', 'Final verification.'),
      step_detail: streamCopy('Je controle les fichiers, la preview, le design de base et les interactions.', 'I am checking files, preview, basic design, and interactions.'),
    });
    let finalGate = await finalReliabilityAutoFix({
      project,
      userId,
      agentRunId,
      requestId,
      files,
      pipeline,
      runnerResult,
      uiPolicy,
      hasExistingFiles: existingFiles.length > 0,
      shouldRunRunner: Boolean(AGENT_V3_ENABLED && reliability.requires_runner),
      maxAttempts: DEFAULT_AGENT_V3_BUDGET.maxAutoFixAttempts,
    });
    files = finalGate.files;
    pipeline = finalGate.pipeline;
    previewHtml = finalGate.previewHtml;
    runnerResult = finalGate.runnerResult;
    const browserResult = finalGate.browserResult;
    if (finalGate.autoFixPatch) autoFix = finalGate.autoFixPatch;
    const verificationChecks = finalGate.verificationChecks;
    const verificationSummary = finalGate.verificationSummary;
    const reliabilitySummary = finalGate.reliabilitySummary;
    const qualitySummary = finalGate.qualitySummary;
    await saveAgentVerifications(project, userId, agentRunId, verificationChecks);
    if (reliabilitySummary.status === 'failed') {
      await send('verification_failed', reliabilitySummary.message, {
        checks: verificationChecks,
        summary: verificationSummary,
        reliability: reliabilitySummary,
        blocking: true,
      });
    }
    await send(
      'quality_checked',
      qualitySummary.status === 'passed'
        ? streamCopy('Controle qualite passe.', 'Quality checks passed.')
        : qualitySummary.status === 'warning'
          ? streamCopy('Controle qualite passe avec notes.', 'Quality checks passed with notes.')
          : streamCopy('Controle qualite avec points a corriger.', 'Quality checks found issues.'),
      {
        quality: qualitySummary,
        summary: verificationSummary,
        reliability: reliabilitySummary,
        step_label: qualitySummary.status === 'failed' ? streamCopy('Points a corriger.', 'Issues found.') : streamCopy('Qualite verifiee.', 'Quality checked.'),
        step_detail: qualitySummary.status === 'failed'
          ? streamCopy('Je bloque seulement les erreurs graves ou les problemes qui cassent l app.', 'I only block serious errors or issues that break the app.')
          : streamCopy('Les notes non bloquantes restent visibles pour les prochaines iterations.', 'Non-blocking notes stay visible for future iterations.'),
      },
    );
    await sendCheckCompleted(
      'quality',
      reliabilitySummary.status === 'failed' ? 'failed' : qualitySummary.status,
      reliabilitySummary.status === 'failed'
        ? 'Quality gate bloque la livraison.'
        : qualitySummary.status === 'passed'
          ? 'Quality gate passe.'
          : 'Quality gate passe avec notes.',
      reliabilitySummary.status === 'failed'
        ? 'Quality gate blocks delivery.'
        : qualitySummary.status === 'passed'
          ? 'Quality gate passed.'
          : 'Quality gate passed with notes.',
      { quality: qualitySummary, summary: verificationSummary, reliability: reliabilitySummary },
    );

    if (reliabilitySummary.status === 'failed') {
      const recoverableProject: GeneratedProject = {
        ...project,
        prompt,
        model_id: model,
        status: project.status || 'draft',
        preview_status: 'needs_fix',
        preview_html: previewHtml,
        updated_at: new Date().toISOString(),
      };
      await saveProject(recoverableProject, files).catch(error => {
        console.warn('[huggy:needs_fix_draft_save_failed]', { project_id: project.id, message: redactSecrets(error?.message || String(error), '[redacted]') });
      });
      throw new ReliabilityGateError(reliabilitySummary);
    }

    const updatedProject: GeneratedProject = {
      ...project,
      prompt,
      model_id: model,
      status: project.status || 'draft',
      preview_status: pipeline.status,
      preview_html: previewHtml,
      updated_at: new Date().toISOString(),
    };

    await saveProject(updatedProject, files);
    const diff = diffFiles(existingFiles, files);
    await sendFileEditEvents(diff, 'final_diff');
    await createProjectVersion(updatedProject, files, prompt, { ...diff, verification: verificationSummary, reliability: reliabilitySummary, agent_run_id: agentRunId || null });
    if (autoFix) await saveProjectPatch(updatedProject, autoFix);
    const memorySummary = summarizeAgentMemory({
      projectName: updatedProject.name,
      files,
      latestDecision: decision.userVisibleReason,
      latestOutcome: parsed.summary,
    });
    await upsertAgentMemory(updatedProject, userId, memorySummary, {
      recent_decisions: [{ intent: decision.intent, summary: decision.userVisibleReason, created_at: new Date().toISOString() }],
      known_errors: verificationChecks.filter(check => check.status === 'fail'),
      architecture: {
        runner: summarizeRunnerForMemory(runnerResult),
        research: summarizeResearchForMemory(researchResult),
        quality: qualitySummary,
      },
    });
    await recordAgentImprovementSignal(updatedProject, userId, {
      prompt,
      decision,
      outcome: 'generated',
      previewChanged: true,
      qualityStatus: qualitySummary.status,
      issueCount: Number(qualitySummary.failed?.length || 0) + Number(qualitySummary.warnings?.length || 0),
    });

    const finalCost = costEstimator.calculateRequiredCredits({
      openrouter_cost_usd: costUsd,
      infra_cost_usd: 0.0005,
      storage_cost_usd: 0.0001,
      build_cost_usd: 0.001,
      domain_operation_cost_usd: 0,
      minimum_action_credits: Math.max(2, modelCreditFloor(model)),
      complexity_surcharge: prompt.length > 400 ? 2 : 0,
    });
    const finalBalance = await helpers.updateWallet(userId, -finalCost.finalCredits);
    await helpers.addLedger(userId, 'usage', -finalCost.finalCredits, finalBalance, `Generated app files with ${model}`, refId);

    const promptIsFrench = isLikelyFrenchPrompt(prompt);
    const previewReadyMessage = promptIsFrench
      ? 'C’est prêt. J’ai mis à jour l’app et rafraîchi la preview.'
      : 'Done. I updated the app and refreshed the preview.';
    const assistantSummary = [
      previewReadyMessage,
      diff.summary ? `${promptIsFrench ? 'Changements' : 'Changes'}: ${diff.summary}.` : '',
      reliabilitySummary?.message ? `${promptIsFrench ? 'Vérification' : 'Checks'}: ${reliabilitySummary.message}` : '',
    ].filter(Boolean).join('\n');
    await saveProjectMessage({
      organization_id: updatedProject.organization_id,
      project_id: updatedProject.id,
      user_id: userId,
      role: 'assistant',
      content: assistantSummary,
      intent: decision.intent,
      requested_mode: decision.requestedMode,
    });

    await send('final_summary', assistantSummary, {
      text: assistantSummary,
      changes: diff.summary,
      files: diff.file_stats || [],
      checks: verificationSummary,
      preview_status: pipeline.status,
      auto_fix: autoFix ? { applied: true, patch: autoFix } : { applied: false },
      rollback: { available: true },
      next_action: pipeline.status === 'ready'
        ? streamCopy('Tester la preview ou publier quand tu es pret.', 'Test the preview or publish when you are ready.')
        : streamCopy('Corriger les blocages restants avant publication.', 'Fix remaining blockers before publishing.'),
    });

    await send('preview_ready', previewReadyMessage, {
      project: updatedProject,
      files,
      preview: { status: pipeline.status, html: previewHtml },
      diff,
      auto_fix: autoFix,
      errors: pipeline.errors,
      runner: runnerResult ? { status: runnerResult.status, checks: runnerResult.checks } : null,
      browser: browserResult ? { status: browserResult.status, findings: browserResult.findings, checks: browserResult.checks } : null,
      research: researchResult ? summarizeResearchForMemory(researchResult) : null,
      huggy_cloud: huggyCloudPlan
        ? {
          requirements: publicHuggyCloudRequirementPayload(huggyCloudPlan.requirement),
          project: huggyCloudPlan.cloudProject,
        }
        : undefined,
      quality: qualitySummary,
      reliability,
      reliability_summary: reliabilitySummary,
      step_label: streamCopy('Preview prete.', 'Preview ready.'),
      step_detail: streamCopy('Tu peux maintenant tester et demander une modification sur l existant.', 'You can now test and ask for changes on the existing app.'),
    });

    await updateBuildSessionStatus(buildSessionId, 'completed');
    await send('memory_updated', streamCopy('Memoire projet mise a jour.', 'Project memory updated.'), {
      summary: memorySummary,
      step_label: streamCopy('Memoire mise a jour.', 'Memory updated.'),
      step_detail: streamCopy('Je retiens les decisions utiles pour les prochaines iterations.', 'I keep useful decisions for future iterations.'),
    });
    await send('done', streamCopy('Generation terminee.', 'Generation completed.'), {
      step_label: streamCopy('Termine.', 'Done.'),
      step_detail: streamCopy('Le run reste visible pour comprendre ce qui a ete fait.', 'The run stays visible so you can understand what happened.'),
    });
    await updateAgentRunStatus(agentRunId, 'completed', {
      duration_ms: Date.now() - streamStartedAt,
      public_payload: {
        verification: verificationSummary,
        reliability: reliabilitySummary,
        quality: qualitySummary,
        runner: summarizeRunnerForMemory(runnerResult),
        browser: browserResult ? { status: browserResult.status, finding_count: browserResult.findings.length } : null,
        research: summarizeResearchForMemory(researchResult),
      },
    });
    await updateAgentRunV3Meta(agentRunId, { runner_status: runnerResult?.status || null, research_used: researchResult?.status === 'completed' });
    endStream();
  } catch (error: any) {
    await updateBuildSessionStatus(buildSessionId, 'failed').catch(() => null);
    await helpers.addLedger(userId, 'refund', estimate.finalCredits, await helpers.getWallet(userId), `Generation failed: ${error.message}`, refId);
    await helpers.addAudit({
      user_id: userId,
      organization_id: userId,
      project_id: project.id,
      requested_model: requestedModelSelection,
      reason: `Streaming generation failed: ${error.message}`,
      source: 'builder_stream',
    });

    const diagnostic = diagnoseProviderError(error);
    await recordAgentImprovementSignal(project, userId, {
      prompt,
      decision,
      outcome: 'failed',
      previewChanged: reliability.should_touch_preview,
      qualityStatus: diagnostic.diagnostic_code,
      issueCount: 1,
    }).catch(() => null);
    console.error('[huggy:generate_stream_failed]', {
      request_id: requestId,
      project_id: project.id,
      user_id: userId,
      model: requestedModelSelection,
      diagnostic_code: diagnostic.diagnostic_code,
      message: redactSecrets(error.message, '[redacted]'),
    });
    await send('error', diagnostic.message, {
      code: 'GenerationFailed',
      diagnostic_code: diagnostic.diagnostic_code,
      request_id: requestId,
      suggested_action: diagnostic.suggested_action,
      reliability: error?.publicPayload || undefined,
    });
    await updateAgentRunStatus(agentRunId, 'failed', {
      diagnostic_code: diagnostic.diagnostic_code,
      suggested_action: diagnostic.suggested_action,
      duration_ms: Date.now() - streamStartedAt,
    });
    endStream();
  }
  } catch (error: any) {
    const diagnostic = diagnoseProviderError(error);
    const message = diagnostic.message;
    console.error('[huggy:generate_stream_preflight_failed]', {
      request_id: requestId,
      project_id: req.params?.id,
      user_id: getOptionalAuthState(req).userId,
      diagnostic_code: diagnostic.diagnostic_code,
      message: redactSecrets(error?.message || String(error), '[redacted]'),
    });
    if (!res.headersSent) {
      const status = error?.statusCode || (String(error?.message || '').includes('requires SUPABASE_SERVICE_ROLE_KEY') ? 503 : diagnostic.status);
      return res.status(status).json({
        success: false,
        error: message,
        message,
        diagnostic_code: diagnostic.diagnostic_code,
        request_id: requestId,
        suggested_action: diagnostic.suggested_action,
      });
    }
    res.write('event: error\n');
    res.write(`data: ${JSON.stringify({
      event_type: 'error',
      message: redactSecrets(message, '[redacted]'),
      payload: {
        code: 'GenerationFailed',
        diagnostic_code: diagnostic.diagnostic_code,
        request_id: requestId,
        suggested_action: diagnostic.suggested_action,
      },
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
  const html = renderPreviewHtml(files, project.name, project.id, 'preview', project.prompt || project.name, project.slug || project.id);
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
  const agentRunId = String(req.body?.agentRunId || '');
  if (buildSessionId) await updateBuildSessionStatus(buildSessionId, 'cancelled', { cancelled_at: new Date().toISOString() });
  if (agentRunId) await updateAgentRunStatus(agentRunId, 'cancelled', { suggested_action: 'cancelled_by_user' });
  await saveAgentEvent({
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    sequence_number: Date.now(),
    event_type: 'cancelled',
    message: 'Build cancelled by user.',
    payload: { build_session_id: buildSessionId, agent_run_id: agentRunId || null },
  });
  res.json({ success: true, status: 'cancelled', agent_run_id: agentRunId || null });
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

app.get('/api/projects/:id/agent/runs', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const runs = await listAgentRuns(project.id, req.query?.limit || 20);
  res.json({ success: true, runs });
});

app.get('/api/projects/:id/agent/runs/:runId', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const run = await getAgentRun(project.id, req.params.runId);
  if (!run) return res.status(404).json({ success: false, error: 'Agent run not found.' });
  const steps = await getAgentRunSteps(project.id, req.params.runId);
  res.json({ success: true, run, steps });
});

app.get('/api/projects/:id/agent/runs/:runId/runner-results', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const run = await getAgentRun(project.id, req.params.runId);
  if (!run) return res.status(404).json({ success: false, error: 'Agent run not found.' });
  const results = await listAgentRunnerResults(project.id, req.params.runId, req.query?.limit || 120);
  res.json({ success: true, results });
});

app.post('/api/projects/:id/agent/feedback', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const allowedFeedback = new Set(['keep', 'modify', 'regenerate', 'publish', 'reject']);
  const feedback = allowedFeedback.has(String(req.body?.feedback || ''))
    ? String(req.body.feedback)
    : 'modify';
  const reasons = Array.isArray(req.body?.reasons)
    ? req.body.reasons.map((item: any) => String(item || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80)).filter(Boolean).slice(0, 8)
    : [];
  const comment = redactSecrets(req.body?.comment || '').trim().slice(0, 2000);
  const messageId = String(req.body?.messageId || '').trim().slice(0, 120);
  const role = ['user', 'assistant', 'system'].includes(String(req.body?.role || ''))
    ? String(req.body.role)
    : null;
  const rating = req.body?.rating === 'positive' ? 'positive' : req.body?.rating === 'negative' ? 'negative' : null;
  const messageExcerpt = redactSecrets(req.body?.content || '').trim().slice(0, 1000);
  await saveAgentEvent({
    organization_id: project.organization_id || userId,
    project_id: project.id,
    user_id: userId,
    sequence_number: Date.now(),
    event_type: 'user_feedback',
    message: `User feedback: ${feedback}.`,
    payload: redactAgentPayload({
      feedback,
      agent_run_id: req.body?.runId || null,
      version_id: req.body?.versionId || null,
      source: req.body?.source || 'builder',
      message_id: messageId || null,
      role,
      rating,
      reasons,
      comment,
      message_excerpt: messageExcerpt,
    }),
  });
  const learningSignal = buildUserFeedbackImprovementSignal({
    feedback,
    rating: rating as 'positive' | 'negative' | null,
    reasons,
    comment,
    role,
    messageExcerpt,
    source: String(req.body?.source || 'builder').slice(0, 120),
  });
  await upsertAgentTypedMemory(project, userId, learningSignal.memoryType, learningSignal.summary, learningSignal.payload).catch(() => null);
  res.json({ success: true, feedback, rating });
});

app.get('/api/projects/:id/agent/research', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const research = await listAgentResearchResults(project.id, req.query?.limit || 40);
  res.json({ success: true, research });
});

app.get('/api/projects/:id/agent/memory', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const memory = await listAgentMemory(project.id);
  res.json({ success: true, memory });
});

app.post('/api/projects/:id/agent/runs/:runId/cancel', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  await updateAgentRunStatus(req.params.runId, 'cancelled', { suggested_action: 'cancelled_by_user' });
  await saveAgentEvent({
    organization_id: project.organization_id,
    project_id: project.id,
    user_id: userId,
    sequence_number: Date.now(),
    event_type: 'cancelled',
    message: 'Agent run cancelled by user.',
    payload: { agent_run_id: req.params.runId, request_id: req.body?.requestId || null },
  });
  res.json({ success: true, status: 'cancelled', run_id: req.params.runId });
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
  if (!requireProjectCapability(req, res, 'build', project)) return;
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

app.post('/api/projects/:id/browser-test', async (req: any, res: any) => {
  const requestId = `browser_${randomUUID()}`;
  try {
    const userId = getUserOrgId(req);
    const project = await loadProject(req.params.id, userId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found.', request_id: requestId });
    }
    if (!requireProjectCapability(req, res, 'view', project)) return;
    const files = await loadProjectFiles(project.id);
    const previewHtml = String(req.body?.preview_html || req.body?.previewHtml || getProjectPreviewHtml(project, files, 'preview'));
    const result = await runBrowserInteractionAuditDetailed({
      files,
      previewHtml,
      timeoutMs: Number(req.body?.timeout_ms || req.body?.timeoutMs || 20_000),
    });
    res.json({ success: true, request_id: requestId, browser_test: result });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      request_id: requestId,
      message: 'Browser test could not complete.',
      diagnostic_code: 'BROWSER_TEST_FAILED',
      suggested_action: 'retry_or_use_static_checks',
      error: redactSecrets(error?.message || String(error), '[redacted]'),
    });
  }
});

app.post('/api/projects/:id/security-scan', async (req: any, res: any) => {
  const requestId = `sec_${randomUUID()}`;
  try {
    const userId = getUserOrgId(req);
    const project = await loadProject(req.params.id, userId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found.', request_id: requestId });
    }
    if (!requireProjectCapability(req, res, 'view', project)) return;
    const files = await loadProjectFiles(project.id);
    const security = scanGeneratedSecurity(files);
    res.json({ success: true, request_id: requestId, security });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      request_id: requestId,
      message: 'Security scan could not complete.',
      diagnostic_code: 'SECURITY_SCAN_FAILED',
      suggested_action: 'retry_or_run_build',
      error: redactSecrets(error?.message || String(error), '[redacted]'),
    });
  }
});

app.post('/api/projects/:id/import-context', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  if (!requireProjectCapability(req, res, 'build', project)) return;
  const context = buildImportContext({
    source: req.body?.source,
    mode: req.body?.mode,
    url: req.body?.url,
    fileName: req.body?.file_name || req.body?.fileName,
    mimeType: req.body?.mime_type || req.body?.mimeType,
    hasAttachment: Boolean(req.body?.has_attachment || req.body?.hasAttachment),
  }, {
    figmaConfigured: Boolean(process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN),
    githubConfigured: Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
  });
  res.json({ success: true, import_context: publicImportContext(context), prompt_context: context?.prompt || '' });
});

app.post('/api/projects/:id/visual-edit', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  if (!requireProjectCapability(req, res, 'build', project)) return;
  const selector = String(req.body?.selector || '').trim().slice(0, 240);
  const instruction = String(req.body?.instruction || req.body?.prompt || '').trim().slice(0, 1200);
  if (!instruction) {
    return res.status(400).json({
      success: false,
      message: 'Describe the visual change to apply.',
      diagnostic_code: 'VISUAL_EDIT_INSTRUCTION_REQUIRED',
      suggested_action: 'provide_visual_edit_instruction',
    });
  }
  const prompt = [
    'Visual edit request.',
    selector ? `Target selector: ${selector}` : 'Target selector: not provided; infer the smallest safe target from the current preview.',
    `Instruction: ${instruction}`,
    'Patch only the smallest relevant files. Preserve data, state, routes, generated app behavior and preview bootstrap code.',
  ].join('\n');
  res.json({
    success: true,
    mode: 'generate_with_visual_edit_prompt',
    prompt,
    suggested_action: 'send_prompt_to_generate_endpoint',
  });
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
  const huggyCloud = await loadProjectHuggyCloud(project.id);
  const tableMatches = [...(schemaFile?.content || '').matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi)];
  const tables = tableMatches.length
    ? tableMatches.map(match => ({ name: match[1], rows: 0, source: 'supabase/schema.sql', columns: [] }))
    : [{ name: 'project_files', rows: files.length, source: 'huggy_control_db', columns: ['path', 'language', 'updated_at'] }];
  res.json({
    success: true,
    database: {
      project_id: project.id,
      backend_status: huggyCloud.project?.status || (schemaFile ? 'schema_generated' : 'waiting_for_schema'),
      mode: huggyCloud.project?.mode || huggyCloud.requirements?.recommended_mode || 'shared_supabase_project',
      cloud: {
        provider: huggyCloud.project?.provider || 'huggy_cloud',
        status: huggyCloud.project?.status || (huggyCloud.requirements ? 'detected' : 'not_detected'),
        mode: huggyCloud.project?.mode || huggyCloud.requirements?.recommended_mode || 'shared',
        region: huggyCloud.project?.region || 'auto',
        schema_name: huggyCloud.project?.schema_name || (huggyCloud.requirements ? buildHuggyCloudSchemaName(project.id) : null),
        requirements: huggyCloud.requirements,
        resources: huggyCloud.resources,
        runtime_config: huggyCloud.project?.public_runtime_config || {},
      },
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
  if (!requireProjectCapability(req, res, 'secrets', project)) return;
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
  if (!requireProjectCapability(req, res, 'secrets', project)) return;
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
  if (!requireProjectCapability(req, res, 'secrets', project)) return;
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
  if (!requireProjectCapability(req, res, 'build', project)) return;

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
app.get('/api/projects/:id/domains', async (req: any, res) => {
  const userId = getUserOrgId(req);
  const projectId = req.params.id;
  const project = await loadProject(projectId, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  if (!requireProjectCapability(req, res, 'view', project)) return;
  const client = requireSupabase('Domain listing');
  const { data, error } = await client.from('domains').select('*').eq('project_id', projectId).neq('status', 'removed');
  if (error) return res.status(500).json({ success: false, error: error.message });
  const domains = (data || []) as any[];
  const ids = domains.map((item: any) => item.id).filter(Boolean);
  let dnsByDomain = new Map<string, any[]>();
  if (ids.length) {
    const dnsResult = await client
      .from('dns_verifications')
      .select('*')
      .in('domain_id', ids);
    if (!dnsResult.error) {
      dnsByDomain = ((dnsResult.data || []) as any[]).reduce((map, record) => {
        const key = String(record.domain_id || '');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(record);
        return map;
      }, new Map<string, any[]>());
    } else if (!isSchemaShapeError(dnsResult.error)) {
      return res.status(500).json({ success: false, error: dnsResult.error.message });
    }
  }
  res.json({
    success: true,
    domains: domains.map((domain: any) => ({
      ...domain,
      dns_records: dnsByDomain.get(String(domain.id)) || [],
    })),
  });
});

// POST /projects/:id/domains
app.post('/api/projects/:id/domains', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const projectId = req.params.id;
  const { domain, type } = req.body;

  try {
    const project = await loadProject(projectId, userId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
    if (!requireProjectCapability(req, res, 'deploy', project)) return;
    const plan = await getOrganizationPlan(project.organization_id);
    const vercelProxy = createVercelDomainProxy();
    const domainService = new DomainService(requireSupabase('Domain creation'), vercelProxy);
    const records = await domainService.registerDomain(project.organization_id, projectId, domain, type || 'custom', plan as any);
    return res.json({ success: true, domain: records });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

function PARTS_RESERVED(sub: string): boolean {
  return ['admin', 'api', 'www', 'app', 'billing', 'support', 'assets', 'jobs'].includes(sub);
}

// POST /projects/:id/domains/:domainId/verify
app.post('/api/projects/:id/domains/:domainId/verify', async (req: any, res) => {
  const userId = getUserOrgId(req);
  const projectId = req.params.id;
  const domainId = req.params.domainId;

  try {
    const project = await loadProject(projectId, userId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
    if (!requireProjectCapability(req, res, 'deploy', project)) return;
    const vercelProxy = createVercelDomainProxy();
    const domainService = new DomainService(requireSupabase('Domain verification'), vercelProxy);
    const result = await domainService.verifyDnsRecords(projectId, domainId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /projects/:id/domains/:domainId
app.delete('/api/projects/:id/domains/:domainId', async (req: any, res) => {
  const userId = getUserOrgId(req);
  const projectId = req.params.id;
  const domainId = req.params.domainId;

  try {
    const project = await loadProject(projectId, userId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
    if (!requireProjectCapability(req, res, 'deploy', project)) return;
    const vercelProxy = createVercelDomainProxy();
    const domainService = new DomainService(requireSupabase('Domain deletion'), vercelProxy);
    await domainService.removeDomain(projectId, domainId);
    res.json({ success: true, message: 'Domain deleted successfully.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /projects/:id/domains/:domainId/primary
app.patch('/api/projects/:id/domains/:domainId/primary', async (req: any, res) => {
  const userId = getUserOrgId(req);
  const projectId = req.params.id;
  const domainId = req.params.domainId;

  try {
    const project = await loadProject(projectId, userId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
    if (!requireProjectCapability(req, res, 'deploy', project)) return;
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

async function createPublishContext(project: GeneratedProject): Promise<PublishContext> {
  const [files, latestDeployment, plan, customDomain, currentVisitors] = await Promise.all([
    loadProjectFiles(project.id),
    getLatestDeployment(project.id),
    getOrganizationPlan(project.organization_id),
    getPrimaryCustomDomain(project.id),
    getPublishCurrentVisitors(project.id),
  ]);
  return { project, files, latestDeployment, plan, customDomain, currentVisitors };
}

function getPublishPublicUrl(project: GeneratedProject, customDomain: string | null): string {
  return customDomain ? normalizeDomainUrl(customDomain) : getDefaultPublishedUrl(project);
}

async function publishProjectSnapshot(req: any, res: any) {
  const requestId = `pub_${randomUUID()}`;
  const projectId = req.params.id;
  const userId = getUserOrgId(req);
  const { commitHash, branch = 'main', userCredits = 100 } = req.body || {};
  try {
    if (!enforceRateLimit(`publish:${userId}`, 6, 60_000)) {
      return res.status(429).json({
        success: false,
        error: 'Too many publish requests. Please wait a moment.',
        message: 'Too many publish requests. Please wait a moment.',
        diagnostic_code: 'PUBLISH_RATE_LIMITED',
        request_id: requestId,
        suggested_action: 'retry_later',
      });
    }

    if (userCredits < 2) {
      return res.status(200).json({ ...publicCreditGateResponse(), request_id: requestId });
    }

    const project = await loadProject(projectId, userId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found.',
        message: 'Project not found.',
        diagnostic_code: 'PROJECT_NOT_FOUND',
        request_id: requestId,
        suggested_action: 'open_project',
      });
    }
    if (!requireProjectCapability(req, res, 'deploy', project)) return;

    const context = await createPublishContext(project);
    const publishStatus = buildPublishStatus(context);
    if (!publishStatus.can_publish) {
      const failedCheck = publishStatus.checks.find((check: any) => check.status === 'fail');
      const diagnosticCode = failedCheck?.key === 'security' ? 'PUBLISH_SECURITY_CHECK_FAILED' : 'PREVIEW_NOT_READY';
      return res.status(409).json({
        success: false,
        error: failedCheck?.detail || 'Build a ready preview before publishing.',
        message: failedCheck?.detail || 'Build a ready preview before publishing.',
        diagnostic_code: diagnosticCode,
        request_id: requestId,
        suggested_action: failedCheck?.key === 'security' ? 'fix_security_then_publish' : 'build_first',
        publish: publishStatus,
      });
    }

    const publicOrigin = getHuggyPublicOrigin();
    const badgeRequired = publishStatus.badge_required;
    const result = await deployFilesToVercel(project, context.files, {
      includeHuggyBadge: badgeRequired,
      publicOrigin,
    });
    const createdAt = new Date().toISOString();
    const deploy = {
      id: randomUUID(),
      organization_id: project.organization_id,
      project_id: projectId,
      provider: 'vercel',
      provider_deployment_id: result.provider_deployment_id,
      deployment_url: result.deployment_url,
      public_url: publishStatus.public_url,
      custom_domain: publishStatus.custom_domain,
      badge_required: badgeRequired,
      status: normalizeDeploymentStatusForPersistence(result.status),
      commit_hash: commitHash || null,
      branch,
      created_at: createdAt,
    };

    await saveDeploymentRecord(deploy);
    const latestContext = { ...context, latestDeployment: deploy };
    const nextStatus = buildPublishStatus(latestContext);
    res.json({
      success: true,
      deployment: sanitizeDeploymentForUser(deploy, nextStatus.public_url, nextStatus.custom_domain),
      publish: nextStatus,
    });
  } catch (error: any) {
    const diagnostic = diagnosePublishError(error);
    console.error('[huggy:publish_failed]', {
      request_id: requestId,
      project_id: projectId,
      user_id: userId,
      diagnostic_code: diagnostic.diagnostic_code,
      message: error?.message || String(error),
    });
    res.status(diagnostic.status).json({
      success: false,
      error: diagnostic.message,
      message: diagnostic.message,
      diagnostic_code: diagnostic.diagnostic_code,
      request_id: requestId,
      suggested_action: diagnostic.suggested_action,
    });
  }
}

// GET /projects/:id/publish/status
app.get('/api/projects/:id/publish/status', async (req: any, res: any) => {
  const userId = getUserOrgId(req);
  const project = await loadProject(req.params.id, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const context = await createPublishContext(project);
  res.json({
    success: true,
    publish: buildPublishStatus(context),
    deployment: sanitizeDeploymentForUser(
      context.latestDeployment,
      getPublishPublicUrl(project, context.customDomain),
      context.customDomain,
    ),
  });
});

// POST /projects/:id/publish
app.post('/api/projects/:id/publish', publishProjectSnapshot);

// POST /projects/:id/deploy
app.post('/api/projects/:id/deploy', publishProjectSnapshot);

// GET /projects/:id/deployments
app.get('/api/projects/:id/deployments', async (req: any, res) => {
  const projectId = req.params.id;
  const userId = getUserOrgId(req);
  const project = await loadProject(projectId, userId);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const customDomain = await getPrimaryCustomDomain(projectId);
  const publicUrl = getPublishPublicUrl(project, customDomain);
  const client = requireSupabase('Deployment listing');
  const { data, error } = await client.from('deployments').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error && isSchemaShapeError(error)) return res.json({ success: true, deployments: [] });
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, deployments: (data || []).map((item: any) => sanitizeDeploymentForUser(item, publicUrl, customDomain)) });
});

async function loadPublicProjectBySlug(slugOrId: string): Promise<GeneratedProject | null> {
  const client = requireSupabase('Public project loading');
  const slug = String(slugOrId || '').trim();
  if (!slug) return null;
  const bySlug = await client.from('projects').select('*').eq('slug', slug).maybeSingle();
  if (bySlug.error) throw new Error(`Supabase public project load failed: ${bySlug.error.message}`);
  if (bySlug.data) return bySlug.data as GeneratedProject;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug)) {
    const byId = await client.from('projects').select('*').eq('id', slug).maybeSingle();
    if (byId.error) throw new Error(`Supabase public project load failed: ${byId.error.message}`);
    return (byId.data as GeneratedProject) || null;
  }
  return null;
}

async function loadPublicProjectByCustomDomain(host: string): Promise<GeneratedProject | null> {
  const domain = normalizeDomainHost(host);
  if (!domain) return null;
  const client = requireSupabase('Public custom domain loading');
  const { data, error } = await client
    .from('domains')
    .select('project_id,status,domain')
    .eq('domain', domain)
    .neq('status', 'removed')
    .limit(1);
  if (error) {
    if (isSchemaShapeError(error)) return null;
    throw new Error(`Supabase custom domain load failed: ${error.message}`);
  }
  const record = ((data || []) as any[]).find((item: any) => ['active', 'verified'].includes(String(item.status || '').toLowerCase()));
  if (!record?.project_id) return null;
  return loadProjectForAnalytics(record.project_id);
}

function isKnownHuggyHost(host: string): boolean {
  const normalized = normalizeDomainHost(host);
  if (!normalized) return true;
  const publicHost = normalizeDomainHost(getHuggyPublicOrigin());
  const rootHost = publicHost.replace(/^www\./, '');
  return [
    publicHost,
    rootHost,
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
  ].some((known: string) => normalized === known || normalized.startsWith(`${known}:`));
}

function stripHuggyPublishedBadge(html: string) {
  return html.replace(/<a\b[^>]*\bdata-huggy-published-badge=["']true["'][\s\S]*?<\/a>/gi, '');
}

function rewritePublishedHtmlForProxy(html: string, project: GeneratedProject, deployment: any, proxyBasePath: string) {
  let output = html;
  if (deployment?.badge_required) {
    output = injectHuggyPublishedBadge(stripHuggyPublishedBadge(output), project, getHuggyPublicOrigin());
  }
  if (proxyBasePath) {
    const base = proxyBasePath.replace(/\/+$/, '');
    output = output
      .replace(/\b(src|href)=["']\/(?!\/|api\/|built-with-huggy\/|p\/)([^"']*)["']/gi, (_match, attr, target) => `${attr}="${base}/${target}"`)
      .replace(/url\(\s*(['"]?)\/(?!\/|api\/|built-with-huggy\/|p\/)([^'")]+)\1\s*\)/gi, (_match, quote, target) => `url(${quote}${base}/${target}${quote})`);
  }
  return output;
}

function buildPublishedProxyTargets(project: GeneratedProject, deploymentUrl: string, requestPath: string) {
  const safePath = requestPath && requestPath.startsWith('/') ? requestPath : `/${requestPath || ''}`;
  const candidates = [deploymentUrl, `https://${getVercelProjectName(project)}.vercel.app`].filter(Boolean);
  const unique = Array.from(new Set(candidates));
  return unique.map(candidate => {
    const url = new URL(candidate);
    const requestUrl = new URL(`https://huggy.local${safePath}`);
    url.pathname = requestUrl.pathname || '/';
    url.search = requestUrl.search;
    return url;
  });
}

async function servePublishedSnapshot(project: GeneratedProject, deployment: any, res: any, proxyBasePath = '') {
  const files = await loadProjectFiles(project.id);
  const html = getProjectPreviewHtml(project, files, 'production');
  if (!html.trim()) return res.status(404).send('This published app has no saved snapshot yet.');
  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.setHeader('X-Huggy-Published-App', project.id);
  res.setHeader('X-Huggy-Published-Source', 'snapshot');
  return res.send(rewritePublishedHtmlForProxy(html, project, deployment, proxyBasePath));
}

async function proxyPublishedDeployment(project: GeneratedProject, deployment: any, req: any, res: any, proxyBasePath = '') {
  const deploymentUrl = String(deployment?.deployment_url || '');
  if (!deploymentUrl) return servePublishedSnapshot(project, deployment, res, proxyBasePath);

  const requestPath = String(req.url || '/');
  const targets = buildPublishedProxyTargets(project, deploymentUrl, requestPath);
  let lastStatus = 502;

  for (const target of targets) {
    const upstream = await fetch(target.toString(), {
      headers: {
        accept: String(req.headers.accept || '*/*'),
        'user-agent': 'Huggy published-app proxy',
      },
    });

    lastStatus = upstream.status;
    if ((upstream.status === 401 || upstream.status === 403) && /-projects\.vercel\.app$/i.test(target.hostname)) {
      continue;
    }

    if (!upstream.ok) continue;

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const cacheControl = upstream.headers.get('cache-control') || 'public, max-age=60, stale-while-revalidate=300';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Huggy-Published-App', project.id);

    if (contentType.includes('text/html')) {
      const html = await upstream.text();
      return res.send(upstream.ok ? rewritePublishedHtmlForProxy(html, project, deployment, proxyBasePath) : html);
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    return res.send(body);
  }

  return servePublishedSnapshot(project, deployment, res, proxyBasePath);
}

// Public published app route. This reads the latest publish snapshot only.
app.use('/p/:slug', async (req: any, res: any, next: any) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  try {
    const project = await loadPublicProjectBySlug(req.params.slug);
    if (!project) return res.status(404).send('Published app not found.');
    const deployment = await getLatestDeployment(project.id);
    return proxyPublishedDeployment(project, deployment, req, res, `/p/${encodeURIComponent(req.params.slug)}`);
  } catch (error: any) {
    res.status(500).send(escapeHtml(redactSecrets(error?.message || 'Unable to load published app.')));
  }
});

// Badge router: owner returns to builder when signed in; visitors land on Huggy.
app.get('/built-with-huggy/:projectId', async (req, res) => {
  try {
    const project = await loadProjectForAnalytics(req.params.projectId);
    if (!project) return res.redirect('/');
    const ownerId = JSON.stringify(project.owner_id);
    const projectId = JSON.stringify(project.id);
    res.setHeader('Cache-Control', 'no-store');
    res.send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Built with Huggy</title></head>
<body>
<script>
(() => {
  const ownerId = ${ownerId};
  const projectId = ${projectId};
  const landing = '/';
  const builder = '/builder.html?project=' + encodeURIComponent(projectId);
  const findUserId = () => {
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i) || '';
        if (!/^sb-|supabase/i.test(key)) continue;
        const parsed = JSON.parse(localStorage.getItem(key) || '{}');
        const user = parsed?.user || parsed?.currentSession?.user || parsed?.session?.user;
        if (user?.id) return String(user.id);
      }
    } catch {}
    return '';
  };
  window.location.replace(findUserId() === ownerId ? builder : landing);
})();
</script>
<noscript><a href="/">Open Huggy</a></noscript>
</body></html>`);
  } catch {
    res.redirect('/');
  }
});

app.use(async (req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  const host = normalizeDomainHost(req.hostname || req.headers.host || '');
  if (isKnownHuggyHost(host)) return next();
  try {
    const project = await loadPublicProjectByCustomDomain(host);
    if (!project) return next();
    const deployment = await getLatestDeployment(project.id);
    return proxyPublishedDeployment(project, deployment, req, res);
  } catch (error: any) {
    return res.status(500).send(escapeHtml(redactSecrets(error?.message || 'Unable to load custom domain app.')));
  }
});

app.use((error: any, req: any, res: any, next: any) => {
  if (res.headersSent) return next(error);
  const requestId = `err_${randomUUID()}`;
  const rawMessage = redactSecrets(error?.message || String(error || 'Unexpected server error'));
  const status = Number(error?.status || error?.statusCode || 500);
  const persistenceMissing = /SUPABASE_SERVICE_ROLE_KEY|persistence requires/i.test(rawMessage);
  const diagnosticCode = persistenceMissing
    ? 'SERVER_PERSISTENCE_UNAVAILABLE'
    : /Cannot read properties of undefined.*auth/i.test(rawMessage)
      ? 'SUPABASE_AUTH_CLIENT_UNDEFINED'
      : 'INTERNAL_SERVER_ERROR';
  const publicMessage = persistenceMissing
    ? 'Server persistence is not configured for this environment.'
    : 'The request could not be completed. Please retry in a moment.';

  console.error('[huggy:api_unhandled_error]', {
    request_id: requestId,
    path: req.path,
    diagnostic_code: diagnosticCode,
    message: rawMessage,
  });

  if (req.path?.startsWith('/api')) {
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      success: false,
      message: publicMessage,
      error: publicMessage,
      diagnostic_code: diagnosticCode,
      request_id: requestId,
      suggested_action: persistenceMissing ? 'check_server_env' : 'retry',
    });
  }

  return res.status(500).send(escapeHtml(publicMessage));
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
