import { apiFetch } from './lib/api';

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
  preview?: {
    status: string;
    html: string;
  };
  summary?: string;
  model?: string;
  credits?: {
    estimated?: number;
    charged?: number;
    remaining?: number;
  };
};

type DeployPayload = {
  success: boolean;
  deployment: {
    deployment_url: string;
    status: string;
  };
};

let currentProjectId = '';
let currentFiles: GeneratedFile[] = [];
let currentPreviewHtml = '';
let isGenerating = false;

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
  return localStorage.getItem('huggy-selected-model') || getStoredProject().model || 'auto';
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
    <p class="msg-body-paragraph">${escapeHtml(body)}</p>
  `;
  scroll.appendChild(card);
  scroll.scrollTop = scroll.scrollHeight;
  return card;
}

function updateMessage(card: HTMLElement | null, body: string) {
  const paragraph = card?.querySelector('.msg-body-paragraph');
  if (paragraph) paragraph.textContent = body;
}

function setPreview(html: string) {
  currentPreviewHtml = html;
  const frame = document.getElementById('preview-iframe-element') as HTMLIFrameElement | null;
  if (frame) frame.srcdoc = html;

  const previewTab = document.getElementById('tab-btn-preview') as HTMLButtonElement | null;
  previewTab?.click();

  const address = document.querySelector('.preview-address-glow span:last-child');
  if (address) address.textContent = `preview.huggy.local / ${currentProjectId.slice(0, 8)}`;
}

function renderFiles(files: GeneratedFile[]) {
  currentFiles = files;
  const tree = document.querySelector('.explorer-tree-scroll');
  if (tree) {
    tree.innerHTML = '';
    files.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = `tree-file${index === 0 ? ' selected' : ''}`;
      item.setAttribute('data-file', file.path);
      item.innerHTML = `<span class="tree-file-icon">File</span><span>${escapeHtml(file.path)}</span>`;
      item.addEventListener('click', () => selectFile(file.path));
      tree.appendChild(item);
    });
  }
  if (files[0]) selectFile(files.find(file => file.path === 'index.html')?.path || files[0].path);
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
    <button id="btn-live-deploy" type="button" style="${style}background:#f4f4f5;color:#09090b;font-weight:700;">Deploy</button>
  `);

  document.getElementById('btn-live-refresh-preview')?.addEventListener('click', refreshPreview);
  document.getElementById('btn-live-open-preview')?.addEventListener('click', openPreview);
  document.getElementById('btn-live-deploy')?.addEventListener('click', deployProject);
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
  const projectName = document.getElementById('project-name');
  const loading = appendMessage('system', 'Loading project files and preview...');
  try {
    const payload = await ensureProject();
    if (projectName) projectName.textContent = payload.project.name;
    renderFiles(payload.files || []);
    if (payload.preview?.html) setPreview(payload.preview.html);
    updateMessage(loading, 'Project synchronized. Generate or edit the app from the chat.');
  } catch (error) {
    updateMessage(loading, error instanceof Error ? error.message : 'Unable to load project.');
  }
}

async function generateFromPrompt(prompt: string) {
  if (isGenerating || !prompt.trim()) return;
  isGenerating = true;

  appendMessage('user', prompt);
  const status = appendMessage('assistant', 'Planning changes, generating files, building preview...');
  try {
    const payload = await apiFetch<ProjectPayload>(`/api/projects/${encodeURIComponent(currentProjectId)}/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt, modelId: selectedModel() }),
    });

    renderFiles(payload.files || []);
    if (payload.preview?.html) setPreview(payload.preview.html);
    const credits = payload.credits?.charged ? ` Credits used: ${payload.credits.charged}.` : '';
    updateMessage(status, `${payload.summary || 'Application generated and preview updated.'}${credits}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed.';
    updateMessage(status, `${message} Use Fix with AI after checking configuration and prompt details.`);
  } finally {
    isGenerating = false;
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
    if (payload.preview?.html) setPreview(payload.preview.html);
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
    updateMessage(status, `ready -> ${payload.deployment.deployment_url}`);
  } catch (error) {
    updateMessage(status, error instanceof Error ? error.message : 'Deployment failed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Deploy';
  }
}

function bindChat() {
  const input = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
  const oldSubmit = document.getElementById('chat-submit-btn') as HTMLButtonElement | null;
  if (!input || !oldSubmit) return;

  const submit = oldSubmit.cloneNode(true) as HTMLButtonElement;
  oldSubmit.replaceWith(submit);
  submit.style.pointerEvents = 'auto';
  submit.style.cursor = 'pointer';

  const send = () => {
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    input.style.height = '48px';
    submit.classList.remove('active');
    void generateFromPrompt(value);
  };

  input.addEventListener('input', () => {
    submit.classList.toggle('active', input.value.trim().length > 0);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      send();
    }
  }, true);

  submit.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    send();
  }, true);
}

function init() {
  bindChat();
  void loadProject();
}

window.addEventListener('huggy:auth-ready', init);
if (document.documentElement.dataset.authReady === 'true') init();
