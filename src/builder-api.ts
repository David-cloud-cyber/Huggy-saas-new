import { apiRequest, currentProjectId, ProjectFile, setCurrentProjectId } from './lib/api';

const projectId = currentProjectId();
if (projectId) setCurrentProjectId(projectId);

const chatContainer = document.getElementById('chat-container');
const textarea = document.getElementById('ai-textarea') as HTMLTextAreaElement | null;
const sendBtn = document.getElementById('btn-send-builder') as HTMLButtonElement | null;
const deployBtn = document.querySelector('.btn-deploy') as HTMLButtonElement | null;
const previewFrame = document.getElementById('preview-frame') as HTMLElement | null;
const fileTree = document.getElementById('file-tree') as HTMLElement | null;
const previewStats = document.querySelector('.preview-stats');
let files: ProjectFile[] = [];

function addSystemMessage(message: string) {
  if (!chatContainer) return;
  const node = document.createElement('div');
  node.className = 'msg-system';
  node.textContent = message;
  chatContainer.appendChild(node);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function renderFiles() {
  if (!fileTree) return;
  fileTree.innerHTML = files.map((file) => `
    <div class="file-item" data-path="${file.path}">
      <span class="file-dot" style="background:#60A5FA"></span>
      <span class="file-name">${file.path}</span>
      <span class="file-size">${(file.content.length / 1024).toFixed(1)}kb</span>
    </div>
  `).join('');
}

async function refreshPreview() {
  if (!projectId || !previewFrame) return;
  const { html } = await apiRequest<{ html: string }>(`/api/projects/${projectId}/preview`, { method: 'POST' });
  previewFrame.innerHTML = `<iframe class="sandbox-preview" sandbox="allow-scripts" srcdoc="${escapeAttribute(html)}"></iframe>`;
  if (previewStats) previewStats.textContent = 'Sandbox preview · responsive';
}

async function loadProject() {
  if (!projectId) return;
  try {
    const bundle = await apiRequest<{ project: any; files: ProjectFile[] }>(`/api/projects/${projectId}`);
    files = bundle.files || [];
    const projectName = document.getElementById('project-name');
    if (projectName) projectName.textContent = bundle.project.name;
    renderFiles();
    await refreshPreview();
  } catch (error: any) {
    addSystemMessage(error.message || 'Unable to load project.');
  }
}

async function generateFromChat(prompt: string) {
  if (!projectId || !prompt.trim()) return;
  sendBtn?.setAttribute('disabled', 'true');
  addSystemMessage('Generating fullstack files...');
  try {
    const result = await apiRequest<{ files: ProjectFile[]; summary: string }>(`/api/projects/${projectId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
    files = result.files;
    renderFiles();
    await refreshPreview();
    addSystemMessage(result.summary || 'Generation complete.');
  } catch (error: any) {
    addSystemMessage(error.message || 'Generation failed.');
  } finally {
    sendBtn?.removeAttribute('disabled');
  }
}

async function deployProject() {
  if (!projectId || !deployBtn) return;
  deployBtn.disabled = true;
  deployBtn.textContent = 'Deploying...';
  try {
    const { deployment } = await apiRequest<{ deployment: { deployment_url: string; status: string } }>(`/api/projects/${projectId}/deploy`, {
      method: 'POST'
    });
    deployBtn.textContent = 'Deployed';
    addSystemMessage(`Deployed: ${deployment.deployment_url}`);
    const address = document.querySelector('.preview-address span:last-child');
    if (address) address.textContent = deployment.deployment_url;
  } catch (error: any) {
    deployBtn.textContent = 'Deploy';
    deployBtn.disabled = false;
    addSystemMessage(error.message || 'Deployment failed.');
  }
}

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('#btn-send-builder')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const prompt = textarea?.value.trim() || '';
    if (prompt) {
      if (textarea) textarea.value = '';
      generateFromChat(prompt);
    }
  }
  if (target.closest('.btn-deploy')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    deployProject();
  }
}, true);

const initialPrompt = sessionStorage.getItem('huggy-initial-prompt');
loadProject().then(() => {
  if (initialPrompt && projectId) {
    sessionStorage.removeItem('huggy-initial-prompt');
    generateFromChat(initialPrompt);
  }
});

function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
