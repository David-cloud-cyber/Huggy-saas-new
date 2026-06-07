import { apiFetch } from './lib/api';
import { refreshVerifiedSession, signOutCurrentDevice } from './lib/supabase-browser';

type SettingsTab = 'profile' | 'account' | 'appearance' | 'ai-usage' | 'api' | 'danger';

type AiUsageResponse = {
  success: boolean;
  wallet?: {
    balance?: number | null;
    monthly_credits?: number | null;
    daily_promo_credits?: number | null;
    topup_credits?: number | null;
    cloud?: {
      balance_usd?: number | null;
      included_balance_usd?: number | null;
      ai_app_balance_usd?: number | null;
      database_storage_gb?: number | null;
      file_storage_gb?: number | null;
      bandwidth_gb?: number | null;
      topup_min_usd?: number | null;
      auto_topup_available?: boolean;
      auto_topup_enabled?: boolean;
    };
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

type AuthMeResponse = {
  success: boolean;
  user?: {
    id?: string;
    email?: string | null;
    role?: string | null;
  };
  plan?: {
    key?: string;
    label?: string;
  };
};

type UserWorkspaceStateResponse = {
  success: boolean;
  state?: {
    theme?: 'light' | 'dark' | null;
    builder_selected_model?: string | null;
    updated_at?: string | null;
  } | null;
};

type SettingsPreferences = {
  profile: {
    displayName: string;
    language: 'auto' | 'fr' | 'en';
    timezone: string;
    role: string;
  };
  appearance: {
    theme: 'system' | 'light' | 'dark';
    density: 'comfortable' | 'compact';
    motion: 'normal' | 'reduced';
    accent: 'huggy-blue' | 'neutral';
  };
  api: {
    webhookUrl: string;
    webhookEvents: string;
  };
};

let settingsStyleInstalled = false;
let settingsBound = false;
let aiUsageLoaded = false;
let currentAuthSummary: AuthMeResponse | null = null;
const SETTINGS_MANAGED_VERSION = '2026-06-07';
const SETTINGS_PREFS_KEY = 'huggy.user.settings.v1';
const SETTINGS_DIRTY_CLASS = 'settings-dirty';

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

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function defaultSettingsPreferences(): SettingsPreferences {
  return {
    profile: {
      displayName: '',
      language: 'auto',
      timezone: defaultTimezone(),
      role: 'founder',
    },
    appearance: {
      theme: 'system',
      density: 'comfortable',
      motion: 'normal',
      accent: 'huggy-blue',
    },
    api: {
      webhookUrl: '',
      webhookEvents: 'publish, rollback, generation_failed',
    },
  };
}

function mergePreferences(value: any): SettingsPreferences {
  const defaults = defaultSettingsPreferences();
  return {
    profile: {
      displayName: String(value?.profile?.displayName || defaults.profile.displayName).slice(0, 80),
      language: ['auto', 'fr', 'en'].includes(value?.profile?.language) ? value.profile.language : defaults.profile.language,
      timezone: String(value?.profile?.timezone || defaults.profile.timezone).slice(0, 80),
      role: String(value?.profile?.role || defaults.profile.role).slice(0, 80),
    },
    appearance: {
      theme: ['system', 'light', 'dark'].includes(value?.appearance?.theme) ? value.appearance.theme : defaults.appearance.theme,
      density: value?.appearance?.density === 'compact' ? 'compact' : 'comfortable',
      motion: value?.appearance?.motion === 'reduced' ? 'reduced' : 'normal',
      accent: value?.appearance?.accent === 'neutral' ? 'neutral' : 'huggy-blue',
    },
    api: {
      webhookUrl: String(value?.api?.webhookUrl || '').slice(0, 320),
      webhookEvents: String(value?.api?.webhookEvents || defaults.api.webhookEvents).slice(0, 180),
    },
  };
}

function loadSettingsPreferences(): SettingsPreferences {
  try {
    return mergePreferences(JSON.parse(localStorage.getItem(SETTINGS_PREFS_KEY) || '{}'));
  } catch {
    return defaultSettingsPreferences();
  }
}

function saveSettingsPreferences(value: SettingsPreferences) {
  localStorage.setItem(SETTINGS_PREFS_KEY, JSON.stringify(value));
}

function resolveThemePreference(theme: SettingsPreferences['appearance']['theme']) {
  if (theme === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function applyAppearancePreferences(value = loadSettingsPreferences()) {
  const theme = resolveThemePreference(value.appearance.theme);
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('huggy-theme', theme);
  document.documentElement.dataset.huggyDensity = value.appearance.density;
  document.documentElement.dataset.huggyMotion = value.appearance.motion;
  document.documentElement.dataset.huggyAccent = value.appearance.accent;
}

function readSettingsForm(): SettingsPreferences {
  const prefs = loadSettingsPreferences();
  const read = (selector: string) => (document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)?.value || '').trim();
  return mergePreferences({
    profile: {
      displayName: read('[data-settings-field="displayName"]'),
      language: read('[data-settings-field="language"]'),
      timezone: read('[data-settings-field="timezone"]'),
      role: read('[data-settings-field="role"]'),
    },
    appearance: {
      theme: document.querySelector<HTMLElement>('[data-settings-theme].active')?.dataset.settingsTheme || prefs.appearance.theme,
      density: document.querySelector<HTMLElement>('[data-settings-density].active')?.dataset.settingsDensity || prefs.appearance.density,
      motion: document.querySelector<HTMLElement>('[data-settings-motion].active')?.dataset.settingsMotion || prefs.appearance.motion,
      accent: document.querySelector<HTMLElement>('[data-settings-accent].active')?.dataset.settingsAccent || prefs.appearance.accent,
    },
    api: {
      webhookUrl: read('[data-settings-field="webhookUrl"]'),
      webhookEvents: read('[data-settings-field="webhookEvents"]'),
    },
  });
}

function setSettingsStatus(message: string, tone: 'idle' | 'saving' | 'success' | 'error' = 'idle') {
  const status = document.querySelector<HTMLElement>('[data-settings-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function markSettingsDirty() {
  const panel = document.getElementById('settings-panel');
  panel?.classList.add(SETTINGS_DIRTY_CLASS);
  setSettingsStatus('Unsaved changes', 'saving');
}

function setSegmentActive(group: string, value: string) {
  document.querySelectorAll<HTMLElement>(`[data-settings-${group}]`).forEach(button => {
    button.classList.toggle('active', button.dataset[`settings${group[0].toUpperCase()}${group.slice(1)}`] === value);
  });
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
      background: var(--bg, #fcfbf8);
      color: var(--text, #1c1c1c);
      border-left: 1px solid var(--border, #eceae4);
      box-shadow: -24px 0 80px rgba(28,28,28,.12);
      transform: translateX(100%);
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition:
        transform var(--motion-panel, 260ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
        opacity var(--motion-normal, 180ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
        visibility 0s linear var(--motion-panel, 260ms);
    }

    .settings-panel.open {
      transform: translateX(0);
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transition:
        transform var(--motion-panel, 260ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
        opacity var(--motion-normal, 180ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
        visibility 0s linear 0s;
    }

    .settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      border-bottom: 1px solid var(--border-light, rgba(236,234,228,.78));
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
      border: 1px solid var(--border, #eceae4);
      border-radius: 7px;
      background: transparent;
      color: var(--text-sub, #77736b);
      cursor: pointer;
    }

    .settings-tabs {
      display: flex;
      gap: 6px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-light, rgba(236,234,228,.78));
      overflow-x: auto;
    }

    .settings-tab {
      height: 28px;
      border: 1px solid transparent;
      border-radius: 7px;
      padding: 0 10px;
      background: transparent;
      color: var(--text-sub, #77736b);
      cursor: pointer;
      flex: 0 0 auto;
      font-size: 12px;
      font-weight: 750;
    }

    .settings-tab.active {
      border-color: var(--border-focus, var(--border, #eceae4));
      background: var(--accent-blue-soft, var(--bg-elevated, #f7f4ed));
      color: var(--accent-blue, var(--text, #1c1c1c));
    }

    .settings-content {
      min-height: 0;
      overflow: auto;
      padding: 16px;
    }

    .settings-title-stack {
      display: grid;
      gap: 4px;
    }

    .settings-title-stack small {
      color: var(--text-sub, #77736b);
      font-size: 11px;
      line-height: 1.4;
    }

    .settings-status {
      display: inline-flex;
      align-items: center;
      height: 24px;
      padding: 0 9px;
      border: 1px solid var(--border, #eceae4);
      border-radius: 999px;
      background: var(--bg-surface, #fffdf8);
      color: var(--text-sub, #77736b);
      font-size: 11px;
      font-weight: 800;
      white-space: nowrap;
    }

    .settings-status[data-tone="saving"] {
      color: var(--accent-blue, #2563eb);
      border-color: color-mix(in srgb, var(--accent-blue, #2563eb) 32%, var(--border, #eceae4));
    }

    .settings-status[data-tone="success"] {
      color: #11845b;
      border-color: rgba(17, 132, 91, .28);
      background: rgba(17, 132, 91, .08);
    }

    .settings-status[data-tone="error"] {
      color: #b42318;
      border-color: rgba(180, 35, 24, .28);
      background: rgba(180, 35, 24, .08);
    }

    .tab-panel.hidden {
      display: none !important;
    }

    .settings-card {
      border: 1px solid var(--border, #eceae4);
      border-radius: 14px;
      background: var(--bg-surface, #fffdf8);
      padding: 14px;
      margin-bottom: 12px;
      transition:
        transform var(--motion-fast, 140ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
        border-color var(--motion-fast, 140ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
        background var(--motion-fast, 140ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
    }

    .settings-card:hover {
      border-color: var(--border-focus, var(--border, #eceae4));
      transform: translateY(-1px);
    }

    .settings-card h3 {
      margin: 0 0 6px;
      font-size: 13px;
      letter-spacing: -.01em;
    }

    .settings-card p {
      margin: 0;
      color: var(--text-sub, #77736b);
      font-size: 12px;
      line-height: 1.55;
    }

    .settings-hero-card {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 14px;
      align-items: center;
      background:
        radial-gradient(circle at 10% 0%, var(--accent-blue-soft, rgba(59,130,246,.14)), transparent 38%),
        var(--bg-surface, #fffdf8);
    }

    .settings-avatar {
      width: 48px;
      height: 48px;
      border-radius: 16px;
      display: grid;
      place-items: center;
      color: var(--bg, #fcfbf8);
      background: var(--accent-blue, #2563eb);
      font-size: 18px;
      font-weight: 900;
      box-shadow: 0 16px 34px rgba(37, 99, 235, .22);
    }

    .settings-plan-badge,
    .settings-mini-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 24px;
      padding: 0 9px;
      border-radius: 999px;
      border: 1px solid var(--border, #eceae4);
      background: var(--bg-elevated, #f7f4ed);
      color: var(--text, #1c1c1c);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .settings-field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 14px;
    }

    .settings-field {
      display: grid;
      gap: 7px;
    }

    .settings-field.full {
      grid-column: 1 / -1;
    }

    .settings-field label,
    .settings-control-label {
      color: var(--text-sub, #77736b);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .settings-field input,
    .settings-field select,
    .settings-field textarea {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--border, #eceae4);
      border-radius: 10px;
      background: var(--bg, #fcfbf8);
      color: var(--text, #1c1c1c);
      padding: 9px 11px;
      outline: none;
      font: inherit;
      font-size: 13px;
      transition:
        border-color var(--motion-fast, 140ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
        box-shadow var(--motion-fast, 140ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
    }

    .settings-field textarea {
      min-height: 72px;
      resize: vertical;
    }

    .settings-field input:focus,
    .settings-field select:focus,
    .settings-field textarea:focus {
      border-color: var(--accent-blue, #2563eb);
      box-shadow: 0 0 0 3px var(--accent-blue-soft, rgba(59,130,246,.14));
    }

    .settings-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 12px 0;
      border-top: 1px solid var(--border-light, rgba(236,234,228,.78));
    }

    .settings-row:first-child {
      border-top: 0;
      padding-top: 0;
    }

    .settings-row strong {
      display: block;
      margin-bottom: 3px;
      color: var(--text, #1c1c1c);
      font-size: 13px;
    }

    .settings-row span,
    .settings-row code {
      color: var(--text-sub, #77736b);
      font-size: 12px;
    }

    .settings-row code {
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      word-break: break-all;
    }

    .settings-action-button,
    .settings-danger-button {
      min-height: 32px;
      border: 1px solid var(--border, #eceae4);
      border-radius: 9px;
      padding: 0 11px;
      background: var(--bg, #fcfbf8);
      color: var(--text, #1c1c1c);
      font-size: 12px;
      font-weight: 850;
      cursor: pointer;
      transition:
        transform var(--motion-fast, 140ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
        background var(--motion-fast, 140ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
    }

    .settings-action-button:hover,
    .settings-danger-button:hover {
      transform: translateY(-1px);
      background: var(--bg-elevated, #f7f4ed);
    }

    .settings-danger-button {
      color: #b42318;
      border-color: rgba(180, 35, 24, .24);
      background: rgba(180, 35, 24, .06);
    }

    .settings-segment {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 10px;
    }

    .settings-segment button {
      min-height: 32px;
      border: 1px solid var(--border, #eceae4);
      border-radius: 999px;
      padding: 0 12px;
      background: var(--bg, #fcfbf8);
      color: var(--text-sub, #77736b);
      font-size: 12px;
      font-weight: 850;
      cursor: pointer;
    }

    .settings-segment button.active {
      border-color: var(--accent-blue, #2563eb);
      background: var(--accent-blue-soft, rgba(59,130,246,.14));
      color: var(--accent-blue, #2563eb);
    }

    .settings-integration-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .settings-integration {
      border: 1px solid var(--border-light, rgba(236,234,228,.78));
      border-radius: 11px;
      padding: 10px;
      background: var(--bg, #fcfbf8);
    }

    .settings-integration strong {
      display: block;
      color: var(--text, #1c1c1c);
      font-size: 12px;
      margin-bottom: 5px;
    }

    .settings-integration span {
      color: var(--text-sub, #77736b);
      font-size: 11px;
      line-height: 1.45;
    }

    .settings-danger-zone {
      border-color: rgba(180, 35, 24, .2);
      background:
        linear-gradient(180deg, rgba(180, 35, 24, .05), transparent 58%),
        var(--bg-surface, #fffdf8);
    }

    .usage-summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .cloud-summary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .usage-summary-card,
    .cloud-summary-card {
      border: 1px solid var(--border-light, rgba(236,234,228,.78));
      border-radius: 10px;
      padding: 10px;
      background: var(--bg-elevated, #f7f4ed);
    }

    .usage-summary-label,
    .cloud-summary-label {
      display: block;
      margin-bottom: 6px;
      color: var(--text-sub, #77736b);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .usage-summary-value,
    .cloud-summary-value {
      color: var(--accent-blue, var(--text, #1c1c1c));
      font-size: 18px;
      font-weight: 850;
      letter-spacing: -.03em;
      font-variant-numeric: tabular-nums;
    }

    .usage-row,
    .model-rate-row {
      border: 1px solid var(--border-light, rgba(236,234,228,.78));
      border-radius: 10px;
      padding: 10px;
      background: var(--bg, #fcfbf8);
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
      color: var(--text, #1c1c1c);
      font-size: 12px;
      font-weight: 800;
    }

    .usage-row-meta,
    .model-rate-meta {
      margin-top: 4px;
      color: var(--text-sub, #77736b);
      font-size: 11px;
      line-height: 1.45;
    }

    .usage-credit-pill,
    .model-tier-pill {
      border: 1px solid var(--border, #eceae4);
      border-radius: 999px;
      padding: 3px 7px;
      background: var(--bg-elevated, #f7f4ed);
      color: var(--text, #1c1c1c);
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
      border: 1px solid var(--border-light, rgba(236,234,228,.78));
      border-radius: 8px;
      padding: 7px;
      background: var(--bg-elevated, #f7f4ed);
    }

    .model-credit-cell span {
      display: block;
      margin-bottom: 4px;
      color: var(--text-sub, #77736b);
      font-size: 9px;
      font-weight: 850;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .model-credit-cell strong {
      color: var(--text, #1c1c1c);
      font-size: 11px;
    }

    .usage-empty {
      border: 1px dashed var(--border, #eceae4);
      border-radius: 10px;
      padding: 12px;
      color: var(--text-sub, #77736b);
      background: var(--bg-elevated, #f7f4ed);
      font-size: 12px;
      line-height: 1.5;
    }

    .settings-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 16px;
      border-top: 1px solid var(--border-light, rgba(236,234,228,.78));
      background: var(--bg, #fcfbf8);
    }

    .settings-footer button {
      height: 30px;
      border: 1px solid var(--border, #eceae4);
      border-radius: 8px;
      padding: 0 12px;
      background: transparent;
      color: var(--text, #1c1c1c);
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }

    .settings-footer .primary {
      background: var(--text, #1c1c1c);
      color: var(--bg, #fcfbf8);
      border-color: var(--text, #1c1c1c);
    }

    [data-theme="dark"] .settings-panel {
      box-shadow: -24px 0 80px rgba(0,0,0,.44);
    }

    @media (max-width: 640px) {
      .settings-panel {
        width: 100vw;
      }

      .usage-summary-grid,
      .cloud-summary-grid,
      .model-credit-grid,
      .settings-field-grid,
      .settings-integration-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .settings-hero-card {
        grid-template-columns: auto 1fr;
      }

      .settings-hero-card .settings-plan-badge {
        grid-column: 1 / -1;
        justify-self: start;
      }
    }

    @media (max-width: 460px) {
      .settings-field-grid,
      .settings-integration-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
  settingsStyleInstalled = true;
}

function settingsMarkup() {
  return `
    <div class="settings-header">
      <div class="settings-title-stack">
        <h2>Settings</h2>
        <small>Profile, plan, preferences, API and safe account controls.</small>
      </div>
      <span class="settings-status" data-settings-status data-tone="idle">Saved</span>
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
        <div class="settings-card settings-hero-card">
          <div class="settings-avatar" data-settings-avatar>H</div>
          <div>
            <h3 data-settings-profile-name>Workspace profile</h3>
            <p data-settings-profile-email>Loading your account...</p>
          </div>
          <span class="settings-plan-badge" data-settings-plan-badge>Free</span>
        </div>
        <div class="settings-card">
          <h3>Personal context</h3>
          <p>These preferences help Huggy answer in the right language, tone and timezone.</p>
          <div class="settings-field-grid">
            <div class="settings-field">
              <label for="settings-display-name">Display name</label>
              <input id="settings-display-name" data-settings-field="displayName" type="text" autocomplete="name" placeholder="Your name">
            </div>
            <div class="settings-field">
              <label for="settings-role">Role</label>
              <select id="settings-role" data-settings-field="role">
                <option value="founder">Founder</option>
                <option value="freelancer">Freelancer</option>
                <option value="agency">Agency</option>
                <option value="developer">Developer</option>
                <option value="marketer">Marketer</option>
              </select>
            </div>
            <div class="settings-field">
              <label for="settings-language">Huggy language</label>
              <select id="settings-language" data-settings-field="language">
                <option value="auto">Auto-detect</option>
                <option value="fr">French</option>
                <option value="en">English</option>
              </select>
            </div>
            <div class="settings-field">
              <label for="settings-timezone">Timezone</label>
              <input id="settings-timezone" data-settings-field="timezone" type="text" placeholder="Africa/Douala">
            </div>
          </div>
        </div>
      </div>
      <div class="tab-panel hidden" id="tab-compte">
        <div class="settings-card">
          <h3>Account</h3>
          <p>Your identity, plan and current browser session.</p>
          <div class="settings-row">
            <div><strong>Email</strong><span data-settings-account-email>Loading...</span></div>
            <span class="settings-mini-badge" data-settings-account-plan>Free</span>
          </div>
          <div class="settings-row">
            <div><strong>User ID</strong><code data-settings-account-id>--</code></div>
            <button type="button" class="settings-action-button" data-settings-action="copy-user-id">Copy</button>
          </div>
          <div class="settings-row">
            <div><strong>Session</strong><span data-settings-session-state>Verified when Settings opened.</span></div>
            <button type="button" class="settings-action-button" data-settings-action="refresh-session">Refresh</button>
          </div>
          <div class="settings-row">
            <div><strong>Billing</strong><span>Upgrade, portal and invoices stay protected behind authenticated billing endpoints.</span></div>
            <button type="button" class="settings-action-button" data-settings-action="open-pricing">Plans</button>
          </div>
        </div>
      </div>
      <div class="tab-panel hidden" id="tab-apparence">
        <div class="settings-card">
          <h3>Appearance</h3>
          <p>Adjust the interface without refreshing the builder. Motion respects reduced-motion preferences.</p>
          <div class="settings-control-label">Theme</div>
          <div class="settings-segment">
            <button type="button" data-settings-theme="system">System</button>
            <button type="button" data-settings-theme="light">Light</button>
            <button type="button" data-settings-theme="dark">Dark</button>
          </div>
          <div class="settings-control-label" style="margin-top:16px;">Density</div>
          <div class="settings-segment">
            <button type="button" data-settings-density="comfortable">Comfortable</button>
            <button type="button" data-settings-density="compact">Compact</button>
          </div>
          <div class="settings-control-label" style="margin-top:16px;">Motion</div>
          <div class="settings-segment">
            <button type="button" data-settings-motion="normal">Normal</button>
            <button type="button" data-settings-motion="reduced">Reduced</button>
          </div>
          <div class="settings-control-label" style="margin-top:16px;">Accent</div>
          <div class="settings-segment">
            <button type="button" data-settings-accent="huggy-blue">Huggy blue</button>
            <button type="button" data-settings-accent="neutral">Neutral</button>
          </div>
        </div>
      </div>
      ${aiUsageMarkup()}
      <div class="tab-panel hidden" id="tab-api">
        <div class="settings-card">
          <h3>API</h3>
          <p>Safe integration controls. Secrets stay server-side or inside project Database secrets.</p>
          <div class="settings-integration-grid">
            <div class="settings-integration"><strong>Supabase</strong><span>Platform auth and generated app backend stay separated.</span></div>
            <div class="settings-integration"><strong>Vercel</strong><span>Publish runs through backend tokens only.</span></div>
            <div class="settings-integration"><strong>OpenRouter</strong><span>AI provider keys are never shown in the browser.</span></div>
            <div class="settings-integration"><strong>Project secrets</strong><span>Per-app keys are managed from Database when a project needs them.</span></div>
          </div>
        </div>
        <div class="settings-card">
          <h3>Webhook preferences</h3>
          <p>Store your preferred webhook endpoint locally until account-level webhooks are enabled server-side.</p>
          <div class="settings-field-grid">
            <div class="settings-field full">
              <label for="settings-webhook-url">Webhook URL</label>
              <input id="settings-webhook-url" data-settings-field="webhookUrl" type="url" placeholder="https://example.com/huggy-webhook">
            </div>
            <div class="settings-field full">
              <label for="settings-webhook-events">Events</label>
              <input id="settings-webhook-events" data-settings-field="webhookEvents" type="text" placeholder="publish, rollback, generation_failed">
            </div>
          </div>
        </div>
      </div>
      <div class="tab-panel hidden" id="tab-danger">
        <div class="settings-card settings-danger-zone">
          <h3>Danger zone</h3>
          <p>Only reversible local actions are exposed here. Account deletion and billing changes must go through protected backend flows.</p>
          <div class="settings-row">
            <div><strong>Reset UI preferences</strong><span>Restores theme, motion, density and profile preferences on this device.</span></div>
            <button type="button" class="settings-danger-button" data-settings-action="reset-preferences">Reset</button>
          </div>
          <div class="settings-row">
            <div><strong>Clear local drafts</strong><span>Removes cached builder prompts and temporary local settings from this browser.</span></div>
            <button type="button" class="settings-danger-button" data-settings-action="clear-drafts">Clear</button>
          </div>
          <div class="settings-row">
            <div><strong>Sign out this device</strong><span>Ends the local Supabase session and returns to authentication.</span></div>
            <button type="button" class="settings-danger-button" data-settings-action="sign-out">Sign out</button>
          </div>
        </div>
      </div>
    </div>
    <div class="settings-footer">
      <button type="button" data-settings-close>Cancel</button>
      <button type="button" class="primary" data-settings-save>Save changes</button>
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
        <h3>Huggy Cloud</h3>
        <p>Cloud balance runs published apps: hosting, database, file storage, realtime, bandwidth and deployed AI app usage.</p>
        <div class="cloud-summary-grid">
          <div class="cloud-summary-card"><span class="cloud-summary-label">Cloud balance</span><strong class="cloud-summary-value" id="cloud-balance">--</strong></div>
          <div class="cloud-summary-card"><span class="cloud-summary-label">AI app balance</span><strong class="cloud-summary-value" id="cloud-ai-app">--</strong></div>
          <div class="cloud-summary-card"><span class="cloud-summary-label">Top-up from</span><strong class="cloud-summary-value" id="cloud-topup-min">--</strong></div>
          <div class="cloud-summary-card"><span class="cloud-summary-label">Database</span><strong class="cloud-summary-value" id="cloud-db-storage">--</strong></div>
          <div class="cloud-summary-card"><span class="cloud-summary-label">Files</span><strong class="cloud-summary-value" id="cloud-file-storage">--</strong></div>
          <div class="cloud-summary-card"><span class="cloud-summary-label">Bandwidth</span><strong class="cloud-summary-value" id="cloud-bandwidth">--</strong></div>
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

function setFieldValue(selector: string, value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
  if (field) field.value = value;
}

function initialsFor(name: string, email: string) {
  const source = (name || email || 'Huggy').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function updateSettingsForm(prefs = loadSettingsPreferences()) {
  setFieldValue('[data-settings-field="displayName"]', prefs.profile.displayName);
  setFieldValue('[data-settings-field="language"]', prefs.profile.language);
  setFieldValue('[data-settings-field="timezone"]', prefs.profile.timezone);
  setFieldValue('[data-settings-field="role"]', prefs.profile.role);
  setFieldValue('[data-settings-field="webhookUrl"]', prefs.api.webhookUrl);
  setFieldValue('[data-settings-field="webhookEvents"]', prefs.api.webhookEvents);
  setSegmentActive('theme', prefs.appearance.theme);
  setSegmentActive('density', prefs.appearance.density);
  setSegmentActive('motion', prefs.appearance.motion);
  setSegmentActive('accent', prefs.appearance.accent);
  applyAppearancePreferences(prefs);
}

function renderAuthSummary(auth: AuthMeResponse | null, prefs = loadSettingsPreferences()) {
  const email = auth?.user?.email || 'Signed in';
  const userId = auth?.user?.id || '--';
  const displayName = prefs.profile.displayName || email.split('@')[0] || 'Huggy user';
  const planLabel = auth?.plan?.label || auth?.plan?.key || 'Free';

  const avatar = document.querySelector<HTMLElement>('[data-settings-avatar]');
  const profileName = document.querySelector<HTMLElement>('[data-settings-profile-name]');
  const profileEmail = document.querySelector<HTMLElement>('[data-settings-profile-email]');
  const planBadge = document.querySelector<HTMLElement>('[data-settings-plan-badge]');
  const accountEmail = document.querySelector<HTMLElement>('[data-settings-account-email]');
  const accountId = document.querySelector<HTMLElement>('[data-settings-account-id]');
  const accountPlan = document.querySelector<HTMLElement>('[data-settings-account-plan]');

  if (avatar) avatar.textContent = initialsFor(displayName, email);
  if (profileName) profileName.textContent = displayName;
  if (profileEmail) profileEmail.textContent = email;
  if (planBadge) planBadge.textContent = String(planLabel);
  if (accountEmail) accountEmail.textContent = email;
  if (accountId) accountId.textContent = userId;
  if (accountPlan) accountPlan.textContent = String(planLabel);
}

async function hydrateSettingsPanel() {
  const prefs = loadSettingsPreferences();
  updateSettingsForm(prefs);
  renderAuthSummary(currentAuthSummary, prefs);
  setSettingsStatus('Loading account...', 'saving');
  try {
    const [auth, state] = await Promise.all([
      apiFetch<AuthMeResponse>('/api/auth/me'),
      apiFetch<UserWorkspaceStateResponse>('/api/users/me/workspace-state').catch(() => null),
    ]);
    const merged = mergePreferences({
      ...prefs,
      appearance: {
        ...prefs.appearance,
        theme: prefs.appearance.theme === 'system' && state?.state?.theme ? state.state.theme : prefs.appearance.theme,
      },
    });
    updateSettingsForm(merged);
    currentAuthSummary = auth;
    renderAuthSummary(currentAuthSummary, merged);
    setSettingsStatus('Saved', 'success');
    document.getElementById('settings-panel')?.classList.remove(SETTINGS_DIRTY_CLASS);
  } catch (error) {
    renderAuthSummary(currentAuthSummary, prefs);
    setSettingsStatus(error instanceof Error ? error.message : 'Account unavailable', 'error');
  }
}

async function saveSettingsFromPanel() {
  const prefs = readSettingsForm();
  saveSettingsPreferences(prefs);
  applyAppearancePreferences(prefs);
  setSettingsStatus('Saving...', 'saving');
  try {
    const theme = resolveThemePreference(prefs.appearance.theme);
    await apiFetch('/api/users/me/workspace-state', {
      method: 'PATCH',
      body: JSON.stringify({ theme }),
    }).catch(() => null);
    renderAuthSummary(currentAuthSummary, prefs);
    document.getElementById('settings-panel')?.classList.remove(SETTINGS_DIRTY_CLASS);
    setSettingsStatus('Saved', 'success');
  } catch (error) {
    setSettingsStatus(error instanceof Error ? error.message : 'Could not save settings', 'error');
  }
}

async function copyText(value: string, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(value);
    setSettingsStatus(label, 'success');
  } catch {
    setSettingsStatus('Copy failed', 'error');
  }
}

function resetLocalPreferences() {
  if (!window.confirm('Reset local Huggy preferences on this device?')) return;
  localStorage.removeItem(SETTINGS_PREFS_KEY);
  const prefs = defaultSettingsPreferences();
  saveSettingsPreferences(prefs);
  updateSettingsForm(prefs);
  setSettingsStatus('Preferences reset', 'success');
}

function clearLocalDrafts() {
  if (!window.confirm('Clear local builder drafts and temporary local settings?')) return;
  [
    'huggy-dashboard-draft',
    'huggy-builder-draft',
    'huggy-design-settings',
    'huggy-media-settings',
    'huggy-last-builder-project-id',
  ].forEach(key => localStorage.removeItem(key));
  setSettingsStatus('Local drafts cleared', 'success');
}

async function handleSettingsAction(action: string) {
  if (action === 'copy-user-id') {
    await copyText(document.querySelector<HTMLElement>('[data-settings-account-id]')?.textContent || '', 'User ID copied');
    return;
  }
  if (action === 'refresh-session') {
    setSettingsStatus('Refreshing session...', 'saving');
    const session = await refreshVerifiedSession();
    const sessionState = document.querySelector<HTMLElement>('[data-settings-session-state]');
    if (sessionState) sessionState.textContent = session ? 'Session refreshed just now.' : 'Session could not be refreshed.';
    setSettingsStatus(session ? 'Session refreshed' : 'Refresh failed', session ? 'success' : 'error');
    return;
  }
  if (action === 'open-pricing') {
    window.location.href = '/pricing.html';
    return;
  }
  if (action === 'reset-preferences') {
    resetLocalPreferences();
    return;
  }
  if (action === 'clear-drafts') {
    clearLocalDrafts();
    return;
  }
  if (action === 'sign-out') {
    if (!window.confirm('Sign out on this device?')) return;
    await signOutCurrentDevice();
    window.location.href = '/auth.html';
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
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
  }
  overlay.classList.add('settings-overlay');
  overlay.dataset.huggySettingsManaged = SETTINGS_MANAGED_VERSION;
  overlay.setAttribute('aria-hidden', overlay.classList.contains('open') ? 'false' : 'true');

  let panel = document.getElementById('settings-panel') as HTMLElement | null;
  if (!panel) {
    panel = document.createElement('aside');
    panel.id = 'settings-panel';
    panel.className = 'settings-panel';
    panel.setAttribute('aria-label', 'Settings');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = settingsMarkup();
    document.body.appendChild(panel);
  } else {
    panel.classList.add('settings-panel');
    panel.setAttribute('aria-hidden', panel.classList.contains('open') ? 'false' : 'true');
  }
  panel.dataset.huggySettingsManaged = SETTINGS_MANAGED_VERSION;
  panel.setAttribute('aria-label', 'Settings');

  const hasManagedMarkup =
    panel.dataset.huggySettingsManaged === SETTINGS_MANAGED_VERSION &&
    Boolean(panel.querySelector('[data-settings-close]')) &&
    Boolean(panel.querySelector('[data-settings-status]')) &&
    Boolean(panel.querySelector('.settings-content')) &&
    Boolean(panel.querySelector('#tab-ia'));

  if (!hasManagedMarkup) {
    panel.innerHTML = settingsMarkup();
    aiUsageLoaded = false;
  } else {
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
  void hydrateSettingsPanel();
  parts.overlay.classList.add('open');
  parts.panel.classList.add('open');
  parts.overlay.setAttribute('aria-hidden', 'false');
  parts.panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  activateSettingsTab(tabAliases[tab] || tab);
}

export function closeSettings() {
  const overlay = document.getElementById('settings-overlay');
  const panel = document.getElementById('settings-panel');
  overlay?.classList.remove('open');
  panel?.classList.remove('open');
  overlay?.setAttribute('aria-hidden', 'true');
  panel?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function bindSettingsPanel() {
  (window as any).openSettings = openSettings;
  (window as any).closeSettings = closeSettings;
  (window as any).ensureSettingsPanel = ensureSettingsPanel;

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
      return;
    }

    const segment = target.closest<HTMLElement>('#settings-panel [data-settings-theme], #settings-panel [data-settings-density], #settings-panel [data-settings-motion], #settings-panel [data-settings-accent]');
    if (segment) {
      const group = segment.dataset.settingsTheme ? 'theme'
        : segment.dataset.settingsDensity ? 'density'
          : segment.dataset.settingsMotion ? 'motion'
            : 'accent';
      const value = segment.dataset.settingsTheme || segment.dataset.settingsDensity || segment.dataset.settingsMotion || segment.dataset.settingsAccent || '';
      setSegmentActive(group, value);
      applyAppearancePreferences(readSettingsForm());
      markSettingsDirty();
      return;
    }

    const action = target.closest<HTMLElement>('#settings-panel [data-settings-action]');
    if (action?.dataset.settingsAction) {
      void handleSettingsAction(action.dataset.settingsAction);
      return;
    }

    if (target.closest('#settings-panel [data-settings-save]')) {
      void saveSettingsFromPanel();
      return;
    }
  });

  document.addEventListener('input', event => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('#settings-panel [data-settings-field]')) return;
    markSettingsDirty();
    const prefs = readSettingsForm();
    renderAuthSummary(currentAuthSummary, prefs);
  });

  document.addEventListener('change', event => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('#settings-panel [data-settings-field]')) return;
    markSettingsDirty();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSettings();
  });
}

function formatCredits(value: unknown) {
  if (value === null || value === undefined || value === '') return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatUsd(value: unknown) {
  if (value === null || value === undefined || value === '') return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `$${number.toFixed(number % 1 === 0 ? 0 : 2)}`;
}

function formatGb(value: unknown) {
  if (value === null || value === undefined || value === '') return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${number % 1 === 0 ? number.toFixed(0) : number.toFixed(2)} GB`;
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

  const cloud = data.wallet?.cloud;
  const cloudBalance = document.getElementById('cloud-balance');
  const cloudAiApp = document.getElementById('cloud-ai-app');
  const cloudTopupMin = document.getElementById('cloud-topup-min');
  const cloudDbStorage = document.getElementById('cloud-db-storage');
  const cloudFileStorage = document.getElementById('cloud-file-storage');
  const cloudBandwidth = document.getElementById('cloud-bandwidth');
  if (cloudBalance) cloudBalance.textContent = formatUsd(cloud?.balance_usd);
  if (cloudAiApp) cloudAiApp.textContent = formatUsd(cloud?.ai_app_balance_usd);
  if (cloudTopupMin) cloudTopupMin.textContent = cloud?.topup_min_usd ? formatUsd(cloud.topup_min_usd) : 'Included only';
  if (cloudDbStorage) cloudDbStorage.textContent = formatGb(cloud?.database_storage_gb);
  if (cloudFileStorage) cloudFileStorage.textContent = formatGb(cloud?.file_storage_gb);
  if (cloudBandwidth) cloudBandwidth.textContent = formatGb(cloud?.bandwidth_gb);

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
