import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const planDomainLimits = {
  free: 0,
  starter: 1,
  pro: 5,
  studio: 15,
  business: 50,
  enterprise: Number.MAX_SAFE_INTEGER,
};

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
    'access-control-allow-origin': process.env.VITE_APP_URL || '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
  });
  response.end(JSON.stringify(body));
}

let centralAllowedModelsCache;
let runtimeAllowedModelsCache;

function readCentralAllowedModels() {
  if (centralAllowedModelsCache) return centralAllowedModelsCache;
  const source = readFileSync(new URL('../config/ai-models.ts', import.meta.url), 'utf8');
  const match = source.match(/export const AI_ALLOWED_MODELS = \[([\s\S]*?)\] as const/);
  const models = [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  if (models.length === 0) throw new RuntimeApiError('ai_model_config_invalid', 'AI model allowlist could not be loaded from central config.', 500);
  centralAllowedModelsCache = models;
  return centralAllowedModelsCache;
}

function runtimeAllowedModels() {
  if (runtimeAllowedModelsCache) return runtimeAllowedModelsCache;
  const central = readCentralAllowedModels();
  const centralSet = new Set(central);
  const configured = (process.env.AI_ALLOWED_MODELS || '').split(',').map((value) => value.trim()).filter(Boolean);
  const models = configured.length > 0 ? configured : central;
  for (const model of models) {
    if (!centralSet.has(model)) {
      throw new RuntimeApiError('ai_model_config_forbidden', 'AI_ALLOWED_MODELS contains a model outside the central whitelist.', 500, { model });
    }
  }
  runtimeAllowedModelsCache = models;
  return runtimeAllowedModelsCache;
}

function defaultRuntimeModel() {
  return runtimeAllowedModels()[0];
}

async function auditBlockedModelAttempt(supabase, context, requestedModel, reason, source = 'api') {
  const metadata = { requested_model: requestedModel, reason, source };
  console.warn('[ai-model-whitelist] blocked model attempt', metadata);
  if (!supabase || !context?.organizationId) return;
  await supabase.from('ai_blocked_model_audit_logs').insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    requested_model: requestedModel,
    reason,
    source,
  }).throwOnError();
}

async function validateRuntimeAllowedModel(supabase, context, model, source = 'api') {
  if (runtimeAllowedModels().includes(model)) return model;
  await auditBlockedModelAttempt(supabase, context, model, 'not_in_ai_allowed_models', source);
  throw new RuntimeApiError('forbidden_model', 'This OpenRouter model is not allowed by the backend whitelist.', 403, { model });
}

function estimateCredits(model, prompt = '') {
  const baseByTier = model.includes('opus') || model.includes('gpt-5.5-pro') ? 45
    : model.includes('sonnet') || model.includes('gpt-5.5') ? 25
      : model.includes('gemini-3-pro') || model.includes('deepseek') || model.includes('codestral') ? 15
        : model.includes('nano') ? 3
          : 8;
  const estimatedTokens = Math.max(250, Math.ceil(String(prompt).length / 3.8));
  const complexityMultiplier = Math.min(3, Math.max(1, estimatedTokens / 2000));
  const estimatedCredits = Math.ceil(baseByTier * complexityMultiplier);
  return {
    model,
    estimated_tokens: estimatedTokens,
    estimated_credits: estimatedCredits,
    estimated_cost_usd: Number((estimatedCredits * 0.2).toFixed(2)),
    confirmation_required: estimatedCredits >= 25,
  };
}

function normalizeRuntimePath(pathname, body = {}) {
  if (pathname.startsWith('/api/platform/')) return pathname;
  if (pathname === '/api/projects') return '/api/platform/projects';
  if (pathname === '/api/billing') return '/api/platform/billing';
  if (pathname === '/api/ai/estimate') return '/api/platform/ai/estimate';
  const messagesMatch = pathname.match(/^\/api\/projects\/([^/]+)\/messages$/);
  if (messagesMatch) return `/api/platform/projects/${messagesMatch[1]}/chat`;
  const projectActionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/(build|preview|deploy|domains|stream)$/);
  if (projectActionMatch) return `/api/platform/projects/${projectActionMatch[1]}/${projectActionMatch[2]}`;
  if (pathname === '/api/deploy' && body.project_id) return `/api/platform/projects/${body.project_id}/${body.target === 'preview' ? 'preview' : 'deploy'}`;
  if (pathname === '/api/domains' && body.project_id) return `/api/platform/projects/${body.project_id}/domains`;
  return pathname;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new RuntimeApiError('payload_too_large', 'Payload is too large.', 413));
    });
    request.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new RuntimeApiError('invalid_json', 'Request body must be valid JSON.', 400));
      }
    });
    request.on('error', reject);
  });
}

class RuntimeApiError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'RuntimeApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function slugify(value) {
  return String(value || 'app')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'app';
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new RuntimeApiError('missing_configuration', `${name} is not configured on the backend.`, 500, { name });
  return value;
}

function appPublicDomain() {
  return requiredEnv('APP_PUBLIC_DOMAIN');
}

function supabaseAdmin() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authenticate(request, supabase) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new RuntimeApiError('unauthorized', 'Missing Supabase bearer token.', 401);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new RuntimeApiError('unauthorized', 'Invalid Supabase session.', 401);
  return data.user;
}

async function ensureWorkspace(supabase, user) {
  const email = user.email || user.user_metadata?.email || '';
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || 'Utilisateur';
  const { error: profileError } = await supabase.from('users_profile').upsert({ id: user.id, email, display_name: displayName }, { onConflict: 'id' });
  if (profileError) throw profileError;

  const { data: existingMember, error: memberError } = await supabase
    .from('organization_members')
    .select('role, organizations(id,name,slug)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;
  if (existingMember?.organizations?.id) {
    await ensureWallet(supabase, existingMember.organizations.id, 'free');
    return { organization: existingMember.organizations, role: existingMember.role || 'owner' };
  }

  const baseSlug = slugify(displayName || email || user.id);
  const slug = `${baseSlug}-${String(user.id).slice(0, 8)}`;
  const { data: organization, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: `${displayName} Workspace`, slug, created_by: user.id })
    .select('id,name,slug')
    .single();
  if (orgError) throw orgError;

  const { error: insertMemberError } = await supabase.from('organization_members').insert({ organization_id: organization.id, user_id: user.id, role: 'owner' });
  if (insertMemberError) throw insertMemberError;
  await ensureWallet(supabase, organization.id, 'free');
  await audit(supabase, organization.id, user.id, null, 'workspace_bootstrap', { source: 'runtime_api' });
  return { organization, role: 'owner' };
}

async function ensureWallet(supabase, organizationId, planKey) {
  const { error } = await supabase.from('credit_wallets').upsert({
    organization_id: organizationId,
    current_plan_key: planKey,
    plan_credits_balance: 100,
    topup_credits_balance: 0,
    reserved_credits: 0,
    lifetime_credits_granted: 100,
  }, { onConflict: 'organization_id', ignoreDuplicates: true });
  if (error && error.code !== '42P01') throw error;
}

async function reserveCredits(supabase, context, amount, reason, metadata = {}) {
  const { data: wallet, error: walletError } = await supabase
    .from('credit_wallets')
    .select('organization_id,plan_credits_balance,topup_credits_balance,reserved_credits,current_plan_key')
    .eq('organization_id', context.organizationId)
    .maybeSingle();
  if (walletError) throw walletError;
  if (!wallet) {
    await ensureWallet(supabase, context.organizationId, 'free');
    return reserveCredits(supabase, context, amount, reason, metadata);
  }
  const available = Number(wallet.plan_credits_balance || 0) + Number(wallet.topup_credits_balance || 0) - Number(wallet.reserved_credits || 0);
  if (available < amount) throw new RuntimeApiError('insufficient_credits', 'Credit balance is insufficient for this action.', 402, { required: amount, available });

  const { data: reservation, error: reservationError } = await supabase.from('credit_reservations').insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    project_id: context.projectId,
    amount,
    reason,
    metadata,
  }).select('id,amount,status').single();
  if (reservationError) throw reservationError;

  const { error: walletUpdateError } = await supabase
    .from('credit_wallets')
    .update({ reserved_credits: Number(wallet.reserved_credits || 0) + amount, updated_at: new Date().toISOString() })
    .eq('organization_id', context.organizationId);
  if (walletUpdateError) throw walletUpdateError;

  await supabase.from('credit_ledger').insert({
    organization_id: context.organizationId,
    wallet_organization_id: context.organizationId,
    user_id: context.userId,
    project_id: context.projectId,
    amount: -Math.abs(amount),
    reason,
    direction: 'debit',
    source: 'reservation',
    metadata: { ...metadata, reservation_id: reservation.id },
  });
  return reservation;
}

async function finalizeReservation(supabase, context, reservation, actualAmount) {
  if (!reservation?.id) return;
  const { data: wallet } = await supabase.from('credit_wallets').select('*').eq('organization_id', context.organizationId).maybeSingle();
  const reserved = Math.max(0, Number(wallet?.reserved_credits || 0) - Number(reservation.amount || actualAmount || 0));
  const planBalance = Math.max(0, Number(wallet?.plan_credits_balance || 0) - Number(actualAmount || reservation.amount || 0));
  await supabase.from('credit_wallets').update({ reserved_credits: reserved, plan_credits_balance: planBalance, lifetime_credits_used: Number(wallet?.lifetime_credits_used || 0) + Number(actualAmount || reservation.amount || 0), updated_at: new Date().toISOString() }).eq('organization_id', context.organizationId);
  await supabase.from('credit_reservations').update({ status: 'finalized', finalized_at: new Date().toISOString(), actual_cost_usd: Number(actualAmount || reservation.amount || 0) * 0.2 }).eq('id', reservation.id);
}

async function audit(supabase, organizationId, userId, projectId, action, metadata = {}) {
  await supabase.from('audit_logs').insert({ organization_id: organizationId, actor_user_id: userId, project_id: projectId, action, metadata }).throwOnError();
}

function generatedFiles(prompt, assistantContent = '') {
  const safePrompt = String(prompt || 'Generated application').slice(0, 500);
  const summary = String(assistantContent || safePrompt).slice(0, 1000);
  return [
    { path: 'package.json', content: JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { '@vitejs/plugin-react': 'latest', vite: 'latest', react: 'latest', 'react-dom': 'latest' }, devDependencies: {} }, null, 2) },
    { path: 'index.html', content: '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Generated App</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>' },
    { path: 'src/main.jsx', content: `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport './style.css';\n\nfunction App() {\n  return <main className="shell"><section className="hero"><p className="eyebrow">Generated with Huggy</p><h1>${escapeJs(safePrompt)}</h1><p>${escapeJs(summary)}</p><button>Get started</button></section></main>;\n}\n\ncreateRoot(document.getElementById('root')).render(<App />);\n` },
    { path: 'src/style.css', content: 'body{margin:0;font-family:Inter,system-ui,sans-serif;background:#060606;color:#f8f5f0}.shell{min-height:100vh;display:grid;place-items:center;padding:48px}.hero{max-width:860px;border:1px solid rgba(255,255,255,.12);border-radius:28px;padding:48px;background:linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.02))}.eyebrow{color:#93c5fd;text-transform:uppercase;letter-spacing:.16em;font-size:12px}h1{font-size:clamp(36px,8vw,86px);line-height:.92;margin:0 0 24px}p{color:#cbd5e1;font-size:18px;line-height:1.7}button{border:0;border-radius:999px;padding:14px 22px;background:#f8f5f0;color:#060606;font-weight:700}' },
  ];
}

function escapeJs(value) {
  return String(value).replace(/[\\`$]/g, '\\$&').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hash(content) {
  return createHash('sha256').update(content || '').digest('hex');
}

async function getProjectForUser(supabase, projectId, workspace) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('organization_id', workspace.organization.id)
    .is('deleted_at', null)
    .single();
  if (error) throw new RuntimeApiError('project_not_found', 'Project was not found.', 404);
  return data;
}

async function nextVersionNumber(supabase, projectId) {
  const { data, error } = await supabase.from('project_versions').select('version_number').eq('project_id', projectId).order('version_number', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return Number(data?.version_number || 0) + 1;
}

async function persistVersionAndFiles(supabase, context, project, files, label) {
  const versionNumber = await nextVersionNumber(supabase, project.id);
  const manifest = { files: files.map((file) => ({ path: file.path, hash: hash(file.content), size_bytes: file.content.length })) };
  const sourceHash = hash(JSON.stringify(manifest));
  const { data: version, error: versionError } = await supabase.from('project_versions').insert({
    project_id: project.id,
    organization_id: context.organizationId,
    created_by: context.userId,
    version_number: versionNumber,
    label,
    manifest,
    source_hash: sourceHash,
  }).select('*').single();
  if (versionError) throw versionError;

  const rows = files.map((file) => ({
    project_id: project.id,
    organization_id: context.organizationId,
    version_id: version.id,
    path: file.path,
    content: file.content,
    content_hash: hash(file.content),
    size_bytes: Buffer.byteLength(file.content),
    mime_type: file.path.endsWith('.json') ? 'application/json' : file.path.endsWith('.css') ? 'text/css' : file.path.endsWith('.html') ? 'text/html' : 'text/plain',
    is_binary: false,
  }));
  const { error: filesError } = await supabase.from('project_files').insert(rows);
  if (filesError) throw filesError;
  const { error: projectError } = await supabase.from('projects').update({ current_version_id: version.id, status: 'ready', updated_at: new Date().toISOString() }).eq('id', project.id);
  if (projectError) throw projectError;
  return version;
}

async function callOpenRouter(model, messages, supabase, context) {
  await validateRuntimeAllowedModel(supabase, context, model, 'api');
  const apiKey = requiredEnv('OPENROUTER_API_KEY');
  const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const completionsUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const response = await fetch(completionsUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'http-referer': process.env.OPENROUTER_SITE_URL || process.env.VITE_APP_URL || 'https://huggy.local',
      'x-title': process.env.OPENROUTER_APP_NAME || 'Huggy SaaS',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new RuntimeApiError('openrouter_error', 'OpenRouter request failed.', response.status, { status: response.status, error: body?.error?.message || body?.message || 'unknown' });
  const content = body?.choices?.[0]?.message?.content || '';
  const usage = body?.usage || {};
  return { id: body.id, content, usage };
}

function vercelProjectName(project) {
  const prefix = process.env.VERCEL_PROJECT_PREFIX || 'huggy';
  return slugify(`${prefix}-${project.slug || project.name}`);
}

async function vercelRequest(path, init = {}) {
  const token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN;
  if (!token) throw new RuntimeApiError('missing_configuration', 'VERCEL_TOKEN is not configured on the backend.', 500, { name: 'VERCEL_TOKEN' });
  const teamId = process.env.VERCEL_TEAM_ID;
  const separator = path.includes('?') ? '&' : '?';
  const url = `https://api.vercel.com${path}${teamId ? `${separator}teamId=${encodeURIComponent(teamId)}` : ''}`;
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new RuntimeApiError('vercel_error', 'Vercel API request failed.', response.status, { status: response.status, error: body?.error?.message || body?.message || 'unknown' });
  return body;
}

async function ensureVercelProject(supabase, project) {
  if (project.vercel_project_id) return project.vercel_project_id;
  const body = await vercelRequest('/v10/projects', { method: 'POST', body: JSON.stringify({ name: vercelProjectName(project), framework: 'vite' }) });
  await supabase.from('projects').update({ vercel_project_id: body.id, updated_at: new Date().toISOString() }).eq('id', project.id);
  return body.id;
}

async function loadVersionFiles(supabase, projectId, versionId) {
  const query = supabase.from('project_files').select('path,content,size_bytes,is_binary').eq('project_id', projectId).is('deleted_at', null).order('path');
  const { data, error } = versionId ? await query.eq('version_id', versionId) : await query;
  if (error) throw error;
  return (data || []).map((file) => ({ file: file.path, data: file.content || '', encoding: 'utf-8' }));
}

async function loadProjectFileRows(supabase, projectId, versionId) {
  const query = supabase.from('project_files').select('path,content,size_bytes,is_binary').eq('project_id', projectId).is('deleted_at', null).order('path');
  const { data, error } = versionId ? await query.eq('version_id', versionId) : await query;
  if (error) throw error;
  return data || [];
}

function validateBuildFiles(files) {
  const paths = new Set(files.map((file) => file.path));
  const missing = [];
  if (!paths.has('package.json')) missing.push('package.json');
  if (!paths.has('index.html')) missing.push('index.html');
  if (!files.some((file) => /^src\/main\.(jsx|tsx|js|ts)$/.test(file.path))) missing.push('src/main.jsx');
  const packageFile = files.find((file) => file.path === 'package.json');
  if (packageFile?.content) {
    try {
      const packageJson = JSON.parse(packageFile.content);
      if (!packageJson?.scripts?.build) missing.push('package.json:scripts.build');
    } catch {
      missing.push('package.json:valid-json');
    }
  }
  return missing;
}

async function appendBuildLogs(supabase, build, context, rows) {
  const { error } = await supabase.from('build_logs').insert(rows.map((row, index) => ({
    build_job_id: build.id,
    organization_id: context.organizationId,
    project_id: context.projectId,
    sequence: index + 1,
    level: row.level,
    message: row.message,
    metadata: row.metadata || {},
  })));
  if (error) throw error;
}

async function runBuildJob(supabase, context, project) {
  const versionId = project.current_version_id;
  if (!versionId) throw new RuntimeApiError('missing_active_version', 'Project has no active version to build.', 422);
  const { data: build, error } = await supabase.from('build_jobs').insert({
    organization_id: context.organizationId,
    project_id: project.id,
    version_id: versionId,
    status: 'running',
    command: 'npm run build',
    started_at: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;

  const files = await loadProjectFileRows(supabase, project.id, versionId);
  const missing = validateBuildFiles(files);
  const logs = [
    { level: 'info', message: 'Build job started', metadata: { version_id: versionId } },
    { level: 'info', message: `Loaded ${files.length} persisted files from project_files`, metadata: { file_count: files.length } },
    { level: missing.length ? 'error' : 'success', message: missing.length ? `Build validation failed: ${missing.join(', ')}` : 'Build inputs validated for Vercel remote build', metadata: { missing } },
  ];
  await appendBuildLogs(supabase, build, context, logs);

  if (missing.length) {
    await supabase.from('build_jobs').update({ status: 'failed', error_message: `Missing or invalid build inputs: ${missing.join(', ')}`, finished_at: new Date().toISOString() }).eq('id', build.id);
    throw new RuntimeApiError('build_validation_failed', 'Build validation failed before deployment.', 422, { build_id: build.id, missing });
  }

  const { data: finishedBuild, error: updateError } = await supabase.from('build_jobs').update({
    status: 'success',
    artifact_storage_path: `project_files/${project.id}/${versionId}`,
    finished_at: new Date().toISOString(),
  }).eq('id', build.id).select('*').single();
  if (updateError) throw updateError;
  return { build: finishedBuild, logs };
}

async function latestSuccessfulBuild(supabase, project) {
  if (!project.current_version_id) return null;
  const { data, error } = await supabase
    .from('build_jobs')
    .select('*')
    .eq('project_id', project.id)
    .eq('version_id', project.current_version_id)
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createVercelDeployment(supabase, context, project, target) {
  const versionId = project.current_version_id;
  const files = await loadVersionFiles(supabase, project.id, versionId);
  if (files.length === 0) throw new RuntimeApiError('no_project_files', 'Project has no generated files to deploy.', 422);
  const build = await latestSuccessfulBuild(supabase, project) || (await runBuildJob(supabase, context, project)).build;
  const vercelProjectId = await ensureVercelProject(supabase, project);
  const body = await vercelRequest('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: vercelProjectName(project),
      project: vercelProjectId,
      target,
      files,
      projectSettings: { framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'dist' },
    }),
  });
  const url = body.url?.startsWith('http') ? body.url : `https://${body.url}`;
  const status = body.readyState === 'READY' ? 'ready' : body.readyState === 'ERROR' ? 'error' : 'queued';
  const { data: deployment, error } = await supabase.from('deployments').insert({
    project_id: project.id,
    organization_id: context.organizationId,
    version_id: versionId,
    build_job_id: build.id,
    environment: target,
    status,
    provider: 'vercel',
    provider_project_id: vercelProjectId,
    provider_deployment_id: body.id,
    vercel_project_id: vercelProjectId,
    vercel_deployment_id: body.id,
    url,
    preview_url: target === 'preview' ? url : null,
    production_url: target === 'production' ? url : null,
    created_by: context.userId,
    ready_at: status === 'ready' ? new Date().toISOString() : null,
  }).select('*').single();
  if (error) throw error;
  if (target === 'preview') {
    await supabase.from('previews').insert({ organization_id: context.organizationId, project_id: project.id, version_id: versionId, deployment_id: deployment.id, status: status === 'ready' ? 'ready' : status === 'error' ? 'failed' : 'building', url });
  }
  await audit(supabase, context.organizationId, context.userId, project.id, `deploy_${target}`, { deployment_id: deployment.id, url });
  return deployment;
}

function contextFrom(workspace, user, projectId) {
  return { organizationId: workspace.organization.id, userId: user.id, role: workspace.role || 'owner', projectId };
}

export async function handleRuntimeApi(request, response, url) {
  if (!url.pathname.startsWith('/api/platform/') && !url.pathname.startsWith('/api/projects') && !['/api/deploy', '/api/domains', '/api/billing', '/api/ai/estimate'].includes(url.pathname)) return false;
  try {
    const supabase = supabaseAdmin();
    const user = await authenticate(request, supabase);
    const workspace = await ensureWorkspace(supabase, user);
    const body = request.method === 'GET' ? {} : await readBody(request);
    const apiPath = normalizeRuntimePath(url.pathname, body);

    if (request.method === 'POST' && apiPath === '/api/platform/bootstrap') {
      return json(response, 200, { user: { id: user.id, email: user.email }, organization: workspace.organization, role: workspace.role });
    }

    if (request.method === 'GET' && apiPath === '/api/platform/projects') {
      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('organization_id', workspace.organization.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return json(response, 200, { projects: projects || [] });
    }

    if (request.method === 'GET' && apiPath === '/api/platform/billing') {
      const { data: wallet, error } = await supabase.from('credit_wallets').select('*').eq('organization_id', workspace.organization.id).maybeSingle();
      if (error) throw error;
      const { data: subscription } = await supabase.from('subscriptions').select('*').eq('organization_id', workspace.organization.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      return json(response, 200, { wallet, subscription, organization: workspace.organization });
    }

    if (request.method === 'POST' && apiPath === '/api/platform/ai/estimate') {
      const context = contextFrom(workspace, user);
      const model = await validateRuntimeAllowedModel(supabase, context, body.model || defaultRuntimeModel(), body.model ? 'custom' : 'auto');
      return json(response, 200, { estimate: estimateCredits(model, body.prompt || '') });
    }

    if (request.method === 'POST' && apiPath === '/api/platform/projects') {
      const context = contextFrom(workspace, user);
      const reservation = await reserveCredits(supabase, context, 1, 'project_create');
      const name = String(body.name || 'Untitled project').trim().slice(0, 120);
      const slug = `${slugify(name)}-${Date.now().toString(36)}`;
      const { data: project, error } = await supabase.from('projects').insert({ organization_id: context.organizationId, created_by: user.id, name, slug, description: body.description || null, status: 'draft', default_subdomain: `${slug}.${appPublicDomain()}` }).select('*').single();
      if (error) throw error;
      const files = generatedFiles(body.prompt || body.description || name);
      const version = await persistVersionAndFiles(supabase, { ...context, projectId: project.id }, project, files, 'Initial version');
      await runBuildJob(supabase, { ...context, projectId: project.id }, { ...project, current_version_id: version.id });
      await finalizeReservation(supabase, context, reservation, 1);
      await audit(supabase, context.organizationId, user.id, project.id, 'project_create', { version_id: version.id });
      return json(response, 201, { project: { ...project, current_version_id: version.id }, version });
    }

    const singleProjectMatch = apiPath.match(/^\/api\/platform\/projects\/([^/]+)$/);
    if (request.method === 'GET' && singleProjectMatch) {
      const project = await getProjectForUser(supabase, singleProjectMatch[1], workspace);
      const { data: versions } = await supabase.from('project_versions').select('*').eq('project_id', project.id).order('version_number', { ascending: false }).limit(25);
      const { data: files } = await supabase.from('project_files').select('path,size_bytes,mime_type,version_id,updated_at').eq('project_id', project.id).is('deleted_at', null).order('path');
      return json(response, 200, { project, versions: versions || [], files: files || [] });
    }

    const projectMatch = apiPath.match(/^\/api\/platform\/projects\/([^/]+)\/(chat|build|preview|deploy|domains|stream)$/);
    if (!projectMatch) throw new RuntimeApiError('not_found', 'Unknown platform API route.', 404);
    const projectId = projectMatch[1];
    const action = projectMatch[2];
    const project = await getProjectForUser(supabase, projectId, workspace);
    const context = contextFrom(workspace, user, project.id);

    if (request.method === 'POST' && action === 'chat') {
      const model = await validateRuntimeAllowedModel(supabase, context, body.model || defaultRuntimeModel(), body.model ? 'custom' : 'auto');
      const reservation = await reserveCredits(supabase, context, 20, 'prompt_generation', { model });
      const prompt = String(body.prompt || '').trim();
      if (!prompt) throw new RuntimeApiError('prompt_required', 'Prompt is required.', 400);
      const { data: promptRow, error: promptError } = await supabase.from('project_prompts').insert({ organization_id: context.organizationId, project_id: project.id, user_id: user.id, prompt, mode: 'agent' }).select('*').single();
      if (promptError) throw promptError;
      const { data: conversation, error: conversationError } = await supabase.from('conversations').insert({ organization_id: context.organizationId, project_id: project.id, title: prompt.slice(0, 80), created_by: user.id }).select('*').single();
      if (conversationError) throw conversationError;
      const { data: agentRun, error: runError } = await supabase.from('agent_runs').insert({ organization_id: context.organizationId, project_id: project.id, prompt_id: promptRow.id, status: 'running', model_provider: 'openrouter', model_name: model, conversation_id: conversation.id, mode: body.mode || 'generate', objective: prompt, started_at: new Date().toISOString() }).select('*').single();
      if (runError) throw runError;
      await supabase.from('chat_messages').insert([{ organization_id: context.organizationId, project_id: project.id, conversation_id: conversation.id, agent_run_id: agentRun.id, role: 'user', content: prompt, sequence_number: 1, created_by: user.id, completed_at: new Date().toISOString() }, { organization_id: context.organizationId, project_id: project.id, conversation_id: conversation.id, agent_run_id: agentRun.id, role: 'assistant', content: '', sequence_number: 2, created_by: user.id }]);
      await supabase.from('stream_events').insert({ organization_id: context.organizationId, project_id: project.id, conversation_id: conversation.id, agent_run_id: agentRun.id, type: 'agent.run.started', payload: { model, prompt }, visibility: 'public', severity: 'info' });

      const completion = await callOpenRouter(model, [{ role: 'system', content: 'You are Huggy, an expert AI SaaS app generator. Return concise implementation guidance.' }, { role: 'user', content: prompt }], supabase, context);
      const files = generatedFiles(prompt, completion.content);
      const version = await persistVersionAndFiles(supabase, context, project, files, 'AI generated version');
      await supabase.from('chat_messages').update({ content: completion.content || 'Application generated.', status: 'completed', completed_at: new Date().toISOString() }).eq('conversation_id', conversation.id).eq('role', 'assistant');
      await supabase.from('agent_runs').update({ status: 'success', input_tokens: completion.usage?.prompt_tokens || 0, output_tokens: completion.usage?.completion_tokens || 0, finished_at: new Date().toISOString() }).eq('id', agentRun.id);
      await supabase.from('ai_requests').insert({ organization_id: context.organizationId, project_id: project.id, user_id: user.id, agent_run_id: agentRun.id, model_key: model, provider: 'openrouter', openrouter_request_id: completion.id, status: 'success', input_tokens: completion.usage?.prompt_tokens || 0, output_tokens: completion.usage?.completion_tokens || 0, actual_cost_usd: 0, metadata: { reservation_id: reservation.id } });
      await supabase.from('stream_events').insert({ organization_id: context.organizationId, project_id: project.id, conversation_id: conversation.id, agent_run_id: agentRun.id, type: 'agent.run.completed', payload: { version_id: version.id }, visibility: 'public', severity: 'success' });
      await finalizeReservation(supabase, context, reservation, 20);
      return json(response, 200, { conversation, agent_run: agentRun, version, files: files.map((file) => ({ path: file.path, size_bytes: file.content.length })), message: completion.content });
    }

    if (request.method === 'POST' && action === 'build') {
      const reservation = await reserveCredits(supabase, context, 10, 'build_job');
      const { build, logs } = await runBuildJob(supabase, context, project);
      await finalizeReservation(supabase, context, reservation, 10);
      return json(response, 200, { build, logs });
    }

    if (request.method === 'POST' && (action === 'preview' || action === 'deploy')) {
      const target = action === 'preview' ? 'preview' : 'production';
      const reservation = await reserveCredits(supabase, context, target === 'preview' ? 25 : 100, `deploy_${target}`);
      const deployment = await createVercelDeployment(supabase, context, project, target);
      await finalizeReservation(supabase, context, reservation, target === 'preview' ? 25 : 100);
      return json(response, 200, { deployment });
    }

    if (request.method === 'POST' && action === 'domains') {
      const hostname = String(body.hostname || '').toLowerCase().trim();
      if (!hostname || !hostname.includes('.')) throw new RuntimeApiError('invalid_domain', 'A valid custom domain is required.', 400);
      const { data: wallet } = await supabase.from('credit_wallets').select('current_plan_key').eq('organization_id', context.organizationId).maybeSingle();
      const planKey = wallet?.current_plan_key || 'free';
      const { count } = await supabase.from('domains').select('id', { count: 'exact', head: true }).eq('project_id', project.id).eq('type', 'custom_domain').is('deleted_at', null);
      if ((count || 0) >= (planDomainLimits[planKey] ?? 0)) throw new RuntimeApiError('domain_limit_reached', 'Custom domains are available from Starter plan.', 402, { planKey });
      const vercelProjectId = await ensureVercelProject(supabase, project);
      await vercelRequest(`/v10/projects/${encodeURIComponent(vercelProjectId)}/domains`, { method: 'POST', body: JSON.stringify({ name: hostname }) });
      const { data: domain, error } = await supabase.from('domains').insert({ organization_id: context.organizationId, project_id: project.id, hostname, type: 'custom_domain', status: 'pending', provider_domain_id: hostname, vercel_domain_id: hostname, added_by: user.id, created_by: user.id }).select('*').single();
      if (error) throw error;
      await audit(supabase, context.organizationId, user.id, project.id, 'domain_add', { hostname });
      return json(response, 200, { domain, dns: { type: 'CNAME', name: hostname, value: 'cname.vercel-dns.com' } });
    }

    if (request.method === 'GET' && action === 'stream') {
      const { data: events, error } = await supabase.from('stream_events').select('*').eq('project_id', project.id).order('created_at', { ascending: true }).limit(200);
      if (error) throw error;
      const { data: buildLogs } = await supabase.from('build_logs').select('*').eq('project_id', project.id).order('created_at', { ascending: true }).limit(200);
      return json(response, 200, { events: events || [], build_logs: buildLogs || [] });
    }

    throw new RuntimeApiError('method_not_allowed', 'Method is not allowed for this route.', 405);
  } catch (error) {
    const status = error instanceof RuntimeApiError ? error.status : error?.status || 500;
    const code = error instanceof RuntimeApiError ? error.code : error?.code || 'internal_error';
    const message = error instanceof RuntimeApiError ? error.message : error?.message || 'Unexpected backend error.';
    return json(response, status, { error: { code, message, details: error?.details || undefined } });
  }
}
