import { apiRequest, currentProjectId, ensureDevSession, ProjectFile, safeText, setCurrentProjectId } from './lib/api';

type Deployment = { id: string; deployment_url: string; status: string; created_at: string };
type DomainRecord = { id: string; domain: string; status: string; type: string; is_primary: boolean };

ensureDevSession();
injectBuilderLiveStyles();

const projectId = currentProjectId();
if (projectId) setCurrentProjectId(projectId);

let files: ProjectFile[] = [];
let selectedModel = 'auto';
let previewReady = false;

void bootBuilder();

async function bootBuilder() {
  await loadModels();
  await loadWallet();
  await loadProject();
  installChatHandlers();
  installPreviewHandlers();
  installDeployHandler();
  installModelSelector();
}

async function loadWallet() {
  try {
    const { wallet } = await apiRequest<{ wallet: { balance: number; plan_id: string } }>('/api/billing/wallet');
    const badge = document.createElement('span');
    badge.className = 'live-credit-badge';
    badge.textContent = `${wallet.balance.toFixed(1)} credits · ${wallet.plan_id}`;
    document.querySelector('.topbar-right')?.prepend(badge);
  } catch {
    addSystemMessage('Billing status unavailable. Check backend configuration.', 'error');
  }
}

async function loadModels() {
  try {
    const { models } = await apiRequest<{ models: any[] }>('/api/ai/models');
    const dropdown = document.getElementById('model-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = `
      <div class="live-model-sheet-header">
        <strong>Choose AI model</strong>
        <span>Auto optimizes quality, speed, and credits.</span>
      </div>
      <div class="model-option active" data-id="auto" data-name="Auto">
        <div class="opt-meta"><span class="opt-name">Auto <em>Recommended</em></span><span class="opt-desc">Best model for the task · protects credits</span></div>
      </div>
      ${models.map((model) => `
        <div class="model-option ${model.upgradeRequired ? 'locked' : ''}" data-id="${safeText(model.id)}" data-name="${safeText(model.displayName)}">
          <div class="model-dot"></div>
          <div class="opt-meta">
            <span class="opt-name">${safeText(model.displayName)} <em>${safeText(model.tier)}</em></span>
            <span class="opt-desc">${safeText(model.provider)} · ${safeText(model.strengths?.join(', '))} · ${safeText(model.costLabel)}</span>
          </div>
          ${model.upgradeRequired ? '<span class="live-upgrade-chip">Upgrade</span>' : ''}
          ${model.requiresConfirmation ? '<span class="live-confirm-chip">Confirm</span>' : ''}
        </div>
      `).join('')}`;
  } catch {
    addSystemMessage('Model catalog unavailable.', 'error');
  }
}

async function loadProject() {
  if (!projectId) {
    addSystemMessage('No project selected. Return to dashboard and create a project.', 'error');
    return;
  }

  try {
    const bundle = await apiRequest<{ project: any; files: ProjectFile[]; deployments: Deployment[] }>(`/api/projects/${projectId}`);
    files = bundle.files || [];
    const projectName = document.getElementById('project-name');
    if (projectName) projectName.textContent = bundle.project.name;
    renderFiles();
    renderDeployments(bundle.deployments || []);
    await refreshPreview();
  } catch (error) {
    addSystemMessage(error instanceof Error ? error.message : 'Unable to load project.', 'error');
  }
}

function installChatHandlers() {
  const textarea = getChatTextarea();
  document.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest('#btn-send-builder, #chat-submit-btn')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const prompt = textarea?.value.trim() || '';
    if (!prompt) return;
    if (textarea) textarea.value = '';
    await generate(prompt);
  }, true);
}

async function generate(prompt: string, fix = false) {
  if (!projectId) return;
  previewReady = false;
  setPreviewStatus('generating', fix ? 'Fixing with AI...' : 'Generating application...');
  addUserMessage(prompt);
  startTimeline(['queued', 'routing_model', 'writing_files', 'building_preview']);

  try {
    const result = await apiRequest<{ files: ProjectFile[]; summary: string; routing: any; credits: { charged: number } }>(`/api/projects/${projectId}/generate`, {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        model: selectedModel === 'auto' ? undefined : selectedModel,
        confirmedPremium: true
      })
    });
    files = result.files || [];
    renderFiles();
    addSystemMessage(`${result.summary || 'Generation complete.'} · ${result.credits.charged} credits`, 'success');
    await refreshPreview();
  } catch (error) {
    setPreviewStatus('failed', error instanceof Error ? error.message : 'Generation failed');
    showBuildError(error instanceof Error ? error.message : 'Generation failed');
  }
}

function installPreviewHandlers() {
  document.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.btn-refresh')) {
      event.preventDefault();
      await refreshPreview();
    }
    const deviceButton = target.closest('.device-btn') as HTMLElement | null;
    if (deviceButton) {
      event.preventDefault();
      setPreviewDevice(deviceButton.dataset.device || 'desktop');
    }
    if (target.closest('#btn-open-preview')) {
      event.preventDefault();
      if (projectId) window.open(`/preview/${encodeURIComponent(projectId)}`, '_blank', 'noopener,noreferrer');
    }
    if (target.closest('#btn-fix-ai')) {
      event.preventDefault();
      await generate('Fix the latest build or preview error and keep the current design direction.', true);
    }
  });
}

async function refreshPreview() {
  if (!projectId) return;
  setPreviewStatus('building', 'Building preview...');
  try {
    const { html } = await apiRequest<{ html: string }>(`/api/projects/${projectId}/preview`, { method: 'POST' });
    const frame = getPreviewFrame();
    if (!frame) return;
    frame.style.display = 'flex';
    frame.style.flexDirection = 'column';
    frame.innerHTML = `<div class="live-preview-controls"></div><iframe title="Generated app preview" class="live-preview-iframe" sandbox="allow-forms allow-scripts" srcdoc="${escapeAttr(html)}"></iframe>`;
    ensurePreviewButtons();
    ensureDeviceControls();
    previewReady = true;
    setPreviewStatus('ready', 'Preview ready');
    const deploy = document.querySelector('.btn-deploy, .btn-publish') as HTMLButtonElement | null;
    if (deploy) deploy.disabled = false;
  } catch (error) {
    previewReady = false;
    setPreviewStatus('failed', error instanceof Error ? error.message : 'Preview failed');
  }
}

function installDeployHandler() {
  const deploy = document.querySelector('.btn-deploy, .btn-publish') as HTMLButtonElement | null;
  if (deploy) {
    deploy.disabled = true;
    deploy.textContent = 'Publish';
  }

  document.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest('.btn-deploy, .btn-publish')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!previewReady) {
      addSystemMessage('Preview must be ready before publishing.', 'error');
      return;
    }

    deploy?.setAttribute('disabled', 'true');
    addSystemMessage('Deploy queued...', 'info');
    try {
      const result = await apiRequest<{ deployment: Deployment; deployment_steps: string[]; credits: { charged: number } }>(`/api/projects/${projectId}/deploy`, {
        method: 'POST'
      });
      for (const step of result.deployment_steps || []) addSystemMessage(`Deploy: ${step}`, step === 'ready' ? 'success' : 'info');
      addSystemMessage(`Published: ${result.deployment.deployment_url} · ${result.credits.charged} credits`, 'success');
      renderDeployments([result.deployment]);
      const address = document.querySelector('.preview-address');
      if (address) address.textContent = result.deployment.deployment_url;
    } catch (error) {
      addSystemMessage(error instanceof Error ? error.message : 'Deployment failed', 'error');
      if (deploy) deploy.disabled = false;
    }
  }, true);
}

function installModelSelector() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const option = target.closest('.model-option') as HTMLElement | null;
    if (!option) return;
    event.stopImmediatePropagation();
    if (option.classList.contains('locked')) {
      addSystemMessage('This model requires an upgrade.', 'error');
      return;
    }
    selectedModel = option.dataset.id || 'auto';
    document.querySelectorAll('.model-option').forEach((node) => node.classList.remove('active'));
    option.classList.add('active');
    const label = document.getElementById('current-model-label');
    if (label) label.textContent = option.dataset.name || 'Auto';
    document.getElementById('model-dropdown')?.classList.remove('open');
  }, true);
}

function renderFiles() {
  const tree = document.getElementById('file-tree');
  if (!tree) return;
  tree.innerHTML = files.map((file) => `
    <div class="file-item live-file-item" data-path="${safeText(file.path)}">
      <span class="file-name">${safeText(file.path)}</span>
      <span class="file-size">${(file.content.length / 1024).toFixed(1)}kb</span>
    </div>
  `).join('');
}

function renderDeployments(deployments: Deployment[]) {
  let panel = document.getElementById('live-deployments');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'live-deployments';
    panel.className = 'live-deployments';
    (document.querySelector('.preview-panel') || document.querySelector('.preview-screen-panel') || document.querySelector('main'))?.appendChild(panel);
  }
  panel.innerHTML = `<strong>Deployments</strong>${deployments.length ? deployments.map((deployment) => `
    <a href="${safeText(deployment.deployment_url)}" target="_blank" rel="noreferrer">${safeText(deployment.status)} · ${safeText(deployment.deployment_url)}</a>
  `).join('') : '<span>No deployments yet.</span>'}`;
}

function setPreviewStatus(state: string, message: string) {
  const stats = ensurePreviewStats();
  if (stats) stats.textContent = `${state} · ${message}`;
}

function startTimeline(steps: string[]) {
  steps.forEach((step, index) => {
    setTimeout(() => addSystemMessage(`Agent: ${step}`, 'info'), index * 120);
  });
}

function showBuildError(message: string) {
  const frame = getPreviewFrame();
  if (frame) {
    frame.innerHTML = `
      <div class="live-build-error">
        <strong>Preview failed</strong>
        <p>${safeText(message)}</p>
        <button id="btn-fix-ai">Fix with AI</button>
      </div>`;
  }
}

function addUserMessage(message: string) {
  const container = getChatContainer();
  if (!container) return;
  const node = document.createElement('div');
  node.className = 'msg-user';
  node.innerHTML = `<div class="msg-user-bubble">${safeText(message)}</div><div class="msg-time">now</div>`;
  container.appendChild(node);
  container.scrollTop = container.scrollHeight;
}

function addSystemMessage(message: string, tone: 'info' | 'success' | 'error' = 'info') {
  const container = getChatContainer();
  if (!container) return;
  const node = document.createElement('div');
  node.className = `msg-system live-msg-${tone}`;
  node.textContent = message;
  container.appendChild(node);
  container.scrollTop = container.scrollHeight;
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function injectBuilderLiveStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .live-credit-badge{font-family:"JetBrains Mono";font-size:10px;color:var(--text-muted);border:1px solid var(--border);border-radius:999px;padding:5px 8px;background:var(--bg-input);white-space:nowrap}
    .live-preview-controls{position:relative;z-index:30;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;background:var(--bg-panel);border-bottom:1px solid var(--border)}
    .live-preview-iframe{position:relative;z-index:1;width:100%;flex:1;min-height:420px;border:0;background:white;border-radius:10px}
    .preview-frame.mobile .live-preview-iframe{max-width:390px;margin:0 auto;display:block}
    .preview-frame.tablet .live-preview-iframe{max-width:768px;margin:0 auto;display:block}
    .live-build-error{height:100%;display:grid;place-items:center;text-align:center;padding:28px;color:var(--text)}
    .live-build-error p{max-width:520px;color:var(--text-muted);line-height:1.6}
    .live-build-error button{margin-top:14px;padding:10px 14px;border-radius:10px;background:var(--accent);color:var(--bg);font-weight:700}
    .live-msg-success{color:var(--success)!important}.live-msg-error{color:var(--error)!important}
    .live-deployments{border-top:1px solid var(--border);padding:12px;display:grid;gap:7px;font-size:12px;background:var(--bg-panel)}
    .live-deployments strong{font-family:"JetBrains Mono";font-size:10px;text-transform:uppercase;color:var(--text-sub)}
    .live-deployments a,.live-deployments span{color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .preview-stats{pointer-events:none}
    .live-device-controls{display:flex;align-items:center;gap:4px}
    .device-btn{height:28px;padding:0 9px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-sub);font-size:11px;cursor:pointer}
    .live-mobile-publish{height:32px;padding:0 14px;border-radius:10px;border:1px solid rgba(13,235,180,.4);background:linear-gradient(135deg,#0debb4,#86ffe1);color:#061411;font-weight:800;font-size:12px;box-shadow:0 12px 32px rgba(13,235,180,.18);cursor:pointer;white-space:nowrap}
    .live-model-sheet-header{padding:12px;border-bottom:1px solid var(--border);display:grid;gap:4px}
    .live-model-sheet-header strong{font-size:13px}.live-model-sheet-header span{font-size:11px;color:var(--text-muted)}
    .model-option.locked{opacity:.58}.live-upgrade-chip,.live-confirm-chip{margin-left:auto;font-size:9px;border:1px solid var(--border);border-radius:999px;padding:2px 6px;color:var(--warning)}
    .opt-name em{font-style:normal;font-size:9px;color:var(--text-sub);margin-left:5px;text-transform:uppercase}
    #btn-open-preview{height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--border);font-size:11px}
    @media(max-width:700px){body{height:auto!important;min-height:100vh!important;overflow:auto!important}.app-workspace{height:auto!important;min-height:100vh!important}.workspace-body{display:flex!important;flex-direction:column!important;overflow:visible!important}.sidebar-pane{width:100%!important;min-height:54vh!important;border-right:0!important;border-bottom:1px solid var(--border)!important}.viewport-content-holder{width:100%!important;min-height:680px!important;overflow:visible!important;flex:none!important}.code-screen-layout{display:grid!important;grid-template-columns:1fr!important;min-height:680px!important}.explorer-column{display:none!important}.preview-screen-panel{position:relative!important;min-height:620px!important}.preview-address-row{position:relative!important;z-index:50!important;height:auto!important;min-height:42px!important;flex-wrap:wrap!important;padding:8px!important}.preview-address-glow{min-width:160px!important}#model-dropdown.open{position:fixed!important;left:0!important;right:0!important;bottom:0!important;top:auto!important;width:100%!important;max-height:75vh;border-radius:18px 18px 0 0;z-index:20000;overflow:auto}.btn-publish{display:none!important}}
  `;
  document.head.appendChild(style);

  if (!document.getElementById('btn-open-preview')) {
    const button = document.createElement('button');
    button.id = 'btn-open-preview';
    button.type = 'button';
    button.textContent = 'Open';
    (document.querySelector('.preview-toolbar') || document.querySelector('.preview-address-row'))?.appendChild(button);
  }
  if (!document.querySelector('.btn-refresh')) {
    const button = document.createElement('button');
    button.className = 'btn-refresh';
    button.type = 'button';
    button.textContent = 'Refresh';
    (document.querySelector('.preview-toolbar') || document.querySelector('.preview-address-row'))?.appendChild(button);
  }
  ensurePreviewButtons();
  ensureDeviceControls();
  ensurePreviewStats();
}

function getChatTextarea() {
  return document.querySelector<HTMLTextAreaElement>('#ai-textarea, #chat-textarea-box');
}

function getChatContainer() {
  return document.querySelector<HTMLElement>('#chat-container, #sidebar-scroll-area');
}

function getPreviewFrame() {
  return document.querySelector<HTMLElement>('#preview-frame, #screen-layout-preview, .preview-screen-panel');
}

function ensurePreviewStats() {
  let stats = document.querySelector<HTMLElement>('.preview-stats');
  if (!stats) {
    stats = document.createElement('div');
    stats.className = 'preview-stats';
    const host = document.querySelector('.preview-address-row') || getPreviewFrame();
    host?.appendChild(stats);
  }
  return stats;
}

function ensureDeviceControls() {
  if (document.querySelector('.device-btn')) return;
  const host = document.querySelector('.live-preview-controls') || document.querySelector('.preview-address-row') || getPreviewFrame();
  if (!host) return;
  const group = document.createElement('div');
  group.className = 'live-device-controls';
  group.innerHTML = `
    <button class="device-btn" data-device="desktop" type="button">Desktop</button>
    <button class="device-btn" data-device="tablet" type="button">Tablet</button>
    <button class="device-btn" data-device="mobile" type="button">Mobile</button>
  `;
  host.prepend(group);
}

function ensurePreviewButtons() {
  const host = document.querySelector('.live-preview-controls') || document.querySelector('.preview-toolbar') || document.querySelector('.preview-address-row') || getPreviewFrame();
  if (!host) return;
  if (!document.getElementById('btn-open-preview')) {
    const button = document.createElement('button');
    button.id = 'btn-open-preview';
    button.type = 'button';
    button.textContent = 'Open';
    host.appendChild(button);
  }
  if (!document.querySelector('.btn-refresh')) {
    const button = document.createElement('button');
    button.className = 'btn-refresh';
    button.type = 'button';
    button.textContent = 'Refresh';
    host.appendChild(button);
  }
  if (!document.querySelector('.live-mobile-publish')) {
    const button = document.createElement('button');
    button.className = 'btn-deploy live-mobile-publish';
    button.type = 'button';
    button.textContent = 'Publish';
    host.appendChild(button);
  }
}

function setPreviewDevice(device: string) {
  const frame = getPreviewFrame();
  if (!frame) return;
  frame.classList.remove('mobile', 'tablet');
  if (device === 'mobile' || device === 'tablet') frame.classList.add(device);
}
