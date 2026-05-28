import { apiFetch, apiStream } from './lib/api';

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
  credits?: {
    estimated?: number;
    charged?: number;
    remaining?: number;
    balance?: number;
    required?: number;
  };
};

type DeployPayload = {
  success: boolean;
  event?: string;
  deployment?: {
    deployment_url: string;
    status: string;
  };
  credits?: { required: number; balance: number };
  error?: string;
};

type AiModel = {
  id: string;
  display_name: string;
  tier?: string;
  locked?: boolean;
  capabilities?: Record<string, unknown>;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStoredProject() {
  try {
    return JSON.parse(localStorage.getItem('huggy-current-project') || '{}');
  } catch {
    return {};
  }
}

function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('project') || getStoredProject().id || '';
}

function selectedModel() {
  return selectedModelId || getStoredProject().model || 'auto';
}

function chatScroll() {
  return document.getElementById('sidebar-scroll-area');
}

function appendMessage(kind: 'user' | 'assistant' | 'system', body: string) {
  const scroll = chatScroll();
  if (!scroll) return null;

  const card = document.createElement('div');
  card.className = 'message-card';
  const color = kind === 'user' ? '#d946ef' : kind === 'system' ? '#60a5fa' : '#f4f4f5';
  const name = kind === 'user' ? 'User' : kind === 'system' ? 'Huggy Build' : 'Huggy AI';
  card.innerHTML = `
    <div class="msg-header-line">
      <span class="msg-sender-identity" style="color:${color};">${name}</span>
    </div>
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
  button.style.cssText = 'margin-top:10px;height:30px;border:1px solid rgba(255,255,255,.12);background:#f4f4f5;color:#09090b;border-radius:7px;padding:0 10px;font-size:11px;font-weight:700;cursor:pointer;';
  button.addEventListener('click', action);
  card.appendChild(button);
}

function setPreview(html: string, status = 'ready') {
  currentPreviewHtml = html;
  const frame = document.getElementById('preview-iframe-element') as HTMLIFrameElement | null;
  if (frame) frame.srcdoc = html;

  activateBuilderView('preview');

  const address = document.querySelector('.preview-address-glow span:last-child');
  if (address) address.textContent = `${status}.huggy.local / ${currentProjectId.slice(0, 8)}`;
  updateDeployState(status === 'ready');
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
  if (!nav || document.getElementById('btn-live-deploy')) return;

  const style = 'height:28px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:7px;padding:0 10px;font-size:11px;cursor:pointer;';
  nav.insertAdjacentHTML('afterbegin', `
    <button id="btn-live-refresh-preview" type="button" style="${style}">Refresh</button>
    <button id="btn-live-open-preview" type="button" style="${style}">Open</button>
    <button id="btn-live-cancel" type="button" style="${style}display:none;">Cancel</button>
    <button id="btn-live-deploy" type="button" disabled style="${style}background:#3f3f46;color:#a1a1aa;font-weight:700;">Deploy</button>
  `);

  document.getElementById('btn-live-refresh-preview')?.addEventListener('click', refreshPreview);
  document.getElementById('btn-live-open-preview')?.addEventListener('click', openPreview);
  document.getElementById('btn-live-deploy')?.addEventListener('click', deployProject);
  document.getElementById('btn-live-cancel')?.addEventListener('click', cancelBuild);
  document.getElementById('action-download-zip')?.addEventListener('click', exportCode);
}

function updateDeployState(enabled: boolean) {
  const button = document.getElementById('btn-live-deploy') as HTMLButtonElement | null;
  if (!button) return;
  button.disabled = !enabled;
  button.style.background = enabled ? '#f4f4f5' : '#3f3f46';
  button.style.color = enabled ? '#09090b' : '#a1a1aa';
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

async function ensureModelSelector() {
  const oldRoot = document.getElementById('model-select-btn');
  if (!oldRoot || oldRoot.dataset.liveBound === 'true') return;

  const root = oldRoot.cloneNode(false) as HTMLElement;
  root.id = 'model-select-btn';
  root.dataset.liveBound = 'true';
  root.className = 'model-select huggy-model-trigger';
  root.style.cssText = 'display:inline-flex;align-items:center;gap:5px;height:24px;max-width:116px;padding:0 8px;border-radius:999px;border:1px solid var(--border);font-size:10px;color:var(--text);user-select:none;position:relative;cursor:pointer;background:rgba(255,255,255,.035);flex:0 0 auto;white-space:nowrap;overflow:hidden;';
  root.innerHTML = `
    <span style="width:6px;height:6px;border-radius:999px;background:#f4f4f5;box-shadow:0 0 10px rgba(244,244,245,.55);flex:0 0 auto;"></span>
    <span id="current-model-label" style="font-weight:800;min-width:0;overflow:hidden;text-overflow:ellipsis;">Auto</span>
    <span style="color:var(--text-sub);font-size:9px;flex:0 0 auto;">v</span>
  `;
  oldRoot.replaceWith(root);

  document.getElementById('model-dropdown')?.remove();
  const dropdown = document.createElement('div');
  dropdown.id = 'model-dropdown';
  dropdown.style.cssText = 'position:fixed;width:292px;max-width:calc(100vw - 24px);max-height:min(320px,calc(100vh - 32px));overflow:auto;border:1px solid var(--border);background:#111113;border-radius:12px;padding:6px;box-shadow:0 18px 54px rgba(0,0,0,.5);display:none;z-index:3000;';
  document.body.appendChild(dropdown);

  const label = root.querySelector('#current-model-label') as HTMLElement;
  const positionDropdown = () => {
    const rect = root.getBoundingClientRect();
    if (window.matchMedia('(max-width: 640px)').matches) {
      dropdown.style.left = '10px';
      dropdown.style.right = '10px';
      dropdown.style.bottom = '10px';
      dropdown.style.top = 'auto';
      dropdown.style.width = 'auto';
      dropdown.style.maxHeight = '60vh';
      return;
    }
    const width = Math.min(292, window.innerWidth - 24);
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
    const availableAbove = Math.max(160, rect.top - 18);
    dropdown.style.width = `${width}px`;
    dropdown.style.maxHeight = `${Math.min(320, availableAbove)}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.right = 'auto';
    dropdown.style.bottom = `${Math.max(12, window.innerHeight - rect.top + 8)}px`;
    dropdown.style.top = 'auto';
  };
  const close = () => { dropdown.style.display = 'none'; root.setAttribute('aria-expanded', 'false'); };
  const open = async () => {
    const shouldOpen = dropdown.style.display !== 'block';
    if (!shouldOpen) {
      close();
      return;
    }
    dropdown.style.display = 'block';
    root.setAttribute('aria-expanded', 'true');
    positionDropdown();
    if (dropdown.dataset.loaded === 'true') return;
    dropdown.innerHTML = '<div style="padding:10px;color:#a1a1aa;font-size:12px;">Loading models...</div>';
    try {
      const payload = await apiFetch<{ models: AiModel[] }>('/api/ai/models');
      const models = payload.models || [];
      dropdown.dataset.loaded = 'true';
      dropdown.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 6px 8px;">
          <div>
            <div style="font-size:12px;font-weight:800;color:#f4f4f5;">AI model</div>
            <div style="font-size:10px;color:#71717a;margin-top:2px;">Auto balances quality and credits.</div>
          </div>
          <button type="button" data-model-id="auto" data-model-name="Auto" style="height:26px;border:1px solid rgba(255,255,255,.12);background:#f4f4f5;color:#09090b;border-radius:8px;padding:0 9px;font-size:10px;font-weight:800;cursor:pointer;flex:0 0 auto;">Auto</button>
        </div>
        <div style="display:grid;gap:3px;">
          ${models.map(model => {
            const tier = model.tier || (model.id === 'auto' ? 'Auto' : 'Standard');
            const color = renderTierColor(tier);
            const locked = model.locked ? '<span style="font-size:10px;color:#fbbf24;">Upgrade</span>' : '';
            return `<button type="button" data-model-id="${escapeHtml(model.id)}" data-model-name="${escapeHtml(model.display_name || model.id)}" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;border:0;background:${model.id === selectedModelId ? 'rgba(255,255,255,.09)' : 'transparent'};color:#f4f4f5;border-radius:8px;padding:7px;cursor:pointer;text-align:left;">
              <span style="display:grid;gap:1px;min-width:0;">
                <span style="font-size:11px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(model.display_name || model.id)}</span>
                <span style="font-size:9px;color:#71717a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(model.id)}</span>
              </span>
              <span style="display:flex;align-items:center;gap:5px;flex:0 0 auto;">
                <span style="font-size:9px;color:${color};border:1px solid ${color}55;border-radius:999px;padding:2px 6px;">${escapeHtml(tier)}</span>
                ${locked}
              </span>
            </button>`;
          }).join('')}
        </div>
      `;
      positionDropdown();
    } catch (error) {
      dropdown.innerHTML = `<div style="padding:10px;color:#fca5a5;font-size:12px;">${escapeHtml(error instanceof Error ? error.message : 'Unable to load models')}</div>`;
      positionDropdown();
    }
  };

  window.addEventListener('resize', () => {
    if (dropdown.style.display === 'block') positionDropdown();
  });
  root.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    void open();
  });
  dropdown.addEventListener('click', async event => {
    event.stopPropagation();
    const target = (event.target as HTMLElement).closest('[data-model-id]') as HTMLElement | null;
    if (!target) return;
    selectedModelId = target.dataset.modelId || 'auto';
    if (label) label.textContent = target.dataset.modelName || 'Auto';
    close();
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
    <div id="chat-mode-wrapper" style="position:relative;display:flex;align-items:center;">
      <button id="btn-chat-mode" type="button" aria-haspopup="menu" aria-expanded="false" title="Choose Plan or Build" style="height:24px;min-width:66px;border:1px solid rgba(244,244,245,.16);background:#f4f4f5;color:#09090b;border-radius:6px;padding:0 8px;font-size:10px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;">
        <span id="chat-mode-label">Build</span><span style="font-size:9px;opacity:.72;">v</span>
      </button>
      <div id="chat-mode-menu" role="menu" style="position:absolute;right:0;bottom:calc(100% + 8px);width:190px;border:1px solid var(--border);background:var(--bg-surface);border-radius:10px;padding:5px;box-shadow:0 18px 50px rgba(0,0,0,.45);display:none;z-index:1000;">
        <button type="button" data-chat-mode="build" role="menuitem" style="width:100%;text-align:left;border:0;background:rgba(244,244,245,.08);color:var(--text);border-radius:7px;padding:8px;font-size:11px;font-weight:700;cursor:pointer;">Build <span style="display:block;color:var(--text-muted);font-weight:500;font-size:10px;margin-top:2px;">Generate or modify the app</span></button>
        <button type="button" data-chat-mode="plan" role="menuitem" style="width:100%;text-align:left;border:0;background:transparent;color:var(--text-muted);border-radius:7px;padding:8px;font-size:11px;font-weight:700;cursor:pointer;">Plan <span style="display:block;color:var(--text-sub);font-weight:500;font-size:10px;margin-top:2px;">Think without changing files</span></button>
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
    button.style.background = mode === 'plan' ? 'var(--bg-input)' : '#f4f4f5';
    button.style.color = mode === 'plan' ? 'var(--text)' : '#09090b';
    button.setAttribute('aria-expanded', 'false');
  }
  if (menu) menu.style.display = 'none';
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
  panel.style.cssText = 'display:none;flex:1;overflow:auto;padding:18px;background:#09090b;color:#f4f4f5;';
  panel.innerHTML = `
    <div style="display:grid;gap:14px;max-width:1120px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <h2 style="font-size:18px;margin:0 0 4px;">Project database</h2>
          <p style="font-size:12px;color:#a1a1aa;margin:0;">Shared Supabase backend isolated by project and organization.</p>
        </div>
        <button id="btn-add-secret" type="button" style="height:32px;border:1px solid rgba(255,255,255,.12);background:#f4f4f5;color:#09090b;border-radius:8px;padding:0 12px;font-size:12px;font-weight:800;cursor:pointer;">Add API key</button>
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
  const stored = getStoredProject();

  if (!currentProjectId || String(currentProjectId).startsWith('proj-')) {
    const created = await apiFetch<ProjectPayload>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: stored.name || 'Generated Huggy App',
        template: stored.template || 'custom',
        theme: stored.theme || 'dark',
        model: stored.model || selectedModel(),
        prompt: stored.desc || 'Create a polished fullstack web application.',
      }),
    });
    currentProjectId = created.project.id;
    localStorage.setItem('huggy-current-project', JSON.stringify({ ...stored, id: currentProjectId, name: created.project.name }));
    window.history.replaceState({}, '', `/builder.html?project=${encodeURIComponent(currentProjectId)}`);
    return created;
  }

  return apiFetch<ProjectPayload>(`/api/projects/${encodeURIComponent(currentProjectId)}`);
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
    if (projectName) projectName.textContent = payload.project.name;
    renderFiles(payload.files || []);
    if (payload.preview?.html) setPreview(payload.preview.html, payload.preview.status);
    restoreMessages(payload);
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
  payload.messages.slice(-12).forEach(message => {
    const card = appendMessage(message.role === 'user' ? 'user' : 'assistant', message.content);
    if (message.intent === 'plan') {
      lastPlan = message.content;
      addInlineAction(card, 'Build this plan', () => void generateFromPrompt('Build this plan', 'build', true));
    }
  });
}

async function generateFromPrompt(prompt: string, requestedMode: 'plan' | 'build', useLastPlan = false, extra: Record<string, unknown> = {}) {
  if (isGenerating || !prompt.trim()) return;
  setBusy(true);
  activeAbort = new AbortController();

  appendMessage('user', `${requestedMode === 'plan' ? 'Plan' : 'Build'}: ${prompt}`);
  const status = appendMessage('assistant', requestedMode === 'plan' ? 'Preparing a plan without changing files...' : 'Planning, generating, building preview...');
  let streamedText = '';
  try {
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
      if (eventType === 'credits_insufficient') {
        updateMessage(status, 'Credits are not enough for this action.');
        showCreditsModal(payload.required || payload.credits?.required || 0, payload.balance || 0);
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
        renderFiles(payload.files || []);
        if (payload.preview?.html) setPreview(payload.preview.html, payload.preview.status);
        const credits = payload.credits?.charged ? ` Credits used: ${payload.credits.charged}.` : '';
        const diff = payload.diff?.summary ? ` ${payload.diff.summary}.` : '';
        updateMessage(status, `${event.message || 'Application generated and preview updated.'}${diff}${credits}`);
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

async function refreshPreview() {
  if (!currentProjectId) return;
  const status = appendMessage('system', 'Refreshing preview from generated files...');
  try {
    const payload = await apiFetch<ProjectPayload>(`/api/projects/${encodeURIComponent(currentProjectId)}/preview`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (payload.preview?.html) setPreview(payload.preview.html, payload.preview.status);
    updateMessage(status, 'Preview refreshed from the persisted files.');
  } catch (error) {
    updateMessage(status, error instanceof Error ? error.message : 'Preview refresh failed.');
  }
}

function openPreview() {
  if (!currentPreviewHtml) return;
  const blob = new Blob([currentPreviewHtml], { type: 'text/html' });
  window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
}

async function deployProject() {
  const button = document.getElementById('btn-live-deploy') as HTMLButtonElement | null;
  if (!currentProjectId || !button) return;
  button.disabled = true;
  button.textContent = 'Deploying...';
  const status = appendMessage('system', 'queued -> building -> deploying -> assigning_domain');
  try {
    const payload = await apiFetch<DeployPayload>(`/api/projects/${encodeURIComponent(currentProjectId)}/deploy`, {
      method: 'POST',
      body: JSON.stringify({ userCredits: 100 }),
    });
    if (payload.event === 'credits_insufficient') {
      showCreditsModal(payload.credits?.required || 2, payload.credits?.balance || 0);
      updateMessage(status, 'Credits are not enough to deploy.');
      return;
    }
    updateMessage(status, `ready -> ${payload.deployment?.deployment_url || 'Deployment started'}`);
  } catch (error) {
    updateMessage(status, error instanceof Error ? error.message : 'Deployment failed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Deploy';
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
  const files = currentFiles.length ? currentFiles : [{ path: 'README.md', content: 'No generated files yet.' }];
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
  target.innerHTML = '<div style="color:#a1a1aa;font-size:12px;">Loading database...</div>';
  try {
    const payload = await apiFetch<any>(`/api/projects/${encodeURIComponent(currentProjectId)}/database`);
    const db = payload.database;
    const secrets = db.secrets || [];
    const integrations = db.integrations || [];
    const assets = db.assets || [];
    const activity = db.activity || [];
    const records = db.records_preview || [];
    target.innerHTML = `
      <div style="border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;background:rgba(255,255,255,.03);">
        <h3 style="margin:0 0 8px;font-size:13px;">Tables</h3>
        ${(db.tables || []).map((table: any) => `<div style="font-size:12px;color:#d4d4d8;">${escapeHtml(table.name)} <span style="color:#71717a;">${table.rows} rows</span></div>`).join('') || '<p style="font-size:12px;color:#71717a;">No project data yet.</p>'}
      </div>
      <div style="border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;background:rgba(255,255,255,.03);">
        <h3 style="margin:0 0 8px;font-size:13px;">API keys</h3>
        ${secrets.map((secret: any) => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#d4d4d8;margin-bottom:7px;"><span>${escapeHtml(secret.variable)}</span><span style="color:#a1a1aa;">${escapeHtml(secret.masked_value)} · ${escapeHtml(secret.status)}</span></div>`).join('') || '<p style="font-size:12px;color:#71717a;">No API keys configured.</p>'}
      </div>
      <div style="border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;background:rgba(255,255,255,.03);">
        <h3 style="margin:0 0 8px;font-size:13px;">Security</h3>
        <p style="font-size:12px;color:#a1a1aa;line-height:1.5;margin:0;">RLS required. Secrets masked. Service role is server-only.</p>
      </div>
      <div style="border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;background:rgba(255,255,255,.03);">
        <h3 style="margin:0 0 8px;font-size:13px;">Records</h3>
        ${records.map((record: any) => `<div style="font-size:11px;color:#d4d4d8;margin-bottom:6px;">${escapeHtml(record.path || record.table || 'record')}</div>`).join('') || '<p style="font-size:12px;color:#71717a;">No records yet.</p>'}
      </div>
      <div style="border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;background:rgba(255,255,255,.03);">
        <h3 style="margin:0 0 8px;font-size:13px;">Integrations</h3>
        ${integrations.map((item: any) => `<div style="font-size:12px;color:#d4d4d8;margin-bottom:6px;">${escapeHtml(item.service)} <span style="color:#71717a;">${escapeHtml(item.status)}</span></div>`).join('') || '<p style="font-size:12px;color:#71717a;">No integrations detected.</p>'}
      </div>
      <div style="border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;background:rgba(255,255,255,.03);">
        <h3 style="margin:0 0 8px;font-size:13px;">Storage</h3>
        ${assets.map((item: any) => `<div style="font-size:12px;color:#d4d4d8;margin-bottom:6px;">${escapeHtml(item.name)} <span style="color:#71717a;">${escapeHtml(item.kind || 'asset')}</span></div>`).join('') || '<p style="font-size:12px;color:#71717a;">No assets uploaded.</p>'}
      </div>
      <div style="border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;background:rgba(255,255,255,.03);">
        <h3 style="margin:0 0 8px;font-size:13px;">Activity</h3>
        ${activity.map((item: any) => `<div style="font-size:11px;color:#d4d4d8;margin-bottom:6px;">${escapeHtml(item.event_type)} - ${escapeHtml(item.message || '')}</div>`).join('') || '<p style="font-size:12px;color:#71717a;">No activity yet.</p>'}
      </div>
    `;
  } catch (error) {
    target.innerHTML = `<div style="font-size:12px;color:#fca5a5;">${escapeHtml(error instanceof Error ? error.message : 'Database unavailable')}</div>`;
  }
}

function showCreditsModal(required: number, balance: number) {
  showMiniModal('Credits required', `
    <p>You need ${required} credits, but your balance is ${balance}.</p>
    <div class="huggy-modal-actions">
      <button data-action="upgrade">Upgrade plan</button>
      <button data-action="topup">Buy credits</button>
      <button data-action="economy">Use cheaper model</button>
    </div>
  `, (action) => {
    if (action === 'upgrade') document.getElementById('btn-upgrade')?.click();
    if (action === 'economy') {
      selectedModelId = 'openai/gpt-5-nano';
      const label = document.getElementById('current-model-label');
      if (label) label.textContent = 'GPT-5 Nano';
    }
  });
}

function showApiKeyModal(requirements: any[]) {
  const rows = requirements.length ? requirements : [{ service: 'Custom', variable: 'CUSTOM_API_KEY', description: 'Project API key' }];
  showMiniModal('Connect external API', `
    <p>Keys are stored server-side and masked in the Database tab.</p>
    ${rows.map((item, index) => `
      <label style="display:grid;gap:5px;margin:10px 0;font-size:11px;color:#a1a1aa;">
        ${escapeHtml(item.service)} · ${escapeHtml(item.variable)}
        <input data-key-index="${index}" data-service="${escapeHtml(item.service)}" data-variable="${escapeHtml(item.variable)}" type="password" placeholder="${escapeHtml(item.variable)}" style="height:34px;border:1px solid rgba(255,255,255,.12);background:#09090b;color:#f4f4f5;border-radius:7px;padding:0 10px;">
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
    <p style="color:#71717a;">${escapeHtml(first.file || 'unknown file')}</p>
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
    <div style="width:min(420px,100%);border:1px solid rgba(255,255,255,.12);background:#18181b;color:#f4f4f5;border-radius:14px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.45);">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;">
        <h3 style="font-size:15px;margin:0;">${escapeHtml(title)}</h3>
        <button data-action="close" style="border:0;background:transparent;color:#a1a1aa;font-size:18px;cursor:pointer;">×</button>
      </div>
      <div style="font-size:12px;color:#d4d4d8;line-height:1.5;">${html}</div>
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
    void generateFromPrompt(value, mode);
  };

  input.addEventListener('input', () => {
    submit.classList.toggle('active', input.value.trim().length > 0);
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

function ensureResizableSidebar() {
  const body = document.querySelector('.workspace-body') as HTMLElement | null;
  const sidebar = document.querySelector('.sidebar-pane') as HTMLElement | null;
  if (!body || !sidebar || document.getElementById('huggy-sidebar-resizer')) return;
  const savedWidth = Number(localStorage.getItem('huggy-sidebar-width') || 380);
  const applyWidth = (width: number) => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      body.style.gridTemplateColumns = '';
      body.style.removeProperty('--huggy-sidebar-width');
      return;
    }
    const next = Math.min(560, Math.max(300, width));
    body.style.gridTemplateColumns = `${next}px minmax(0, 1fr)`;
    body.style.setProperty('--huggy-sidebar-width', `${next}px`);
    const currentHandle = document.getElementById('huggy-sidebar-resizer') as HTMLElement | null;
    if (currentHandle) currentHandle.style.left = `${next - 4}px`;
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
      const next = Math.min(560, Math.max(300, startWidth + moveEvent.clientX - startX));
      body.style.gridTemplateColumns = `${next}px minmax(0, 1fr)`;
      body.style.setProperty('--huggy-sidebar-width', `${next}px`);
      handle.style.left = `${next - 4}px`;
      localStorage.setItem('huggy-sidebar-width', String(Math.round(next)));
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
  bindChat();
  void loadProject();
}

window.addEventListener('huggy:auth-ready', init);
if (document.documentElement.dataset.authReady === 'true') init();
