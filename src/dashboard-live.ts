import { apiFetch } from './lib/api';
import { normalizeAiChatInputs } from './ai-chat-input-normalizer';
import { initHuggyMotion } from './huggy-motion';
import { initProviderModelSelectors } from './model-selector-ui';
import { initPromptInputActions } from './prompt-input-actions';
import { ensureSettingsPanel, openSettings } from './settings-panel';

type ProjectResponse = {
  success: boolean;
  project: {
    id: string;
    name: string;
    slug: string;
    template?: string;
    theme?: string;
    model_id?: string;
    prompt?: string;
    created_at?: string;
  };
};

type ProjectListResponse = {
  success: boolean;
  projects: Array<{
    id: string;
    name: string;
    slug?: string;
    prompt?: string;
    template?: string;
    theme?: string;
    model_id?: string;
    status?: string;
    preview_status?: string;
    created_at?: string;
    updated_at?: string;
  }>;
};

type UserWorkspaceState = {
  last_project_id?: string;
  dashboard_draft_prompt?: string;
  dashboard_selected_mode?: 'plan' | 'build';
  theme?: string;
  last_route?: string;
};

type AiUsageResponse = {
  success: boolean;
  wallet?: {
    balance?: number | null;
    monthly_credits?: number | null;
    daily_promo_credits?: number | null;
    topup_credits?: number | null;
  };
  history?: Array<{
    id: string;
    project_name?: string;
    model_name?: string;
    mode?: string;
    credits_charged?: number;
    status?: string;
    created_at?: string;
  }>;
};

type ModelRateResponse = {
  success: boolean;
  models?: Array<{
    id: string;
    display_name: string;
    tier: string;
    availability: string;
    credits: {
      plan: string;
      build: string;
      fix: string;
      deploy: string;
    };
  }>;
};

let dashboardInitialized = false;
let dashboardWorkspaceTimer: number | null = null;
let dashboardWorkspaceState: UserWorkspaceState | null = null;
let aiUsageLoaded = false;

function getTemplateDescription(template: string): string {
  const labels: Record<string, string> = {
    dashboard: 'analytics dashboard with charts, logs and KPI cards',
    ecommerce: 'e-commerce storefront with catalogue, cart and checkout-ready sections',
    saas: 'AI assistant SaaS with chat, sidebar, billing and project workspace',
    portfolio: 'creative developer portfolio with responsive visual sections',
  };
  return labels[template] || 'modern responsive web application';
}

function selectedFeatures(): string[] {
  return [
    (document.getElementById('features-db') as HTMLInputElement | null)?.checked ? 'Supabase data persistence' : '',
    (document.getElementById('features-auth') as HTMLInputElement | null)?.checked ? 'authentication' : '',
    (document.getElementById('features-export') as HTMLInputElement | null)?.checked ? 'export actions' : '',
    (document.getElementById('features-seo') as HTMLInputElement | null)?.checked ? 'SEO metadata' : '',
  ].filter(Boolean);
}

function setCreateBusy(button: HTMLButtonElement, busy: boolean) {
  button.disabled = busy;
  button.textContent = busy ? 'Creating...' : 'Create Project';
}

function showProjectError(message: string) {
  let status = document.getElementById('new-project-live-status');
  if (!status) {
    status = document.createElement('div');
    status.id = 'new-project-live-status';
    status.setAttribute('role', 'alert');
    status.style.cssText = 'margin-top:10px;color:#fca5a5;font-size:12px;line-height:1.5;';
    document.querySelector('#new-project-modal .modal-content')?.appendChild(status);
  }
  status.textContent = message;
}

function selectedDashboardMode(): 'plan' | 'build' {
  const root = document.querySelector('.prompt-mode') as HTMLElement | null;
  return root?.dataset.promptMode === 'plan' ? 'plan' : 'build';
}

function setDashboardMode(mode: 'plan' | 'build') {
  const selected = mode === 'plan' ? 'plan' : 'build';
  const root = document.querySelector('.prompt-mode') as HTMLElement | null;
  const label = document.querySelector('.prompt-mode-label');
  root?.setAttribute('data-prompt-mode', selected);
  if (label) label.textContent = selected === 'plan' ? 'Plan' : 'Build';
  document.querySelectorAll('[data-prompt-mode-option]').forEach(option => {
    option.classList.toggle('active', (option as HTMLElement).dataset.promptModeOption === selected);
  });
}

function saveDashboardWorkspace(immediate = false) {
  if (dashboardWorkspaceTimer !== null) window.clearTimeout(dashboardWorkspaceTimer);
  const save = async () => {
    const textarea = document.getElementById('ai-textarea') as HTMLTextAreaElement | null;
    try {
      await apiFetch('/api/users/me/workspace-state', {
        method: 'PATCH',
        body: JSON.stringify({
          dashboard_draft_prompt: textarea?.value || '',
          dashboard_selected_mode: selectedDashboardMode(),
          last_route: '/dashboard.html',
        }),
      });
    } catch {
      // Draft persistence should never block dashboard input.
    }
  };
  if (immediate) {
    void save();
    return;
  }
  dashboardWorkspaceTimer = window.setTimeout(save, 1500);
}

function installContinueLastProject(state: UserWorkspaceState | null) {
  if (!state?.last_project_id || document.getElementById('btn-continue-last-project')) return;
  const createSection = document.querySelector('.create-section');
  const subtitle = document.querySelector('.create-subtitle');
  if (!createSection || !subtitle) return;
  const button = document.createElement('button');
  button.id = 'btn-continue-last-project';
  button.type = 'button';
  button.textContent = 'Continue last project';
  button.style.cssText = 'margin:14px auto 18px;display:inline-flex;height:34px;align-items:center;justify-content:center;border:1px solid var(--border);background:var(--bg-elevated);color:var(--text);border-radius:999px;padding:0 14px;font-size:12px;font-weight:750;cursor:pointer;';
  button.addEventListener('click', () => {
    window.location.href = `/builder.html?project=${encodeURIComponent(state.last_project_id || '')}`;
  });
  subtitle.insertAdjacentElement('afterend', button);
}

async function hydrateWorkspaceState() {
  try {
    const response = await apiFetch<{ success: boolean; state: UserWorkspaceState | null }>('/api/users/me/workspace-state');
    dashboardWorkspaceState = response.state || null;
    const textarea = document.getElementById('ai-textarea') as HTMLTextAreaElement | null;
    if (textarea && !textarea.value.trim() && dashboardWorkspaceState?.dashboard_draft_prompt) {
      textarea.value = dashboardWorkspaceState.dashboard_draft_prompt;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (dashboardWorkspaceState?.dashboard_selected_mode) {
      setDashboardMode(dashboardWorkspaceState.dashboard_selected_mode);
    }
    installContinueLastProject(dashboardWorkspaceState);
  } catch {
    dashboardWorkspaceState = null;
  }
}

function bindDashboardWorkspacePersistence() {
  const textarea = document.getElementById('ai-textarea') as HTMLTextAreaElement | null;
  textarea?.addEventListener('input', () => saveDashboardWorkspace());
  document.querySelectorAll('[data-prompt-mode-option]').forEach(option => {
    option.addEventListener('click', () => {
      window.setTimeout(() => saveDashboardWorkspace(true), 0);
    });
  });
  document.getElementById('submit-btn')?.addEventListener('click', () => saveDashboardWorkspace(true), true);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function relativeTime(isoString?: string) {
  if (!isoString) return 'recently';
  const delta = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(delta)) return 'recently';
  const mins = Math.max(0, Math.floor(delta / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function projectAccent(index: number) {
  const colors = ['#8b5cf6', '#22c55e', '#38bdf8', '#f59e0b', '#f472b6'];
  return colors[index % colors.length];
}

function projectDescription(project: ProjectListResponse['projects'][number]) {
  return project.prompt || 'Open the builder to plan, generate and preview this project.';
}

function renderLiveProjects(projects: ProjectListResponse['projects']) {
  const grid = document.querySelector('.projects-grid') as HTMLElement | null;
  const sidebarList = document.getElementById('sidebar-projects-list');
  const countLabel = document.querySelector('.section-label span');
  if (countLabel) countLabel.textContent = `(${projects.length})`;

  if (sidebarList) {
    sidebarList.innerHTML = projects.length
      ? projects.map((project, index) => `
          <button class="nav-project" data-id="${escapeHtml(project.id)}">
            <div class="project-dot" style="background:${projectAccent(index)}"></div>
            <span class="project-nav-name">${escapeHtml(project.name)}</span>
          </button>
        `).join('')
      : `<div class="empty-nav-state" style="padding:10px;font-size:11px;color:var(--text-sub);font-style:italic;">No projects yet</div>`;
    sidebarList.querySelectorAll<HTMLElement>('.nav-project').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        if (id) window.location.href = `/builder.html?project=${encodeURIComponent(id)}`;
      });
    });
  }

  if (!grid) return;
  if (!projects.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
        </div>
        <h3 class="empty-title">Your workspace is quiet</h3>
        <p class="empty-desc">Describe your first idea above or click New Project to open the builder.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = projects.map((project, index) => {
    const status = project.preview_status || project.status || 'ready';
    return `
      <div class="project-card" data-id="${escapeHtml(project.id)}">
        <div class="card-header">
          <div class="card-title-row">
            <div class="project-dot" style="background:${projectAccent(index)}"></div>
            <span class="card-name">${escapeHtml(project.name)}</span>
          </div>
          <span class="status-badge" style="background:var(--success-dim);color:var(--success);border:1px solid rgba(74,222,128,0.2);">${escapeHtml(status)}</span>
        </div>
        <p class="card-desc">${escapeHtml(projectDescription(project))}</p>
        <div class="card-stats">
          <span class="score-badge meta" style="background:var(--bg-elevated);color:var(--text-muted);border:1px solid var(--border);">${escapeHtml(project.model_id || 'Auto')}</span>
          <span class="score-badge meta" style="background:var(--bg-elevated);color:var(--text-muted);border:1px solid var(--border);">Updated ${relativeTime(project.updated_at || project.created_at)}</span>
        </div>
        <div class="card-footer">
          <span class="card-meta">${escapeHtml(project.slug || project.id.slice(0, 8))}</span>
          <button class="btn-open-project" type="button" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;padding:6px 14px;font-size:12px;color:var(--text);">Open Builder</button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll<HTMLElement>('.project-card').forEach(card => {
    card.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('.btn-card-delete')) return;
      const id = card.dataset.id;
      if (id) window.location.href = `/builder.html?project=${encodeURIComponent(id)}`;
    });
  });
}

function hydrateUserIdentity(detail?: any) {
  const user = detail?.user || detail?.detail?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  const name = typeof user?.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()
    ? user.user_metadata.full_name.trim()
    : email.split('@')[0] || 'Workspace';
  const nameEl = document.getElementById('dashboard-user-name');
  const emailEl = document.getElementById('dashboard-user-email');
  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = email || 'Session verified';
}

async function loadLiveProjects() {
  try {
    localStorage.removeItem('huggy-projects');
    localStorage.removeItem('huggy-current-project');
    const response = await apiFetch<ProjectListResponse>('/api/projects');
    renderLiveProjects(response.projects || []);
  } catch (error) {
    const grid = document.querySelector('.projects-grid') as HTMLElement | null;
    if (grid) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3 class="empty-title">Projects unavailable</h3>
          <p class="empty-desc">${escapeHtml(error instanceof Error ? error.message : 'Unable to load projects from Supabase.')}</p>
        </div>
      `;
    }
  }
}

async function loadLiveWallet() {
  const count = document.querySelector('.credits-count');
  const total = document.querySelector('.credits-total');
  try {
    const wallet = await apiFetch<{ success: boolean; balance: number }>('/api/billing/wallet');
    if (count) count.textContent = String(wallet.balance ?? 0);
    if (total) total.textContent = ' credits';
  } catch {
    if (count) count.textContent = '--';
    if (total) total.textContent = ' credits unavailable';
  }
}

function formatCredits(value: unknown) {
  if (value === null || value === undefined || value === '') return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatDate(iso?: string) {
  if (!iso) return 'Recently';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return 'Recently';
  }
}

function renderAiUsage(data: AiUsageResponse, rates: ModelRateResponse) {
  const balance = document.getElementById('ai-usage-balance');
  const monthly = document.getElementById('ai-usage-monthly');
  const daily = document.getElementById('ai-usage-daily');
  const topups = document.getElementById('ai-usage-topups');
  if (balance) balance.textContent = formatCredits(data.wallet?.balance);
  if (monthly) monthly.textContent = formatCredits(data.wallet?.monthly_credits);
  if (daily) daily.textContent = formatCredits(data.wallet?.daily_promo_credits);
  if (topups) topups.textContent = formatCredits(data.wallet?.topup_credits);

  const history = document.getElementById('ai-usage-history');
  if (history) {
    const rows = data.history || [];
    history.innerHTML = rows.length ? rows.map(item => `
      <div class="usage-row">
        <div class="usage-row-head">
          <span class="usage-row-title">${escapeHtml(item.mode || 'AI action')}</span>
          <span class="usage-credit-pill">${escapeHtml(formatCredits(item.credits_charged))} credits</span>
        </div>
        <div class="usage-row-meta">
          ${escapeHtml(item.model_name || 'Auto')} · ${escapeHtml(item.project_name || 'Project')} · ${escapeHtml(item.status || 'completed')} · ${escapeHtml(formatDate(item.created_at))}
        </div>
      </div>
    `).join('') : '<div class="usage-empty">AI usage history will appear here after your first Plan, Build, Fix or Deploy action.</div>';
  }

  const rateList = document.getElementById('model-credit-rates');
  if (rateList) {
    const models = rates.models || [];
    rateList.innerHTML = models.length ? models.map(model => `
      <div class="model-rate-row">
        <div class="model-rate-head">
          <div>
            <div class="model-rate-title">${escapeHtml(model.display_name)}</div>
            <div class="model-rate-meta">${escapeHtml(model.availability === 'all' ? 'Available to all plans' : `${model.availability} plan and above`)}</div>
          </div>
          <span class="model-tier-pill">${escapeHtml(model.tier)}</span>
        </div>
        <div class="model-credit-grid">
          <div class="model-credit-cell"><span>Plan</span><strong>${escapeHtml(model.credits.plan)}</strong></div>
          <div class="model-credit-cell"><span>Build</span><strong>${escapeHtml(model.credits.build)}</strong></div>
          <div class="model-credit-cell"><span>Fix</span><strong>${escapeHtml(model.credits.fix)}</strong></div>
          <div class="model-credit-cell"><span>Deploy</span><strong>${escapeHtml(model.credits.deploy)}</strong></div>
        </div>
      </div>
    `).join('') : '<div class="usage-empty">Model credit rates are unavailable right now.</div>';
  }
}

async function loadAiUsageSettings(force = false) {
  if (aiUsageLoaded && !force) return;
  const history = document.getElementById('ai-usage-history');
  const rateList = document.getElementById('model-credit-rates');
  if (history) history.innerHTML = '<div class="usage-empty">Loading AI usage...</div>';
  if (rateList) rateList.innerHTML = '<div class="usage-empty">Loading model credit rates...</div>';
  try {
    const [usage, rates] = await Promise.all([
      apiFetch<AiUsageResponse>('/api/users/me/ai-usage'),
      apiFetch<ModelRateResponse>('/api/users/me/model-credit-rates'),
    ]);
    renderAiUsage(usage, rates);
    aiUsageLoaded = true;
  } catch (error) {
    if (history) history.innerHTML = `<div class="usage-empty">${escapeHtml(error instanceof Error ? error.message : 'Unable to load AI usage.')}</div>`;
    if (rateList) rateList.innerHTML = '<div class="usage-empty">Model credit rates are unavailable right now.</div>';
  }
}

function bindAiUsageSettings() {
  ensureSettingsPanel();
  document.getElementById('btn-settings')?.addEventListener('click', () => openSettings('profile'));
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    window.setTimeout(() => {
      if (document.querySelector('.settings-tab[data-tab="ia"]')?.classList.contains('active')) {
        void loadAiUsageSettings();
      }
    }, 0);
  });
  document.querySelector('.settings-tab[data-tab="ia"]')?.addEventListener('click', () => {
    void loadAiUsageSettings();
  });
}

function bindLiveProjectCreation() {
  const oldButton = document.getElementById('btn-new-proj-create') as HTMLButtonElement | null;
  if (!oldButton) return;

  const button = oldButton.cloneNode(true) as HTMLButtonElement;
  oldButton.replaceWith(button);

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const nameInput = document.getElementById('new-proj-name') as HTMLInputElement | null;
    const templateSelect = document.getElementById('new-proj-template') as HTMLSelectElement | null;
    const themeSelect = document.getElementById('new-proj-theme') as HTMLSelectElement | null;
    const modelSelect = document.getElementById('new-proj-model') as HTMLSelectElement | null;
    const name = nameInput?.value.trim() || '';

    if (!name) {
      showProjectError('Please enter a valid project name.');
      return;
    }

    const template = templateSelect?.value || 'dashboard';
    const theme = themeSelect?.value || 'light';
    const model = modelSelect?.value || 'auto';
    const features = selectedFeatures();
    const initialPrompt = sessionStorage.getItem('huggy-initial-prompt')?.trim() || localStorage.getItem('huggy-initial-prompt')?.trim() || '';
    const prompt = initialPrompt || `Create a ${getTemplateDescription(template)} named "${name}". Include ${features.join(', ') || 'a polished responsive UI'}.`;

    setCreateBusy(button, true);
    showProjectError('');

    try {
      const response = await apiFetch<ProjectResponse>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name, template, theme, model, prompt, features }),
      });

      sessionStorage.removeItem('huggy-initial-prompt');
      sessionStorage.removeItem('huggy-requested-mode');
      localStorage.removeItem('huggy-initial-prompt');
      window.location.href = `/builder.html?project=${encodeURIComponent(response.project.id)}`;
    } catch (error) {
      showProjectError(error instanceof Error ? error.message : 'Unable to create the project.');
    } finally {
      setCreateBusy(button, false);
    }
  });
}

function initDashboardLive() {
  if (dashboardInitialized) return;
  dashboardInitialized = true;
  initHuggyMotion();
  ensureSettingsPanel();
  normalizeAiChatInputs();
  initPromptInputActions({ persistForBuilder: true });
  initProviderModelSelectors();
  normalizeAiChatInputs();
  hydrateUserIdentity((window as any).huggyAuthReady);
  bindLiveProjectCreation();
  bindDashboardWorkspacePersistence();
  bindAiUsageSettings();
  void hydrateWorkspaceState();
  void loadLiveProjects();
  void loadLiveWallet();
}

window.addEventListener('huggy:auth-ready', event => {
  (window as any).huggyAuthReady = (event as CustomEvent).detail;
  initDashboardLive();
});
if (document.documentElement.dataset.authReady === 'true') initDashboardLive();
