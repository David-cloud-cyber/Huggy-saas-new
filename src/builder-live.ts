import { apiFetch, apiStream } from './lib/api';
import {
  consumePendingPromptAttachments,
  initPromptInputActions,
  storePendingPromptAttachments,
  type PendingPromptAttachment,
} from './prompt-input-actions';

type GeneratedFile = {
  path: string;
  content: string;
  language?: string;
};

type ProjectPayload = {
  success: boolean;
  project: {
    id: string;
    name: string;
    slug?: string;
    model_id?: string;
    preview_status?: string;
  };
  files: GeneratedFile[];
  messages?: Array<{ role: string; content: string; intent?: string }>;
  events?: Array<{ event_type: string; message: string; sequence_number: number; payload?: any }>;
  workspace_state?: WorkspaceState | null;
  preview?: {
    status: string;
    html: string;
  };
  summary?: string;
  text?: string;
  model?: string;
  intent?: { intent: string };
  diff?: { created: string[]; modified: string[]; deleted: string[]; summary: string };
  errors?: Array<{ message: string; file?: string }>;
};

type WorkspaceState = {
  draft_prompt?: string;
  selected_mode?: 'plan' | 'build';
  selected_model?: string;
  active_tab?: 'preview' | 'code' | 'database' | 'analysis';
  sidebar_width?: number;
  preview_device?: PreviewDevice;
};

type UserWorkspaceState = {
  last_project_id?: string;
  builder_draft_prompt?: string;
  builder_selected_mode?: 'plan' | 'build';
  builder_selected_model?: string;
  builder_active_tab?: 'preview' | 'code' | 'database' | 'analysis';
  builder_preview_device?: PreviewDevice;
};

type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

type AiModel = {
  id: string;
  display_name: string;
  tier?: string;
  provider?: string;
  description?: string;
  plan_minimum?: string;
  badges?: {
    new?: boolean;
    fast?: boolean;
    premium?: boolean;
  };
  locked?: boolean;
  capabilities?: Record<string, unknown>;
};

type AiModelProviderGroup = {
  provider: string;
  meta: {
    label: string;
    color: string;
    textColor: string;
    icon: string;
  };
  models: AiModel[];
};

type AnalysisPayload = {
  current_visitors: number;
  metrics: {
    visitors: number;
    pageviews: number;
    views_per_visit: number;
    visit_duration_seconds: number;
    bounce_rate: number;
  };
  timeseries: Array<{ time: string; visitors: number; pageviews: number }>;
  sources: Array<{ source: string; visitors: number }>;
  pages: Array<{ page: string; visitors: number }>;
  countries: Array<{ country_code: string; country_name: string; visitors: number }>;
  devices: Array<{ device: 'Mobile' | 'Desktop' | 'Tablet' | 'Unknown'; visitors: number; percentage: number }>;
  seo?: {
    score: number;
    recommendations: string[];
    checks: Array<{ key: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }>;
    preview?: {
      title?: string;
      description?: string;
      h1?: string;
      ogTitle?: string;
      structuredData?: boolean;
    };
  };
};

let currentProjectId = '';
let currentFiles: GeneratedFile[] = [];
let currentPreviewHtml = '';
let isGenerating = false;
let lastPlan = '';
let lastBuildSessionId = '';
let activeAbort: AbortController | null = null;
let selectedChatMode: 'plan' | 'build' = 'build';
let selectedModelId = 'auto';
let selectedPreviewDevice: PreviewDevice = 'desktop';
let currentProjectName = 'Untitled app';
let initialBuilderHandoff: { prompt: string; mode: 'plan' | 'build' } | null = null;
let analysisPollTimer: number | null = null;
let analysisRange = '30d';
let projectWorkspaceState: WorkspaceState | null = null;
let userWorkspaceState: UserWorkspaceState | null = null;
let workspaceSaveTimer: number | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('project') || '';
}

function getInitialBuilderHandoff() {
  if (initialBuilderHandoff) return initialBuilderHandoff;
  const sessionPrompt = sessionStorage.getItem('huggy-initial-prompt')?.trim() || '';
  const legacyPrompt = localStorage.getItem('huggy-initial-prompt')?.trim() || '';
  const rawMode = sessionStorage.getItem('huggy-requested-mode');
  initialBuilderHandoff = {
    prompt: sessionPrompt || legacyPrompt,
    mode: rawMode === 'plan' ? 'plan' : 'build',
  };
  sessionStorage.removeItem('huggy-initial-prompt');
  sessionStorage.removeItem('huggy-requested-mode');
  localStorage.removeItem('huggy-initial-prompt');
  return initialBuilderHandoff;
}

function getInitialDashboardPrompt() {
  return getInitialBuilderHandoff().prompt;
}

function getInitialDashboardMode() {
  return getInitialBuilderHandoff().mode;
}

function selectedModel() {
  return selectedModelId || 'auto';
}

function displayProjectName(value?: string) {
  const clean = String(value || '').trim();
  return clean || 'Untitled app';
}

function projectInitial(value?: string) {
  const clean = displayProjectName(value).replace(/[^a-zA-Z0-9]/g, '');
  return (clean[0] || 'H').toUpperCase();
}

function setProjectNameDisplay(value?: string) {
  currentProjectName = displayProjectName(value);
  const name = document.getElementById('project-name');
  const menuTitle = document.getElementById('project-menu-title');
  const avatar = document.getElementById('project-menu-avatar');
  const input = document.getElementById('project-name-input') as HTMLInputElement | null;
  if (name) name.textContent = currentProjectName;
  if (menuTitle) menuTitle.textContent = currentProjectName;
  if (avatar) avatar.textContent = projectInitial(currentProjectName);
  if (input && document.activeElement !== input) input.value = currentProjectName;
}

function activeBuilderView(): 'preview' | 'code' | 'database' | 'analysis' {
  const active = document.querySelector('.sub-nav-tab.active')?.id || '';
  if (active.includes('code')) return 'code';
  if (active.includes('database')) return 'database';
  if (active.includes('analysis')) return 'analysis';
  return 'preview';
}

function normalizePreviewDevice(value: unknown): PreviewDevice {
  return value === 'tablet' || value === 'mobile' ? value : 'desktop';
}

function setPreviewDevice(device: PreviewDevice, persist = true) {
  selectedPreviewDevice = normalizePreviewDevice(device);
  const panel = document.getElementById('screen-layout-preview') as HTMLElement | null;
  if (panel) panel.dataset.previewDevice = selectedPreviewDevice;
  document.querySelectorAll<HTMLButtonElement>('[data-preview-device-option]').forEach(button => {
    const active = button.dataset.previewDeviceOption === selectedPreviewDevice;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (persist) scheduleWorkspaceSave({ preview_device: selectedPreviewDevice });
}

function bindPreviewDeviceToggle() {
  setPreviewDevice(selectedPreviewDevice, false);
  document.querySelectorAll<HTMLButtonElement>('[data-preview-device-option]').forEach(button => {
    if (button.dataset.boundPreviewDevice === 'true') return;
    button.dataset.boundPreviewDevice = 'true';
    button.addEventListener('click', () => {
      setPreviewDevice(normalizePreviewDevice(button.dataset.previewDeviceOption));
    });
  });
}

function scheduleWorkspaceSave(patch: Partial<WorkspaceState> = {}, immediate = false) {
  if (workspaceSaveTimer !== null) window.clearTimeout(workspaceSaveTimer);
  const save = async () => {
    const input = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
    const body = {
      draft_prompt: input?.value || '',
      selected_mode: selectedChatMode,
      selected_model: selectedModelId,
      active_tab: activeBuilderView(),
      preview_device: selectedPreviewDevice,
      ...patch,
    };
    try {
      if (currentProjectId) {
        await apiFetch(`/api/projects/${encodeURIComponent(currentProjectId)}/workspace-state`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/users/me/workspace-state', {
          method: 'PATCH',
          body: JSON.stringify({
            builder_draft_prompt: body.draft_prompt,
            builder_selected_mode: body.selected_mode,
            builder_selected_model: body.selected_model,
            builder_active_tab: body.active_tab,
            builder_preview_device: body.preview_device,
            last_route: '/builder.html?new=1',
          }),
        });
      }
    } catch {
      // Draft persistence must never block typing or generation.
    }
  };
  if (immediate) {
    void save();
    return;
  }
  workspaceSaveTimer = window.setTimeout(save, 1500);
}

function applySidebarWidthPreference(width?: number) {
  const body = document.querySelector('.workspace-body') as HTMLElement | null;
  const sidebar = document.querySelector('.sidebar-pane') as HTMLElement | null;
  if (!body || !sidebar || !width || window.matchMedia('(max-width: 760px)').matches) return;
  const next = Math.min(520, Math.max(280, Number(width || 380)));
  body.style.gridTemplateColumns = `${next}px minmax(0, 1fr)`;
  body.style.setProperty('--huggy-sidebar-width', `${next}px`);
  const handle = document.getElementById('huggy-sidebar-resizer') as HTMLElement | null;
  if (handle) handle.style.left = `${next - 4}px`;
}

function syncModelLabelFromSelection() {
  const label = document.getElementById('current-model-label');
  const options = Array.from(document.querySelectorAll<HTMLElement>('[data-model-id]'));
  const selected = options.find(option => (option.dataset.modelId || 'auto') === selectedModelId);
  if (label) label.textContent = selected?.dataset.modelName || (selectedModelId === 'auto' ? 'Auto' : selectedModelId);
  options.forEach(option => option.classList.toggle('active', (option.dataset.modelId || 'auto') === selectedModelId));
}

function applyWorkspaceState(state?: WorkspaceState | null) {
  if (!state) return;
  projectWorkspaceState = state;
  if (state.selected_mode) setChatMode(state.selected_mode);
  if (state.selected_model) {
    selectedModelId = state.selected_model;
    syncModelLabelFromSelection();
  }
  if (state.preview_device) setPreviewDevice(normalizePreviewDevice(state.preview_device), false);
  if (state.sidebar_width) {
    localStorage.setItem('huggy-sidebar-width', String(state.sidebar_width));
    applySidebarWidthPreference(state.sidebar_width);
  }
  const handoff = getInitialBuilderHandoff();
  const input = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
  const submit = document.getElementById('chat-submit-btn') as HTMLButtonElement | null;
  if (input && !handoff.prompt && !input.value.trim() && state.draft_prompt) {
    input.value = state.draft_prompt;
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    submit?.classList.add('active');
  }
}

function chatScroll() {
  return document.getElementById('sidebar-scroll-area');
}

function ensureInlineBlockHost() {
  let host = document.getElementById('chat-inline-blocks');
  if (host) return host;
  const inputRow = document.querySelector('.chat-input-row');
  host = document.createElement('div');
  host.id = 'chat-inline-blocks';
  host.style.cssText = 'display:grid;gap:8px;padding:0 24px 8px;';
  inputRow?.parentElement?.insertBefore(host, inputRow);
  return host;
}

function clearInlineBlocks() {
  const host = document.getElementById('chat-inline-blocks');
  if (host) host.innerHTML = '';
}

function appendMessage(kind: 'user' | 'assistant' | 'system', body: string) {
  const scroll = chatScroll();
  if (!scroll) return null;

  const card = document.createElement('div');
  card.className = `message-card message-card-${kind}`;
  card.innerHTML = `
    <p class="msg-body-paragraph" style="white-space:pre-wrap;"></p>
  `;
  const paragraph = card.querySelector('.msg-body-paragraph');
  if (paragraph) paragraph.textContent = body;
  scroll.appendChild(card);
  scroll.scrollTop = scroll.scrollHeight;
  return card;
}

function updateMessage(card: HTMLElement | null, body: string) {
  const paragraph = card?.querySelector('.msg-body-paragraph');
  if (paragraph) paragraph.textContent = body;
}

function addInlineAction(card: HTMLElement | null, label: string, action: () => void) {
  if (!card) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = 'margin-top:10px;height:30px;border:1px solid var(--border);background:var(--text);color:var(--bg);border-radius:7px;padding:0 10px;font-size:11px;font-weight:700;cursor:pointer;';
  button.addEventListener('click', action);
  card.appendChild(button);
}

function positionProjectMenu() {
  const trigger = document.getElementById('project-combo-trigger') as HTMLElement | null;
  const panel = document.getElementById('project-menu-panel') as HTMLElement | null;
  if (!trigger || !panel) return;
  const rect = trigger.getBoundingClientRect();
  const maxLeft = window.innerWidth - Math.min(390, window.innerWidth - 24) - 12;
  panel.style.left = `${Math.max(12, Math.min(rect.left, maxLeft))}px`;
  panel.style.top = `${Math.min(rect.bottom + 10, window.innerHeight - 80)}px`;
}

function closeProjectMenu() {
  const panel = document.getElementById('project-menu-panel');
  const trigger = document.getElementById('project-combo-trigger');
  panel?.classList.remove('open');
  panel?.setAttribute('aria-hidden', 'true');
  trigger?.setAttribute('aria-expanded', 'false');
}

async function loadProjectMenuCredits() {
  const status = document.getElementById('project-menu-credit-status');
  const fill = document.getElementById('project-menu-credit-fill') as HTMLElement | null;
  if (status) status.textContent = 'View credit usage in Settings.';
  if (fill) fill.style.width = '100%';
}

function openProjectMenu() {
  const panel = document.getElementById('project-menu-panel');
  const trigger = document.getElementById('project-combo-trigger');
  if (!panel || !trigger) return;
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    closeProjectMenu();
    return;
  }
  setProjectNameDisplay(currentProjectName);
  positionProjectMenu();
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  trigger.setAttribute('aria-expanded', 'true');
  void loadProjectMenuCredits();
}

function validateProjectName(value: string) {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (clean.length < 2) return { ok: false, value: clean, error: 'Use at least 2 characters.' };
  if (clean.length > 80) return { ok: false, value: clean.slice(0, 80), error: 'Use 80 characters or fewer.' };
  return { ok: true, value: clean, error: '' };
}

async function saveProjectNameFromMenu() {
  const input = document.getElementById('project-name-input') as HTMLInputElement | null;
  const status = document.getElementById('project-name-status');
  const button = document.getElementById('project-name-save') as HTMLButtonElement | null;
  const validation = validateProjectName(input?.value || '');
  if (!validation.ok) {
    if (status) status.textContent = validation.error;
    return;
  }
  if (!currentProjectId) {
    setProjectNameDisplay(validation.value);
    if (status) status.textContent = 'Name saved for the next project.';
    return;
  }
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving';
    }
    const response = await apiFetch<{ success: boolean; project: { name: string; slug?: string } }>(`/api/projects/${encodeURIComponent(currentProjectId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: validation.value }),
    });
    setProjectNameDisplay(response.project?.name || validation.value);
    if (status) status.textContent = 'Project name saved.';
  } catch (error) {
    if (status) status.textContent = error instanceof Error ? error.message : 'Unable to save project name.';
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Save';
    }
  }
}

function bindProjectMenu() {
  const trigger = document.getElementById('project-combo-trigger');
  if (!trigger || trigger.dataset.boundProjectMenu === 'true') return;
  trigger.dataset.boundProjectMenu = 'true';
  trigger.addEventListener('click', event => {
    event.preventDefault();
    openProjectMenu();
  });
  document.getElementById('project-menu-dashboard')?.addEventListener('click', () => {
    window.location.href = '/dashboard.html';
  });
  document.getElementById('project-menu-upgrade')?.addEventListener('click', () => {
    closeProjectMenu();
    (document.querySelector('.btn-upgrade') as HTMLButtonElement | null)?.click();
  });
  document.getElementById('project-menu-free-credits')?.addEventListener('click', () => {
    showMiniModal('Get free credits', '<p>Free credit campaigns are not configured yet. Upgrade or buy credits to continue building without interruption.</p>', () => {});
  });
  document.getElementById('project-menu-settings')?.addEventListener('click', () => {
    showMiniModal('Project settings', '<p>Project settings are controlled from this menu for now. Rename your app here, then manage secrets in Database.</p>', () => {});
  });
  document.getElementById('project-name-save')?.addEventListener('click', () => void saveProjectNameFromMenu());
  document.getElementById('project-name-input')?.addEventListener('keydown', event => {
    if ((event as KeyboardEvent).key === 'Enter') void saveProjectNameFromMenu();
  });
  document.addEventListener('click', event => {
    const panel = document.getElementById('project-menu-panel');
    if (!panel?.classList.contains('open')) return;
    if (panel.contains(event.target as Node) || trigger.contains(event.target as Node)) return;
    closeProjectMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeProjectMenu();
  });
  window.addEventListener('resize', positionProjectMenu);
}

function setPreview(html: string, status = 'ready') {
  currentPreviewHtml = html;
  const frame = document.getElementById('preview-iframe-element') as HTMLIFrameElement | null;
  if (frame) frame.srcdoc = html;
  setPreviewDevice(selectedPreviewDevice, false);

  activateBuilderView('preview');

  const address = document.querySelector('.preview-address-glow span:last-child');
  if (address) address.textContent = `${status}.huggy.local / ${currentProjectId.slice(0, 8)}`;
}

function renderFiles(files: GeneratedFile[]) {
  currentFiles = files;
  const tree = document.querySelector('.explorer-tree-scroll');
  if (tree) {
    tree.innerHTML = '';
    if (!files.length) {
      tree.innerHTML = `
        <div class="code-empty-state" style="margin:8px;">
          <h3>No files yet</h3>
          <p>Use Build to generate project files. Real files from your backend will appear here.</p>
        </div>
      `;
    }
    files.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = `tree-file${index === 0 ? ' selected' : ''}`;
      item.setAttribute('data-file', file.path);
      item.innerHTML = `<span class="tree-file-icon">File</span><span>${escapeHtml(file.path)}</span>`;
      item.addEventListener('click', () => selectFile(file.path));
      tree.appendChild(item);
    });
  }
  if (files[0]) {
    selectFile(files.find(file => file.path === 'index.html')?.path || files[0].path);
    return;
  }
  const label = document.getElementById('open-file-tab-label');
  if (label) label.textContent = 'No file selected';
  const code = document.getElementById('code-content-view-panel');
  if (code) {
    code.innerHTML = '<div class="code-empty-state"><h3>No source file loaded</h3><p>Generated files will be loaded from the project once Huggy receives them from the backend.</p></div>';
  }
}

function selectFile(filePath: string) {
  document.querySelectorAll('.tree-file').forEach(item => item.classList.toggle('selected', item.getAttribute('data-file') === filePath));
  const label = document.getElementById('open-file-tab-label');
  if (label) label.textContent = filePath;

  const file = currentFiles.find(item => item.path === filePath);
  const code = document.getElementById('code-content-view-panel');
  if (!code || !file) return;

  const lines = file.content.split('\n').slice(0, 600);
  code.innerHTML = lines
    .map((line, index) => `<div class="editor-line-row"><span class="editor-line-number">${index + 1}</span><span class="editor-line-content">${escapeHtml(line) || '&nbsp;'}</span></div>`)
    .join('');
}

function ensureToolbar() {
  const nav = document.querySelector('.sub-nav-right');
  if (!nav || document.getElementById('btn-live-cancel')) return;

  const style = 'height:28px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:7px;padding:0 10px;font-size:11px;cursor:pointer;';
  nav.insertAdjacentHTML('afterbegin', `
    <button id="btn-live-cancel" type="button" style="${style}display:none;">Cancel</button>
  `);

  document.getElementById('btn-live-cancel')?.addEventListener('click', cancelBuild);
  document.getElementById('action-download-zip')?.addEventListener('click', exportCode);
}

function setBusy(busy: boolean) {
  isGenerating = busy;
  const cancel = document.getElementById('btn-live-cancel') as HTMLButtonElement | null;
  if (cancel) cancel.style.display = busy ? 'inline-flex' : 'none';
}

function renderTierColor(tier = 'Standard') {
  if (/premium/i.test(tier)) return '#c084fc';
  if (/pro/i.test(tier)) return '#60a5fa';
  if (/economy/i.test(tier)) return '#34d399';
  return '#a1a1aa';
}

function ensureBuilderModelSelectorStyle() {
  if (document.getElementById('huggy-builder-model-selector-style')) return;
  const style = document.createElement('style');
  style.id = 'huggy-builder-model-selector-style';
  style.textContent = `
    .chat-input-row {
      --chat-action-height: 34px;
      --chat-action-radius: 999px;
      --chat-action-font: 11px;
    }
    .chat-input-row #btn-chat-mode,
    .chat-input-row .huggy-builder-model-trigger {
      height: var(--chat-action-height) !important;
      min-height: var(--chat-action-height) !important;
      border-radius: var(--chat-action-radius) !important;
      font-size: var(--chat-action-font) !important;
      align-items: center !important;
    }
    .huggy-builder-model-trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-width: min(230px, 38vw);
      padding: 0 11px;
      border-radius: 999px;
      border: 1px solid var(--border);
      font-size: 11px;
      color: var(--text-muted);
      user-select: none;
      position: relative;
      transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms cubic-bezier(0.22, 1, 0.36, 1);
      cursor: pointer;
      background: var(--bg-input);
      flex: 0 1 auto;
      white-space: nowrap;
    }
    .huggy-builder-model-trigger:hover,
    .huggy-builder-model-trigger[aria-expanded="true"] {
      border-color: var(--border-focus, var(--border));
      background: var(--accent-hover, var(--bg-panel));
      color: var(--text);
      transform: translateY(-1px);
    }
    .huggy-builder-model-trigger .model-label-prefix {
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 9px;
      opacity: 0.62;
      padding-right: 8px;
      border-right: 1px solid var(--border);
    }
    .huggy-builder-model-trigger .provider-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 3px rgba(9,9,11,.08);
      flex: 0 0 auto;
    }
    .huggy-builder-model-trigger #current-model-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 650;
      color: var(--text);
    }
    .huggy-builder-model-trigger #chevron-icon {
      flex: 0 0 auto;
      transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .huggy-builder-model-trigger[aria-expanded="true"] #chevron-icon {
      transform: rotate(180deg);
    }
    .huggy-model-dropdown {
      position: fixed;
      width: 302px;
      max-width: calc(100vw - 24px);
      max-height: min(420px, calc(100vh - 36px));
      overflow: visible;
      border: 1px solid var(--border);
      background: var(--bg-surface);
      color: var(--text);
      border-radius: 16px;
      padding: 8px;
      box-shadow: 0 18px 54px rgba(0,0,0,.20), 0 4px 16px rgba(0,0,0,.10);
      display: none;
      z-index: 3000;
      backdrop-filter: blur(18px);
    }
    .huggy-model-dropdown.open {
      display: block;
    }
    .huggy-builder-provider-list {
      display: grid;
      gap: 6px;
    }
    .huggy-auto-model-option,
    .huggy-builder-provider-card {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--border);
      background: var(--bg-input);
      color: var(--text);
      border-radius: 10px;
      padding: 7px 8px;
      display: flex;
      align-items: center;
      gap: 9px;
      text-align: left;
      cursor: pointer;
      transition: background 160ms cubic-bezier(0.22,1,0.36,1), border-color 160ms cubic-bezier(0.22,1,0.36,1), transform 160ms cubic-bezier(0.34,1.56,0.64,1);
    }
    .huggy-auto-model-option:hover,
    .huggy-auto-model-option.active,
    .huggy-builder-provider-card:hover,
    .huggy-builder-provider-card.active,
    .huggy-builder-provider-card.open {
      background: var(--accent-hover, rgba(9,9,11,.08));
      border-color: var(--border-focus, var(--border));
    }
    .huggy-builder-provider-card.open {
      transform: translateX(2px);
    }
    .huggy-provider-icon {
      width: 24px;
      height: 24px;
      border-radius: 7px;
      background: var(--provider-color);
      color: var(--provider-text);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 850;
      line-height: 1;
      flex: 0 0 auto;
    }
    .huggy-provider-card-main {
      min-width: 0;
      display: grid;
      gap: 1px;
      flex: 1 1 auto;
    }
    .huggy-provider-name {
      color: var(--text);
      font-size: 12px;
      font-weight: 750;
      line-height: 1.2;
    }
    .huggy-provider-sub {
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .huggy-provider-expand-btn {
      width: 26px;
      height: 26px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-muted);
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 160ms cubic-bezier(0.22,1,0.36,1), color 160ms cubic-bezier(0.22,1,0.36,1), transform 220ms cubic-bezier(0.34,1.56,0.64,1);
    }
    .huggy-provider-expand-btn:hover,
    .huggy-provider-expand-btn.open {
      background: var(--bg-panel, var(--bg-input));
      color: var(--text);
    }
    .huggy-provider-expand-btn.open {
      transform: rotate(90deg);
    }
    .huggy-builder-model-panel {
      position: absolute;
      left: calc(100% + 8px);
      top: 0;
      width: 296px;
      max-height: min(430px, 70vh);
      border: 1px solid var(--border);
      background: var(--bg-surface);
      color: var(--text);
      border-radius: 16px;
      box-shadow: 0 18px 54px rgba(0,0,0,.22), 0 4px 16px rgba(0,0,0,.10);
      opacity: 0;
      transform: translateX(-8px) scale(.97);
      pointer-events: none;
      overflow: hidden;
      z-index: 3200;
      transition: opacity 180ms cubic-bezier(0,0,0.2,1), transform 260ms cubic-bezier(0.34,1.56,0.64,1);
    }
    .huggy-builder-model-panel.visible {
      opacity: 1;
      transform: translateX(0) scale(1);
      pointer-events: auto;
    }
    .huggy-model-list-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 11px 12px 8px;
      border-bottom: 1px solid var(--border);
    }
    .huggy-model-list-title {
      font-size: 10px;
      font-weight: 850;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .huggy-model-list-count {
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
    }
    .huggy-model-list-scroll {
      max-height: 360px;
      overflow-y: auto;
      padding: 6px;
      display: grid;
      gap: 4px;
    }
    .huggy-builder-model-item {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--text);
      border-radius: 10px;
      padding: 9px 10px;
      display: grid;
      gap: 4px;
      text-align: left;
      cursor: pointer;
      position: relative;
      animation: huggy-builder-model-enter 220ms cubic-bezier(0.34,1.56,0.64,1) both;
      transition: background 150ms cubic-bezier(0.22,1,0.36,1), transform 150ms cubic-bezier(0.34,1.56,0.64,1);
    }
    .huggy-builder-model-item:hover {
      background: var(--accent-hover, rgba(9,9,11,.08));
      transform: translateX(2px);
    }
    .huggy-builder-model-item.selected {
      background: var(--accent-hover, rgba(9,9,11,.10));
    }
    .huggy-builder-model-item.selected::before {
      content: "";
      position: absolute;
      left: 0;
      top: 22%;
      bottom: 22%;
      width: 3px;
      border-radius: 0 999px 999px 0;
      background: var(--accent);
    }
    .huggy-model-item-name {
      font-size: 12px;
      font-weight: 750;
      color: var(--text);
      line-height: 1.25;
    }
    .huggy-model-item-meta {
      font-size: 10px;
      color: var(--text-muted);
      line-height: 1.35;
    }
    .huggy-model-item-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .huggy-model-badge.new { color: #166534; background: #dcfce7; border-color: #bbf7d0; }
    .huggy-model-badge.fast { color: #854d0e; background: #fef9c3; border-color: #fde68a; }
    .huggy-model-badge.premium { color: #6b21a8; background: #f3e8ff; border-color: #e9d5ff; }
    @keyframes huggy-builder-model-enter {
      from { opacity: 0; transform: translateX(-8px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .huggy-model-dropdown .dropdown-header {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      padding: 8px 10px 10px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 8px;
    }
    .huggy-model-dropdown .dropdown-search-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 34px;
      margin: 0 4px 8px;
      padding: 0 10px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg-input);
      color: var(--text-muted);
    }
    .huggy-model-dropdown .dropdown-search-input {
      min-width: 0;
      width: 100%;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 12px;
    }
    .huggy-model-dropdown .dropdown-group-title {
      padding: 8px 10px 5px;
      color: var(--text-sub);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 9px;
      font-weight: 800;
    }
    .huggy-model-dropdown .model-option {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      border-radius: 10px;
      cursor: pointer;
      text-align: left;
      transition: background 150ms cubic-bezier(0.22, 1, 0.36, 1), transform 150ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .huggy-model-dropdown .model-option:hover,
    .huggy-model-dropdown .model-option.active {
      background: var(--accent-hover, rgba(9,9,11,.08));
      transform: translateX(3px);
    }
    .huggy-model-dropdown .model-option[aria-disabled="true"] {
      opacity: .58;
      cursor: not-allowed;
    }
    .huggy-model-dropdown .model-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      flex: 0 0 auto;
    }
    .huggy-model-dropdown .opt-meta {
      min-width: 0;
      display: grid;
      gap: 2px;
      flex: 1 1 auto;
    }
    .huggy-model-dropdown .opt-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 700;
      color: var(--text);
    }
    .huggy-model-dropdown .opt-desc {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 10px;
      color: var(--text-muted);
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .huggy-model-badge {
      border: 1px solid currentColor;
      border-radius: 999px;
      padding: 2px 7px;
      font-size: 9px;
      font-weight: 800;
      flex: 0 0 auto;
    }
    .huggy-model-upgrade {
      color: #b45309;
      font-size: 10px;
      font-weight: 800;
      flex: 0 0 auto;
    }
    @media (max-width: 640px) {
      .huggy-builder-model-trigger {
        max-width: 132px;
      }
      .huggy-model-dropdown {
        left: 10px !important;
        right: 10px !important;
        bottom: 10px !important;
        top: auto !important;
        width: auto !important;
        max-width: none;
        max-height: 68vh;
        border-radius: 18px;
      }
      .huggy-builder-model-panel {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        top: auto;
        width: 100%;
        max-height: 82dvh;
        border-radius: 22px 22px 0 0;
        transform: translateY(100%);
      }
      .huggy-builder-model-panel.visible {
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
}

async function ensureModelSelector() {
  ensureBuilderModelSelectorStyle();
  const oldRoot = document.getElementById('model-select-btn');
  if (!oldRoot || oldRoot.dataset.liveBound === 'true') return;

  const root = oldRoot.cloneNode(false) as HTMLElement;
  root.id = 'model-select-btn';
  root.dataset.liveBound = 'true';
  root.className = 'model-select huggy-builder-model-trigger';
  root.style.cssText = '';
  root.innerHTML = `
    <span class="model-label-prefix">Model</span>
    <span class="provider-dot"></span>
    <span id="current-model-label">Auto</span>
    <svg id="chevron-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;
  oldRoot.replaceWith(root);

  document.getElementById('model-dropdown')?.remove();
  const dropdown = document.createElement('div');
  dropdown.id = 'model-dropdown';
  dropdown.className = 'huggy-model-dropdown';
  document.body.appendChild(dropdown);

  const label = root.querySelector('#current-model-label') as HTMLElement;
  const providerDot = root.querySelector('.provider-dot') as HTMLElement | null;
  let providerGroups: AiModelProviderGroup[] = [];
  let activeProvider = '';
  const positionDropdown = () => {
    const rect = root.getBoundingClientRect();
    if (window.matchMedia('(max-width: 640px)').matches) {
      dropdown.style.left = '';
      dropdown.style.right = '';
      dropdown.style.bottom = '';
      dropdown.style.top = 'auto';
      return;
    }
    const width = Math.min(344, window.innerWidth - 24);
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
    dropdown.style.width = `${width}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.right = 'auto';
    dropdown.style.bottom = `${Math.max(12, window.innerHeight - rect.top + 8)}px`;
    dropdown.style.top = 'auto';
  };
  const closeProviderPanel = () => {
    activeProvider = '';
    dropdown.querySelector<HTMLElement>('.huggy-builder-model-panel')?.classList.remove('visible');
    dropdown.querySelectorAll('.huggy-provider-expand-btn.open, .huggy-builder-provider-card.open').forEach(item => item.classList.remove('open'));
  };
  const close = () => {
    dropdown.classList.remove('open');
    root.setAttribute('aria-expanded', 'false');
    closeProviderPanel();
  };
  const selectedProviderMeta = () => {
    const group = providerGroups.find(item => item.models.some(model => model.id === selectedModelId));
    return group?.meta || null;
  };
  const setActiveOption = () => {
    dropdown.querySelectorAll<HTMLElement>('[data-model-id]').forEach(option => {
      option.classList.toggle('active', (option.dataset.modelId || 'auto') === selectedModelId);
      option.classList.toggle('selected', (option.dataset.modelId || 'auto') === selectedModelId);
    });
    dropdown.querySelectorAll<HTMLElement>('[data-provider]').forEach(card => {
      const group = providerGroups.find(item => item.provider === card.dataset.provider);
      const active = Boolean(group?.models.some(model => model.id === selectedModelId));
      card.classList.toggle('active', active);
      const sub = card.querySelector<HTMLElement>('.huggy-provider-sub');
      if (sub && group) {
        const selected = group.models.find(model => model.id === selectedModelId);
        sub.textContent = selected ? selected.display_name : `${group.models.length} models`;
      }
    });
    const meta = selectedProviderMeta();
    if (providerDot) providerDot.style.background = meta?.color || 'var(--accent)';
    if (label) {
      const selected = dropdown.querySelector<HTMLElement>(`[data-model-id="${CSS.escape(selectedModelId)}"]`);
      label.textContent = selected?.dataset.modelName || (selectedModelId === 'auto' ? 'Auto' : selectedModelId);
    }
  };
  const providerInitial = (name: string) => (name.trim()[0] || 'M').toUpperCase();
  const renderModelPanel = (group: AiModelProviderGroup) => `
    <div class="huggy-model-list-header">
      <span class="huggy-model-list-title">${escapeHtml(group.meta.label)}</span>
      <span class="huggy-model-list-count">${group.models.length} models</span>
    </div>
    <div class="huggy-model-list-scroll">
      ${group.models.map((model, index) => {
        const tier = model.tier || 'Standard';
        const locked = model.locked ? '<span class="huggy-model-badge">Upgrade</span>' : '';
        const badges = [
          `<span class="huggy-model-badge">${escapeHtml(tier)}</span>`,
          model.badges?.new ? '<span class="huggy-model-badge new">New</span>' : '',
          model.badges?.fast ? '<span class="huggy-model-badge fast">Fast</span>' : '',
          model.badges?.premium ? '<span class="huggy-model-badge premium">Premium</span>' : '',
          model.plan_minimum && model.plan_minimum !== 'free' ? '<span class="huggy-model-badge">Upgrade</span>' : '',
          locked,
        ].filter(Boolean).join('');
        const context = Number(model.capabilities?.maxContextTokens || 0);
        return `<button type="button" class="huggy-builder-model-item${selectedModelId === model.id ? ' selected' : ''}" data-model-id="${escapeHtml(model.id)}" data-model-name="${escapeHtml(model.display_name || model.id)}" aria-disabled="${model.locked ? 'true' : 'false'}" style="animation-delay:${index * 35}ms">
          <span class="huggy-model-item-name">${escapeHtml(model.display_name || model.id)}</span>
          <span class="huggy-model-item-meta">${escapeHtml(model.description || model.id)}${context ? ` · ${Math.round(context / 1000)}K ctx` : ''}</span>
          <span class="huggy-model-item-badges">${badges}</span>
        </button>`;
      }).join('')}
    </div>
  `;
  const toggleProviderPanel = (provider: string) => {
    const panel = dropdown.querySelector<HTMLElement>('.huggy-builder-model-panel');
    const group = providerGroups.find(item => item.provider === provider);
    if (!panel || !group) return;
    if (activeProvider === provider) {
      closeProviderPanel();
      return;
    }
    activeProvider = provider;
    dropdown.querySelectorAll('.huggy-provider-expand-btn.open, .huggy-builder-provider-card.open').forEach(item => item.classList.remove('open'));
    dropdown.querySelector<HTMLElement>(`[data-provider="${CSS.escape(provider)}"]`)?.classList.add('open');
    dropdown.querySelector<HTMLElement>(`[data-provider-arrow="${CSS.escape(provider)}"]`)?.classList.add('open');
    panel.innerHTML = renderModelPanel(group);
    panel.classList.add('visible');
    setActiveOption();
  };
  const open = async () => {
    const shouldOpen = !dropdown.classList.contains('open');
    if (!shouldOpen) {
      close();
      return;
    }
    dropdown.classList.add('open');
    root.setAttribute('aria-expanded', 'true');
    positionDropdown();
    if (dropdown.dataset.loaded === 'true') return;
    dropdown.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:12px;">Loading models...</div>';
    try {
      const payload = await apiFetch<{ models: AiModel[]; providers?: AiModelProviderGroup[] }>('/api/ai/models');
      const models = (payload.models || []).filter(model => model.id !== 'auto');
      providerGroups = (payload.providers && payload.providers.length)
        ? payload.providers
        : Object.values(models.reduce<Record<string, AiModelProviderGroup>>((acc, model) => {
          const provider = model.provider || model.id.split('/')[0] || 'other';
          if (!acc[provider]) {
            acc[provider] = {
              provider,
              meta: { label: provider, color: renderTierColor(model.tier), textColor: '#fff', icon: provider },
              models: [],
            };
          }
          acc[provider].models.push(model);
          return acc;
        }, {}));
      const validIds = new Set(models.map(model => model.id));
      if (selectedModelId !== 'auto' && !validIds.has(selectedModelId)) {
        selectedModelId = 'auto';
        scheduleWorkspaceSave({ selected_model: selectedModelId }, true);
      }
      dropdown.dataset.loaded = 'true';
      dropdown.innerHTML = `
        <div class="dropdown-header">Choose AI Engine</div>
        <button type="button" class="huggy-auto-model-option active" data-model-id="auto" data-model-name="Auto">
          <span class="huggy-provider-icon" style="--provider-color:var(--accent);--provider-text:var(--bg);">A</span>
          <span class="huggy-provider-card-main">
            <span class="huggy-provider-name">Auto</span>
            <span class="huggy-provider-sub">Huggy routes to the best fit</span>
          </span>
          <span class="huggy-model-badge" style="color:${renderTierColor('Standard')}">Standard</span>
        </button>
        <div class="huggy-builder-provider-list">
          ${providerGroups.map(group => {
            const activeModel = group.models.find(model => model.id === selectedModelId);
            return `<div class="huggy-builder-provider-card" data-provider="${escapeHtml(group.provider)}" style="--provider-color:${escapeHtml(group.meta.color)};--provider-text:${escapeHtml(group.meta.textColor)};">
              <span class="huggy-provider-icon">${escapeHtml(providerInitial(group.meta.label))}</span>
              <span class="huggy-provider-card-main">
                <span class="huggy-provider-name">${escapeHtml(group.meta.label)}</span>
                <span class="huggy-provider-sub">${escapeHtml(activeModel?.display_name || `${group.models.length} models`)}</span>
              </span>
              <button class="huggy-provider-expand-btn" type="button" aria-label="Open ${escapeHtml(group.meta.label)} models" data-provider-arrow="${escapeHtml(group.provider)}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>`;
          }).join('')}
        </div>
        <div class="huggy-builder-model-panel" role="listbox" aria-label="Provider models"></div>
      `;
      setActiveOption();
      positionDropdown();
    } catch (error) {
      dropdown.innerHTML = `<div style="padding:10px;color:#b91c1c;font-size:12px;">${escapeHtml(error instanceof Error ? error.message : 'Unable to load models')}</div>`;
      positionDropdown();
    }
  };

  window.addEventListener('resize', () => {
    if (dropdown.classList.contains('open')) positionDropdown();
  });
  root.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    void open();
  });
  dropdown.addEventListener('click', async event => {
    event.stopPropagation();
    const providerTarget = (event.target as HTMLElement).closest('[data-provider-arrow]') as HTMLElement | null;
    if (providerTarget) {
      event.preventDefault();
      toggleProviderPanel(providerTarget.dataset.providerArrow || '');
      return;
    }
    const target = (event.target as HTMLElement).closest('[data-model-id]') as HTMLElement | null;
    if (!target) return;
    if (target.getAttribute('aria-disabled') === 'true') return;
    selectedModelId = target.dataset.modelId || 'auto';
    if (label) label.textContent = target.dataset.modelName || 'Auto';
    setActiveOption();
    close();
    scheduleWorkspaceSave({ selected_model: selectedModelId });
    await apiFetch('/api/users/me/ai-preferences', {
      method: 'PATCH',
      body: JSON.stringify({ default_routing_mode: selectedModelId === 'auto' ? 'Auto' : 'Custom' }),
    }).catch(() => null);
  });
  document.addEventListener('click', close);
}

function ensurePlanBuildControls() {
  const submitWrapper = document.querySelector('.submit-wrapper');
  if (!submitWrapper || document.getElementById('btn-chat-mode')) return;
  submitWrapper.insertAdjacentHTML('beforebegin', `
    <div id="chat-mode-wrapper" style="position:relative;display:flex;align-items:center;flex:0 0 auto;">
      <button id="btn-chat-mode" type="button" aria-haspopup="menu" aria-expanded="false" title="Choose Plan or Build" style="height:28px;min-width:78px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:999px;padding:0 10px;font-size:11px;font-weight:750;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);">
        <span id="chat-mode-label">Build</span><span style="font-size:10px;opacity:.62;">v</span>
      </button>
      <div id="chat-mode-menu" role="menu" style="position:absolute;right:0;bottom:calc(100% + 8px);width:206px;border:1px solid var(--border);background:var(--bg-surface);border-radius:12px;padding:6px;box-shadow:0 18px 50px rgba(0,0,0,.22);display:none;z-index:1000;">
        <button type="button" data-chat-mode="build" role="menuitem" style="width:100%;text-align:left;border:0;background:var(--accent-hover, rgba(9,9,11,.08));color:var(--text);border-radius:8px;padding:9px;font-size:11px;font-weight:750;cursor:pointer;">Build <span style="display:block;color:var(--text-muted);font-weight:500;font-size:10px;margin-top:2px;">Generate or edit the app</span></button>
        <button type="button" data-chat-mode="plan" role="menuitem" style="width:100%;text-align:left;border:0;background:transparent;color:var(--text-muted);border-radius:8px;padding:9px;font-size:11px;font-weight:750;cursor:pointer;">Plan <span style="display:block;color:var(--text-sub);font-weight:500;font-size:10px;margin-top:2px;">Think without changing files</span></button>
      </div>
    </div>
  `);
}

function setChatMode(mode: 'plan' | 'build') {
  selectedChatMode = mode;
  const label = document.getElementById('chat-mode-label');
  const button = document.getElementById('btn-chat-mode') as HTMLButtonElement | null;
  const menu = document.getElementById('chat-mode-menu');
  if (label) label.textContent = mode === 'plan' ? 'Plan' : 'Build';
  if (button) {
    button.style.background = mode === 'plan' ? 'var(--accent-hover)' : 'var(--bg-input)';
    button.style.color = mode === 'plan' ? 'var(--blue, var(--accent))' : 'var(--text)';
    button.setAttribute('aria-expanded', 'false');
  }
  if (menu) menu.style.display = 'none';
  scheduleWorkspaceSave({ selected_mode: mode });
}

function activateBuilderView(view: 'preview' | 'code' | 'database' | 'analysis') {
  const screens: Record<string, string> = {
    preview: 'screen-layout-preview',
    code: 'screen-layout-code',
    database: 'screen-layout-database',
    analysis: 'screen-layout-analysis',
  };
  Object.entries(screens).forEach(([name, id]) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.style.display = name === view ? (view === 'code' ? 'grid' : 'flex') : 'none';
    node.setAttribute('aria-hidden', name === view ? 'false' : 'true');
  });
  document.querySelectorAll('.sub-nav-tab').forEach(tab => tab.classList.remove('active'));
  document.getElementById(`tab-btn-${view}`)?.classList.add('active');
  if (view === 'database') void loadDatabase();
  if (view === 'analysis') {
    void loadAnalysis();
    startAnalysisPolling();
  } else {
    stopAnalysisPolling();
  }
  scheduleWorkspaceSave({ active_tab: view });
}

function bindBuilderViews() {
  const entries: Array<['preview' | 'code' | 'database' | 'analysis', string]> = [
    ['preview', 'tab-btn-preview'],
    ['code', 'tab-btn-code'],
    ['database', 'tab-btn-database'],
    ['analysis', 'tab-btn-analysis'],
  ];
  entries.forEach(([view, id]) => {
    const oldButton = document.getElementById(id) as HTMLButtonElement | null;
    if (!oldButton || oldButton.dataset.liveBound === 'true') return;
    const button = oldButton.cloneNode(true) as HTMLButtonElement;
    button.dataset.liveBound = 'true';
    oldButton.replaceWith(button);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      activateBuilderView(view);
    }, true);
  });
  document.getElementById('btn-add-secret')?.addEventListener('click', () => {
    showApiKeyModal([{ service: 'Custom', variable: 'CUSTOM_API_KEY', description: 'Project API key', required: false }]);
  });
}

function ensureDatabaseView() {
  if (document.getElementById('tab-btn-database')) {
    bindBuilderViews();
    return;
  }
  const tabs = document.querySelector('.sub-nav-tabs');
  const holder = document.querySelector('.viewport-content-holder');
  if (!tabs || !holder || document.getElementById('tab-btn-database')) return;

  const databaseBtn = document.createElement('button');
  databaseBtn.className = 'sub-nav-tab';
  databaseBtn.id = 'tab-btn-database';
  databaseBtn.innerHTML = '<span style="font-size:13px;">▦</span> Database';
  const analysis = document.getElementById('tab-btn-analysis');
  tabs.insertBefore(databaseBtn, analysis || null);

  const panel = document.createElement('div');
  panel.id = 'screen-layout-database';
  panel.style.cssText = 'display:none;flex:1;overflow:auto;padding:18px;background:var(--bg);color:var(--text);';
  panel.innerHTML = `
    <div style="display:grid;gap:14px;max-width:1120px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <h2 style="font-size:18px;margin:0 0 4px;">Project database</h2>
          <p style="font-size:12px;color:var(--text-muted);margin:0;">Shared Supabase backend isolated by project and organization.</p>
        </div>
        <button id="btn-add-secret" type="button" style="height:32px;border:1px solid var(--border);background:var(--text);color:var(--bg);border-radius:8px;padding:0 12px;font-size:12px;font-weight:800;cursor:pointer;">Add API key</button>
      </div>
      <div id="database-content" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;"></div>
    </div>
  `;
  holder.appendChild(panel);
  databaseBtn.addEventListener('click', () => activateDatabaseView());
  panel.querySelector('#btn-add-secret')?.addEventListener('click', () => showApiKeyModal([{ service: 'Custom', variable: 'CUSTOM_API_KEY', description: 'Project API key', required: false }]));
}

function activateDatabaseView() {
  ['screen-layout-code', 'screen-layout-preview'].forEach(id => {
    const node = document.getElementById(id);
    if (node) node.style.display = 'none';
  });
  const analysis = document.getElementById('screen-layout-analysis');
  if (analysis) analysis.style.display = 'none';
  const database = document.getElementById('screen-layout-database');
  if (database) database.style.display = 'block';
  document.querySelectorAll('.sub-nav-tab').forEach(tab => tab.classList.remove('active'));
  document.getElementById('tab-btn-database')?.classList.add('active');
  void loadDatabase();
}

async function ensureProject() {
  currentProjectId = getProjectIdFromUrl();

  if (!currentProjectId || String(currentProjectId).startsWith('proj-')) {
    return {
      success: true,
      project: {
        id: '',
        name: currentProjectName || 'Untitled app',
        preview_status: 'idle',
      },
      files: [],
      messages: [],
      events: [],
      preview: {
        status: 'idle',
        html: currentPreviewHtml,
      },
    } as ProjectPayload;
  }

  return apiFetch<ProjectPayload>(`/api/projects/${encodeURIComponent(currentProjectId)}`);
}

function projectNameFromPrompt(prompt: string) {
  const words = prompt
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  return words.join(' ') || 'New Huggy app';
}

async function ensureProjectForPrompt(prompt: string) {
  if (currentProjectId) return;
  const initialPrompt = prompt || getInitialDashboardPrompt() || 'Create a polished fullstack web application.';
  const selectedName = currentProjectName && currentProjectName !== 'Untitled app'
    ? currentProjectName
    : projectNameFromPrompt(initialPrompt);
  const created = await apiFetch<ProjectPayload>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: selectedName,
      template: 'custom',
      theme: 'light',
      model: selectedModel(),
      prompt: initialPrompt,
    }),
  });
  currentProjectId = created.project.id;
  setProjectNameDisplay(created.project.name || selectedName);
  window.history.replaceState({}, '', `/builder.html?project=${encodeURIComponent(currentProjectId)}`);
  await apiFetch(`/api/projects/${encodeURIComponent(currentProjectId)}/workspace-state`, {
    method: 'PATCH',
    body: JSON.stringify({
      draft_prompt: '',
      selected_mode: selectedChatMode,
      selected_model: selectedModelId,
      active_tab: 'preview',
      preview_device: selectedPreviewDevice,
      sidebar_width: Number(localStorage.getItem('huggy-sidebar-width') || 380),
    }),
  }).catch(() => null);
  await apiFetch('/api/users/me/workspace-state', {
    method: 'PATCH',
    body: JSON.stringify({
      last_project_id: currentProjectId,
      dashboard_draft_prompt: '',
      builder_draft_prompt: '',
      builder_selected_mode: selectedChatMode,
      builder_selected_model: selectedModelId,
      builder_active_tab: 'preview',
      builder_preview_device: selectedPreviewDevice,
      last_route: `/builder.html?project=${currentProjectId}`,
    }),
  }).catch(() => null);
  await flushPendingPromptAttachments();
}

function dataUrlToBase64(dataUrl?: string) {
  if (!dataUrl) return '';
  const marker = 'base64,';
  const index = dataUrl.indexOf(marker);
  return index >= 0 ? dataUrl.slice(index + marker.length) : '';
}

async function uploadPromptAttachments(attachments: PendingPromptAttachment[]) {
  if (!attachments.length) return;
  if (!currentProjectId) {
    await storePendingPromptAttachments(attachments);
    appendMessage('system', `${attachments.length} file(s) will attach after the project is created.`);
    return;
  }

  let uploaded = 0;
  for (const attachment of attachments) {
    await apiFetch(`/api/projects/${encodeURIComponent(currentProjectId)}/assets`, {
      method: 'POST',
      body: JSON.stringify({
        name: attachment.name,
        kind: attachment.type?.startsWith('image/') ? 'image' : 'file',
        mime_type: attachment.type,
        size_bytes: attachment.size,
        content_base64: dataUrlToBase64(attachment.dataUrl),
      }),
    });
    uploaded += 1;
  }

  appendMessage('system', `${uploaded} file(s) attached to Database > Storage.`);
  if (document.getElementById('tab-btn-database')?.classList.contains('active')) {
    void loadDatabase();
  }
}

async function flushPendingPromptAttachments() {
  if (!currentProjectId) return;
  const pending = await consumePendingPromptAttachments();
  if (!pending.length) return;
  try {
    await uploadPromptAttachments(pending);
  } catch (error) {
    await storePendingPromptAttachments(pending);
    appendMessage('system', error instanceof Error ? error.message : 'Unable to attach pending files.');
  }
}

async function loadProject() {
  ensureToolbar();
  ensurePlanBuildControls();
  ensureDatabaseView();
  const scroll = chatScroll();
  if (scroll && scroll.dataset.liveInitialized !== 'true') {
    scroll.innerHTML = '';
    scroll.dataset.liveInitialized = 'true';
  }
  const projectName = document.getElementById('project-name');
  const loading = appendMessage('system', 'Loading project files, timeline and preview...');
  try {
    const payload = await ensureProject();
    if (!currentProjectId) {
      const userState = await apiFetch<{ success: boolean; state: UserWorkspaceState | null }>('/api/users/me/workspace-state').catch(() => null);
      userWorkspaceState = userState?.state || null;
      if (userWorkspaceState) {
        applyWorkspaceState({
          draft_prompt: userWorkspaceState.builder_draft_prompt || '',
          selected_mode: userWorkspaceState.builder_selected_mode || 'build',
          selected_model: userWorkspaceState.builder_selected_model || 'auto',
          active_tab: userWorkspaceState.builder_active_tab || 'preview',
          preview_device: userWorkspaceState.builder_preview_device || 'desktop',
        });
      }
    }
    if (projectName) setProjectNameDisplay(payload.project.name);
    if (currentProjectId) await flushPendingPromptAttachments();
    renderFiles(payload.files || []);
    applyWorkspaceState(payload.workspace_state || null);
    if (payload.preview?.html) setPreview(payload.preview.html, payload.preview.status);
    restoreMessages(payload);
    const activeTab = (payload.workspace_state?.active_tab || userWorkspaceState?.builder_active_tab) as WorkspaceState['active_tab'];
    if (activeTab) activateBuilderView(activeTab);
    setPreviewDevice(normalizePreviewDevice(payload.workspace_state?.preview_device || userWorkspaceState?.builder_preview_device), false);
    updateMessage(loading, 'Project synchronized. Use Plan to think, or Build to update the app.');
  } catch (error) {
    updateMessage(loading, error instanceof Error ? error.message : 'Unable to load project.');
  }
}

function restoreMessages(payload: ProjectPayload) {
  if (!payload.messages?.length) return;
  const scroll = chatScroll();
  if (!scroll || scroll.dataset.restored === 'true') return;
  scroll.dataset.restored = 'true';
  payload.messages.slice(-100).forEach(message => {
    const card = appendMessage(message.role === 'user' ? 'user' : 'assistant', message.content);
    if (message.intent === 'plan') {
      lastPlan = message.content;
      addInlineAction(card, 'Build this plan', () => void generateFromPrompt('Build this plan', 'build', true));
    }
  });
}

async function generateFromPrompt(prompt: string, requestedMode: 'plan' | 'build', useLastPlan = false, extra: Record<string, unknown> = {}, displayText = prompt) {
  if (isGenerating || !prompt.trim()) return;
  setBusy(true);
  activeAbort = new AbortController();
  clearInlineBlocks();

  appendMessage('user', displayText);
  const status = appendMessage('assistant', requestedMode === 'plan' ? 'Preparing a plan without changing files...' : 'Planning, generating, building preview...');
  if (requestedMode === 'build') activateBuilderView('preview');
  let streamedText = '';
  try {
    await ensureProjectForPrompt(prompt);
    await apiStream(`/api/projects/${encodeURIComponent(currentProjectId)}/generate/stream`, {
      prompt,
      requestedMode,
      useLastPlan,
      modelId: selectedModel(),
      ...extra,
    }, (eventType, event) => {
      const payload = event.payload || {};
      if (payload.build_session_id) lastBuildSessionId = payload.build_session_id;
      if (eventType === 'token') {
        streamedText += event.message || '';
        updateMessage(status, streamedText || 'Streaming code generation...');
        return;
      }
      if (eventType === 'planning' || eventType === 'answering') {
        updateMessage(status, payload.text || event.message || '');
        if (eventType === 'planning') {
          lastPlan = payload.text || event.message || '';
          addInlineAction(status, 'Build this plan', () => void generateFromPrompt('Build this plan', 'build', true));
        }
        return;
      }
      if (eventType === 'clarification_required') {
        updateMessage(status, payload.text || event.message || 'I need one more detail before building.');
        showClarificationBlock(payload, prompt, requestedMode);
        return;
      }
      if (eventType === 'credits_insufficient') {
        updateMessage(status, 'Upgrade required.');
        showCreditsModal();
        return;
      }
      if (eventType === 'external_api_keys_required') {
        updateMessage(status, 'External API keys are needed or can be skipped.');
        showApiKeyModal(payload.requirements || []);
        return;
      }
      if (eventType === 'error_detected' || eventType === 'auto_fix_failed') {
        showFixBugBox(payload.errors || [{ message: event.message }]);
      }
      if (eventType === 'queued' || eventType === 'routing' || eventType === 'model_started' || eventType === 'build_started' || eventType === 'building' || eventType === 'preview_building' || eventType === 'auto_fix_started' || eventType === 'patch_applied') {
        updateMessage(status, event.message || 'Working...');
        return;
      }
      if (eventType === 'preview_ready') {
        activateBuilderView('preview');
        renderFiles(payload.files || []);
        if (payload.preview?.html) setPreview(payload.preview.html, payload.preview.status);
        const diff = payload.diff?.summary ? ` ${payload.diff.summary}.` : '';
        updateMessage(status, `${event.message || 'Application generated and preview updated.'}${diff}`);
        if (payload.errors?.length) showFixBugBox(payload.errors);
        return;
      }
      if (eventType === 'done') {
        setBusy(false);
      }
      if (eventType === 'error') {
        updateMessage(status, event.message || 'Generation failed.');
      }
    }, activeAbort.signal);
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      updateMessage(status, 'Build cancelled.');
    } else {
      updateMessage(status, error instanceof Error ? error.message : 'Generation failed.');
    }
  } finally {
    setBusy(false);
    activeAbort = null;
  }
}

async function cancelBuild() {
  activeAbort?.abort();
  if (currentProjectId) {
    await apiFetch(`/api/projects/${encodeURIComponent(currentProjectId)}/build/cancel`, {
      method: 'POST',
      body: JSON.stringify({ buildSessionId: lastBuildSessionId }),
    }).catch(() => null);
  }
  setBusy(false);
}

async function exportCode() {
  if (!currentProjectId) return;
  if (!currentFiles.length) {
    appendMessage('system', 'No generated files are available to export yet.');
    return;
  }
  const files = currentFiles;
  const blob = new Blob([JSON.stringify({ files }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'huggy-code-export.json';
  link.click();
  URL.revokeObjectURL(url);
}

async function loadDatabase() {
  if (!currentProjectId) return;
  const target = document.getElementById('database-content');
  if (!target) return;
  target.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">Loading database...</div>';
  try {
    const payload = await apiFetch<any>(`/api/projects/${encodeURIComponent(currentProjectId)}/database`);
    const db = payload.database;
    const secrets = db.secrets || [];
    const integrations = db.integrations || [];
    const assets = db.assets || [];
    const activity = db.activity || [];
    const records = db.records_preview || [];
    target.innerHTML = `
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-input);">
        <h3 style="margin:0 0 8px;font-size:13px;">Tables</h3>
        ${(db.tables || []).map((table: any) => `<div style="font-size:12px;color:var(--text);">${escapeHtml(table.name)} <span style="color:var(--text-muted);">${table.rows} rows</span></div>`).join('') || '<p style="font-size:12px;color:var(--text-muted);">No project data yet.</p>'}
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-input);">
        <h3 style="margin:0 0 8px;font-size:13px;">API keys</h3>
        ${secrets.map((secret: any) => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--text);margin-bottom:7px;"><span>${escapeHtml(secret.variable)}</span><span style="color:var(--text-muted);">${escapeHtml(secret.masked_value)} &middot; ${escapeHtml(secret.status)}</span></div>`).join('') || '<p style="font-size:12px;color:var(--text-muted);">No API keys configured.</p>'}
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-input);">
        <h3 style="margin:0 0 8px;font-size:13px;">Security</h3>
        <p style="font-size:12px;color:var(--text-muted);line-height:1.5;margin:0;">RLS required. Secrets masked. Service role is server-only.</p>
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-input);">
        <h3 style="margin:0 0 8px;font-size:13px;">Records</h3>
        ${records.map((record: any) => `<div style="font-size:11px;color:var(--text);margin-bottom:6px;">${escapeHtml(record.path || record.table || 'record')}</div>`).join('') || '<p style="font-size:12px;color:var(--text-muted);">No records yet.</p>'}
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-input);">
        <h3 style="margin:0 0 8px;font-size:13px;">Integrations</h3>
        ${integrations.map((item: any) => `<div style="font-size:12px;color:var(--text);margin-bottom:6px;">${escapeHtml(item.service)} <span style="color:var(--text-muted);">${escapeHtml(item.status)}</span></div>`).join('') || '<p style="font-size:12px;color:var(--text-muted);">No integrations detected.</p>'}
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-input);">
        <h3 style="margin:0 0 8px;font-size:13px;">Storage</h3>
        ${assets.map((item: any) => `<div style="font-size:12px;color:var(--text);margin-bottom:6px;">${escapeHtml(item.name)} <span style="color:var(--text-muted);">${escapeHtml(item.kind || 'asset')}</span></div>`).join('') || '<p style="font-size:12px;color:var(--text-muted);">No assets uploaded.</p>'}
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-input);">
        <h3 style="margin:0 0 8px;font-size:13px;">Activity</h3>
        ${activity.map((item: any) => `<div style="font-size:11px;color:var(--text);margin-bottom:6px;">${escapeHtml(item.event_type)} - ${escapeHtml(item.message || '')}</div>`).join('') || '<p style="font-size:12px;color:var(--text-muted);">No activity yet.</p>'}
      </div>
    `;
  } catch (error) {
    target.innerHTML = `<div style="font-size:12px;color:#b91c1c;">${escapeHtml(error instanceof Error ? error.message : 'Database unavailable')}</div>`;
  }
}

function stopAnalysisPolling() {
  if (analysisPollTimer !== null) {
    window.clearInterval(analysisPollTimer);
    analysisPollTimer = null;
  }
}

function startAnalysisPolling() {
  stopAnalysisPolling();
  analysisPollTimer = window.setInterval(() => {
    if (document.getElementById('tab-btn-analysis')?.classList.contains('active')) {
      void loadAnalysis(true);
    }
  }, 30000);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: value >= 10 ? 0 : 2 }).format(value || 0);
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  if (minutes <= 0) return `${remaining}s`;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function countryFlag(code: string) {
  const normalized = (code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized) || normalized === 'UN') return '';
  return normalized
    .split('')
    .map(char => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
}

function renderAnalysisChart(points: AnalysisPayload['timeseries']) {
  const data = points.length ? points : [
    { time: '00:00', visitors: 0, pageviews: 0 },
    { time: '03:00', visitors: 0, pageviews: 0 },
    { time: '06:00', visitors: 0, pageviews: 0 },
    { time: '09:00', visitors: 0, pageviews: 0 },
    { time: '12:00', visitors: 0, pageviews: 0 },
  ];
  const width = 1000;
  const height = 260;
  const padX = 54;
  const padTop = 22;
  const padBottom = 36;
  const chartHeight = height - padTop - padBottom;
  const maxValue = Math.max(1, ...data.map(point => point.visitors));
  const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;
  const coords = data.map((point, index) => {
    const x = padX + index * stepX;
    const y = padTop + chartHeight - (point.visitors / maxValue) * chartHeight;
    return { x, y, point };
  });
  const linePath = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1]?.x || padX} ${height - padBottom} L ${coords[0]?.x || padX} ${height - padBottom} Z`;
  const yTicks = maxValue <= 1 ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.25, 0.5, 0.75, 1].map(item => Math.round(item * maxValue));
  const xLabelEvery = Math.max(1, Math.ceil(data.length / 5));
  return `
    <svg class="analysis-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Visitors over time">
      ${yTicks.map(tick => {
        const y = padTop + chartHeight - (tick / maxValue) * chartHeight;
        return `<line class="analysis-chart-grid" x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}"></line><text class="analysis-chart-label" x="10" y="${y + 4}">${tick}</text>`;
      }).join('')}
      <path class="analysis-chart-area" d="${areaPath}"></path>
      <path class="analysis-chart-line" d="${linePath}"></path>
      ${coords.map((coord, index) => index % xLabelEvery === 0 || index === coords.length - 1
        ? `<text class="analysis-chart-label" x="${coord.x}" y="${height - 8}" text-anchor="middle">${escapeHtml(coord.point.time)}</text>`
        : ''
      ).join('')}
    </svg>
  `;
}

function renderAnalysisBreakdown(
  title: string,
  rows: Array<{ label: string; visitors: number; suffix?: string }>
) {
  const maxVisitors = Math.max(1, ...rows.map(row => row.visitors));
  return `
    <section class="analysis-breakdown-card">
      <div class="analysis-breakdown-head"><span>${escapeHtml(title)}</span><span>Visitors</span></div>
      ${rows.length ? rows.map(row => `
        <div class="analysis-row">
          <div class="analysis-row-track" style="--row-width:${Math.max(8, (row.visitors / maxVisitors) * 100)}%;">
            <span>${escapeHtml(row.label)}</span>
          </div>
          <strong>${formatCompactNumber(row.visitors)}${row.suffix || ''}</strong>
        </div>
      `).join('') : '<p style="margin:0;color:var(--text-muted);font-size:12px;">No data yet</p>'}
    </section>
  `;
}

function renderSeoAudit(seo?: AnalysisPayload['seo']) {
  if (!seo) {
    return `
      <section class="analysis-seo-card">
        <div>
          <span class="analysis-seo-kicker">SEO readiness</span>
          <h3>SEO audit unavailable</h3>
          <p>No generated project files were available for an SEO review yet.</p>
        </div>
      </section>
    `;
  }

  const checks = (seo.checks || []).slice(0, 8);
  const recommendations = (seo.recommendations || []).slice(0, 3);
  return `
    <section class="analysis-seo-card">
      <div class="analysis-seo-summary">
        <div class="analysis-seo-score" aria-label="SEO score">${Math.max(0, Math.min(100, Math.round(seo.score || 0)))}</div>
        <div>
          <span class="analysis-seo-kicker">SEO & AI-search readiness</span>
          <h3>${seo.score >= 90 ? 'Search foundation looks strong' : 'SEO fixes are available'}</h3>
          <p>${seo.preview?.title ? escapeHtml(seo.preview.title) : 'Huggy checks title, meta, H1, Open Graph, structured data, alt text, sitemap and robots.'}</p>
        </div>
        <button class="analysis-seo-action" id="btn-fix-seo" type="button">Fix SEO with AI</button>
      </div>
      <div class="analysis-seo-checks">
        ${checks.map(check => `
          <div class="analysis-seo-check is-${escapeHtml(check.status)}">
            <span>${escapeHtml(check.label)}</span>
            <strong>${escapeHtml(check.status)}</strong>
            <small>${escapeHtml(check.detail)}</small>
          </div>
        `).join('')}
      </div>
      ${recommendations.length ? `
        <div class="analysis-seo-recommendations">
          ${recommendations.map(item => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

function renderAnalysis(payload: AnalysisPayload) {
  const target = document.getElementById('analysis-content');
  if (!target) return;
  const metrics = payload.metrics || {
    visitors: 0,
    pageviews: 0,
    views_per_visit: 0,
    visit_duration_seconds: 0,
    bounce_rate: 0,
  };
  const sourceRows = (payload.sources || []).map(row => ({ label: row.source || 'Direct', visitors: row.visitors }));
  const pageRows = (payload.pages || []).map(row => ({ label: row.page || '/', visitors: row.visitors }));
  const countryRows = (payload.countries || []).map(row => ({
    label: `${countryFlag(row.country_code)} ${row.country_name || row.country_code || 'Unknown'}`.trim(),
    visitors: row.visitors,
  }));
  const deviceRows = (payload.devices || []).map(row => ({
    label: row.device || 'Unknown',
    visitors: row.visitors,
    suffix: row.percentage ? ` · ${row.percentage}%` : '',
  }));

  target.innerHTML = `
    <div class="analysis-topbar">
      <div class="analysis-live-pill">
        <span class="analysis-live-dot"></span>
        <span>${formatCompactNumber(payload.current_visitors || 0)} current visitor${payload.current_visitors === 1 ? '' : 's'}</span>
      </div>
      <select id="analysis-range-select" class="analysis-range-select" aria-label="Analysis range">
        <option value="24h"${analysisRange === '24h' ? ' selected' : ''}>Last 24 hours</option>
        <option value="7d"${analysisRange === '7d' ? ' selected' : ''}>Last 7 days</option>
        <option value="30d"${analysisRange === '30d' ? ' selected' : ''}>Last 30 days</option>
        <option value="90d"${analysisRange === '90d' ? ' selected' : ''}>Last 90 days</option>
      </select>
    </div>
    <div class="analysis-metrics-grid">
      <section class="analysis-metric-card is-primary"><div class="analysis-metric-label">Visitors</div><div class="analysis-metric-value">${formatCompactNumber(metrics.visitors)}</div></section>
      <section class="analysis-metric-card"><div class="analysis-metric-label">Pageviews</div><div class="analysis-metric-value">${formatCompactNumber(metrics.pageviews)}</div></section>
      <section class="analysis-metric-card"><div class="analysis-metric-label">Views Per Visit</div><div class="analysis-metric-value">${formatCompactNumber(metrics.views_per_visit)}</div></section>
      <section class="analysis-metric-card"><div class="analysis-metric-label">Visit Duration</div><div class="analysis-metric-value">${formatDuration(metrics.visit_duration_seconds)}</div></section>
      <section class="analysis-metric-card"><div class="analysis-metric-label">Bounce Rate</div><div class="analysis-metric-value">${formatCompactNumber(metrics.bounce_rate)}%</div></section>
    </div>
    <section class="analysis-chart-card">
      ${renderAnalysisChart(payload.timeseries || [])}
    </section>
    ${renderSeoAudit(payload.seo)}
    <div class="analysis-breakdown-grid">
      ${renderAnalysisBreakdown('Source', sourceRows)}
      ${renderAnalysisBreakdown('Page', pageRows)}
      ${renderAnalysisBreakdown('Country', countryRows)}
      ${renderAnalysisBreakdown('Device', deviceRows)}
    </div>
  `;

  document.getElementById('analysis-range-select')?.addEventListener('change', event => {
    analysisRange = (event.target as HTMLSelectElement).value || '30d';
    void loadAnalysis();
  });
  document.getElementById('btn-fix-seo')?.addEventListener('click', () => {
    const input = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
    if (!input) return;
    input.value = 'Optimize this app for Google and AI search. Add strong title and meta descriptions, Open Graph tags, one clear H1, image alt text, structured data, sitemap.xml and robots.txt without changing the core product.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
}

async function loadAnalysis(silent = false) {
  const target = document.getElementById('analysis-content');
  if (!target) return;
  if (!currentProjectId) {
    target.innerHTML = '<div class="analysis-empty"><strong style="display:block;color:var(--text);font-size:14px;margin-bottom:6px;">No project selected</strong><span style="font-size:12px;">Open or create a project before viewing analysis.</span></div>';
    return;
  }
  if (!silent) {
    target.innerHTML = `
      <div class="analysis-topbar"><div class="analysis-skeleton" style="width:220px;min-height:36px;"></div><div class="analysis-skeleton" style="width:150px;min-height:36px;"></div></div>
      <div class="analysis-metrics-grid">${Array.from({ length: 5 }, () => '<div class="analysis-skeleton"></div>').join('')}</div>
      <div class="analysis-skeleton" style="min-height:310px;"></div>
    `;
  }
  try {
    const payload = await apiFetch<AnalysisPayload & { success: boolean }>(`/api/projects/${encodeURIComponent(currentProjectId)}/analysis?range=${encodeURIComponent(analysisRange)}`);
    renderAnalysis(payload);
  } catch (error) {
    target.innerHTML = `<div class="analysis-error"><strong style="display:block;color:var(--text);font-size:14px;margin-bottom:6px;">Analysis unavailable</strong><span style="font-size:12px;">${escapeHtml(error instanceof Error ? error.message : 'Unable to load project analysis.')}</span></div>`;
  }
}

function showClarificationBlock(payload: any, originalPrompt: string, requestedMode: 'plan' | 'build') {
  const host = ensureInlineBlockHost();
  const question = payload.question || 'What should Huggy focus on first?';
  const choices: string[] = Array.isArray(payload.choices)
    ? payload.choices.filter((choice: unknown): choice is string => typeof choice === 'string' && choice.trim().length > 0).slice(0, 4)
    : [];
  const recommendation = payload.recommendation || choices[0] || '';
  host.innerHTML = `
    <div id="clarification-block" style="border:1px solid var(--border-focus, var(--border));background:var(--bg-surface);border-radius:13px;padding:12px;color:var(--text);box-shadow:0 18px 50px rgba(0,0,0,.16);">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px;">
        <div>
          <div style="font-size:11px;color:#93c5fd;font-weight:800;margin-bottom:4px;">Clarification needed</div>
          <div style="font-size:13px;line-height:1.45;font-weight:650;">${escapeHtml(question)}</div>
        </div>
        <button type="button" data-action="dismiss" aria-label="Dismiss" style="border:0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:18px;line-height:1;">&times;</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;">
        ${choices.map(choice => `<button type="button" data-choice="${escapeHtml(choice)}" style="border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:999px;padding:6px 9px;font-size:11px;font-weight:700;cursor:pointer;">${escapeHtml(choice)}</button>`).join('')}
      </div>
      <textarea data-free-answer placeholder="Answer briefly or choose an option..." style="width:100%;min-height:42px;max-height:90px;resize:vertical;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:9px;padding:9px;font-size:12px;line-height:1.4;outline:none;"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:9px;">
        <button type="button" data-action="recommend" style="height:30px;border:1px solid var(--border);background:transparent;color:var(--text);border-radius:8px;padding:0 10px;font-size:11px;font-weight:750;cursor:pointer;">Use recommendation</button>
        <button type="button" data-action="continue" style="height:30px;border:0;background:var(--text);color:var(--bg);border-radius:8px;padding:0 12px;font-size:11px;font-weight:850;cursor:pointer;">Continue</button>
      </div>
    </div>
  `;

  let selectedAnswer = '';
  host.querySelectorAll('[data-choice]').forEach(button => {
    button.addEventListener('click', () => {
      selectedAnswer = (button as HTMLElement).dataset.choice || '';
      host.querySelectorAll('[data-choice]').forEach(item => ((item as HTMLElement).style.background = 'var(--bg-input)'));
      (button as HTMLElement).style.background = 'rgba(96,165,250,.28)';
    });
  });
  host.querySelector('[data-action="dismiss"]')?.addEventListener('click', clearInlineBlocks);
  host.querySelector('[data-action="recommend"]')?.addEventListener('click', async () => {
    await resumeFromClarification(recommendation || selectedAnswer || choices[0] || 'Use the recommended product structure.', originalPrompt, requestedMode);
  });
  host.querySelector('[data-action="continue"]')?.addEventListener('click', async () => {
    const freeAnswer = (host.querySelector('[data-free-answer]') as HTMLTextAreaElement | null)?.value.trim() || '';
    await resumeFromClarification(freeAnswer || selectedAnswer || recommendation, originalPrompt, requestedMode);
  });
}

async function resumeFromClarification(answer: string, originalPrompt: string, requestedMode: 'plan' | 'build') {
  if (!answer.trim()) return;
  clearInlineBlocks();
  const response = await apiFetch<{ prompt: string; requestedMode?: 'plan' | 'build' }>(`/api/projects/${encodeURIComponent(currentProjectId)}/agent/answer`, {
    method: 'POST',
    body: JSON.stringify({ answer, originalPrompt, requestedMode, recommendation: answer }),
  });
  await generateFromPrompt(response.prompt || `${originalPrompt}\n\nClarification answer: ${answer}`, response.requestedMode || requestedMode, false, {}, answer);
}

function showCreditsModal() {
  showMiniModal('Upgrade required', `
    <p>Your current balance or plan does not support this action with the selected model.</p>
    <div class="huggy-modal-actions">
      <button data-action="upgrade">Upgrade plan</button>
      <button data-action="topup">Buy credits</button>
      <button data-action="auto">Use Auto</button>
      <button data-action="cancel">Cancel</button>
    </div>
  `, (action) => {
    if (action === 'upgrade') document.getElementById('btn-upgrade')?.click();
    if (action === 'auto') {
      selectedModelId = 'auto';
      const label = document.getElementById('current-model-label');
      if (label) label.textContent = 'Auto';
      syncModelLabelFromSelection();
      scheduleWorkspaceSave({ selected_model: selectedModelId }, true);
    }
  });
}

function showApiKeyModal(requirements: any[]) {
  const rows = requirements.length ? requirements : [{ service: 'Custom', variable: 'CUSTOM_API_KEY', description: 'Project API key' }];
  showMiniModal('Connect external API', `
    <p>Keys are stored server-side and masked in the Database tab.</p>
    ${rows.map((item, index) => `
      <label style="display:grid;gap:5px;margin:10px 0;font-size:11px;color:var(--text-muted);">
        ${escapeHtml(item.service)} &middot; ${escapeHtml(item.variable)}
        <input data-key-index="${index}" data-service="${escapeHtml(item.service)}" data-variable="${escapeHtml(item.variable)}" type="password" placeholder="${escapeHtml(item.variable)}" style="height:34px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:7px;padding:0 10px;">
      </label>
    `).join('')}
    <div class="huggy-modal-actions">
      <button data-action="continue">Continue</button>
      <button data-action="skip">Skip for now</button>
    </div>
  `, async (action, root) => {
    if (action === 'skip') {
      await generateFromPrompt('Continue with safe placeholders', 'build', false, { skipExternalKeys: true });
      return;
    }
    if (action === 'continue') {
      const keys = Array.from(root.querySelectorAll('input')).map((input: any) => ({
        service: input.dataset.service,
        variable: input.dataset.variable,
        value: input.value,
      })).filter(item => item.value);
      await apiFetch(`/api/projects/${encodeURIComponent(currentProjectId)}/external-keys`, {
        method: 'POST',
        body: JSON.stringify({ keys }),
      });
      await loadDatabase();
      await generateFromPrompt('Continue build with configured API keys', 'build', false, { externalKeysConfirmed: true });
    }
  });
}

function showFixBugBox(errors: any[]) {
  const first = errors[0] || { message: 'Preview failed.' };
  showMiniModal('Fix bug', `
    <p>${escapeHtml(first.message || 'Preview failed.')}</p>
    <p style="color:var(--text-muted);">${escapeHtml(first.file || 'unknown file')}</p>
    <div class="huggy-modal-actions">
      <button data-action="fix">Fix with AI</button>
      <button data-action="copy">Copy error</button>
      <button data-action="send">Send to chat</button>
    </div>
  `, async (action) => {
    if (action === 'copy') await navigator.clipboard?.writeText(first.message || 'Preview failed.');
    if (action === 'send') {
      const input = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
      if (input) input.value = `Fix this preview error: ${first.message}`;
    }
    if (action === 'fix') await generateFromPrompt(`Fix this preview error: ${first.message}`, 'build');
  });
}

function showMiniModal(title: string, html: string, onAction: (action: string, root: HTMLElement) => void | Promise<void>) {
  document.getElementById('huggy-live-modal')?.remove();
  const root = document.createElement('div');
  root.id = 'huggy-live-modal';
  root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:grid;place-items:center;z-index:99999;padding:16px;';
  root.innerHTML = `
    <div style="width:min(420px,100%);border:1px solid var(--border);background:var(--bg-surface);color:var(--text);border-radius:14px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.22);">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;">
        <h3 style="font-size:15px;margin:0;">${escapeHtml(title)}</h3>
        <button data-action="close" style="border:0;background:transparent;color:var(--text-muted);font-size:18px;cursor:pointer;">&times;</button>
      </div>
      <div style="font-size:12px;color:var(--text);line-height:1.5;">${html}</div>
    </div>
  `;
  root.querySelectorAll('button[data-action]').forEach(button => {
    button.addEventListener('click', async () => {
      const action = (button as HTMLElement).dataset.action || 'close';
      if (action !== 'close') await onAction(action, root);
      root.remove();
    });
  });
  document.body.appendChild(root);
}

function bindChat() {
  const input = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
  const oldSubmit = document.getElementById('chat-submit-btn') as HTMLButtonElement | null;
  if (!input || !oldSubmit) return;

  const submit = oldSubmit.cloneNode(true) as HTMLButtonElement;
  oldSubmit.replaceWith(submit);
  submit.style.pointerEvents = 'auto';
  submit.style.cursor = 'pointer';

  const send = (mode: 'plan' | 'build') => {
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    input.style.height = '48px';
    submit.classList.remove('active');
    scheduleWorkspaceSave({ draft_prompt: '', selected_mode: mode }, true);
    void generateFromPrompt(value, mode);
  };

  input.addEventListener('input', () => {
    submit.classList.toggle('active', input.value.trim().length > 0);
    scheduleWorkspaceSave();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      send(selectedChatMode);
    }
  }, true);

  submit.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    send(selectedChatMode);
  }, true);

  document.getElementById('btn-chat-mode')?.addEventListener('click', (event) => {
    event.preventDefault();
    const menu = document.getElementById('chat-mode-menu');
    const button = document.getElementById('btn-chat-mode') as HTMLButtonElement | null;
    const nextOpen = menu?.style.display !== 'block';
    if (menu) menu.style.display = nextOpen ? 'block' : 'none';
    button?.setAttribute('aria-expanded', String(nextOpen));
  });

  document.querySelectorAll('[data-chat-mode]').forEach(option => {
    option.addEventListener('click', (event) => {
      event.preventDefault();
      const mode = (option as HTMLElement).dataset.chatMode === 'plan' ? 'plan' : 'build';
      setChatMode(mode);
    });
  });

  document.addEventListener('click', (event) => {
    const wrapper = document.getElementById('chat-mode-wrapper');
    if (wrapper && !wrapper.contains(event.target as Node)) {
      const menu = document.getElementById('chat-mode-menu');
      const button = document.getElementById('btn-chat-mode') as HTMLButtonElement | null;
      if (menu) menu.style.display = 'none';
      button?.setAttribute('aria-expanded', 'false');
    }
  });

  setChatMode(selectedChatMode);
}

function hydrateDashboardPrompt() {
  const input = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
  const submit = document.getElementById('chat-submit-btn') as HTMLButtonElement | null;
  const mode = getInitialDashboardMode();
  const prompt = getInitialDashboardPrompt();
  setChatMode(mode);
  if (!input || !prompt || input.value.trim()) return;
  if (!currentProjectId && currentProjectName === 'Untitled app') {
    setProjectNameDisplay(projectNameFromPrompt(prompt));
  }
  input.value = prompt;
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  submit?.classList.add('active');
}

function ensureResizableSidebar() {
  const body = document.querySelector('.workspace-body') as HTMLElement | null;
  const sidebar = document.querySelector('.sidebar-pane') as HTMLElement | null;
  if (!body || !sidebar || document.getElementById('huggy-sidebar-resizer')) return;
  const savedWidth = Number(projectWorkspaceState?.sidebar_width || localStorage.getItem('huggy-sidebar-width') || 380);
  const applyWidth = (width: number) => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      body.style.gridTemplateColumns = '';
      body.style.removeProperty('--huggy-sidebar-width');
      return;
    }
    const next = Math.min(520, Math.max(280, width));
    applySidebarWidthPreference(next);
    localStorage.setItem('huggy-sidebar-width', String(next));
  };
  applyWidth(savedWidth);
  const handle = document.createElement('div');
  handle.id = 'huggy-sidebar-resizer';
  handle.title = 'Resize chat panel';
  handle.style.cssText = 'position:absolute;top:0;bottom:0;left:calc(var(--huggy-sidebar-width, 380px) - 4px);width:8px;cursor:col-resize;z-index:20;background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent);opacity:.45;touch-action:none;';
  body.style.position = 'relative';
  body.appendChild(handle);
  window.addEventListener('resize', () => applyWidth(Number(localStorage.getItem('huggy-sidebar-width') || 380)));
  handle.addEventListener('dblclick', () => applyWidth(380));
  handle.addEventListener('pointerdown', event => {
    if (window.matchMedia('(max-width: 760px)').matches) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebar.getBoundingClientRect().width;
    body.classList.add('is-resizing-sidebar');
    handle.setPointerCapture?.(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const next = Math.min(520, Math.max(280, startWidth + moveEvent.clientX - startX));
      body.style.gridTemplateColumns = `${next}px minmax(0, 1fr)`;
      body.style.setProperty('--huggy-sidebar-width', `${next}px`);
      handle.style.left = `${next - 4}px`;
      localStorage.setItem('huggy-sidebar-width', String(Math.round(next)));
      scheduleWorkspaceSave({ sidebar_width: Math.round(next) });
    };
    const up = () => {
      body.classList.remove('is-resizing-sidebar');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function init() {
  ensureToolbar();
  void ensureModelSelector();
  ensurePlanBuildControls();
  ensureDatabaseView();
  ensureResizableSidebar();
  bindProjectMenu();
  bindPreviewDeviceToggle();
  initPromptInputActions({
    persistForBuilder: false,
    onFiles: uploadPromptAttachments,
    onNotice: (message, kind) => appendMessage(kind === 'error' ? 'system' : 'system', message),
  });
  bindChat();
  hydrateDashboardPrompt();
  void loadProject();
}

window.addEventListener('huggy:auth-ready', init);
if (document.documentElement.dataset.authReady === 'true') init();
