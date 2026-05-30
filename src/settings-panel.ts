import { apiFetch } from './lib/api';

type SettingsTab = 'profile' | 'account' | 'appearance' | 'ai-usage' | 'api' | 'danger';

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

let settingsStyleInstalled = false;
let settingsBound = false;
let aiUsageLoaded = false;

const tabAliases: Record<SettingsTab, string> = {
  profile: 'profil',
  account: 'compte',
  appearance: 'apparence',
  'ai-usage': 'ia',
  api: 'api',
  danger: 'danger',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function installSettingsStyle() {
  if (settingsStyleInstalled || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'huggy-settings-panel-style';
  style.textContent = `
    .settings-overlay {
      position: fixed;
      inset: 0;
      z-index: 9000;
      background: rgba(9, 9, 11, .34);
      opacity: 0;
      visibility: hidden;
      backdrop-filter: blur(8px);
    }

    .settings-overlay.open {
      opacity: 1;
      visibility: visible;
    }

    .settings-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 9001;
      display: flex;
      flex-direction: column;
      width: min(620px, 100vw);
      background: var(--bg, #fff);
      color: var(--text, #09090b);
      border-left: 1px solid var(--border, rgba(9,9,11,.16));
      box-shadow: -24px 0 80px rgba(9,9,11,.16);
      transform: translateX(100%);
    }

    .settings-panel.open {
      transform: translateX(0);
    }

    .settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      border-bottom: 1px solid var(--border-light, rgba(9,9,11,.10));
    }

    .settings-header h2 {
      margin: 0;
      font-size: 16px;
      letter-spacing: -.02em;
    }

    .settings-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: 1px solid var(--border, rgba(9,9,11,.16));
      border-radius: 7px;
      background: transparent;
      color: var(--text-sub, #52525b);
      cursor: pointer;
    }

    .settings-tabs {
      display: flex;
      gap: 6px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-light, rgba(9,9,11,.10));
      overflow-x: auto;
    }

    .settings-tab {
      height: 28px;
      border: 1px solid transparent;
      border-radius: 7px;
      padding: 0 10px;
      background: transparent;
      color: var(--text-sub, #52525b);
      cursor: pointer;
      flex: 0 0 auto;
      font-size: 12px;
      font-weight: 750;
    }

    .settings-tab.active {
      border-color: var(--border, rgba(9,9,11,.16));
      background: var(--bg-elevated, #f6f7f9);
      color: var(--text, #09090b);
    }

    .settings-content {
      min-height: 0;
      overflow: auto;
      padding: 16px;
    }

    .tab-panel.hidden {
      display: none !important;
    }

    .settings-card {
      border: 1px solid var(--border, rgba(9,9,11,.16));
      border-radius: 14px;
      background: var(--bg-surface, #fff);
      padding: 14px;
      margin-bottom: 12px;
    }

    .settings-card h3 {
      margin: 0 0 6px;
      font-size: 13px;
      letter-spacing: -.01em;
    }

    .settings-card p {
      margin: 0;
      color: var(--text-sub, #52525b);
      font-size: 12px;
      line-height: 1.55;
    }

    .usage-summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .usage-summary-card {
      border: 1px solid var(--border-light, rgba(9,9,11,.10));
      border-radius: 10px;
      padding: 10px;
      background: var(--bg-elevated, #f6f7f9);
    }

    .usage-summary-label {
      display: block;
      margin-bottom: 6px;
      color: var(--text-sub, #52525b);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .usage-summary-value {
      font-size: 18px;
      font-weight: 850;
      letter-spacing: -.03em;
      font-variant-numeric: tabular-nums;
    }

    .usage-row,
    .model-rate-row {
      border: 1px solid var(--border-light, rgba(9,9,11,.10));
      border-radius: 10px;
      padding: 10px;
      background: var(--bg, #fff);
    }

    .usage-row + .usage-row,
    .model-rate-row + .model-rate-row {
      margin-top: 8px;
    }

    .usage-row-head,
    .model-rate-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .usage-row-title,
    .model-rate-title {
      color: var(--text, #09090b);
      font-size: 12px;
      font-weight: 800;
    }

    .usage-row-meta,
    .model-rate-meta {
      margin-top: 4px;
      color: var(--text-sub, #52525b);
      font-size: 11px;
      line-height: 1.45;
    }

    .usage-credit-pill,
    .model-tier-pill {
      border: 1px solid var(--border, rgba(9,9,11,.16));
      border-radius: 999px;
      padding: 3px 7px;
      background: var(--bg-elevated, #f6f7f9);
      color: var(--text, #09090b);
      font-size: 10px;
      font-weight: 850;
      white-space: nowrap;
    }

    .model-credit-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      margin-top: 10px;
    }

    .model-credit-cell {
      border: 1px solid var(--border-light, rgba(9,9,11,.10));
      border-radius: 8px;
      padding: 7px;
      background: var(--bg-elevated, #f6f7f9);
    }

    .model-credit-cell span {
      display: block;
      margin-bottom: 4px;
      color: var(--text-sub, #52525b);
      font-size: 9px;
      font-weight: 850;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .model-credit-cell strong {
      color: var(--text, #09090b);
      font-size: 11px;
    }

    .usage-empty {
      border: 1px dashed var(--border, rgba(9,9,11,.16));
      border-radius: 10px;
      padding: 12px;
      color: var(--text-sub, #52525b);
      background: var(--bg-elevated, #f6f7f9);
      font-size: 12px;
      line-height: 1.5;
    }

    .settings-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 16px;
      border-top: 1px solid var(--border-light, rgba(9,9,11,.10));
      background: var(--bg, #fff);
    }

    .settings-footer button {
      height: 30px;
      border: 1px solid var(--border, rgba(9,9,11,.16));
      border-radius: 8px;
      padding: 0 12px;
      background: transparent;
      color: var(--text, #09090b);
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }

    .settings-footer .primary {
      background: var(--text, #09090b);
      color: var(--bg, #fff);
      border-color: var(--text, #09090b);
    }

    [data-theme="dark"] .settings-panel {
      box-shadow: -24px 0 80px rgba(0,0,0,.44);
    }

    @media (max-width: 640px) {
      .settings-panel {
        width: 100vw;
      }

      .usage-summary-grid,
      .model-credit-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;
  document.head.appendChild(style);
  settingsStyleInstalled = true;
}

function settingsMarkup() {
  return `
    <div class="settings-header">
      <h2>Settings</h2>
      <button class="settings-close" type="button" data-settings-close aria-label="Close settings">&times;</button>
    </div>
    <div class="settings-tabs" role="tablist" aria-label="Settings">
      <button class="settings-tab active" type="button" data-tab="profil">Profile</button>
      <button class="settings-tab" type="button" data-tab="compte">Account</button>
      <button class="settings-tab" type="button" data-tab="apparence">Appearance</button>
      <button class="settings-tab" type="button" data-tab="ia">AI Usage</button>
      <button class="settings-tab" type="button" data-tab="api">API</button>
      <button class="settings-tab" type="button" data-tab="danger">Danger</button>
    </div>
    <div class="settings-content">
      <div class="tab-panel" id="tab-profil">
        <div class="settings-card">
          <h3>Workspace profile</h3>
          <p>Manage the visible profile details for your Huggy workspace.</p>
        </div>
      </div>
      <div class="tab-panel hidden" id="tab-compte">
        <div class="settings-card">
          <h3>Account</h3>
          <p>Billing, security and session settings for this account.</p>
        </div>
      </div>
      <div class="tab-panel hidden" id="tab-apparence">
        <div class="settings-card">
          <h3>Appearance</h3>
          <p>Huggy uses a clean white light theme by default. Dark mode stays available from the theme toggle.</p>
        </div>
      </div>
      ${aiUsageMarkup()}
      <div class="tab-panel hidden" id="tab-api">
        <div class="settings-card">
          <h3>API</h3>
          <p>Connect API keys from the Database tab when a generated project needs external services.</p>
        </div>
      </div>
      <div class="tab-panel hidden" id="tab-danger">
        <div class="settings-card">
          <h3>Danger zone</h3>
          <p>Destructive actions will ask for confirmation before they run.</p>
        </div>
      </div>
    </div>
    <div class="settings-footer">
      <button type="button" data-settings-close>Cancel</button>
      <button type="button" class="primary" data-settings-close>Save changes</button>
    </div>
  `;
}

function aiUsageMarkup() {
  return `
    <div class="tab-panel hidden" id="tab-ia">
      <div class="settings-card">
        <h3>AI Usage</h3>
        <p>Credits are shown for your account only. Provider costs, margins and internal platform costs are never exposed here.</p>
        <div class="usage-summary-grid">
          <div class="usage-summary-card"><span class="usage-summary-label">Balance</span><strong class="usage-summary-value" id="ai-usage-balance">--</strong></div>
          <div class="usage-summary-card"><span class="usage-summary-label">Monthly</span><strong class="usage-summary-value" id="ai-usage-monthly">--</strong></div>
          <div class="usage-summary-card"><span class="usage-summary-label">Daily promo</span><strong class="usage-summary-value" id="ai-usage-daily">--</strong></div>
          <div class="usage-summary-card"><span class="usage-summary-label">Top-ups</span><strong class="usage-summary-value" id="ai-usage-topups">--</strong></div>
        </div>
      </div>
      <div class="settings-card">
        <h3>History</h3>
        <div id="ai-usage-history"><div class="usage-empty">AI usage history will appear here after your first Plan, Build, Fix or Deploy action.</div></div>
      </div>
      <div class="settings-card">
        <h3>Model credit rates</h3>
        <div id="model-credit-rates"><div class="usage-empty">Model credit rates are loading on demand.</div></div>
      </div>
    </div>
  `;
}

function ensureAiUsageTab(panel: HTMLElement) {
  const tabs = panel.querySelector('.settings-tabs');
  const content = panel.querySelector('.settings-content');
  if (tabs && !tabs.querySelector('[data-tab="ia"]')) {
    tabs.insertAdjacentHTML('beforeend', '<button class="settings-tab" type="button" data-tab="ia">AI Usage</button>');
  }
  if (content && !content.querySelector('#tab-ia')) {
    content.insertAdjacentHTML('beforeend', aiUsageMarkup());
  }
}

export function ensureSettingsPanel() {
  if (typeof document === 'undefined') return null;
  installSettingsStyle();

  let overlay = document.getElementById('settings-overlay') as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    overlay.className = 'settings-overlay';
    document.body.appendChild(overlay);
  }

  let panel = document.getElementById('settings-panel') as HTMLElement | null;
  if (!panel) {
    panel = document.createElement('aside');
    panel.id = 'settings-panel';
    panel.className = 'settings-panel';
    panel.setAttribute('aria-label', 'Settings');
    panel.innerHTML = settingsMarkup();
    document.body.appendChild(panel);
  } else {
    panel.classList.add('settings-panel');
    ensureAiUsageTab(panel);
  }

  bindSettingsPanel();
  return { overlay, panel };
}

function activateSettingsTab(tab: string) {
  const id = tabAliases[tab as SettingsTab] || tab || 'profil';
  document.querySelectorAll<HTMLElement>('#settings-panel .settings-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === id);
  });
  document.querySelectorAll<HTMLElement>('#settings-panel .tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `tab-${id}`);
  });
  if (id === 'ia') void loadAiUsageSettings();
}

export function openSettings(tab: SettingsTab = 'profile') {
  const parts = ensureSettingsPanel();
  if (!parts) return;
  parts.overlay.classList.add('open');
  parts.panel.classList.add('open');
  document.body.style.overflow = 'hidden';
  activateSettingsTab(tabAliases[tab] || tab);
}

export function closeSettings() {
  const overlay = document.getElementById('settings-overlay');
  const panel = document.getElementById('settings-panel');
  overlay?.classList.remove('open');
  panel?.classList.remove('open');
  document.body.style.overflow = '';
}

function bindSettingsPanel() {
  if (settingsBound) return;
  settingsBound = true;
  document.addEventListener('click', event => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.closest('[data-settings-close], #btn-close-settings')) {
      closeSettings();
      return;
    }

    if (target.id === 'settings-overlay') {
      closeSettings();
      return;
    }

    const tab = target.closest<HTMLElement>('#settings-panel .settings-tab');
    if (tab?.dataset.tab) {
      activateSettingsTab(tab.dataset.tab);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSettings();
  });

  (window as any).openSettings = openSettings;
  (window as any).closeSettings = closeSettings;
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
