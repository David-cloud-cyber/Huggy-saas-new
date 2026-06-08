import { apiFetch } from './lib/api';

type JsonRecord = Record<string, any>;

type AdminState = {
  overview: JsonRecord | null;
  users: JsonRecord[];
  projects: JsonRecord[];
  runs: JsonRecord[];
  errors: JsonRecord | null;
  models: JsonRecord | null;
  publish: JsonRecord | null;
  security: JsonRecord | null;
  flags: JsonRecord[];
  loading: boolean;
};

const state: AdminState = {
  overview: null,
  users: [],
  projects: [],
  runs: [],
  errors: null,
  models: null,
  publish: null,
  security: null,
  flags: [],
  loading: true,
};

let allUsers: JsonRecord[] = [];
let allProjects: JsonRecord[] = [];

function qs<T extends HTMLElement = HTMLElement>(selector: string) {
  return document.querySelector<T>(selector);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusClass(value: unknown) {
  const status = String(value || 'unknown').toLowerCase();
  if (/ok|ready|success|completed|published|active|enabled/.test(status)) return 'ok';
  if (/fail|error|blocked|denied|missing|disabled/.test(status)) return 'failed';
  if (/warn|draft|running|pending|unknown|idle/.test(status)) return 'warning';
  return status.replace(/[^a-z0-9_-]/g, '') || 'warning';
}

function pill(value: unknown) {
  const text = String(value || 'unknown');
  return `<span class="status-pill ${statusClass(text)}">${escapeHtml(text)}</span>`;
}

function formatDate(value: unknown) {
  if (!value) return 'Never';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function metric(label: string, value: unknown, note = '') {
  return `
    <article class="admin-card">
      <span class="metric-label">${escapeHtml(label)}</span>
      <strong class="metric-value">${escapeHtml(value)}</strong>
      ${note ? `<span class="metric-note">${escapeHtml(note)}</span>` : ''}
    </article>
  `;
}

function empty(message: string) {
  return `<div class="admin-empty">${escapeHtml(message)}</div>`;
}

function table(headers: string[], rows: string[][]) {
  if (!rows.length) return empty('No data available yet.');
  return `
    <div style="overflow:auto;">
      <table class="admin-table">
        <thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderHealth(rows: JsonRecord[] = []) {
  if (!rows.length) return empty('Health checks are unavailable.');
  return `<div class="health-list">${rows.map(row => `
    <div class="health-row">
      <div><strong>${escapeHtml(row.label)}</strong><br><span>${escapeHtml(row.detail)}</span></div>
      ${pill(row.status)}
    </div>
  `).join('')}</div>`;
}

function renderOverview() {
  const root = qs('#admin-overview');
  if (!root) return;
  const overview = state.overview;
  if (!overview) {
    root.innerHTML = empty('Loading admin overview...');
    return;
  }
  const metrics = overview.metrics || {};
  root.innerHTML = [
    metric('Users', metrics.users ?? 0, `${metrics.active_today ?? 0} active today`),
    metric('Projects', metrics.projects ?? 0, `${metrics.previews_ready ?? 0} previews ready`),
    metric('Run success', `${metrics.success_rate ?? 100}%`, `${metrics.failed_runs ?? 0} failed runs observed`),
    metric('Published', metrics.publish_success ?? 0, 'Successful deployment records'),
    metric('AI requests', metrics.ai_requests ?? 0, 'Recent provider requests'),
    metric('Wallet credits', metrics.wallet_credits ?? 0, 'Total visible wallet balance'),
    `<article class="admin-card wide"><span class="panel-label">System health</span>${renderHealth(overview.health || [])}</article>`,
    `<article class="admin-card"><span class="panel-label">Availability</span>${renderAvailability(overview.availability || {})}</article>`,
    `<article class="admin-card full"><span class="panel-label">Recent failed runs</span>${renderFailedRuns(overview.recent?.failed_runs || [])}</article>`,
  ].join('');
}

function renderAvailability(availability: JsonRecord) {
  const entries = Object.entries(availability);
  if (!entries.length) return empty('No availability data.');
  return `<div class="flag-list">${entries.map(([key, available]) => `
    <div class="flag-row">
      <div><strong>${escapeHtml(key.replace(/_/g, ' '))}</strong><br><span>${available ? 'Connected' : 'Missing or unavailable'}</span></div>
      ${pill(available ? 'ok' : 'warning')}
    </div>
  `).join('')}</div>`;
}

function renderUsers() {
  const root = qs('#admin-users');
  if (!root) return;
  root.innerHTML = table(['User', 'Plan/credits', 'Projects', 'Runs', 'Last sign in', 'Role'], state.users.map(user => [
    `<strong>${escapeHtml(user.email || 'No email')}</strong><br><span>${escapeHtml(user.id)}</span>`,
    `<strong>${escapeHtml(user.wallet?.balance ?? '--')}</strong><br><span>visible credits</span>`,
    escapeHtml(user.project_count ?? 0),
    escapeHtml(user.run_count ?? 0),
    escapeHtml(formatDate(user.last_sign_in_at)),
    pill(user.is_platform_admin ? 'platform_admin' : user.role || 'user'),
  ]));
}

function renderProjects() {
  const root = qs('#admin-projects');
  if (!root) return;
  root.innerHTML = table(['Project', 'Owner', 'Preview', 'Publish', 'Files', 'Updated', 'Action'], state.projects.map(project => [
    `<strong>${escapeHtml(project.name)}</strong><br><span>${escapeHtml(project.id)}</span>`,
    escapeHtml(project.owner_id || '--'),
    pill(project.preview_status),
    pill(project.publish_status || (project.live_url ? 'published' : 'draft')),
    escapeHtml(project.file_count ?? '--'),
    escapeHtml(formatDate(project.updated_at)),
    `<button class="admin-button" data-open-project="${escapeHtml(project.id)}" type="button">Open</button>`,
  ]));
}

function renderFailedRuns(rows: JsonRecord[]) {
  return table(['Request', 'Intent', 'Model', 'Diagnostic', 'When'], rows.map(run => [
    `<strong>${escapeHtml(run.request_id || run.id)}</strong><br><span>${escapeHtml(run.project_id || '--')}</span>`,
    escapeHtml(run.intent || '--'),
    escapeHtml(run.model_id || 'Auto'),
    escapeHtml(run.diagnostic_code || run.suggested_action || '--'),
    escapeHtml(formatDate(run.created_at)),
  ]));
}

function renderRuns() {
  const root = qs('#admin-runs');
  if (!root) return;
  const distributions = state.overview?.distributions || {};
  root.innerHTML = `
    ${metric('Runs observed', state.runs.length, 'Latest 500 agent runs')}
    ${metric('Failed', state.runs.filter(run => run.status === 'failed').length, 'Requires investigation')}
    ${metric('Average duration', averageDuration(state.runs), 'Completed run mean')}
    <article class="admin-card full"><span class="panel-label">Recent runs</span>${table(['Run', 'Status', 'Intent', 'Model', 'Duration', 'Created'], state.runs.slice(0, 80).map(run => [
      `<strong>${escapeHtml(run.request_id || run.id)}</strong><br><span>${escapeHtml(run.project_id || '--')}</span>`,
      pill(run.status),
      escapeHtml(run.intent || '--'),
      escapeHtml(run.model_id || 'Auto'),
      escapeHtml(`${Math.round(Number(run.duration_ms || 0) / 1000)}s`),
      escapeHtml(formatDate(run.created_at)),
    ]))}</article>
    <article class="admin-card full"><span class="panel-label">Intent distribution</span><pre class="support-summary">${escapeHtml(JSON.stringify(distributions.run_intent || {}, null, 2))}</pre></article>
  `;
}

function averageDuration(rows: JsonRecord[]) {
  const durations = rows.map(row => Number(row.duration_ms || 0)).filter(value => value > 0);
  if (!durations.length) return '0s';
  return `${Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length / 1000)}s`;
}

function renderErrors() {
  const root = qs('#admin-errors');
  if (!root) return;
  const failedRuns = state.errors?.errors?.failed_runs || [];
  const runnerFailures = state.errors?.errors?.runner_failures || [];
  root.innerHTML = `
    ${metric('Failed runs', failedRuns.length, 'Recent run-level failures')}
    ${metric('Runner failures', runnerFailures.length, 'Build, preview or QA checks')}
    ${metric('Top diagnostic', topKey(state.errors?.grouped?.diagnostic_code), 'Most frequent issue')}
    <article class="admin-card full"><span class="panel-label">Failed runs</span>${renderFailedRuns(failedRuns.slice(0, 80))}</article>
    <article class="admin-card full"><span class="panel-label">Runner failures</span>${table(['Run', 'Check', 'Severity', 'Message', 'When'], runnerFailures.slice(0, 80).map((row: JsonRecord) => [
      escapeHtml(row.agent_run_id || '--'),
      escapeHtml(row.check_type || '--'),
      pill(row.severity || row.status),
      escapeHtml(row.message || '--'),
      escapeHtml(formatDate(row.created_at)),
    ]))}</article>
  `;
}

function topKey(record: JsonRecord = {}) {
  const entries = Object.entries(record).sort((a, b) => Number(b[1]) - Number(a[1]));
  return entries[0]?.[0] || '--';
}

function renderModels() {
  const root = qs('#admin-models');
  if (!root) return;
  const costs = state.models?.costs || [];
  const providers = state.models?.providers || [];
  const margins = state.models?.margins || [];
  root.innerHTML = `
    ${metric('AI requests', costs.length, 'Recent request rows')}
    ${metric('Provider rows', providers.length, 'Provider usage events')}
    ${metric('Margin rows', margins.length, 'Cost guardrail samples')}
    <article class="admin-card full"><span class="panel-label">AI costs</span>${table(['Model', 'Type', 'Status', 'Project', 'When'], costs.slice(0, 80).map((row: JsonRecord) => [
      escapeHtml(row.model_id || 'Auto'),
      escapeHtml(row.request_type || '--'),
      pill(row.status),
      escapeHtml(row.project_id || '--'),
      escapeHtml(formatDate(row.created_at)),
    ]))}</article>
  `;
}

function renderPublish() {
  const root = qs('#admin-publish');
  if (!root) return;
  const deployments = state.publish?.deployments || [];
  const domains = state.publish?.domains || [];
  root.innerHTML = `
    ${metric('Deployments', deployments.length, 'Recent publish records')}
    ${metric('Domains', domains.length, 'Custom domain records')}
    ${metric('Ready', deployments.filter((row: JsonRecord) => /ready|success|published|completed/i.test(row.status)).length, 'Successful deploys')}
    <article class="admin-card full"><span class="panel-label">Deployments</span>${table(['Deployment', 'Project', 'Status', 'URL', 'When'], deployments.slice(0, 100).map((row: JsonRecord) => [
      escapeHtml(row.id || '--'),
      escapeHtml(row.project_id || '--'),
      pill(row.status),
      row.url ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">${escapeHtml(row.url)}</a>` : '--',
      escapeHtml(formatDate(row.created_at)),
    ]))}</article>
  `;
}

function renderSecurity() {
  const root = qs('#admin-security');
  if (!root) return;
  const findings = state.security?.findings || [];
  const checklist = state.security?.checklist || [];
  root.innerHTML = `
    ${metric('Open findings', state.security?.summary?.open_findings ?? 0, 'Security-related runner findings')}
    ${metric('Projects observed', state.security?.summary?.projects_observed ?? 0, 'Recent projects scanned')}
    ${metric('Admin guard', state.security?.summary?.admin_guard || 'enabled', 'Protected server routes')}
    <article class="admin-card wide"><span class="panel-label">Checklist</span><div class="health-list">${checklist.map((item: JsonRecord) => `
      <div class="health-row"><div><strong>${escapeHtml(item.label)}</strong></div>${pill(item.status)}</div>
    `).join('')}</div></article>
    <article class="admin-card full"><span class="panel-label">Findings</span>${table(['Run', 'Check', 'Severity', 'Message'], findings.slice(0, 80).map((row: JsonRecord) => [
      escapeHtml(row.agent_run_id || '--'),
      escapeHtml(row.check_type || '--'),
      pill(row.severity || row.status),
      escapeHtml(row.message || '--'),
    ]))}</article>
  `;
}

function renderFlags() {
  const root = qs('#admin-flags');
  if (!root) return;
  root.innerHTML = `
    <article class="admin-card full">
      <span class="panel-label">Feature flags</span>
      <div class="flag-list" style="margin-top:12px;">
        ${state.flags.map(flag => `
          <div class="flag-row">
            <div><strong>${escapeHtml(flag.label)}</strong><br><span>${escapeHtml(flag.key)} · ${escapeHtml(flag.rollout)} · risk ${escapeHtml(flag.risk)}</span></div>
            ${pill(flag.enabled ? 'enabled' : 'disabled')}
          </div>
        `).join('')}
      </div>
      <p class="metric-note">Rollout mutation is intentionally read-only until dangerous admin actions are explicitly wired with audit logs.</p>
    </article>
  `;
}

function buildSupportSummary() {
  const overview = state.overview?.metrics || {};
  const failed = state.errors?.errors?.failed_runs?.[0];
  return [
    'Huggy support snapshot',
    `Generated: ${new Date().toISOString()}`,
    `Users: ${overview.users ?? 0}`,
    `Projects: ${overview.projects ?? 0}`,
    `Run success: ${overview.success_rate ?? 100}%`,
    `Failed runs: ${overview.failed_runs ?? 0}`,
    failed ? `Latest failure: ${failed.request_id || failed.id} / ${failed.diagnostic_code || failed.status}` : 'Latest failure: none observed',
    'Secrets: redacted by admin API',
  ].join('\n');
}

function renderSupport() {
  const root = qs('#admin-support');
  if (!root) return;
  root.innerHTML = `<pre class="support-summary">${escapeHtml(buildSupportSummary())}</pre>`;
}

function renderAll() {
  renderOverview();
  renderUsers();
  renderProjects();
  renderRuns();
  renderErrors();
  renderModels();
  renderPublish();
  renderSecurity();
  renderFlags();
  renderSupport();
}

async function loadAdminData() {
  try {
    qs('#admin-overview')!.innerHTML = empty('Loading live admin data...');
    const [overview, users, projects, runs, errors, costs, providers, margins, publish, security, flags] = await Promise.all([
      apiFetch<JsonRecord>('/api/admin/overview'),
      apiFetch<JsonRecord>('/api/admin/users'),
      apiFetch<JsonRecord>('/api/admin/projects'),
      apiFetch<JsonRecord>('/api/admin/runs'),
      apiFetch<JsonRecord>('/api/admin/errors'),
      apiFetch<JsonRecord>('/api/admin/ai-costs'),
      apiFetch<JsonRecord>('/api/admin/provider-usage'),
      apiFetch<JsonRecord>('/api/admin/billing/margins'),
      apiFetch<JsonRecord>('/api/admin/publish'),
      apiFetch<JsonRecord>('/api/admin/security'),
      apiFetch<JsonRecord>('/api/admin/feature-flags'),
    ]);
    state.overview = overview;
    allUsers = users.users || [];
    allProjects = projects.projects || [];
    state.users = allUsers;
    state.projects = allProjects;
    state.runs = runs.runs || [];
    state.errors = errors;
    state.models = { costs: costs.rows || [], providers: providers.rows || [], margins: margins.rows || [], guardrails: margins.guardrails };
    state.publish = publish;
    state.security = security;
    state.flags = flags.flags || [];
    renderAll();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load admin data.';
    const root = qs('#admin-overview');
    if (root) root.innerHTML = `<div class="admin-error">${escapeHtml(message)}</div>`;
  }
}

function bindNavigation() {
  document.querySelectorAll<HTMLButtonElement>('[data-admin-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.adminTab;
      document.querySelectorAll('[data-admin-tab]').forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll<HTMLElement>('[data-section]').forEach(section => section.classList.toggle('active', section.dataset.section === tab));
    });
  });
}

function bindFilters() {
  qs<HTMLInputElement>('#admin-user-search')?.addEventListener('input', event => {
    const value = (event.currentTarget as HTMLInputElement).value.trim().toLowerCase();
    state.users = allUsers.filter(user => !value || String(user.email || '').toLowerCase().includes(value) || String(user.id || '').toLowerCase().includes(value));
    renderUsers();
  });
  qs<HTMLInputElement>('#admin-project-search')?.addEventListener('input', event => {
    const value = (event.currentTarget as HTMLInputElement).value.trim().toLowerCase();
    state.projects = allProjects.filter(project => !value || String(project.name || '').toLowerCase().includes(value) || String(project.id || '').toLowerCase().includes(value) || String(project.owner_id || '').toLowerCase().includes(value));
    renderProjects();
  });
}

function bindActions() {
  qs('#admin-refresh')?.addEventListener('click', () => void loadAdminData());
  qs('#admin-copy-summary')?.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(buildSupportSummary()).catch(() => undefined);
  });
  qs('#admin-build-support-summary')?.addEventListener('click', renderSupport);
  document.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const projectId = target.closest<HTMLElement>('[data-open-project]')?.dataset.openProject;
    if (projectId) window.location.href = `/builder.html?project=${encodeURIComponent(projectId)}`;
  });
  qs('#admin-drawer-close')?.addEventListener('click', () => qs('#admin-drawer')?.classList.remove('open'));
}

function initAdmin() {
  bindNavigation();
  bindFilters();
  bindActions();
  void loadAdminData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}
