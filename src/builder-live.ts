import { apiFetch, apiStream } from './lib/api';
import { normalizeAiChatInputs } from './ai-chat-input-normalizer';
import { initHuggyMotion } from './huggy-motion';
import {
  consumePendingPromptAttachments,
  initPromptInputActions,
  storePendingPromptAttachments,
  type PendingPromptAttachment,
} from './prompt-input-actions';
import { MODEL_REGISTRY, PROVIDER_META } from './config/ai-models';
import { providerIconSvg } from './model-provider-icons';
import { ensureSettingsPanel, openSettings } from './settings-panel';
import { mountBuilderConversation, type HuggyConversationApi } from './builder-conversation-island';

type ChatMode = 'auto' | 'plan' | 'build';
type MessageHandle = HTMLElement & { __huggyMessageId?: string };

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
  selected_mode?: ChatMode;
  selected_model?: string;
  active_tab?: 'preview' | 'code' | 'database' | 'analysis';
  sidebar_width?: number;
  preview_device?: PreviewDevice;
};

type UserWorkspaceState = {
  last_project_id?: string;
  builder_draft_prompt?: string;
  builder_selected_mode?: ChatMode;
  builder_selected_model?: string;
  builder_active_tab?: 'preview' | 'code' | 'database' | 'analysis';
  builder_preview_device?: PreviewDevice;
};

type PreviewDevice = 'desktop' | 'tablet' | 'mobile';
type EmptyPreviewMode = 'idle' | 'working';

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

type PublishCheck = {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
};

type PublishStatusPayload = {
  state: 'not_ready' | 'ready_to_publish' | 'published' | 'changes_unpublished';
  public_url: string;
  custom_domain: string | null;
  latest_published_at: string | null;
  project_updated_at: string | null;
  badge_required: boolean;
  checks: PublishCheck[];
  can_publish: boolean;
  has_unpublished_changes: boolean;
};

type PublishApiPayload = {
  success: boolean;
  publish: PublishStatusPayload;
  deployment?: {
    id?: string;
    status?: string;
    public_url?: string;
    deployment_url?: string;
    custom_domain?: string | null;
    created_at?: string;
  } | null;
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
let lastAgentRunId = '';
let activeAbort: AbortController | null = null;
let stopRequested = false;
let workingTimer: number | null = null;
let activeWorkingCard: HTMLElement | null = null;
let activeWorkingLabel = 'Thinking';
let selectedChatMode: ChatMode = 'auto';
let selectedModelId = 'auto';
let selectedPreviewDevice: PreviewDevice = 'desktop';
let currentProjectName = 'Untitled app';
let initialBuilderHandoff: { prompt: string; mode: ChatMode } | null = null;
let analysisPollTimer: number | null = null;
let analysisRange = '30d';
let projectWorkspaceState: WorkspaceState | null = null;
let userWorkspaceState: UserWorkspaceState | null = null;
let workspaceSaveTimer: number | null = null;
let chatShimmerStyleInstalled = false;
let emptyPreviewMode: EmptyPreviewMode | 'ready' = 'idle';
let emptyPreviewLabel = '';
let conversationApi: HuggyConversationApi | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function emptyPreviewHtml(mode: EmptyPreviewMode, label = '') {
  const isWorking = mode === 'working';
  const status = escapeHtml(label || (isWorking ? 'Assembling preview' : 'Ready when you are'));
  const stateClass = isWorking ? 'working' : 'idle';
  return `<!DOCTYPE html>
<html lang="en" data-preview-state="${stateClass}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --panel: #ffffff;
  --panel-soft: #f6f7f9;
  --text: #09090b;
  --muted: #52525b;
  --line: rgba(9,9,11,.14);
  --line-strong: rgba(9,9,11,.22);
  --accent: #09090b;
  --glow: rgba(9,9,11,.08);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #09090b;
    --panel: #111113;
    --panel-soft: #18181b;
    --text: #f8fafc;
    --muted: #b8bbc3;
    --line: rgba(255,255,255,.12);
    --line-strong: rgba(255,255,255,.22);
    --accent: #ffffff;
    --glow: rgba(255,255,255,.10);
  }
}
* { box-sizing: border-box; }
body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px),
    radial-gradient(circle at 50% 38%, var(--glow), transparent 34%),
    var(--bg);
  background-size: 48px 48px, 48px 48px, 100% 100%, auto;
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.studio {
  position: relative;
  width: min(680px, calc(100vw - 48px));
  min-height: 360px;
  display: grid;
  place-items: center;
}
.orbit {
  position: absolute;
  inset: 54px 76px;
  border: 1px dashed var(--line-strong);
  border-radius: 28px;
}
.connector {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 58%;
  height: 1px;
  transform: translate(-50%, -50%);
  background: linear-gradient(90deg, transparent, var(--line-strong), transparent);
}
.connector.vertical {
  width: 1px;
  height: 54%;
  background: linear-gradient(180deg, transparent, var(--line-strong), transparent);
}
.pulse {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  background: var(--accent);
  box-shadow: 0 0 0 6px var(--glow);
  opacity: .9;
}
.tile {
  position: absolute;
  width: 156px;
  min-height: 106px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  box-shadow: 0 18px 54px rgba(9,9,11,.08), 0 4px 12px rgba(9,9,11,.04);
  padding: 14px;
}
.tile.prompt { left: 8px; top: 38px; }
.tile.interface { right: 8px; top: 38px; }
.tile.data { left: 8px; bottom: 38px; }
.tile.preview { right: 8px; bottom: 38px; }
.tile-label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
  color: var(--text);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--accent);
}
.line {
  height: 8px;
  border-radius: 999px;
  background: var(--panel-soft);
  border: 1px solid var(--line);
  margin-top: 8px;
}
.line.short { width: 64%; }
.line.mid { width: 82%; }
.blocks {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.block {
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-soft);
}
.status {
  position: relative;
  z-index: 2;
  width: min(282px, 70vw);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  box-shadow: 0 20px 80px rgba(9,9,11,.10);
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
}
.status strong {
  color: var(--text);
  font-weight: 760;
}
.working .shining-text {
  color: transparent;
  background-image: linear-gradient(110deg,#404040 0%,#404040 35%,#fff 50%,#404040 75%,#404040 100%);
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  animation: preview-shine 2s linear infinite;
}
.working .pulse { animation: pulse 1.4s cubic-bezier(.22,1,.36,1) infinite; }
.working .connector::after,
.working .connector.vertical::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  transform: translateX(-100%);
  animation: flow 1.45s cubic-bezier(.22,1,.36,1) infinite;
}
.working .connector.vertical::after {
  background: linear-gradient(180deg, transparent, var(--accent), transparent);
  transform: translateY(-100%);
  animation-name: flowY;
}
.working .tile {
  animation: lift 1.8s cubic-bezier(.22,1,.36,1) infinite;
}
.working .tile.interface { animation-delay: .12s; }
.working .tile.data { animation-delay: .24s; }
.working .tile.preview { animation-delay: .36s; }
.working .line,
.working .block {
  position: relative;
  overflow: hidden;
}
.working .line::after,
.working .block::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.72), transparent);
  transform: translateX(-100%);
  animation: shimmer 1.35s cubic-bezier(.22,1,.36,1) infinite;
}
@media (prefers-color-scheme: dark) {
  .working .line::after,
  .working .block::after { background: linear-gradient(90deg, transparent, rgba(255,255,255,.13), transparent); }
}
@keyframes shimmer { to { transform: translateX(100%); } }
@keyframes preview-shine {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
@keyframes flow { to { transform: translateX(100%); } }
@keyframes flowY { to { transform: translateY(100%); } }
@keyframes pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(.9); opacity: .55; }
  50% { transform: translate(-50%, -50%) scale(1.12); opacity: 1; }
}
@keyframes lift {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@media (max-width: 620px) {
  .studio { width: min(390px, calc(100vw - 28px)); min-height: 420px; }
  .orbit { inset: 48px 42px; }
  .connector { width: 44%; }
  .connector.vertical { height: 60%; }
  .tile { width: 132px; min-height: 96px; padding: 12px; border-radius: 15px; }
  .tile.prompt, .tile.data { left: 0; }
  .tile.interface, .tile.preview { right: 0; }
  .status { width: min(248px, 76vw); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
</style>
</head>
<body>
  <main class="studio ${stateClass}" aria-label="Preview preparation">
    <div class="orbit"></div>
    <div class="connector"></div>
    <div class="connector vertical"></div>
    <div class="pulse"></div>
    <section class="tile prompt" aria-label="Prompt">
      <div class="tile-label"><span class="dot"></span>Prompt</div>
      <div class="line mid"></div><div class="line"></div><div class="line short"></div>
    </section>
    <section class="tile interface" aria-label="Interface">
      <div class="tile-label"><span class="dot"></span>Interface</div>
      <div class="blocks"><span class="block"></span><span class="block"></span><span class="block"></span></div>
    </section>
    <section class="tile data" aria-label="Data">
      <div class="tile-label"><span class="dot"></span>Data</div>
      <div class="line"></div><div class="line mid"></div><div class="line short"></div>
    </section>
    <section class="tile preview" aria-label="Preview">
      <div class="tile-label"><span class="dot"></span>Preview</div>
      <div class="blocks"><span class="block"></span><span class="block"></span><span class="block"></span></div>
    </section>
    <div class="status" role="status" aria-live="polite"><span class="dot"></span><strong class="shining-text">${status}</strong></div>
  </main>
</body>
</html>`;
}

function setEmptyPreviewState(mode: EmptyPreviewMode = 'idle', label = '') {
  if (currentPreviewHtml.trim()) return;
  const frame = document.getElementById('preview-iframe-element') as HTMLIFrameElement | null;
  if (!frame) return;
  const resolvedLabel = label || (mode === 'working' ? 'Assembling preview' : 'Ready when you are');
  if (emptyPreviewMode === mode && emptyPreviewLabel === resolvedLabel && frame.dataset.emptyPreview === 'true') return;
  emptyPreviewMode = mode;
  emptyPreviewLabel = resolvedLabel;
  frame.dataset.emptyPreview = 'true';
  frame.dataset.emptyPreviewMode = mode;
  frame.srcdoc = emptyPreviewHtml(mode, resolvedLabel);
  setPreviewDevice(selectedPreviewDevice, false);
  const address = document.querySelector('.preview-address-glow span:last-child');
  const statusSlug = resolvedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'working';
  if (address) address.textContent = mode === 'working' ? `${statusSlug}.huggy.local` : 'preview.huggy.local / waiting';
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
    mode: rawMode === 'plan' ? 'plan' : rawMode === 'build' ? 'build' : 'auto',
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
    if (submit) syncSubmitButtonState();
  }
}

function chatScroll() {
  return document.getElementById('sidebar-scroll-area');
}

function ensureConversationApi() {
  if (conversationApi) return conversationApi;
  const scroll = chatScroll();
  if (!scroll) return null;
  conversationApi = mountBuilderConversation(scroll);
  return conversationApi;
}

function createMessageHandle(messageId: string): MessageHandle {
  const handle = document.createElement('div') as MessageHandle;
  handle.__huggyMessageId = messageId;
  handle.dataset.messageId = messageId;
  return handle;
}

function messageHandleId(card: HTMLElement | null | undefined) {
  return (card as MessageHandle | null)?.__huggyMessageId || card?.dataset.messageId || '';
}

function formatWorkingDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}m ${seconds}s`;
}

function renderWorkingLabel(label = activeWorkingLabel) {
  if (!activeWorkingCard) return;
  activeWorkingLabel = label || 'Thinking';
  const startedAt = Number(activeWorkingCard.dataset.workingStartedAt || 0);
  const elapsed = startedAt ? formatWorkingDuration(Date.now() - startedAt) : '0m 00s';
  updateMessage(activeWorkingCard, `${activeWorkingLabel} · Working for ${elapsed}`);
}

function startWorkingTimer(card: HTMLElement | null, label = 'Thinking') {
  if (!card) return;
  if (workingTimer !== null) window.clearInterval(workingTimer);
  activeWorkingCard = card;
  activeWorkingLabel = label;
  card.dataset.workingStartedAt = String(Date.now());
  renderWorkingLabel(label);
  workingTimer = window.setInterval(() => renderWorkingLabel(), 1000);
}

function stopWorkingTimer(card?: HTMLElement | null) {
  if (workingTimer !== null) {
    window.clearInterval(workingTimer);
    workingTimer = null;
  }
  const target = card || activeWorkingCard;
  if (target) delete target.dataset.workingStartedAt;
  activeWorkingCard = null;
}

function ensureChatShimmerStyle() {
  if (chatShimmerStyleInstalled || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'huggy-chat-shimmer-style';
  style.textContent = `
    .message-card.message-card-shimmer {
      overflow: hidden;
      position: relative;
    }

    .message-card.message-card-shimmer .msg-body-paragraph {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--text-sub, #52525b);
      font-weight: 650;
    }

    .message-card.message-card-shimmer .msg-body-paragraph::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: currentColor;
      opacity: .68;
      box-shadow: 12px 0 0 currentColor, 24px 0 0 currentColor;
      transform: translateX(0);
      animation: huggy-chat-dots 900ms cubic-bezier(.22, 1, .36, 1) infinite;
    }

    .message-card.message-card-shimmer::after {
      content: "";
      display: block;
      width: min(260px, 82%);
      height: 8px;
      margin-top: 12px;
      border-radius: 999px;
      background:
        linear-gradient(90deg, rgba(9,9,11,.05), rgba(9,9,11,.14), rgba(9,9,11,.05));
      background-size: 240% 100%;
      animation: huggy-chat-shimmer 1.15s cubic-bezier(.22, 1, .36, 1) infinite;
    }

    [data-theme="dark"] .message-card.message-card-shimmer::after {
      background:
        linear-gradient(90deg, rgba(255,255,255,.06), rgba(255,255,255,.18), rgba(255,255,255,.06));
      background-size: 240% 100%;
    }

    @keyframes huggy-chat-shimmer {
      from { background-position: 100% 0; }
      to { background-position: -100% 0; }
    }

    @keyframes huggy-chat-dots {
      0%, 100% { opacity: .34; transform: translateX(0); }
      50% { opacity: .82; transform: translateX(2px); }
    }

    @media (prefers-reduced-motion: reduce) {
      .message-card.message-card-shimmer::after,
      .message-card.message-card-shimmer .msg-body-paragraph::before {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
  chatShimmerStyleInstalled = true;
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
  ensureChatShimmerStyle();
  const api = ensureConversationApi();
  if (api) {
    const id = api.addMessage({ role: kind, content: body });
    return createMessageHandle(id);
  }

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

function setMessageShimmer(card: HTMLElement | null, label = 'Thinking') {
  if (!card) return;
  ensureChatShimmerStyle();
  const id = messageHandleId(card);
  if (id && conversationApi) {
    conversationApi.setWorking(id, label);
  }
  card.classList.add('message-card-shimmer');
  card.setAttribute('aria-busy', 'true');
  if (isGenerating) {
    if (!card.dataset.workingStartedAt) card.dataset.workingStartedAt = String(Date.now());
    activeWorkingCard = card;
    if (workingTimer === null) {
      workingTimer = window.setInterval(() => renderWorkingLabel(), 1000);
    }
    renderWorkingLabel(label);
    return;
  }
  updateMessage(card, label);
}

function clearMessageShimmer(card: HTMLElement | null) {
  if (!card) return;
  stopWorkingTimer(card);
  const id = messageHandleId(card);
  if (id && conversationApi) conversationApi.clearWorking(id);
  card.classList.remove('message-card-shimmer');
  card.removeAttribute('aria-busy');
}

function updateMessage(card: HTMLElement | null, body: string) {
  const id = messageHandleId(card);
  if (id && conversationApi) {
    conversationApi.updateMessage(id, body);
    return;
  }
  const paragraph = card?.querySelector('.msg-body-paragraph');
  if (paragraph) paragraph.textContent = body;
}

function addInlineAction(card: HTMLElement | null, label: string, action: () => void) {
  if (!card) return;
  const id = messageHandleId(card);
  if (id && conversationApi) {
    conversationApi.addAction(id, label, action);
    return;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = 'margin-top:10px;height:30px;border:1px solid var(--border);background:var(--text);color:var(--bg);border-radius:7px;padding:0 10px;font-size:11px;font-weight:700;cursor:pointer;';
  button.addEventListener('click', action);
  card.appendChild(button);
}

function formatAgentErrorMessage(event: any) {
  const payload = event?.payload || {};
  const base = String(event?.message || payload.message || 'Generation failed.').trim();
  const diagnostic = typeof payload.diagnostic_code === 'string' && payload.diagnostic_code.trim()
    ? ` Code: ${payload.diagnostic_code.trim()}.`
    : '';
  const action = typeof payload.suggested_action === 'string' && payload.suggested_action.trim()
    ? ` Suggested action: ${payload.suggested_action.trim().replace(/_/g, ' ')}.`
    : '';
  const requestId = typeof payload.request_id === 'string' && payload.request_id.trim()
    ? ` Request ID: ${payload.request_id.trim()}.`
    : '';
  return `${base}${diagnostic}${action}${requestId}`;
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
    closeProjectMenu();
    openSettings('ai-usage');
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
  emptyPreviewMode = 'ready';
  emptyPreviewLabel = '';
  const frame = document.getElementById('preview-iframe-element') as HTMLIFrameElement | null;
  if (frame) {
    frame.dataset.emptyPreview = 'false';
    frame.dataset.emptyPreviewMode = 'ready';
    frame.srcdoc = html;
  }
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
          <p>Ask Huggy for an app, feature, or fix. Generated files from your backend will appear here.</p>
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
  document.querySelectorAll<HTMLButtonElement>('.btn-publish').forEach(button => {
    if (button.dataset.publishBound === 'true') return;
    button.dataset.publishBound = 'true';
    button.type = 'button';
    button.addEventListener('click', event => {
      event.preventDefault();
      void openPublishPanel();
    });
  });
}

function publishStateLabel(state: PublishStatusPayload['state']) {
  if (state === 'not_ready') return 'Build required';
  if (state === 'ready_to_publish') return 'Ready to publish';
  if (state === 'changes_unpublished') return 'Unpublished changes';
  return 'Live';
}

function publishPrimaryLabel(status: PublishStatusPayload | null) {
  if (!status?.can_publish) return 'Build first';
  if (status.state === 'published' && !status.has_unpublished_changes) return 'Republish';
  if (status.state === 'changes_unpublished') return 'Publish updates';
  return 'Publish app';
}

function formatPublishDate(value: string | null | undefined) {
  if (!value) return 'Never';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function ensurePublishPanel() {
  let root = document.getElementById('huggy-publish-panel');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'huggy-publish-panel';
  root.style.cssText = 'position:fixed;inset:0;background:rgba(9,9,11,.42);display:grid;place-items:center;z-index:99999;padding:16px;backdrop-filter:blur(8px);';
  document.body.appendChild(root);
  root.addEventListener('click', event => {
    if (event.target === root) closePublishPanel();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('huggy-publish-panel')) closePublishPanel();
  });
  return root;
}

function closePublishPanel() {
  document.getElementById('huggy-publish-panel')?.remove();
}

function publishCheckIcon(status: PublishCheck['status']) {
  if (status === 'pass') return '✓';
  if (status === 'warn') return '!';
  return '×';
}

function renderPublishPanel(payload: PublishApiPayload | null, isPublishing = false, error = '') {
  const root = ensurePublishPanel();
  const status = payload?.publish || null;
  const publicUrl = status?.public_url || '';
  const canOpen = Boolean(publicUrl && payload?.deployment);
  const checks = status?.checks || [];
  root.innerHTML = `
    <section style="width:min(460px,100%);border:1px solid var(--border);background:var(--bg-surface);color:var(--text);border-radius:16px;box-shadow:0 28px 90px rgba(9,9,11,.24);overflow:hidden;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:16px 16px 12px;border-bottom:1px solid var(--border-light);">
        <div>
          <div style="font-size:11px;color:var(--text-muted);font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Publish</div>
          <h3 style="margin:4px 0 0;font-size:16px;line-height:1.2;">${status ? escapeHtml(publishStateLabel(status.state)) : 'Preparing publish'}</h3>
        </div>
        <button type="button" data-publish-action="close" style="border:1px solid var(--border);background:var(--bg-input);color:var(--text);width:28px;height:28px;border-radius:8px;cursor:pointer;">×</button>
      </div>
      <div style="padding:16px;display:grid;gap:14px;">
        ${error ? `<div style="border:1px solid rgba(185,28,28,.28);background:rgba(254,242,242,.88);color:#991b1b;border-radius:10px;padding:10px;font-size:12px;line-height:1.45;">${escapeHtml(error)}</div>` : ''}
        ${status ? `
          <div style="border:1px solid var(--border);background:var(--bg-elevated);border-radius:12px;padding:12px;display:grid;gap:8px;">
            <div style="font-size:11px;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:.10em;">Live URL</div>
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:700;">${escapeHtml(publicUrl)}</span>
            </div>
            <div style="font-size:11px;color:var(--text-sub);line-height:1.5;">
              Last published: ${escapeHtml(formatPublishDate(status.latest_published_at))}
              ${status.badge_required ? '<br>Free plan badge will be visible on the published app.' : ''}
            </div>
          </div>
          <div style="display:grid;gap:8px;">
            ${checks.map(check => `
              <div style="display:grid;grid-template-columns:22px 1fr;gap:8px;align-items:start;font-size:12px;">
                <span style="display:grid;place-items:center;width:20px;height:20px;border-radius:6px;border:1px solid var(--border);background:${check.status === 'pass' ? 'rgba(22,163,74,.10)' : check.status === 'warn' ? 'rgba(217,119,6,.10)' : 'rgba(220,38,38,.10)'};color:${check.status === 'pass' ? '#166534' : check.status === 'warn' ? '#92400e' : '#991b1b'};font-weight:900;">${publishCheckIcon(check.status)}</span>
                <span>
                  <strong style="display:block;font-size:12px;color:var(--text);">${escapeHtml(check.label)}</strong>
                  <small style="display:block;margin-top:2px;color:var(--text-sub);line-height:1.45;">${escapeHtml(check.detail)}</small>
                </span>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="display:grid;gap:10px;">
            <div class="skeleton" style="height:48px;border-radius:12px;"></div>
            <div class="skeleton" style="height:82px;border-radius:12px;"></div>
          </div>
        `}
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
          <button type="button" data-publish-action="copy" ${publicUrl ? '' : 'disabled'} style="height:32px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:9px;padding:0 11px;font-size:12px;font-weight:800;cursor:pointer;opacity:${publicUrl ? '1' : '.45'};">Copy link</button>
          <button type="button" data-publish-action="open" ${canOpen ? '' : 'disabled'} style="height:32px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:9px;padding:0 11px;font-size:12px;font-weight:800;cursor:pointer;opacity:${canOpen ? '1' : '.45'};">Open app</button>
          <button type="button" data-publish-action="publish" ${status?.can_publish && !isPublishing ? '' : 'disabled'} style="height:32px;border:1px solid #09090b;background:#09090b;color:#fff;border-radius:9px;padding:0 13px;font-size:12px;font-weight:900;cursor:pointer;opacity:${status?.can_publish && !isPublishing ? '1' : '.48'};">${isPublishing ? 'Publishing…' : escapeHtml(publishPrimaryLabel(status))}</button>
        </div>
      </div>
    </section>
  `;

  root.querySelectorAll<HTMLButtonElement>('[data-publish-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.publishAction || 'close';
      if (action === 'close') closePublishPanel();
      if (action === 'copy' && publicUrl) {
        void navigator.clipboard?.writeText(publicUrl);
        appendMessage('system', 'Published app link copied.');
      }
      if (action === 'open' && publicUrl && canOpen) window.open(publicUrl, '_blank', 'noopener,noreferrer');
      if (action === 'publish') void publishCurrentProject(payload);
    });
  });
}

async function openPublishPanel() {
  if (!currentProjectId) {
    appendMessage('system', 'Create or open a project before publishing.');
    return;
  }
  renderPublishPanel(null);
  try {
    const payload = await apiFetch<PublishApiPayload>(`/api/projects/${encodeURIComponent(currentProjectId)}/publish/status`);
    renderPublishPanel(payload);
  } catch (error) {
    renderPublishPanel(null, false, error instanceof Error ? error.message : 'Unable to load publish status.');
  }
}

async function publishCurrentProject(previousPayload: PublishApiPayload | null) {
  if (!currentProjectId) return;
  renderPublishPanel(previousPayload, true);
  try {
    const payload = await apiFetch<PublishApiPayload>(`/api/projects/${encodeURIComponent(currentProjectId)}/publish`, {
      method: 'POST',
      body: JSON.stringify({ branch: 'main' }),
    });
    renderPublishPanel(payload);
    if (payload.publish?.public_url) appendMessage('assistant', `Published. Your live app is available here:\n${payload.publish.public_url}`);
  } catch (error) {
    renderPublishPanel(previousPayload, false, error instanceof Error ? error.message : 'Publish failed.');
  }
}

const sendIconSvg = `
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="12" y1="19" x2="12" y2="5"></line>
    <polyline points="5 12 12 5 19 12"></polyline>
  </svg>
`;

const stopIconSvg = `
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2"></rect>
  </svg>
`;

function syncSubmitButtonState() {
  const input = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
  const submit = document.getElementById('chat-submit-btn') as HTMLButtonElement | null;
  if (!submit) return;
  const hasPrompt = Boolean(input?.value.trim());
  const shouldStop = isGenerating;
  submit.innerHTML = shouldStop ? stopIconSvg : sendIconSvg;
  submit.classList.toggle('active', shouldStop || hasPrompt);
  submit.classList.toggle('is-generating', shouldStop);
  submit.setAttribute('aria-label', shouldStop ? 'Stop generation' : 'Send message');
  submit.setAttribute('title', shouldStop ? 'Stop generation' : 'Send message');
  submit.setAttribute('aria-disabled', shouldStop || hasPrompt ? 'false' : 'true');
  submit.style.pointerEvents = 'auto';
  submit.style.cursor = shouldStop || hasPrompt ? 'pointer' : 'not-allowed';
}

function setBusy(busy: boolean) {
  isGenerating = busy;
  const cancel = document.getElementById('btn-live-cancel') as HTMLButtonElement | null;
  if (cancel) cancel.style.display = busy ? 'inline-flex' : 'none';
  syncSubmitButtonState();
}

function renderTierColor(tier = 'Standard') {
  if (/premium/i.test(tier)) return '#c084fc';
  if (/pro/i.test(tier)) return '#60a5fa';
  if (/economy/i.test(tier)) return '#34d399';
  return '#52525b';
}

function buildLocalProviderGroups(): AiModelProviderGroup[] {
  return (Object.keys(PROVIDER_META) as Array<keyof typeof PROVIDER_META>)
    .map(provider => ({
      provider,
      meta: PROVIDER_META[provider],
      models: MODEL_REGISTRY
        .filter(model => model.provider === provider)
        .map(model => ({
          id: model.id,
          display_name: model.label,
          tier: model.tier,
          provider: model.provider,
          description: model.description,
          plan_minimum: model.minPlan,
          badges: {
            new: 'isNew' in model ? Boolean(model.isNew) : false,
            fast: 'isFast' in model ? Boolean(model.isFast) : false,
            premium: 'isPremium' in model ? Boolean(model.isPremium) : false,
          },
          locked: false,
          capabilities: { maxContextTokens: model.contextWindow },
        })),
    }))
    .filter(group => group.models.length > 0);
}

function ensureBuilderModelSelectorStyle() {
  if (document.getElementById('huggy-builder-model-selector-style')) return;
  const style = document.createElement('style');
  style.id = 'huggy-builder-model-selector-style';
  style.textContent = `
    .chat-input-row {
      --chat-action-height: 24px;
      --chat-action-radius: 5px;
      --chat-action-font: 10px;
    }
    .chat-input-row #btn-chat-mode,
    .chat-input-row .huggy-builder-model-trigger {
      height: var(--chat-action-height) !important;
      min-height: var(--chat-action-height) !important;
      border-radius: var(--chat-action-radius) !important;
      font-size: var(--chat-action-font) !important;
      align-items: center !important;
      border: 1px solid var(--border) !important;
      background: transparent !important;
      color: var(--text-sub) !important;
      box-shadow: none !important;
    }
    .huggy-builder-model-trigger {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: min(156px, 36vw);
      padding: 0 7px;
      border-radius: 5px;
      border: 1px solid var(--border);
      font-size: 10px;
      color: var(--text-muted);
      user-select: none;
      position: relative;
      transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms cubic-bezier(0.22, 1, 0.36, 1);
      cursor: pointer;
      background: transparent;
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
      padding-right: 6px;
      border-right: 1px solid var(--border);
    }
    .huggy-builder-model-trigger .provider-dot {
      width: 14px;
      height: 14px;
      color: var(--accent);
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .huggy-builder-model-trigger .provider-dot svg,
    .huggy-provider-icon svg {
      width: 100%;
      height: 100%;
      display: block;
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
      transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .huggy-builder-model-trigger[aria-expanded="true"] #chevron-icon {
      transform: rotate(180deg);
    }
    .huggy-model-dropdown {
      position: fixed;
      width: 224px;
      max-width: calc(100vw - 24px);
      max-height: min(320px, calc(100vh - 36px));
      overflow: visible;
      border: 1px solid var(--border);
      background: var(--bg-surface);
      color: var(--text);
      border-radius: 12px;
      padding: 6px;
      box-shadow: 0 14px 36px rgba(0,0,0,.16), 0 3px 10px rgba(0,0,0,.08);
      display: none;
      z-index: 3000;
      backdrop-filter: blur(18px);
    }
    .huggy-model-dropdown.open {
      display: block;
    }
    .huggy-builder-provider-list {
      display: grid;
      gap: 4px;
    }
    .huggy-auto-model-option,
    .huggy-builder-provider-card {
      width: 100%;
      min-height: 30px;
      border: 1px solid var(--border);
      background: var(--bg-input);
      color: var(--text);
      border-radius: 8px;
      padding: 5px 6px;
      display: flex;
      align-items: center;
      gap: 6px;
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
      width: 18px;
      height: 18px;
      border-radius: 5px;
      background: var(--bg-input);
      color: var(--provider-color);
      border: 1px solid var(--border);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 850;
      line-height: 1;
      flex: 0 0 auto;
      --provider-icon-bg: var(--bg-input);
    }
    .huggy-provider-card-main {
      min-width: 0;
      display: grid;
      gap: 1px;
      flex: 1 1 auto;
    }
    .huggy-provider-name {
      color: var(--text);
      font-size: 11px;
      font-weight: 720;
      line-height: 1.2;
    }
    .huggy-provider-sub {
      color: var(--text-muted);
      font-size: 9px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .huggy-provider-expand-btn {
      width: 22px;
      height: 22px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-muted);
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 120ms cubic-bezier(0.22,1,0.36,1), color 120ms cubic-bezier(0.22,1,0.36,1), transform 150ms cubic-bezier(0.22,1,0.36,1);
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
      left: calc(100% + 6px);
      top: 0;
      width: 236px;
      max-height: min(320px, 66vh);
      border: 1px solid var(--border);
      background: var(--bg-surface);
      color: var(--text);
      border-radius: 12px;
      box-shadow: 0 14px 36px rgba(0,0,0,.16), 0 3px 10px rgba(0,0,0,.08);
      opacity: 0;
      transform: translateX(-8px) scale(.97);
      pointer-events: none;
      overflow: hidden;
      z-index: 3200;
      transition: opacity 120ms cubic-bezier(0,0,0.2,1), transform 150ms cubic-bezier(0.22,1,0.36,1);
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
      padding: 8px 10px 6px;
      border-bottom: 1px solid var(--border);
    }
    .huggy-model-list-title {
      font-size: 9px;
      font-weight: 850;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .huggy-model-list-count {
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--text-muted);
      font-size: 9px;
      font-weight: 700;
      padding: 1px 6px;
    }
    .huggy-model-list-scroll {
      max-height: 272px;
      overflow-y: auto;
      padding: 4px;
      display: grid;
      gap: 2px;
    }
    .huggy-builder-model-item {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--text);
      border-radius: 8px;
      padding: 6px 8px;
      display: grid;
      gap: 2px;
      text-align: left;
      cursor: pointer;
      position: relative;
      animation: huggy-builder-model-enter 130ms cubic-bezier(0.22,1,0.36,1) both;
      transition: background 120ms cubic-bezier(0.22,1,0.36,1), transform 120ms cubic-bezier(0.22,1,0.36,1);
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
      font-size: 11px;
      font-weight: 720;
      color: var(--text);
      line-height: 1.25;
    }
    .huggy-model-item-meta {
      font-size: 9px;
      color: var(--text-muted);
      line-height: 1.35;
    }
    .huggy-model-item-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
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
      padding: 6px 8px 7px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 5px;
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
      padding: 1px 5px;
      font-size: 8px;
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
        max-height: 64vh;
        border-radius: 14px;
      }
      .huggy-builder-model-panel {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        top: auto;
        width: 100%;
        max-height: 76dvh;
        border-radius: 16px 16px 0 0;
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
    <span class="provider-dot">${providerIconSvg('auto')}</span>
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
  let providerGroups: AiModelProviderGroup[] = buildLocalProviderGroups();
  let activeProvider = '';
  let hydrateModelsPromise: Promise<void> | null = null;
  const positionDropdown = () => {
    const rect = root.getBoundingClientRect();
    if (window.matchMedia('(max-width: 640px)').matches) {
      dropdown.style.left = '';
      dropdown.style.right = '';
      dropdown.style.bottom = '';
      dropdown.style.top = 'auto';
      return;
    }
    const width = Math.min(248, window.innerWidth - 24);
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
  const selectedModel = () => providerGroups.flatMap(group => group.models).find(model => model.id === selectedModelId);
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
    if (providerDot) {
      providerDot.innerHTML = providerIconSvg(meta?.icon || 'auto');
      providerDot.style.color = meta?.color || 'var(--accent)';
    }
    if (label) {
      const selected = dropdown.querySelector<HTMLElement>(`[data-model-id="${CSS.escape(selectedModelId)}"]`);
      label.textContent = selected?.dataset.modelName || selectedModel()?.display_name || (selectedModelId === 'auto' ? 'Auto' : selectedModelId);
    }
  };
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
        return `<button type="button" class="huggy-builder-model-item${selectedModelId === model.id ? ' selected' : ''}" data-model-id="${escapeHtml(model.id)}" data-model-name="${escapeHtml(model.display_name || model.id)}" aria-disabled="${model.locked ? 'true' : 'false'}" style="animation-delay:${index * 25}ms">
          <span class="huggy-model-item-name">${escapeHtml(model.display_name || model.id)}</span>
          <span class="huggy-model-item-meta">${escapeHtml(tier)}${context ? ` · ${Math.round(context / 1000)}K ctx` : ''}</span>
          <span class="huggy-model-item-badges">${badges}</span>
        </button>`;
      }).join('')}
    </div>
  `;
  const renderDropdownContent = () => `
    <div class="dropdown-header">Models</div>
    <button type="button" class="huggy-auto-model-option active" data-model-id="auto" data-model-name="Auto">
      <span class="huggy-provider-icon" style="--provider-color:var(--accent);--provider-text:var(--bg);">${providerIconSvg('auto')}</span>
      <span class="huggy-provider-card-main">
        <span class="huggy-provider-name">Auto</span>
        <span class="huggy-provider-sub">Best fit</span>
      </span>
      <span class="huggy-model-badge" style="color:${renderTierColor('Standard')}">Standard</span>
    </button>
    <div class="huggy-builder-provider-list">
      ${providerGroups.map(group => {
        const activeModel = group.models.find(model => model.id === selectedModelId);
        return `<div class="huggy-builder-provider-card" data-provider="${escapeHtml(group.provider)}" style="--provider-color:${escapeHtml(group.meta.color)};--provider-text:${escapeHtml(group.meta.textColor)};">
          <span class="huggy-provider-icon">${providerIconSvg(group.meta.icon)}</span>
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
  const renderDropdown = () => {
    const previousProvider = activeProvider;
    dropdown.innerHTML = renderDropdownContent();
    dropdown.dataset.loaded = 'true';
    setActiveOption();
    if (previousProvider) {
      activeProvider = '';
      toggleProviderPanel(previousProvider);
    }
  };
  const hydrateModelGroups = async () => {
    if (hydrateModelsPromise) return hydrateModelsPromise;
    hydrateModelsPromise = (async () => {
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
        if (dropdown.classList.contains('open')) {
          renderDropdown();
          positionDropdown();
        } else {
          setActiveOption();
        }
      } catch {
        // The local registry already rendered the selector; network hydration is optional.
      }
    })();
    return hydrateModelsPromise;
  };
  window.setTimeout(() => void hydrateModelGroups(), 0);
  const open = async () => {
    const shouldOpen = !dropdown.classList.contains('open');
    if (!shouldOpen) {
      close();
      return;
    }
    dropdown.classList.add('open');
    root.setAttribute('aria-expanded', 'true');
    positionDropdown();
    if (dropdown.dataset.loaded !== 'true') renderDropdown();
    void hydrateModelGroups();
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
      <button id="btn-chat-mode" type="button" aria-haspopup="menu" aria-expanded="false" title="Choose Auto, Build or Plan" style="height:24px;min-width:64px;border:1px solid var(--border);background:transparent;color:var(--text);border-radius:5px;padding:0 9px;font-size:10px;font-weight:750;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;">
        <span id="chat-mode-label">Auto</span><span style="font-size:10px;opacity:.62;">v</span>
      </button>
      <div id="chat-mode-menu" role="menu" style="position:absolute;right:0;bottom:calc(100% + 8px);width:218px;border:1px solid var(--border);background:var(--bg-surface);border-radius:12px;padding:6px;box-shadow:0 18px 50px rgba(0,0,0,.22);display:none;z-index:1000;">
        <button type="button" data-chat-mode="auto" role="menuitem" style="width:100%;text-align:left;border:0;background:var(--accent-hover, rgba(9,9,11,.08));color:var(--text);border-radius:8px;padding:9px;font-size:11px;font-weight:750;cursor:pointer;">Auto <span style="display:block;color:var(--text-muted);font-weight:500;font-size:10px;margin-top:2px;">Let Huggy choose the right action</span></button>
        <button type="button" data-chat-mode="build" role="menuitem" style="width:100%;text-align:left;border:0;background:transparent;color:var(--text-muted);border-radius:8px;padding:9px;font-size:11px;font-weight:750;cursor:pointer;">Build <span style="display:block;color:var(--text-muted);font-weight:500;font-size:10px;margin-top:2px;">Generate or edit the app</span></button>
        <button type="button" data-chat-mode="plan" role="menuitem" style="width:100%;text-align:left;border:0;background:transparent;color:var(--text-muted);border-radius:8px;padding:9px;font-size:11px;font-weight:750;cursor:pointer;">Plan <span style="display:block;color:var(--text-sub);font-weight:500;font-size:10px;margin-top:2px;">Think without changing files</span></button>
      </div>
    </div>
  `);
}

function setChatMode(mode: ChatMode) {
  selectedChatMode = mode === 'plan' ? 'plan' : mode === 'build' ? 'build' : 'auto';
  const label = document.getElementById('chat-mode-label');
  const button = document.getElementById('btn-chat-mode') as HTMLButtonElement | null;
  const menu = document.getElementById('chat-mode-menu');
  if (label) label.textContent = selectedChatMode === 'plan' ? 'Plan' : selectedChatMode === 'build' ? 'Build' : 'Auto';
  if (button) {
    button.style.background = selectedChatMode === 'auto' ? 'transparent' : 'var(--accent-hover)';
    button.style.color = selectedChatMode === 'plan' ? 'var(--blue, var(--accent))' : 'var(--text)';
    button.setAttribute('aria-expanded', 'false');
  }
  document.querySelectorAll<HTMLElement>('[data-chat-mode]').forEach(option => {
    const active = option.dataset.chatMode === selectedChatMode;
    option.style.background = active ? 'var(--accent-hover, rgba(9,9,11,.08))' : 'transparent';
    option.style.color = active ? 'var(--text)' : 'var(--text-muted)';
  });
  if (menu) menu.style.display = 'none';
  scheduleWorkspaceSave({ selected_mode: selectedChatMode });
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
          selected_mode: userWorkspaceState.builder_selected_mode || 'auto',
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
    if (payload.preview?.html) {
      setPreview(payload.preview.html, payload.preview.status);
    } else {
      setEmptyPreviewState('idle');
    }
    restoreMessages(payload);
    const activeTab = (payload.workspace_state?.active_tab || userWorkspaceState?.builder_active_tab) as WorkspaceState['active_tab'];
    if (activeTab) activateBuilderView(activeTab);
    setPreviewDevice(normalizePreviewDevice(payload.workspace_state?.preview_device || userWorkspaceState?.builder_preview_device), false);
    updateMessage(loading, 'Project synchronized. Auto is ready to answer, plan, fix or build from your next message.');
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

async function generateFromPrompt(prompt: string, requestedMode: ChatMode, useLastPlan = false, extra: Record<string, unknown> = {}, displayText = prompt) {
  if (isGenerating || !prompt.trim()) return;
  stopRequested = false;
  setBusy(true);
  activeAbort = new AbortController();
  clearInlineBlocks();

  appendMessage('user', displayText);
  const initialLabel = requestedMode === 'plan' ? 'Planning' : 'Thinking';
  const status = appendMessage('assistant', initialLabel);
  setMessageShimmer(status, initialLabel);
  startWorkingTimer(status, initialLabel);
  let generationTouchesPreview = requestedMode === 'build';
  if (generationTouchesPreview) {
    activateBuilderView('preview');
    setEmptyPreviewState('working', 'Thinking');
  }
  let streamedText = '';
  let assistantHasFinalContent = false;
  const setAssistantWorking = (label: string) => {
    if (assistantHasFinalContent) return;
    setMessageShimmer(status, label);
  };
  const commitAssistantText = (content: unknown, fallback = 'Done.') => {
    const text = String(content || '').trim() || fallback;
    clearMessageShimmer(status);
    assistantHasFinalContent = true;
    streamedText = text;
    updateMessage(status, text);
  };
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
      if (payload.agent_run_id) lastAgentRunId = String(payload.agent_run_id);
      if (eventType === 'token') {
        clearMessageShimmer(status);
        streamedText += event.message || '';
        assistantHasFinalContent = true;
        updateMessage(status, streamedText || 'Streaming code generation...');
        return;
      }
      if (eventType === 'agent_thinking' || eventType === 'intent_detected') {
        setAssistantWorking('Thinking');
        if (payload.intent?.requiresPreviewRebuild || payload.intent?.requiresFileChanges) {
          generationTouchesPreview = true;
          activateBuilderView('preview');
          setEmptyPreviewState('working', 'Thinking');
        }
        return;
      }
      if (eventType === 'working_tick') {
        const elapsed = Number(payload.elapsed_seconds || 0);
        if (elapsed >= 30) {
          setAssistantWorking('Still working');
          if (generationTouchesPreview) setEmptyPreviewState('working', 'Still working');
        }
        return;
      }
      if (eventType === 'planning' || eventType === 'research_started' || eventType === 'tool_loop_started' || (eventType === 'answering' && !payload.text)) {
        const label = eventType === 'planning'
          ? 'Planning'
          : eventType === 'research_started'
            ? 'Researching'
            : eventType === 'tool_loop_started'
              ? 'Thinking'
              : 'Thinking';
        setAssistantWorking(label);
        if (generationTouchesPreview) setEmptyPreviewState('working', label);
        return;
      }
      if (eventType === 'research_result' || eventType === 'research_skipped') {
        setAssistantWorking(eventType === 'research_result' ? 'Researching' : 'Thinking');
        if (generationTouchesPreview) setEmptyPreviewState('working', eventType === 'research_result' ? 'Researching' : 'Thinking');
        return;
      }
      if (eventType === 'plan_ready' || eventType === 'answering') {
        const text = payload.text || event.message || '';
        if (eventType === 'plan_ready' && payload.auto_plan_required) {
          clearMessageShimmer(status);
          updateMessage(status, String(text || 'Plan ready. Starting the build...'));
        } else {
          commitAssistantText(text, eventType === 'plan_ready' ? 'Plan ready.' : 'Done.');
        }
        if (eventType === 'plan_ready' && !payload.auto_plan_required) {
          lastPlan = payload.text || event.message || '';
          addInlineAction(status, 'Build this plan', () => void generateFromPrompt('Build this plan', 'build', true));
        }
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Ready for build');
        return;
      }
      if (eventType === 'clarification_required') {
        commitAssistantText(payload.text || event.message, 'I need one more detail before building.');
        showClarificationBlock(payload, prompt, requestedMode);
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Waiting for details');
        return;
      }
      if (eventType === 'credits_insufficient') {
        commitAssistantText('Upgrade required.');
        showCreditsModal();
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Ready when you are');
        return;
      }
      if (eventType === 'external_api_keys_required') {
        commitAssistantText('External API keys are needed or can be skipped.');
        showApiKeyModal(payload.requirements || []);
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Waiting for keys');
        return;
      }
      if (eventType === 'error_detected' || eventType === 'auto_fix_failed') {
        showFixBugBox(payload.errors || [{ message: event.message }]);
      }
      if (eventType === 'queued' || eventType === 'routing' || eventType === 'model_started' || eventType === 'build_started' || eventType === 'building' || eventType === 'preview_building' || eventType === 'runner_started' || eventType === 'runner_failed' || eventType === 'runner_passed' || eventType === 'verification_started' || eventType === 'retest_started' || eventType === 'auto_fix_started' || eventType === 'patch_applied') {
        const label = eventType === 'build_started' || eventType === 'building' || eventType === 'preview_building'
          ? 'Building'
          : eventType === 'runner_started' || eventType === 'verification_started'
            ? 'Running checks'
            : eventType === 'retest_started' || eventType === 'runner_failed' || eventType === 'runner_passed'
              ? 'Retesting'
              : eventType === 'auto_fix_started' || eventType === 'patch_applied'
                ? 'Fixing'
                : 'Thinking';
        setAssistantWorking(label);
        generationTouchesPreview = true;
        setEmptyPreviewState('working', label);
        return;
      }
      if (eventType === 'preview_ready') {
        activateBuilderView('preview');
        renderFiles(payload.files || []);
        if (payload.preview?.html) setPreview(payload.preview.html, payload.preview.status);
        const diff = payload.diff?.summary ? ` ${payload.diff.summary}.` : '';
        commitAssistantText(`${event.message || 'Application generated and preview updated.'}${diff}`, 'Preview ready.');
        if (payload.errors?.length) showFixBugBox(payload.errors);
        return;
      }
      if (eventType === 'cancelled') {
        commitAssistantText(event.message || 'Generation stopped.');
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Generation stopped');
        setBusy(false);
        return;
      }
      if (eventType === 'done') {
        if (!assistantHasFinalContent) {
          commitAssistantText(event.message || (generationTouchesPreview ? 'Done. Preview is ready.' : 'Done.'));
        } else {
          clearMessageShimmer(status);
        }
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Ready when you are');
        setBusy(false);
      }
      if (eventType === 'error') {
        commitAssistantText(formatAgentErrorMessage(event), 'Generation failed.');
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Ready when you are');
      }
    }, activeAbort.signal);
  } catch (error) {
    clearMessageShimmer(status);
    if ((error as Error).name === 'AbortError') {
      updateMessage(status, stopRequested ? 'Generation stopped.' : 'Build cancelled.');
      if (generationTouchesPreview) setEmptyPreviewState('idle', stopRequested ? 'Generation stopped' : 'Build cancelled');
    } else {
      updateMessage(status, error instanceof Error ? error.message : 'Generation failed.');
      if (generationTouchesPreview) setEmptyPreviewState('idle', 'Ready when you are');
    }
  } finally {
    setBusy(false);
    activeAbort = null;
    stopRequested = false;
  }
}

async function cancelBuild() {
  if (!isGenerating) return;
  stopRequested = true;
  activeAbort?.abort();
  if (currentProjectId) {
    await apiFetch(`/api/projects/${encodeURIComponent(currentProjectId)}/build/cancel`, {
      method: 'POST',
      body: JSON.stringify({ buildSessionId: lastBuildSessionId, agentRunId: lastAgentRunId }),
    }).catch(() => null);
    if (lastAgentRunId) {
      await apiFetch(`/api/projects/${encodeURIComponent(currentProjectId)}/agent/runs/${encodeURIComponent(lastAgentRunId)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ buildSessionId: lastBuildSessionId }),
      }).catch(() => null);
    }
  }
  setEmptyPreviewState('idle', 'Generation stopped');
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

function showClarificationBlock(payload: any, originalPrompt: string, requestedMode: ChatMode) {
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

async function resumeFromClarification(answer: string, originalPrompt: string, requestedMode: ChatMode) {
  if (!answer.trim()) return;
  clearInlineBlocks();
  const response = await apiFetch<{ prompt: string; requestedMode?: ChatMode }>(`/api/projects/${encodeURIComponent(currentProjectId)}/agent/answer`, {
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
  syncSubmitButtonState();

  const send = (mode: ChatMode) => {
    if (isGenerating) return;
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    input.style.height = '48px';
    submit.classList.remove('active');
    syncSubmitButtonState();
    scheduleWorkspaceSave({ draft_prompt: '', selected_mode: mode }, true);
    void generateFromPrompt(value, mode);
  };

  input.addEventListener('input', () => {
    syncSubmitButtonState();
    scheduleWorkspaceSave();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (isGenerating) return;
      send(selectedChatMode);
    }
  }, true);

  submit.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isGenerating) {
      void cancelBuild();
      return;
    }
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
      const rawMode = (option as HTMLElement).dataset.chatMode;
      const mode: ChatMode = rawMode === 'plan' ? 'plan' : rawMode === 'build' ? 'build' : 'auto';
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
  syncSubmitButtonState();
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
  if (submit) syncSubmitButtonState();
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
  handle.style.cssText = 'position:absolute;top:0;bottom:0;left:calc(var(--huggy-sidebar-width, 380px) - 4px);width:8px;cursor:col-resize;z-index:20;background:linear-gradient(90deg,transparent,rgba(9,9,11,.16),transparent);opacity:.45;touch-action:none;';
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
  initHuggyMotion();
  ensureSettingsPanel();
  ensureConversationApi();
  normalizeAiChatInputs();
  ensureToolbar();
  void ensureModelSelector();
  ensurePlanBuildControls();
  normalizeAiChatInputs();
  ensureDatabaseView();
  ensureResizableSidebar();
  bindProjectMenu();
  bindPreviewDeviceToggle();
  initPromptInputActions({
    persistForBuilder: false,
    onFiles: uploadPromptAttachments,
    onNotice: (message, kind) => appendMessage(kind === 'error' ? 'system' : 'system', message),
  });
  normalizeAiChatInputs();
  bindChat();
  hydrateDashboardPrompt();
  void loadProject();
}

window.addEventListener('huggy:auth-ready', init);
if (document.documentElement.dataset.authReady === 'true') init();
