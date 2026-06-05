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
import { mountBuilderConversation, type HuggyAgentTrace, type HuggyConversationApi, type HuggyConversationBlock } from './builder-conversation-island';
import { isSeniorStreamEvent } from './streaming/agent-stream-event-map';
import { createInitialAgentStreamState, reduceAgentStreamEvent, type AgentStreamUiState } from './streaming/agent-stream-reducer';
import { redactSecretPayload, redactSecrets } from './services/secret-redaction';
import { clearCreateProjectFlow, readCreateProjectFlow } from './services/create-project-flow';
import {
  DESIGN_WORKSHOP_OPTIONS,
  designWorkshopOptionLabel,
  normalizeDesignWorkshopSettings,
  type DesignWorkshopSettings,
} from './services/design-workshop';

type ChatMode = 'auto' | 'plan' | 'build';
type StudioWorkshop = 'chat' | 'design' | 'decks' | 'media';
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

type MediaGeneratePayload = {
  success: boolean;
  status: 'completed' | 'queued' | 'not_configured' | 'locked' | 'failed';
  output: 'marketing_kit' | 'video' | 'image' | 'storyboard';
  settings: MediaSettings;
  model: {
    id: string;
    label: string;
    output: string;
    quality: string;
    min_plan: string;
  };
  estimated_credits: number;
  assets: Array<{ type: 'image' | 'video'; url: string }>;
  text: string;
  preview?: {
    status: string;
    html: string;
  };
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
type MediaKind = 'launch_kit' | 'social_posts' | 'ads_creatives' | 'brand_assets' | 'pitch_one_pager' | 'video_ad' | 'ugc' | 'storyboard' | 'product_image' | 'social_creative' | 'thumbnail';
type MediaFormat = '9:16' | '1:1' | '4:5' | '16:9' | '3:4';
type MediaDuration = '5s' | '8s' | '10s' | '15s' | '30s';
type MediaModelPreference = 'auto' | 'best_quality' | 'fast' | 'seedance' | 'veo' | 'sora' | 'kling' | 'flux' | 'openai_image';

type MediaSettings = {
  kind: MediaKind;
  format: MediaFormat;
  duration: MediaDuration;
  modelPreference: MediaModelPreference;
};

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
  current_visitors?: number;
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

type AgentRunSummary = {
  id: string;
  intent?: string;
  mode?: string;
  model_id?: string;
  status?: string;
  diagnostic_code?: string | null;
  duration_ms?: number | null;
  created_at?: string;
};

type ProjectVersionSummary = {
  id: string;
  version_number?: number;
  label?: string;
  created_at?: string;
  diff_summary?: { summary?: string; created?: string[]; modified?: string[]; deleted?: string[] };
};

let currentProjectId = '';
let currentFiles: GeneratedFile[] = [];
let currentPreviewHtml = '';
let isGenerating = false;
let lastPlan = '';
let lastBuildSessionId = '';
let lastAgentRunId = '';
let activeGenerationTouchesPreview = false;
let activeAbort: AbortController | null = null;
let stopRequested = false;
let workingTimer: number | null = null;
let activeWorkingCard: HTMLElement | null = null;
let activeWorkingLabel = 'Thinking';
let activeWorkingDetails: string[] = [];
let activeWorkingSteps: NonNullable<HuggyAgentTrace['steps']> = [];
let activeAgentActivityMessageId = '';
let selectedChatMode: ChatMode = 'auto';
let activeWorkshop: StudioWorkshop = 'chat';
let designSettings: DesignWorkshopSettings = {
  action: 'autopilot',
  scope: 'focused',
  target: 'auto',
  direction: 'auto',
};
let mediaSettings: MediaSettings = {
  kind: 'launch_kit',
  format: '9:16',
  duration: '8s',
  modelPreference: 'auto',
};
let selectedModelId = 'auto';
let selectedPreviewDevice: PreviewDevice = 'desktop';
let currentProjectName = 'Untitled app';
let initialBuilderHandoff: { prompt: string; mode: ChatMode; importContext?: Record<string, unknown>; source?: string; shouldAutoRun?: boolean } | null = null;
let initialGenerationStarted = false;
let analysisPollTimer: number | null = null;
let analysisRange = '30d';
let projectWorkspaceState: WorkspaceState | null = null;
let userWorkspaceState: UserWorkspaceState | null = null;
let workspaceSaveTimer: number | null = null;
let chatShimmerStyleInstalled = false;
let emptyPreviewMode: EmptyPreviewMode | 'ready' = 'idle';
let emptyPreviewLabel = '';
let currentMediaPreviewHtml = '';
let conversationApi: HuggyConversationApi | null = null;
let conversationFeedbackBridgeBound = false;
const LAST_BUILDER_PROJECT_STORAGE_KEY = 'huggy-last-builder-project-id';
const ACTIVE_WORKSHOP_STORAGE_KEY = 'huggy-active-workshop';
const DESIGN_SETTINGS_STORAGE_KEY = 'huggy-design-settings';
const MEDIA_SETTINGS_STORAGE_KEY = 'huggy-media-settings';

const WORKSHOP_CONFIG: Record<StudioWorkshop, {
  label: string;
  shortLabel: string;
  placeholder: string;
  icon: string;
  disabled?: boolean;
  promptPrefix?: string;
}> = {
  chat: {
    label: 'Chat',
    shortLabel: 'Chat',
    placeholder: 'Ask Huggy to answer, plan, fix or build',
    icon: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>',
  },
  design: {
    label: 'Huggy Design',
    shortLabel: 'Design',
    placeholder: 'Describe the interface, style, layout or design change',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M8 4v16"></path><path d="M3 9h18"></path><path d="M12 13h5"></path><path d="M12 16h3"></path>',
    promptPrefix: 'Huggy Design workspace: treat this as UI/UX, product design, visual system, prototype, or targeted interface refinement. Preserve the existing app unless the user clearly asks for a new design. Use the current design system, avoid generic AI design, and make changes as focused as possible. Favor Opus-level design reasoning for hierarchy, spacing, motion, responsive states and product taste.',
  },
  decks: {
    label: 'Huggy Decks',
    shortLabel: 'Decks',
    placeholder: 'Describe the deck, audience, story or slide changes',
    icon: '<rect x="4" y="5" width="16" height="12" rx="2"></rect><path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M8 9h8"></path><path d="M8 12h5"></path>',
    promptPrefix: 'Huggy Decks workspace: treat this as a pitch deck, slide deck, one-pager, product narrative, investor story, or presentation request. When building, create a polished responsive web presentation in Preview with clear slides, real slide navigation, keyboard support, subtle animation, progress, speaker-friendly copy, and an honest Download HTML or Download outline action when practical. Do not claim PPTX, PDF, Canva or video export unless implemented.',
  },
  media: {
    label: 'Huggy Media',
    shortLabel: 'Media',
    placeholder: 'Describe the launch kit, post, ad, visual or media asset you want',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M8 5v14"></path><path d="M16 5v14"></path><path d="M3 10h5"></path><path d="M16 10h5"></path><path d="M3 14h5"></path><path d="M16 14h5"></path>',
    promptPrefix: 'Huggy Media workspace: treat this as a creative marketing media request for images, videos, UGC ads, product storytelling, thumbnails, social creatives, app teasers, or campaign assets. Do not build a web app unless the user explicitly asks to use the asset inside the app. Choose media format and model intelligently from the compact settings, keep the result in Preview, and never expose provider costs.',
  },
};

const MEDIA_OPTIONS: {
  modelPreference: Array<{ value: MediaModelPreference; label: string; hint: string }>;
  format: Array<{ value: MediaFormat; label: string; hint: string }>;
  kind: Array<{ value: MediaKind; label: string; hint: string }>;
  duration: Array<{ value: MediaDuration; label: string; hint: string }>;
} = {
  modelPreference: [
    { value: 'auto', label: 'Auto model', hint: 'Best fit' },
    { value: 'best_quality', label: 'Best quality', hint: 'Premium' },
    { value: 'fast', label: 'Fast', hint: 'Lower cost' },
    { value: 'seedance', label: 'Seedance', hint: 'UGC/video' },
    { value: 'veo', label: 'Veo', hint: 'Cinematic' },
    { value: 'sora', label: 'Sora', hint: 'Premium' },
    { value: 'kling', label: 'Kling', hint: 'Motion' },
    { value: 'flux', label: 'Flux', hint: 'Image' },
    { value: 'openai_image', label: 'OpenAI Image', hint: 'Image' },
  ],
  format: [
    { value: '9:16', label: '9:16', hint: 'Reels/TikTok' },
    { value: '1:1', label: '1:1', hint: 'Square' },
    { value: '4:5', label: '4:5', hint: 'Ads' },
    { value: '16:9', label: '16:9', hint: 'YouTube' },
    { value: '3:4', label: '3:4', hint: 'Portrait' },
  ],
  kind: [
    { value: 'launch_kit', label: 'Launch kit', hint: 'Posts + CTAs' },
    { value: 'social_posts', label: 'Social posts', hint: 'FB/LinkedIn/WhatsApp' },
    { value: 'ads_creatives', label: 'Ads', hint: 'A/B angles' },
    { value: 'brand_assets', label: 'Brand assets', hint: 'Visual system' },
    { value: 'pitch_one_pager', label: 'One-pager', hint: 'Pitch copy' },
    { value: 'video_ad', label: 'Video ad', hint: 'Campaign' },
    { value: 'ugc', label: 'UGC', hint: 'Creator-style' },
    { value: 'storyboard', label: 'Storyboard', hint: 'Plan shots' },
    { value: 'product_image', label: 'Product image', hint: 'Still' },
    { value: 'social_creative', label: 'Social creative', hint: 'Ad asset' },
    { value: 'thumbnail', label: 'Thumbnail', hint: 'Cover' },
  ],
  duration: [
    { value: '5s', label: '5s', hint: 'Hook' },
    { value: '8s', label: '8s', hint: 'Default' },
    { value: '10s', label: '10s', hint: 'Story' },
    { value: '15s', label: '15s', hint: 'Ad' },
    { value: '30s', label: '30s', hint: 'Long' },
  ],
};

const MEDIA_CONTROL_ORDER: Array<keyof typeof MEDIA_OPTIONS> = ['modelPreference', 'format', 'kind', 'duration'];

function mediaOptionLabel(key: keyof typeof MEDIA_OPTIONS, value: string) {
  return MEDIA_OPTIONS[key].find(option => option.value === value)?.label || String(value);
}

function normalizeMediaSettings(value: any): MediaSettings {
  const pick = <K extends keyof typeof MEDIA_OPTIONS>(key: K, fallback: MediaSettings[K]) => {
    const allowed = MEDIA_OPTIONS[key].map(option => option.value);
    return allowed.includes(value?.[key]) ? value[key] : fallback;
  };
  return {
    modelPreference: pick('modelPreference', 'auto'),
    format: pick('format', '9:16'),
    kind: pick('kind', 'launch_kit'),
    duration: pick('duration', '8s'),
  };
}

function loadMediaSettings() {
  try {
    mediaSettings = normalizeMediaSettings(JSON.parse(localStorage.getItem(MEDIA_SETTINGS_STORAGE_KEY) || '{}'));
  } catch {
    mediaSettings = normalizeMediaSettings({});
  }
}

function saveMediaSettings() {
  try {
    localStorage.setItem(MEDIA_SETTINGS_STORAGE_KEY, JSON.stringify(mediaSettings));
  } catch {
    // Non-critical UI preference.
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const DESIGN_CONTROL_ORDER: Array<keyof typeof DESIGN_WORKSHOP_OPTIONS> = ['action', 'scope', 'target', 'direction'];

function loadDesignSettings() {
  try {
    designSettings = normalizeDesignWorkshopSettings(JSON.parse(localStorage.getItem(DESIGN_SETTINGS_STORAGE_KEY) || '{}'));
  } catch {
    designSettings = normalizeDesignWorkshopSettings({});
  }
}

function saveDesignSettings() {
  try {
    localStorage.setItem(DESIGN_SETTINGS_STORAGE_KEY, JSON.stringify(designSettings));
  } catch {
    // Non-critical UI preference.
  }
}

function ensureDesignControlsStyle() {
  if (document.getElementById('huggy-design-controls-style')) return;
  const style = document.createElement('style');
  style.id = 'huggy-design-controls-style';
  style.textContent = `
    .huggy-design-controls {
      display: none;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      margin: 7px 14px 0;
      max-width: calc(100% - 28px);
    }
    .huggy-design-controls.visible { display: flex; }
    .huggy-design-pill {
      height: 23px;
      border: 1px solid var(--border-light);
      border-radius: 999px;
      background: color-mix(in srgb, var(--bg-input) 84%, transparent);
      color: var(--text-muted);
      padding: 0 8px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font: 760 10px/1 "Instrument Sans", Inter, system-ui, sans-serif;
      cursor: pointer;
      transition: border-color 140ms cubic-bezier(.22,1,.36,1), color 140ms cubic-bezier(.22,1,.36,1), background 140ms cubic-bezier(.22,1,.36,1), transform 140ms cubic-bezier(.22,1,.36,1);
    }
    .huggy-design-pill:hover,
    .huggy-design-pill[aria-expanded="true"] {
      border-color: var(--border-focus);
      background: var(--accent-dim);
      color: var(--text);
      transform: translateY(-1px);
    }
    .huggy-design-pill svg {
      width: 11px;
      height: 11px;
      opacity: .78;
    }
    .huggy-design-popover {
      position: fixed;
      z-index: 12000;
      min-width: 188px;
      max-width: min(272px, calc(100vw - 24px));
      padding: 6px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: color-mix(in srgb, var(--bg-surface) 96%, transparent);
      box-shadow: 0 18px 52px rgba(28,28,28,.16);
      backdrop-filter: blur(18px) saturate(150%);
      display: grid;
      gap: 3px;
    }
    .huggy-design-menu-option {
      width: 100%;
      min-height: 34px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 7px 8px;
      text-align: left;
      cursor: pointer;
    }
    .huggy-design-menu-option:hover,
    .huggy-design-menu-option.active {
      background: var(--accent-dim);
    }
    .huggy-design-menu-option strong {
      font-size: 11px;
      font-weight: 820;
    }
    .huggy-design-menu-option span {
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 650;
    }
    @media (max-width: 520px) {
      .huggy-design-controls { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; }
      .huggy-design-pill { flex: 0 0 auto; }
    }
    @media (prefers-reduced-motion: reduce) {
      .huggy-design-pill { transition: none; }
    }
  `;
  document.head.appendChild(style);
}

function closeDesignSettingsMenu() {
  document.getElementById('huggy-design-popover')?.remove();
  document.querySelectorAll<HTMLElement>('.huggy-design-pill[aria-expanded="true"]').forEach(button => {
    button.setAttribute('aria-expanded', 'false');
  });
}

function openDesignSettingsMenu(key: keyof typeof DESIGN_WORKSHOP_OPTIONS, anchor: HTMLElement) {
  closeDesignSettingsMenu();
  const rect = anchor.getBoundingClientRect();
  const popover = document.createElement('div');
  popover.id = 'huggy-design-popover';
  popover.className = 'huggy-design-popover';
  popover.style.left = `${Math.min(rect.left, window.innerWidth - 284)}px`;
  popover.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 280)}px`;
  popover.setAttribute('role', 'menu');
  anchor.setAttribute('aria-expanded', 'true');
  popover.innerHTML = DESIGN_WORKSHOP_OPTIONS[key].map(option => {
    const active = designSettings[key] === option.value;
    return `
      <button class="huggy-design-menu-option${active ? ' active' : ''}" type="button" role="menuitem" data-design-value="${escapeHtml(String(option.value))}">
        <strong>${escapeHtml(option.label)}</strong>
        <span>${escapeHtml(option.hint)}</span>
      </button>
    `;
  }).join('');
  popover.querySelectorAll<HTMLElement>('[data-design-value]').forEach(option => {
    option.addEventListener('click', () => {
      (designSettings as any)[key] = option.dataset.designValue || designSettings[key];
      saveDesignSettings();
      closeDesignSettingsMenu();
      syncDesignControls();
    });
  });
  document.body.appendChild(popover);
  setTimeout(() => {
    const close = (event: MouseEvent) => {
      if (popover.contains(event.target as Node) || anchor.contains(event.target as Node)) return;
      closeDesignSettingsMenu();
      document.removeEventListener('click', close, true);
    };
    document.addEventListener('click', close, true);
  }, 0);
}

function ensureDesignControls() {
  ensureDesignControlsStyle();
  let controls = document.getElementById('huggy-design-controls') as HTMLElement | null;
  if (controls) return controls;
  const context = document.getElementById('huggy-workshop-context');
  controls = document.createElement('div');
  controls.id = 'huggy-design-controls';
  controls.className = 'huggy-design-controls';
  controls.setAttribute('aria-label', 'Huggy Design settings');
  context?.insertAdjacentElement('afterend', controls);
  return controls;
}

function syncDesignControls() {
  const controls = ensureDesignControls();
  controls.classList.toggle('visible', activeWorkshop === 'design');
  controls.setAttribute('aria-hidden', activeWorkshop === 'design' ? 'false' : 'true');
  if (activeWorkshop !== 'design') {
    closeDesignSettingsMenu();
    return;
  }
  controls.innerHTML = DESIGN_CONTROL_ORDER.map(key => `
    <button class="huggy-design-pill" type="button" data-design-control="${key}" aria-haspopup="menu" aria-expanded="false">
      <span>${escapeHtml(designWorkshopOptionLabel(key, (designSettings as any)[key]))}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
    </button>
  `).join('');
  controls.querySelectorAll<HTMLElement>('[data-design-control]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openDesignSettingsMenu(button.dataset.designControl as keyof typeof DESIGN_WORKSHOP_OPTIONS, button);
    });
  });
}

function normalizeWorkshop(value: unknown): StudioWorkshop {
  return value === 'design' || value === 'decks' || value === 'media' ? value : 'chat';
}

function currentWorkshopConfig() {
  return WORKSHOP_CONFIG[activeWorkshop] || WORKSHOP_CONFIG.chat;
}

function workshopIconSvg(workshop: StudioWorkshop) {
  const config = WORKSHOP_CONFIG[workshop] || WORKSHOP_CONFIG.chat;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${config.icon}</svg>`;
}

function ensureMediaControlsStyle() {
  if (document.getElementById('huggy-media-controls-style')) return;
  const style = document.createElement('style');
  style.id = 'huggy-media-controls-style';
  style.textContent = `
    .huggy-media-controls {
      display: none;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      margin: 7px 14px 0;
      max-width: calc(100% - 28px);
    }
    .huggy-media-controls.visible { display: flex; }
    .huggy-media-pill {
      height: 23px;
      border: 1px solid var(--border-light);
      border-radius: 999px;
      background: color-mix(in srgb, var(--bg-input) 84%, transparent);
      color: var(--text-muted);
      padding: 0 8px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font: 760 10px/1 "Instrument Sans", Inter, system-ui, sans-serif;
      cursor: pointer;
      transition: border-color 140ms cubic-bezier(.22,1,.36,1), color 140ms cubic-bezier(.22,1,.36,1), background 140ms cubic-bezier(.22,1,.36,1), transform 140ms cubic-bezier(.22,1,.36,1);
    }
    .huggy-media-pill:hover,
    .huggy-media-pill[aria-expanded="true"] {
      border-color: var(--border-focus);
      background: var(--accent-dim);
      color: var(--text);
      transform: translateY(-1px);
    }
    .huggy-media-pill svg {
      width: 11px;
      height: 11px;
      opacity: .78;
    }
    .huggy-media-popover {
      position: fixed;
      z-index: 12000;
      min-width: 182px;
      max-width: min(260px, calc(100vw - 24px));
      padding: 6px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: color-mix(in srgb, var(--bg-surface) 96%, transparent);
      box-shadow: 0 18px 52px rgba(28,28,28,.16);
      backdrop-filter: blur(18px) saturate(150%);
      display: grid;
      gap: 3px;
    }
    .huggy-media-menu-option {
      width: 100%;
      min-height: 34px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 7px 8px;
      text-align: left;
      cursor: pointer;
    }
    .huggy-media-menu-option:hover,
    .huggy-media-menu-option.active {
      background: var(--accent-dim);
    }
    .huggy-media-menu-option strong {
      font-size: 11px;
      font-weight: 820;
    }
    .huggy-media-menu-option span {
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 650;
    }
    @media (max-width: 520px) {
      .huggy-media-controls { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; }
      .huggy-media-pill { flex: 0 0 auto; }
    }
    @media (prefers-reduced-motion: reduce) {
      .huggy-media-pill { transition: none; }
    }
  `;
  document.head.appendChild(style);
}

function closeMediaSettingsMenu() {
  document.getElementById('huggy-media-popover')?.remove();
  document.querySelectorAll<HTMLElement>('.huggy-media-pill[aria-expanded="true"]').forEach(button => {
    button.setAttribute('aria-expanded', 'false');
  });
}

function openMediaSettingsMenu(key: keyof typeof MEDIA_OPTIONS, anchor: HTMLElement) {
  closeMediaSettingsMenu();
  const rect = anchor.getBoundingClientRect();
  const popover = document.createElement('div');
  popover.id = 'huggy-media-popover';
  popover.className = 'huggy-media-popover';
  popover.style.left = `${Math.min(rect.left, window.innerWidth - 272)}px`;
  popover.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 260)}px`;
  popover.setAttribute('role', 'menu');
  anchor.setAttribute('aria-expanded', 'true');
  popover.innerHTML = MEDIA_OPTIONS[key].map(option => {
    const active = mediaSettings[key] === option.value;
    return `
      <button class="huggy-media-menu-option${active ? ' active' : ''}" type="button" role="menuitem" data-media-value="${escapeHtml(String(option.value))}">
        <strong>${escapeHtml(option.label)}</strong>
        <span>${escapeHtml(option.hint)}</span>
      </button>
    `;
  }).join('');
  popover.querySelectorAll<HTMLElement>('[data-media-value]').forEach(option => {
    option.addEventListener('click', () => {
      (mediaSettings as any)[key] = option.dataset.mediaValue || mediaSettings[key];
      saveMediaSettings();
      closeMediaSettingsMenu();
      syncMediaControls();
      syncWorkshopPreview();
    });
  });
  document.body.appendChild(popover);
  setTimeout(() => {
    const close = (event: MouseEvent) => {
      if (popover.contains(event.target as Node) || anchor.contains(event.target as Node)) return;
      closeMediaSettingsMenu();
      document.removeEventListener('click', close, true);
    };
    document.addEventListener('click', close, true);
  }, 0);
}

function ensureMediaControls() {
  ensureMediaControlsStyle();
  let controls = document.getElementById('huggy-media-controls') as HTMLElement | null;
  if (controls) return controls;
  const context = document.getElementById('huggy-workshop-context');
  controls = document.createElement('div');
  controls.id = 'huggy-media-controls';
  controls.className = 'huggy-media-controls';
  controls.setAttribute('aria-label', 'Huggy Media settings');
  context?.insertAdjacentElement('afterend', controls);
  return controls;
}

function syncMediaControls() {
  const controls = ensureMediaControls();
  controls.classList.toggle('visible', activeWorkshop === 'media');
  controls.setAttribute('aria-hidden', activeWorkshop === 'media' ? 'false' : 'true');
  if (activeWorkshop !== 'media') {
    closeMediaSettingsMenu();
    return;
  }
  controls.innerHTML = MEDIA_CONTROL_ORDER.map(key => `
    <button class="huggy-media-pill" type="button" data-media-control="${key}" aria-haspopup="menu" aria-expanded="false">
      <span>${escapeHtml(mediaOptionLabel(key as any, (mediaSettings as any)[key]))}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
    </button>
  `).join('');
  controls.querySelectorAll<HTMLElement>('[data-media-control]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openMediaSettingsMenu(button.dataset.mediaControl as keyof typeof MEDIA_OPTIONS, button);
    });
  });
}

function refreshWorkshopInputContext() {
  const input = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
  const context = document.getElementById('huggy-workshop-context') as HTMLElement | null;
  const label = document.getElementById('huggy-workshop-context-label') as HTMLElement | null;
  const chatTab = document.getElementById('btn-sidebar-chat') as HTMLElement | null;
  const studioTab = document.getElementById('btn-sidebar-studio') as HTMLElement | null;
  const wrapper = document.getElementById('pane-studio-wrapper') as HTMLElement | null;
  const config = currentWorkshopConfig();

  document.body.dataset.huggyWorkshop = activeWorkshop;
  chatTab?.classList.toggle('active', activeWorkshop === 'chat');
  studioTab?.classList.toggle('active', activeWorkshop !== 'chat');
  wrapper?.querySelectorAll<HTMLElement>('[data-studio-panel]').forEach(option => {
    const selected = normalizeWorkshop(option.dataset.studioPanel) === activeWorkshop;
    option.classList.toggle('active', selected);
    if (selected) option.setAttribute('aria-current', 'true');
    else option.removeAttribute('aria-current');
  });

  if (input && !input.value.trim()) input.placeholder = config.placeholder;
  if (context && label) {
    context.classList.toggle('visible', activeWorkshop !== 'chat');
    context.setAttribute('aria-hidden', activeWorkshop === 'chat' ? 'true' : 'false');
    context.querySelector('svg')?.remove();
    context.insertAdjacentHTML('afterbegin', workshopIconSvg(activeWorkshop));
    label.textContent = config.label;
  }
  syncDesignControls();
  syncMediaControls();
}

function setActiveWorkshop(workshop: StudioWorkshop, options: { focusInput?: boolean } = {}) {
  const nextWorkshop = normalizeWorkshop(workshop);
  if (WORKSHOP_CONFIG[nextWorkshop]?.disabled) return;
  activeWorkshop = nextWorkshop;
  localStorage.setItem(ACTIVE_WORKSHOP_STORAGE_KEY, activeWorkshop);
  refreshWorkshopInputContext();
  syncWorkshopPreview();
  syncProjectReadinessClass();
  if (options.focusInput) {
    document.getElementById('chat-textarea-box')?.focus();
  }
}

function loadActiveWorkshop() {
  loadDesignSettings();
  loadMediaSettings();
  const requested = normalizeWorkshop(new URLSearchParams(window.location.search).get('workshop'));
  const saved = normalizeWorkshop(localStorage.getItem(ACTIVE_WORKSHOP_STORAGE_KEY));
  activeWorkshop = requested !== 'chat' && !WORKSHOP_CONFIG[requested]?.disabled
    ? requested
    : WORKSHOP_CONFIG[saved]?.disabled ? 'chat' : saved;
}

function studioPromptContextPayload() {
  const config = currentWorkshopConfig();
  return activeWorkshop === 'chat'
    ? undefined
    : {
        workshop: activeWorkshop,
        label: config.label,
        instruction: config.promptPrefix || '',
        ...(activeWorkshop === 'design' ? { settings: designSettings } : {}),
        ...(activeWorkshop === 'media' ? { settings: mediaSettings } : {}),
      };
}

function workshopPlaceholderForFollowUp(speaksFrench: boolean) {
  if (activeWorkshop === 'design') {
    return speaksFrench ? 'Decris le changement visuel a appliquer...' : 'Describe the visual change to apply...';
  }
  if (activeWorkshop === 'decks') {
    return speaksFrench ? 'Decris la slide, le deck ou le message a ameliorer...' : 'Describe the slide, deck, or story to improve...';
  }
  return speaksFrench ? 'Dis-moi quoi changer dans cette version...' : 'Tell me what to change in this version...';
}

function emptyPreviewHtml(mode: EmptyPreviewMode, label = '') {
  return centeredPreviewLoaderHtml(mode, label);
}

function previewLoaderLetters(label: string) {
  return Array.from(label).map((letter, index) => {
    const safeLetter = letter === ' ' ? '&nbsp;' : escapeHtml(letter);
    return `<span class="loader-letter" style="animation-delay:${(index * 0.1).toFixed(1)}s">${safeLetter}</span>`;
  }).join('');
}

function centeredPreviewLoaderHtml(mode: EmptyPreviewMode, label = '') {
  const isWorking = mode === 'working';
  const rawStatus = label || (isWorking ? 'Generating' : 'Ready when you are');
  const status = escapeHtml(rawStatus);
  const letters = previewLoaderLetters(rawStatus);
  const stateClass = isWorking ? 'working' : 'idle';
  return `<!DOCTYPE html>
<html lang="en" data-preview-state="${stateClass}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {
  color-scheme: light dark;
  --loader-text: #1c1c1c;
  --loader-bg-a: #fcfbf8;
  --loader-bg-b: #f7f4ed;
  --loader-bg-c: #fffdf8;
  --ring-a: #dbeafe;
  --ring-b: #93c5fd;
  --ring-c: #3b82f6;
  --ring-mid-a: #bfdbfe;
  --ring-mid-b: #60a5fa;
  --ring-mid-c: #2563eb;
  --ring-glow-a: rgba(96,165,250,.22);
  --ring-glow-b: rgba(59,130,246,.14);
}
@media (prefers-color-scheme: dark) {
  :root {
    --loader-text: #f8f4eb;
    --loader-bg-a: #171613;
    --loader-bg-b: #201f1b;
    --loader-bg-c: #2a2822;
    --ring-a: #d8d1c3;
    --ring-b: #93c5fd;
    --ring-c: #3b82f6;
    --ring-mid-a: #f8f4eb;
    --ring-mid-b: #bfdbfe;
    --ring-mid-c: #60a5fa;
    --ring-glow-a: rgba(147,197,253,.22);
    --ring-glow-b: rgba(191,219,254,.12);
  }
}
* { box-sizing: border-box; }
html, body { min-height: 100%; }
body {
  margin: 0;
  overflow: hidden;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
  background: linear-gradient(180deg, var(--loader-bg-a), var(--loader-bg-b) 52%, var(--loader-bg-c));
  color: var(--loader-text);
}
.preview-loader {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.loader-core {
  position: relative;
  width: min(180px, 54vw);
  height: min(180px, 54vw);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 520;
  letter-spacing: .01em;
  user-select: none;
}
.loader-text {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 78%;
  color: var(--loader-text);
  font-size: clamp(13px, 3vw, 16px);
  line-height: 1;
  text-align: center;
  filter: drop-shadow(0 1px 10px rgba(0,0,0,.18));
}
.loader-letter {
  display: inline-block;
  opacity: .4;
  animation: loaderLetter 3s infinite;
}
.loader-circle {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  animation: loaderCircle 5s linear infinite;
}
.idle .loader-circle { animation-duration: 8s; opacity: .88; }
.idle .loader-letter { animation-duration: 4.5s; }
@keyframes loaderCircle {
  0% {
    transform: rotate(90deg);
    box-shadow: 0 6px 12px 0 var(--ring-a) inset, 0 12px 18px 0 var(--ring-b) inset, 0 36px 36px 0 var(--ring-c) inset, 0 0 3px 1.2px var(--ring-glow-a), 0 0 6px 1.8px var(--ring-glow-b);
  }
  50% {
    transform: rotate(270deg);
    box-shadow: 0 6px 12px 0 var(--ring-mid-a) inset, 0 12px 6px 0 var(--ring-mid-b) inset, 0 24px 36px 0 var(--ring-mid-c) inset, 0 0 3px 1.2px var(--ring-glow-a), 0 0 6px 1.8px var(--ring-glow-b);
  }
  100% {
    transform: rotate(450deg);
    box-shadow: 0 6px 12px 0 var(--ring-a) inset, 0 12px 18px 0 var(--ring-b) inset, 0 36px 36px 0 var(--ring-c) inset, 0 0 3px 1.2px var(--ring-glow-a), 0 0 6px 1.8px var(--ring-glow-b);
  }
}
@media (prefers-color-scheme: dark) {
  @keyframes loaderCircle {
    0%, 100% {
      transform: rotate(90deg);
      box-shadow: 0 6px 12px 0 var(--ring-a) inset, 0 12px 18px 0 var(--ring-b) inset, 0 36px 36px 0 var(--ring-c) inset, 0 0 3px 1.2px var(--ring-glow-a), 0 0 6px 1.8px var(--ring-glow-b);
    }
    50% {
      transform: rotate(270deg);
      box-shadow: 0 6px 12px 0 var(--ring-mid-a) inset, 0 12px 6px 0 var(--ring-mid-b) inset, 0 24px 36px 0 var(--ring-mid-c) inset, 0 0 3px 1.2px var(--ring-glow-a), 0 0 6px 1.8px var(--ring-glow-b);
    }
  }
}
@keyframes loaderLetter {
  0%, 100% { opacity: .4; transform: translateY(0) scale(1); }
  20% { opacity: 1; transform: scale(1.15); }
  40% { opacity: .7; transform: translateY(0) scale(1); }
}
@media (max-width: 520px) {
  .loader-core { width: min(150px, 58vw); height: min(150px, 58vw); }
  .loader-text { font-size: 13px; }
}
@media (prefers-reduced-motion: reduce) {
  .loader-circle,
  .loader-letter { animation: none !important; }
  .loader-letter { opacity: .86; }
}
</style>
</head>
<body>
  <main class="preview-loader ${stateClass}" aria-label="Preview preparation">
    <div class="loader-core" role="status" aria-live="polite" aria-label="${status}">
      <span class="loader-text">${letters}</span>
      <div class="loader-circle" aria-hidden="true"></div>
    </div>
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
  frame.srcdoc = centeredPreviewLoaderHtml(mode, resolvedLabel);
  setPreviewDevice(selectedPreviewDevice, false);
  const address = document.querySelector('.preview-address-glow span:last-child');
  const statusSlug = resolvedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'working';
  if (address) address.textContent = mode === 'working' ? `${statusSlug}.huggy.local` : 'preview.huggy.local / waiting';
}

function mediaPreviewShellHtml(state: 'idle' | 'working' = 'idle', title = 'Media output') {
  const isWorking = state === 'working';
  const status = isWorking ? title || 'Generating media' : 'Media results will appear here';
  const helper = isWorking
    ? 'Huggy is preparing the asset from your current request.'
    : 'Use the main input to create an image, video, UGC ad, storyboard or campaign asset.';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{color-scheme:light dark;--bg:#fcfbf8;--panel:#fffefa;--ink:#1c1c1c;--muted:#5f5f5d;--line:#eceae4;--soft:#f7f4ed;--blue:#315fdc}
@media(prefers-color-scheme:dark){:root{--bg:#171613;--panel:#201f1b;--ink:#f8f4eb;--muted:#d8d1c3;--line:rgba(252,251,248,.14);--soft:#24231f}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}
.empty{display:grid;justify-items:center;gap:10px;text-align:center;max-width:360px;color:var(--muted)}
.status{display:inline-flex;align-items:center;gap:9px;border:1px solid var(--line);border-radius:999px;background:color-mix(in srgb,var(--panel) 88%,transparent);padding:9px 13px;color:var(--ink);font-size:13px;font-weight:750;box-shadow:0 8px 28px rgba(28,28,28,.06)}
.dot{width:8px;height:8px;border-radius:999px;background:#3b82f6;box-shadow:0 0 0 5px rgba(59,130,246,.10);animation:${isWorking ? 'pulse 1.6s cubic-bezier(.22,1,.36,1) infinite' : 'none'}}
.helper{margin:0;font-size:12px;line-height:1.45;color:var(--muted)}
@keyframes pulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.18)}}
@media(prefers-reduced-motion:reduce){.dot{animation:none}}
</style>
</head>
<body>
<main class="wrap">
  <section class="empty" aria-label="Huggy Media preview">
    <div class="status" role="status" aria-live="polite"><span class="dot" aria-hidden="true"></span>${escapeHtml(status)}</div>
    <p class="helper">${escapeHtml(helper)}</p>
  </section>
</main>
</body>
</html>`;
}

function setMediaPreviewHtml(html: string, addressLabel = 'media.huggy.local / lab') {
  const frame = document.getElementById('preview-iframe-element') as HTMLIFrameElement | null;
  if (!frame) return;
  currentMediaPreviewHtml = html;
  frame.dataset.mediaPreview = 'true';
  frame.removeAttribute('data-empty-preview');
  frame.srcdoc = html;
  setPreviewDevice(selectedPreviewDevice, false);
  const address = document.querySelector('.preview-address-glow span:last-child');
  if (address) address.textContent = addressLabel;
}

function syncWorkshopPreview() {
  const frame = document.getElementById('preview-iframe-element') as HTMLIFrameElement | null;
  if (!frame) return;
  if (activeWorkshop === 'media') {
    activateBuilderView('preview');
    setMediaPreviewHtml(currentMediaPreviewHtml || mediaPreviewShellHtml('idle', 'Media output'));
    return;
  }
  if (frame.dataset.mediaPreview === 'true') {
    frame.removeAttribute('data-media-preview');
    if (currentPreviewHtml.trim()) {
      setPreview(currentPreviewHtml, 'ready');
    } else {
      frame.srcdoc = '';
      setEmptyPreviewState('idle', 'Ready when you are');
    }
  }
}

function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('project') || '';
}

function isRealProjectId(value?: string | null) {
  const clean = String(value || '').trim();
  return Boolean(clean && !clean.startsWith('proj-') && /^[a-zA-Z0-9_-]{8,}$/.test(clean));
}

function rememberLastBuilderProjectId(projectId = currentProjectId) {
  if (!isRealProjectId(projectId)) return;
  try {
    localStorage.setItem(LAST_BUILDER_PROJECT_STORAGE_KEY, String(projectId));
  } catch {
    // Local persistence is only a safety net for builder restore.
  }
}

function forgetLastBuilderProjectId(projectId?: string) {
  try {
    const remembered = localStorage.getItem(LAST_BUILDER_PROJECT_STORAGE_KEY) || '';
    if (!projectId || remembered === projectId) localStorage.removeItem(LAST_BUILDER_PROJECT_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function rememberedLastBuilderProjectId() {
  try {
    const remembered = localStorage.getItem(LAST_BUILDER_PROJECT_STORAGE_KEY) || '';
    return isRealProjectId(remembered) ? remembered : '';
  } catch {
    return '';
  }
}

function setCurrentBuilderProjectId(projectId: string, updateUrl = true) {
  currentProjectId = isRealProjectId(projectId) ? String(projectId).trim() : '';
  if (!currentProjectId) return;
  rememberLastBuilderProjectId(currentProjectId);
  if (updateUrl && getProjectIdFromUrl() !== currentProjectId) {
    window.history.replaceState({}, '', `/builder.html?project=${encodeURIComponent(currentProjectId)}`);
  }
}

function getInitialBuilderHandoff() {
  if (initialBuilderHandoff) return initialBuilderHandoff;
  const pendingFlow = readCreateProjectFlow();
  const sessionPrompt = pendingFlow?.prompt?.trim() || sessionStorage.getItem('huggy-initial-prompt')?.trim() || '';
  const legacyPrompt = localStorage.getItem('huggy-initial-prompt')?.trim() || '';
  const rawMode = pendingFlow?.mode || sessionStorage.getItem('huggy-requested-mode');
  const rawImportContext = sessionStorage.getItem('huggy-import-context') || localStorage.getItem('huggy-import-context') || '';
  let importContext: Record<string, unknown> | undefined = pendingFlow?.importContext;
  if (rawImportContext) {
    try {
      const parsed = JSON.parse(rawImportContext);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) importContext = parsed;
    } catch {
      importContext = undefined;
    }
  }
  initialBuilderHandoff = {
    prompt: sessionPrompt || legacyPrompt,
    mode: rawMode === 'plan' ? 'plan' : rawMode === 'build' ? 'build' : 'auto',
    importContext,
    source: pendingFlow?.source,
    shouldAutoRun: Boolean(pendingFlow?.prompt) || new URLSearchParams(window.location.search).get('run') === 'initial',
  };
  clearCreateProjectFlow();
  sessionStorage.removeItem('huggy-initial-prompt');
  sessionStorage.removeItem('huggy-requested-mode');
  sessionStorage.removeItem('huggy-import-context');
  localStorage.removeItem('huggy-initial-prompt');
  localStorage.removeItem('huggy-import-context');
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
  bindConversationFeedbackBridge();
  return conversationApi;
}

function bindConversationFeedbackBridge() {
  if (conversationFeedbackBridgeBound) return;
  conversationFeedbackBridgeBound = true;
  window.addEventListener('huggy-agent-feedback', (event: Event) => {
    const detail = (event as CustomEvent).detail || {};
    const feedback = detail.feedback === 'keep' || detail.rating === 'positive' ? 'keep' : 'reject';
    void recordAgentFeedback(feedback, {
      source: 'message_hover_toolbar',
      messageId: String(detail.messageId || ''),
      role: String(detail.role || ''),
      content: String(detail.content || ''),
      rating: detail.rating === 'positive' ? 'positive' : 'negative',
      reasons: Array.isArray(detail.reasons) ? detail.reasons : [],
      comment: String(detail.comment || ''),
    });
  });
  window.addEventListener('huggy-edit-message', (event: Event) => {
    const detail = (event as CustomEvent).detail || {};
    const content = String(detail.content || '').trim();
    if (!content) return;
    const input = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
    if (!input) return;
    input.value = content;
    input.focus();
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    syncSubmitButtonState();
  });
  window.addEventListener('huggy:stream-preview-action', (event: Event) => {
    const action = String((event as CustomEvent).detail?.action || '');
    if (action === 'open') activateBuilderView('preview');
    if (action === 'mobile') {
      activateBuilderView('preview');
      setPreviewDevice('mobile');
    }
    if (action === 'publish') void openPublishPanel();
  });
  window.addEventListener('huggy:stream-file-action', (event: Event) => {
    const detail = (event as CustomEvent).detail || {};
    const action = String(detail.action || '');
    const path = String(detail.path || '');
    if (!path) return;
    if (action === 'open') {
      activateBuilderView('code');
      const target = Array.from(document.querySelectorAll<HTMLElement>('.tree-file')).find(item => item.textContent?.includes(path));
      target?.click();
    }
    if (action === 'rollback') {
      appendMessage('system', `Rollback for ${path} will use the project history panel.`);
      void openHistoryPanel();
    }
  });
  window.addEventListener('huggy:stream-command', (event: Event) => {
    const action = String((event as CustomEvent).detail?.action || '');
    if (action === 'stop') {
      void cancelBuild();
      return;
    }
    if (action === 'files') {
      activateBuilderView('code');
      return;
    }
    if (action === 'rollback') {
      void openHistoryPanel();
      return;
    }
    if (action === 'media') {
      setActiveWorkshop('media', { focusInput: true });
      return;
    }
    if (action === 'focus-input') {
      document.getElementById('chat-textarea-box')?.focus();
    }
  });
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

function currentWorkingDetail() {
  const active = activeWorkingDetails.find(detail => detail.startsWith('now:'));
  const latest = active || [...activeWorkingDetails].reverse().find(Boolean) || '';
  return latest.replace(/^(done|now):\s*/, '').trim();
}

function publicWorkingHeadline(label: string) {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('planning')) return 'Planning the work';
  if (normalized.includes('building')) return 'Generating files';
  if (normalized.includes('running checks')) return 'Checking the result';
  if (normalized.includes('retesting')) return 'Retesting after the fix';
  if (normalized.includes('fixing')) return 'Applying a targeted fix';
  if (normalized.includes('preview')) return 'Preparing preview';
  return 'Understanding the request';
}

function buildWorkingTrace(card: HTMLElement | null, label: string, status: HuggyAgentTrace['status'] = 'active'): HuggyAgentTrace {
  const startedAt = Number(card?.dataset.workingStartedAt || 0);
  const elapsed = startedAt ? formatWorkingDuration(Date.now() - startedAt) : '0m 00s';
  const detail = currentWorkingDetail();
  const headline = publicWorkingHeadline(label);
  const fallbackStatus: NonNullable<NonNullable<HuggyAgentTrace['steps']>[number]['status']> = status === 'done' ? 'done' : status || 'active';
  const steps = activeWorkingSteps.length
    ? activeWorkingSteps.map(step => ({
        ...step,
        status: status === 'done' && step.status === 'active' ? 'done' : step.status,
      }))
    : [{
        id: 'current',
        label: detail || label || 'Working',
        status: fallbackStatus,
      }];
  return {
    title: status === 'done' ? 'Run complete' : headline,
    elapsed,
    status,
    steps,
  };
}

function applyWorkingTrace(card: HTMLElement | null, label = activeWorkingLabel, status: HuggyAgentTrace['status'] = 'active') {
  const id = messageHandleId(card);
  if (id && id === activeAgentActivityMessageId) return;
  if (!id || !conversationApi?.setTrace) return;
  conversationApi.setTrace(id, buildWorkingTrace(card, label, status));
}

function renderWorkingLabel(label = activeWorkingLabel) {
  if (!activeWorkingCard) return;
  activeWorkingLabel = label || 'Thinking';
  const startedAt = Number(activeWorkingCard.dataset.workingStartedAt || 0);
  const elapsed = startedAt ? formatWorkingDuration(Date.now() - startedAt) : '0m 00s';
  const detail = currentWorkingDetail();
  const headline = publicWorkingHeadline(activeWorkingLabel);
  const normalizedLabel = headline.toLowerCase();
  const normalizedDetail = detail.toLowerCase();
  const detailSuffix = detail && !normalizedLabel.includes(normalizedDetail) ? ` · ${detail}` : '';
  applyWorkingTrace(activeWorkingCard, activeWorkingLabel, 'active');
  updateMessage(activeWorkingCard, `${headline} · Working for ${elapsed}${detailSuffix}`);
}

function startWorkingTimer(card: HTMLElement | null, label = 'Thinking') {
  if (!card) return;
  if (workingTimer !== null) window.clearInterval(workingTimer);
  activeWorkingCard = card;
  activeWorkingLabel = label;
  activeWorkingDetails = [];
  activeWorkingSteps = [];
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
  activeWorkingDetails = [];
  activeWorkingSteps = [];
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
      content: none;
    }

    [data-theme="dark"] .message-card.message-card-shimmer::after {
      content: none;
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

function appendMessage(kind: 'user' | 'assistant' | 'system', body: string, options: { working?: boolean } = {}) {
  ensureChatShimmerStyle();
  const safeBody = redactSecrets(body);
  const api = ensureConversationApi();
  if (api) {
    const id = api.addMessage({ role: kind, content: safeBody, working: Boolean(options.working) });
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
  if (paragraph) paragraph.textContent = safeBody;
  if (options.working) {
    card.classList.add('message-card-shimmer');
    card.setAttribute('aria-busy', 'true');
  }
  scroll.appendChild(card);
  scroll.scrollTop = scroll.scrollHeight;
  return card;
}

function setMessageShimmer(card: HTMLElement | null, label = 'Thinking', withTimer = true) {
  if (!card) return;
  ensureChatShimmerStyle();
  const id = messageHandleId(card);
  if (id && conversationApi) {
    conversationApi.setWorking(id, label);
  }
  card.classList.add('message-card-shimmer');
  card.setAttribute('aria-busy', 'true');
  if (isGenerating && withTimer) {
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

function completeMessageShimmer(card: HTMLElement | null, label = 'Completed') {
  if (!card) return;
  const startedAt = Number(card.dataset.workingStartedAt || 0);
  const elapsed = startedAt ? formatWorkingDuration(Date.now() - startedAt) : '';
  const detail = currentWorkingDetail();
  const finalTrace = buildWorkingTrace(card, label, 'done');
  stopWorkingTimer(card);
  const id = messageHandleId(card);
  if (id && conversationApi) {
    if (id !== activeAgentActivityMessageId) conversationApi.setTrace?.(id, finalTrace);
    conversationApi.clearWorking(id);
  }
  card.classList.remove('message-card-shimmer');
  card.removeAttribute('aria-busy');
  const normalizedLabel = label.toLowerCase();
  const normalizedDetail = detail.toLowerCase();
  const parts = [
    label,
    elapsed,
    detail && !normalizedLabel.includes(normalizedDetail) ? detail : '',
  ].filter(Boolean);
  updateMessage(card, parts.join(' · '));
}

function updateMessage(card: HTMLElement | null, body: string) {
  const safeBody = redactSecrets(body);
  const id = messageHandleId(card);
  if (id && conversationApi) {
    conversationApi.updateMessage(id, safeBody);
    return;
  }
  const paragraph = card?.querySelector('.msg-body-paragraph');
  if (paragraph) paragraph.textContent = safeBody;
}

function setMessageBlock(card: HTMLElement | null, block: HuggyConversationBlock | null) {
  if (!card) return;
  const id = messageHandleId(card);
  if (id && conversationApi?.setBlock) {
    conversationApi.setBlock(id, block);
  }
}

function setAgentActivityBlock(card: HTMLElement | null, state: AgentStreamUiState | null) {
  if (!card || !state) return;
  setMessageBlock(card, { type: 'agent_activity', state });
}

function buildPlanBlock(content: string, prompt: string, open = false): HuggyConversationBlock {
  const summary = content.split('\n').map(line => line.trim()).find(Boolean) || 'Huggy prepared a plan before changing the app.';
  const title = isLikelyFrenchText(prompt) ? 'Plan de Huggy' : 'Huggy plan';
  const description = summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
  return {
    type: 'plan',
    title,
    description,
    content,
    defaultOpen: open,
  };
}

function redactStreamingCodeSnippet(value: unknown) {
  const text = redactSecrets(value);
  const lines = text.split('\n').slice(0, 22);
  const clipped = lines.join('\n').slice(0, 1800);
  return clipped || '// No public snippet available for this step.';
}

function inferCodeLanguage(path = '') {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) return 'tsx';
  if (lower.endsWith('.ts') || lower.endsWith('.js')) return 'ts';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.sql')) return 'sql';
  return 'text';
}

function diffPreviewSnippet(diff: any) {
  const created = Array.isArray(diff?.created) ? diff.created : [];
  const modified = Array.isArray(diff?.modified) ? diff.modified : [];
  const deleted = Array.isArray(diff?.deleted) ? diff.deleted : [];
  const lines = [
    ...created.map((path: string) => `+ ${path}`),
    ...modified.map((path: string) => `~ ${path}`),
    ...deleted.map((path: string) => `- ${path}`),
  ];
  return lines.slice(0, 16).join('\n') || String(diff?.summary || 'Project files updated.');
}

function filePreviewSnippet(files: GeneratedFile[], preferredPaths: string[] = []) {
  const pathSet = new Set(preferredPaths.filter(Boolean));
  const file = files.find(item => pathSet.has(item.path)) || files.find(item => item.path === 'src/App.tsx') || files.find(item => item.path === 'index.html') || files[0];
  if (!file) return null;
  return {
    path: file.path,
    language: inferCodeLanguage(file.path),
    code: redactStreamingCodeSnippet(file.content),
  };
}

function appendCodePreviewBlock(options: {
  title: string;
  subtitle?: string;
  code: string;
  language?: string;
  status?: 'writing' | 'done' | 'failed';
  defaultOpen?: boolean;
}) {
  const card = appendMessage('assistant', '');
  setMessageBlock(card, {
    type: 'code_preview',
    title: options.title,
    subtitle: options.subtitle,
    language: options.language || 'text',
    code: redactStreamingCodeSnippet(options.code),
    status: options.status || 'done',
    defaultOpen: options.defaultOpen ?? false,
  });
  return card;
}

function removeMessage(card: HTMLElement | null) {
  if (!card) return;
  const id = messageHandleId(card);
  if (id && conversationApi) {
    conversationApi.removeMessage(id);
    return;
  }
  card.remove();
}

function showTransientNotice(body: string, duration = 2400) {
  const card = appendMessage('system', body);
  if (duration > 0) window.setTimeout(() => removeMessage(card), duration);
  return card;
}

function isLikelyFrenchText(value: string) {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´ʼʹ]/g, "'");
  return /\b(je|tu|vous|nous|veux|j'aimerais|j aimerais|qu'est ce|qu est ce|cree|corrige|explique|comment|pourquoi|bonjour|salut|merci|projet|application|couleur|bouton)\b/i.test(normalized);
}

function normalizePromptIntentText(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´ʼʹ']/g, ' ')
    .replace(/[!?.,;:()[\]{}"“”«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isQuickConversationPrompt(value: string, mode: ChatMode) {
  if (mode !== 'auto') return false;
  const normalized = normalizePromptIntentText(value);
  if (!normalized || normalized.length > 280) return false;
  const projectContextHints = /\b(ce projet|cette app|cette application|mon projet|mon app|mon application|l app actuelle|le code actuel|les fichiers|dans le projet|dans l application|preview actuelle|fichiers actuels|current project|current app|current files|existing code)\b/i;
  if (projectContextHints.test(normalized)) return false;
  const changeHints = /\b(create|build|generate|add|edit|change|modify|fix|debug|deploy|publish|crée|creer|génère|genere|ajoute|modifie|corrige|déploie|deploie|publie|supprime|remplace|couleur|color|button|bouton|texte|text)\b/i;
  if (changeHints.test(normalized)) return false;
  const technicalActionHints = /\b(api|database|base de donnees|component|composant|page|app|application|site|interface|fonctionnalite|feature|bug|erreur|error|login|auth|supabase|vercel|railway)\b/i;
  if (technicalActionHints.test(normalized)) return false;
  const direct = new Set([
    'bonjour',
    'bonsoir',
    'salut',
    'coucou',
    'hello',
    'hi',
    'hey',
    'merci',
    'thanks',
    'thank you',
    'ok',
    'okay',
    'd accord',
    'daccord',
    'comment ca va',
    'comment ça va',
    'how are you',
    'que peux tu faire',
    'que peux-tu faire',
    'que sais tu faire',
    'que sais-tu faire',
    'qu est ce que tu sais faire',
    "qu'est ce que tu sais faire",
    "qu'est-ce que tu sais faire",
    'tu peux faire quoi',
    'what can you do',
    'what are you able to do',
    'aide moi',
    'help me',
  ]);
  if (direct.has(normalized)) return true;
  if (/\b(explique|pourquoi|comment|conseil|avis|strategie|analyse|compare|resume|reformule|corrige ce texte|que penses tu|peux tu me dire|est ce que|what|why|how|should|can you explain)\b/i.test(normalized)) {
    return true;
  }
  return /^(qui es tu|qui es-tu|tu es qui|what are you|what is huggy|c est quoi huggy|c'est quoi huggy|comment tu peux m aider|comment tu peux m'aider)/i.test(normalized);
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
  document.getElementById('project-menu-history')?.addEventListener('click', () => {
    closeProjectMenu();
    void openHistoryPanel();
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
  syncProjectReadinessClass();
  const frame = document.getElementById('preview-iframe-element') as HTMLIFrameElement | null;
  if (frame) {
    frame.dataset.emptyPreview = 'false';
    frame.dataset.emptyPreviewMode = 'ready';
    frame.removeAttribute('data-media-preview');
    frame.style.transition = 'opacity 180ms cubic-bezier(.22,1,.36,1), transform 180ms cubic-bezier(.22,1,.36,1)';
    frame.style.opacity = '0.72';
    frame.style.transform = 'scale(.998)';
    frame.srcdoc = html;
    requestAnimationFrame(() => {
      frame.style.opacity = '1';
      frame.style.transform = 'scale(1)';
    });
  }
  setPreviewDevice(selectedPreviewDevice, false);

  activateBuilderView('preview');

  const address = document.querySelector('.preview-address-glow span:last-child');
  if (address) address.textContent = `${status}.huggy.local / ${currentProjectId.slice(0, 8)}`;
}

function renderFiles(files: GeneratedFile[]) {
  currentFiles = files;
  syncProjectReadinessClass();
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

function syncProjectReadinessClass() {
  const hasFiles = currentFiles.length > 0;
  const hasPreview = Boolean(currentPreviewHtml.trim());
  document.body.classList.toggle('huggy-new-project-mode', !hasFiles && !hasPreview && activeWorkshop === 'chat');
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

function publishPrimaryLabel(status: PublishStatusPayload | null) {
  if (!status?.can_publish) return 'Build first';
  if (status.state === 'published' || status.state === 'changes_unpublished') return 'Update';
  return 'Publish';
}

function formatPublishDate(value: string | null | undefined) {
  if (!value) return 'Never';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

let publishPanelMode: 'main' | 'security' | 'domain' = 'main';

function publishPanelTitle(status: PublishStatusPayload | null) {
  if (!status) return 'Publishing';
  if (status.state === 'published' || status.state === 'changes_unpublished') return 'Published';
  if (status.state === 'ready_to_publish') return 'Ready to publish';
  return 'Publish';
}

function formatPublishUrl(url: string) {
  if (!url) return 'Not published yet';
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url.replace(/^https?:\/\//i, '');
  }
}

function publishIcon(name: 'copy' | 'link' | 'globe' | 'visitors' | 'shield' | 'settings' | 'check' | 'warning' | 'fail') {
  const common = 'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  if (name === 'copy') return `<svg ${common}><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  if (name === 'link') return `<svg ${common}><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"></path><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"></path></svg>`;
  if (name === 'globe') return `<svg ${common}><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z"></path></svg>`;
  if (name === 'visitors') return `<svg ${common}><path d="M5 20V10"></path><path d="M12 20V4"></path><path d="M19 20v-7"></path></svg>`;
  if (name === 'shield') return `<svg ${common}><path d="M12 3 20 6v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3Z"></path><path d="m9 12 2 2 4-5"></path></svg>`;
  if (name === 'settings') return `<svg ${common}><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"></path><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06a2.1 2.1 0 0 1-3 3l-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.64V21a2.1 2.1 0 0 1-4.2 0v-.09A1.8 1.8 0 0 0 8.4 19.3a1.8 1.8 0 0 0-2 .36l-.06.06a2.1 2.1 0 1 1-3-3l.06-.06a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2.1 13H2a2.1 2.1 0 0 1 0-4.2h.09A1.8 1.8 0 0 0 3.7 7.6a1.8 1.8 0 0 0-.36-2l-.06-.06a2.1 2.1 0 1 1 3-3l.06.06a1.8 1.8 0 0 0 2 .36H8.4A1.8 1.8 0 0 0 9.5 1.3V1a2.1 2.1 0 0 1 4.2 0v.09a1.8 1.8 0 0 0 1.1 1.64 1.8 1.8 0 0 0 2-.36l.06-.06a2.1 2.1 0 1 1 3 3l-.06.06a1.8 1.8 0 0 0-.36 2V7.6a1.8 1.8 0 0 0 1.64 1.1H21a2.1 2.1 0 0 1 0 4.2h-.09A1.8 1.8 0 0 0 19.4 15Z"></path></svg>`;
  if (name === 'check') return `<svg ${common}><path d="m5 12 4 4L19 6"></path></svg>`;
  if (name === 'fail') return `<svg ${common}><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
  return `<svg ${common}><path d="M12 8v5"></path><path d="M12 17h.01"></path><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"></path></svg>`;
}

function ensurePublishPanel() {
  let root = document.getElementById('huggy-publish-panel');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'huggy-publish-panel';
  root.style.cssText = 'position:fixed;inset:0;background:rgba(9,9,11,.58);display:grid;place-items:center;z-index:99999;padding:16px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);';
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

function renderPublishPanel(payload: PublishApiPayload | null, isPublishing = false, error = '') {
  const root = ensurePublishPanel();
  const status = payload?.publish || null;
  const hasPublishedDeployment = Boolean(
    payload?.deployment &&
    status &&
    (status.state === 'published' || status.state === 'changes_unpublished')
  );
  const publicUrl = hasPublishedDeployment ? status?.public_url || '' : '';
  const publicUrlLabel = formatPublishUrl(publicUrl);
  const canOpen = Boolean(publicUrl && hasPublishedDeployment);
  const checks = status?.checks || [];
  const visitorCount = Math.max(0, Number(status?.current_visitors || 0));
  const visitorLabel = `${formatCompactNumber(visitorCount)} Visitor${visitorCount === 1 ? '' : 's'}`;
  const title = publishPanelTitle(status);
  const primaryLabel = isPublishing ? 'Publishing...' : publishPrimaryLabel(status);
  const checkCount = Math.max(1, checks.length);
  const statusDetail = status?.state === 'changes_unpublished'
    ? 'Live is stable. Update publishes the latest preview.'
    : status?.state === 'published'
      ? 'This URL serves the last published version.'
      : status?.state === 'ready_to_publish'
        ? 'Publish creates the live URL.'
        : 'Build a ready preview first.';
  const securityRows = checks.map(check => {
    const tone = check.status === 'pass' ? '#7ddf8a' : check.status === 'warn' ? '#fb923c' : '#f87171';
    const iconName = check.status === 'pass' ? 'check' : check.status === 'warn' ? 'warning' : 'fail';
    return `
      <div style="display:grid;grid-template-columns:26px 1fr;gap:10px;align-items:start;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.035);">
        <span style="display:grid;place-items:center;width:26px;height:26px;border-radius:9px;color:${tone};background:rgba(255,255,255,.06);">${publishIcon(iconName as 'check' | 'warning' | 'fail')}</span>
        <span>
          <strong style="display:block;color:#f7f7f4;font-size:12px;line-height:1.2;">${escapeHtml(check.label)}</strong>
          <small style="display:block;margin-top:4px;color:#bbb8ae;font-size:11px;line-height:1.4;">${escapeHtml(check.detail)}</small>
        </span>
      </div>
    `;
  }).join('');
  const detailPanel = publishPanelMode === 'security'
    ? `
      <div style="display:grid;gap:9px;padding:0 24px 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <strong style="color:#f7f7f4;font-size:13px;">Security review</strong>
          <button type="button" data-publish-action="main" style="border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#e8e5dc;height:28px;border-radius:9px;padding:0 10px;font-size:12px;font-weight:750;cursor:pointer;">Back</button>
        </div>
        ${securityRows || '<p style="margin:0;color:#bbb8ae;font-size:13px;">No publish checks are available yet.</p>'}
      </div>
    `
    : publishPanelMode === 'domain'
      ? `
        <div style="display:grid;gap:10px;padding:0 24px 16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <strong style="color:#f7f7f4;font-size:13px;">Custom domain</strong>
            <button type="button" data-publish-action="main" style="border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#e8e5dc;height:28px;border-radius:9px;padding:0 10px;font-size:12px;font-weight:750;cursor:pointer;">Back</button>
          </div>
          <div style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);border-radius:13px;padding:12px;color:#c9c6bc;font-size:12px;line-height:1.5;">
            ${status?.custom_domain
              ? `This app is configured for <strong style="color:#fffefa;">${escapeHtml(status.custom_domain)}</strong>. Click Update after DNS changes are verified.`
              : 'Connect a custom domain from project settings, verify DNS, then click Update. Until then, Huggy serves the app under your Huggy URL.'}
          </div>
          <button type="button" data-publish-action="settings" style="height:36px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.07));color:#fffefa;border-radius:11px;font-size:12px;font-weight:850;cursor:pointer;">Open settings</button>
        </div>
      `
      : '';
  root.innerHTML = `
    <section role="dialog" aria-modal="true" aria-label="Publish settings" style="width:min(390px,100%);border:1px solid rgba(255,255,255,.12);background:#151513;color:#fffefa;border-radius:18px;box-shadow:0 24px 64px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.04) inset;overflow:hidden;font-family:var(--font-body,Inter,ui-sans-serif,system-ui);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 14px;border-bottom:1px solid rgba(255,255,255,.08);">
        <div style="min-width:0;">
          <h3 style="margin:0;color:#fffefa;font-size:18px;line-height:1.1;letter-spacing:-.03em;font-weight:850;">${escapeHtml(title)}</h3>
          <p style="margin:5px 0 0;color:#bbb8ae;font-size:11px;line-height:1.35;">${escapeHtml(statusDetail)}</p>
        </div>
        <div style="display:flex;align-items:center;gap:6px;color:#fffefa;font-size:12px;font-weight:850;white-space:nowrap;">
          <span style="color:#f3f2eb;display:grid;place-items:center;width:17px;height:17px;">${publishIcon('visitors')}</span>
          <span>${escapeHtml(visitorLabel)}</span>
        </div>
      </div>
      <div style="display:grid;gap:14px;padding:16px 18px 16px;border-bottom:1px solid rgba(255,255,255,.08);">
        ${error ? `<div style="border:1px solid rgba(248,113,113,.28);background:rgba(127,29,29,.30);color:#fecaca;border-radius:12px;padding:10px 12px;font-size:12px;line-height:1.4;">${escapeHtml(error)}</div>` : ''}
        ${status ? `
          <div style="display:grid;gap:9px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <strong style="color:#fffefa;font-size:13px;letter-spacing:-.02em;">Website URL</strong>
              <button type="button" data-publish-action="domain" style="display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:#fffefa;font-size:11px;font-weight:760;cursor:pointer;padding:0;white-space:nowrap;">
                <span style="display:grid;place-items:center;width:16px;height:16px;">${publishIcon('link')}</span>
                <span>Add custom domain</span>
              </button>
            </div>
            <div style="display:flex;align-items:center;gap:8px;min-width:0;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.035);border-radius:13px;padding:10px 11px;box-shadow:0 1px 0 rgba(255,255,255,.05) inset;">
              <span title="${escapeHtml(publicUrl || publicUrlLabel)}" style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${publicUrl ? '#fffefa' : '#8f8b82'};font-size:13px;font-weight:780;letter-spacing:-.01em;">${escapeHtml(publicUrlLabel)}</span>
              <button type="button" data-publish-action="copy" ${publicUrl ? '' : 'disabled'} aria-label="Copy live URL" style="display:grid;place-items:center;width:24px;height:24px;border:0;background:transparent;color:${publicUrl ? '#d8d5cc' : '#6f6c64'};cursor:${publicUrl ? 'pointer' : 'default'};padding:0;">${publishIcon('copy')}</button>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;color:#928f86;font-size:11px;line-height:1.35;">
              <span>${hasPublishedDeployment ? `Last published: ${escapeHtml(formatPublishDate(status.latest_published_at))}` : 'URL appears after first publish'}</span>
              <span>${status.badge_required ? 'Badge active' : 'No badge'}</span>
            </div>
          </div>
        ` : `
          <div style="display:grid;gap:10px;">
            <div class="skeleton" style="height:62px;border-radius:16px;background:rgba(255,255,255,.07);"></div>
            <div class="skeleton" style="height:72px;border-radius:14px;background:rgba(255,255,255,.05);"></div>
          </div>
        `}
        ${status ? `
          <div style="display:grid;gap:9px;">
            <strong style="color:#fffefa;font-size:13px;letter-spacing:-.02em;">Who can see this website</strong>
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.08);color:#d8d5cc;">${publishIcon('globe')}</div>
              <div>
                <div style="color:#fffefa;font-size:13px;font-weight:850;letter-spacing:-.02em;">Public</div>
                <div style="margin-top:2px;color:#c8c4bb;font-size:12px;font-weight:620;">Anyone with the URL</div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
      ${detailPanel}
      <div style="display:grid;gap:11px;padding:13px 18px 16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">
          <button type="button" data-publish-action="security" ${status ? '' : 'disabled'} style="height:32px;border:1px solid rgba(255,255,255,.15);background:linear-gradient(180deg,rgba(255,255,255,.15),rgba(255,255,255,.07));color:#fffefa;border-radius:10px;font-size:11px;font-weight:850;cursor:${status ? 'pointer' : 'default'};box-shadow:0 1px 0 rgba(255,255,255,.08) inset;opacity:${status ? '1' : '.5'};">
            Security <span style="display:inline-grid;place-items:center;min-width:18px;height:18px;margin-left:5px;border-radius:999px;background:#f97316;color:#fff;font-size:10px;font-weight:900;">${checkCount}</span>
          </button>
          <button type="button" data-publish-action="settings" ${status ? '' : 'disabled'} style="height:32px;border:1px solid rgba(255,255,255,.15);background:linear-gradient(180deg,rgba(255,255,255,.15),rgba(255,255,255,.07));color:#fffefa;border-radius:10px;font-size:11px;font-weight:850;cursor:${status ? 'pointer' : 'default'};box-shadow:0 1px 0 rgba(255,255,255,.08) inset;opacity:${status ? '1' : '.5'};">Settings</button>
        </div>
        <button type="button" data-publish-action="publish" ${status?.can_publish && !isPublishing ? '' : 'disabled'} style="height:36px;border:1px solid rgba(255,255,255,.16);background:radial-gradient(circle at 24% 12%, rgba(191,219,254,.26), transparent 34%),linear-gradient(135deg,#3768ff 0%,#2456f3 48%,#173fbd 100%);color:#fffefa;border-radius:10px;font-size:13px;font-weight:900;cursor:${status?.can_publish && !isPublishing ? 'pointer' : 'default'};box-shadow:0 10px 22px rgba(28,83,255,.22),inset 0 1px 0 rgba(255,255,255,.20);opacity:${status?.can_publish && !isPublishing ? '1' : '.52'};">${escapeHtml(primaryLabel)}</button>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;color:#8f8c84;font-size:11px;">
          <button type="button" data-publish-action="close" style="border:0;background:transparent;color:#aaa69d;font-weight:800;cursor:pointer;padding:0;">Close</button>
          <button type="button" data-publish-action="open" ${canOpen ? '' : 'disabled'} style="border:0;background:transparent;color:${canOpen ? '#d8d5cc' : '#69665f'};font-weight:800;cursor:${canOpen ? 'pointer' : 'default'};padding:0;">Open live app</button>
        </div>
      </div>
    </section>
  `;

  root.querySelectorAll<HTMLButtonElement>('[data-publish-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.publishAction || 'close';
      if (action === 'close') closePublishPanel();
      if (action === 'main') {
        publishPanelMode = 'main';
        renderPublishPanel(payload, isPublishing, error);
      }
      if (action === 'security') {
        publishPanelMode = publishPanelMode === 'security' ? 'main' : 'security';
        renderPublishPanel(payload, isPublishing, error);
      }
      if (action === 'domain') {
        publishPanelMode = publishPanelMode === 'domain' ? 'main' : 'domain';
        renderPublishPanel(payload, isPublishing, error);
      }
      if (action === 'settings') {
        closePublishPanel();
        openSettings('account');
      }
      if (action === 'copy' && publicUrl) {
        void navigator.clipboard?.writeText(publicUrl);
        showTransientNotice('Live app link copied.');
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
  publishPanelMode = 'main';
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
  publishPanelMode = 'main';
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

function ensureHistoryPanel() {
  let root = document.getElementById('huggy-history-panel');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'huggy-history-panel';
  root.style.cssText = 'position:fixed;inset:0;background:rgba(9,9,11,.38);display:grid;place-items:center;z-index:99999;padding:16px;backdrop-filter:blur(8px);';
  document.body.appendChild(root);
  root.addEventListener('click', event => {
    if (event.target === root) closeHistoryPanel();
  });
  return root;
}

function closeHistoryPanel() {
  document.getElementById('huggy-history-panel')?.remove();
}

function formatShortDate(value?: string) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderHistoryPanel(runs: AgentRunSummary[] = [], versions: ProjectVersionSummary[] = [], loading = false, error = '') {
  const root = ensureHistoryPanel();
  const runRows = runs.length ? runs.map(run => {
    const runMeta = [
      formatShortDate(run.created_at),
      run.duration_ms ? `${Math.max(1, Math.round(run.duration_ms / 1000))}s` : '',
    ].filter(Boolean).join(' · ');
    return `
    <div style="border:1px solid var(--border-light);background:var(--bg-elevated);border-radius:10px;padding:10px;display:grid;gap:5px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <strong style="font-size:12px;color:var(--text);">${escapeHtml(run.intent || 'agent run')}</strong>
        <span style="font-size:10px;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(run.status || 'unknown')}</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(runMeta)}</div>
      ${run.diagnostic_code ? `<div style="font-size:11px;color:#991b1b;">${escapeHtml(run.diagnostic_code)}</div>` : ''}
    </div>
  `;
  }).join('') : '<div style="color:var(--text-muted);font-size:12px;">No agent runs recorded yet.</div>';
  const versionRows = versions.length ? versions.map(version => `
    <div style="border:1px solid var(--border-light);background:var(--bg-elevated);border-radius:10px;padding:10px;display:grid;gap:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <strong style="font-size:12px;color:var(--text);">Version ${escapeHtml(String(version.version_number || ''))}</strong>
        <span style="font-size:11px;color:var(--text-muted);">${formatShortDate(version.created_at)}</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);line-height:1.45;">${escapeHtml(version.diff_summary?.summary || version.label || 'Saved project version.')}</div>
      <button type="button" data-history-rollback="${escapeHtml(version.id)}" style="justify-self:start;height:28px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:7px;padding:0 10px;font-size:11px;font-weight:800;cursor:pointer;">Rollback</button>
    </div>
  `).join('') : '<div style="color:var(--text-muted);font-size:12px;">No saved versions yet.</div>';

  root.innerHTML = `
    <section style="width:min(760px,100%);max-height:min(760px,calc(100vh - 32px));overflow:auto;border:1px solid var(--border);background:var(--bg-surface);color:var(--text);border-radius:16px;box-shadow:0 28px 90px rgba(9,9,11,.22);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:16px;border-bottom:1px solid var(--border-light);">
        <div>
          <div style="font-size:11px;color:var(--text-muted);font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Project history</div>
          <h3 style="margin:4px 0 0;font-size:16px;line-height:1.2;">Runs, versions and rollback</h3>
        </div>
        <button type="button" data-history-close style="border:1px solid var(--border);background:var(--bg-input);color:var(--text);width:28px;height:28px;border-radius:8px;cursor:pointer;">×</button>
      </div>
      <div style="padding:16px;display:grid;gap:14px;">
        ${loading ? '<div style="font-size:12px;color:var(--text-muted);">Loading history...</div>' : ''}
        ${error ? `<div style="border:1px solid rgba(185,28,28,.28);background:rgba(254,242,242,.88);color:#991b1b;border-radius:10px;padding:10px;font-size:12px;">${escapeHtml(error)}</div>` : ''}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
          <div style="display:grid;gap:8px;align-content:start;">
            <h4 style="margin:0;font-size:13px;">Agent runs</h4>
            ${runRows}
          </div>
          <div style="display:grid;gap:8px;align-content:start;">
            <h4 style="margin:0;font-size:13px;">Saved versions</h4>
            ${versionRows}
          </div>
        </div>
      </div>
    </section>
  `;
  root.querySelector('[data-history-close]')?.addEventListener('click', closeHistoryPanel);
  root.querySelectorAll<HTMLButtonElement>('[data-history-rollback]').forEach(button => {
    button.addEventListener('click', () => void rollbackToVersion(button.dataset.historyRollback || ''));
  });
}

async function openHistoryPanel() {
  if (!currentProjectId) {
    appendMessage('system', 'Create or open a project before viewing history.');
    return;
  }
  renderHistoryPanel([], [], true);
  try {
    const [runsPayload, versionsPayload] = await Promise.all([
      apiFetch<{ success: boolean; runs: AgentRunSummary[] }>(`/api/projects/${encodeURIComponent(currentProjectId)}/agent/runs?limit=12`),
      apiFetch<{ success: boolean; versions: ProjectVersionSummary[] }>(`/api/projects/${encodeURIComponent(currentProjectId)}/versions`),
    ]);
    renderHistoryPanel(runsPayload.runs || [], versionsPayload.versions || []);
  } catch (error) {
    renderHistoryPanel([], [], false, error instanceof Error ? error.message : 'Unable to load project history.');
  }
}

async function rollbackToVersion(versionId: string) {
  if (!currentProjectId || !versionId) return;
  try {
    const payload = await apiFetch<{ success: boolean; files: GeneratedFile[]; preview?: { html?: string; status?: string }; project?: { name?: string } }>(`/api/projects/${encodeURIComponent(currentProjectId)}/versions/${encodeURIComponent(versionId)}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ source: 'history_panel' }),
    });
    renderFiles(payload.files || []);
    if (payload.preview?.html) setPreview(payload.preview.html, payload.preview.status || 'ready');
    if (payload.project?.name) setProjectNameDisplay(payload.project.name);
    closeHistoryPanel();
    appendMessage('assistant', 'Rollback complete. The preview now shows the restored version.');
  } catch (error) {
    renderHistoryPanel([], [], false, error instanceof Error ? error.message : 'Rollback failed.');
  }
}

function recordAgentFeedback(feedback: 'keep' | 'modify' | 'regenerate' | 'publish' | 'reject', extra: Record<string, unknown> = {}) {
  if (!currentProjectId) return Promise.resolve();
  return apiFetch(`/api/projects/${encodeURIComponent(currentProjectId)}/agent/feedback`, {
    method: 'POST',
    body: JSON.stringify({ feedback, runId: lastAgentRunId, source: 'builder_inline_action', ...extra }),
  }).then(() => undefined).catch(() => undefined);
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

function emptyBuilderProjectPayload(): ProjectPayload {
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
    workspace_state: userWorkspaceState ? {
      draft_prompt: userWorkspaceState.builder_draft_prompt || '',
      selected_mode: userWorkspaceState.builder_selected_mode || 'auto',
      selected_model: userWorkspaceState.builder_selected_model || 'auto',
      active_tab: userWorkspaceState.builder_active_tab || 'preview',
      preview_device: userWorkspaceState.builder_preview_device || 'desktop',
    } : null,
  } as ProjectPayload;
}

async function ensureProject() {
  const params = new URLSearchParams(window.location.search);
  const wantsFreshProject = params.get('new') === '1';
  const routeProjectId = getProjectIdFromUrl();
  currentProjectId = isRealProjectId(routeProjectId) ? routeProjectId : '';

  if (currentProjectId) {
    rememberLastBuilderProjectId(currentProjectId);
    return apiFetch<ProjectPayload>(`/api/projects/${encodeURIComponent(currentProjectId)}`);
  }

  const userState = await apiFetch<{ success: boolean; state: UserWorkspaceState | null }>('/api/users/me/workspace-state').catch(() => null);
  userWorkspaceState = userState?.state || null;
  if (wantsFreshProject) {
    currentProjectId = '';
    return emptyBuilderProjectPayload();
  }
  const stateProjectId = isRealProjectId(userWorkspaceState?.last_project_id) ? String(userWorkspaceState?.last_project_id) : '';
  const fallbackProjectId = stateProjectId || rememberedLastBuilderProjectId();

  if (fallbackProjectId) {
    setCurrentBuilderProjectId(fallbackProjectId);
    try {
      return await apiFetch<ProjectPayload>(`/api/projects/${encodeURIComponent(currentProjectId)}`);
    } catch (error) {
      forgetLastBuilderProjectId(fallbackProjectId);
      currentProjectId = '';
      window.history.replaceState({}, '', '/builder.html');
      if (userWorkspaceState?.last_project_id === fallbackProjectId) {
        await apiFetch('/api/users/me/workspace-state', {
          method: 'PATCH',
          body: JSON.stringify({ last_project_id: null, last_route: '/builder.html' }),
        }).catch(() => null);
      }
      console.warn('[huggy] Unable to restore last builder project.', error);
    }
  }

  return emptyBuilderProjectPayload();
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
  setCurrentBuilderProjectId(created.project.id);
  setProjectNameDisplay(created.project.name || selectedName);
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
  const api = ensureConversationApi();
  api?.clear();
  if (scroll) delete scroll.dataset.restored;
  const projectName = document.getElementById('project-name');
  const loading = showTransientNotice('Loading project files, timeline and preview...', 0);
  try {
    const payload = await ensureProject();
    if (isRealProjectId(payload.project?.id || currentProjectId)) {
      setCurrentBuilderProjectId(String(payload.project?.id || currentProjectId));
    }
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
    syncProjectReadinessClass();
    restoreMessages(payload);
    const activeTab = payload.workspace_state?.active_tab || userWorkspaceState?.builder_active_tab;
    if (activeTab === 'code' || activeTab === 'database' || activeTab === 'analysis') {
      activateBuilderView(activeTab);
    } else if (activeTab) {
      activateBuilderView('preview');
    }
    setPreviewDevice(normalizePreviewDevice(payload.workspace_state?.preview_device || userWorkspaceState?.builder_preview_device), false);
    syncWorkshopPreview();
    removeMessage(loading);
    if (!payload.messages?.length) {
      showTransientNotice('Ready when you are.', 1600);
    }
  } catch (error) {
    updateMessage(loading, error instanceof Error ? error.message : 'Unable to load project.');
    window.setTimeout(() => removeMessage(loading), 5000);
  }
}

function restoreMessages(payload: ProjectPayload) {
  if (!payload.messages?.length) return;
  const scroll = chatScroll();
  if (!scroll || scroll.dataset.restored === 'true') return;
  scroll.dataset.restored = 'true';
  payload.messages
    .filter(message => message.content && !/^Project (synchronized|ready)\./i.test(message.content))
    .slice(-100)
    .forEach(message => {
    const card = appendMessage(message.role === 'user' ? 'user' : 'assistant', message.content);
    if (message.intent === 'plan') {
      lastPlan = message.content;
      setMessageBlock(card, buildPlanBlock(message.content, message.content, false));
      addInlineAction(card, 'Build this plan', () => void generateFromPrompt('Build this plan', 'build', true));
    }
    });
}

const STREAM_INTERNAL_MODEL_KEYS = [
  'model',
  'model_id',
  'selected_model',
  'requested_model',
  'routed_model',
  'provider_model',
  'selectedModel',
  'requestedModel',
  'auto_routed',
  'task_complexity',
  'routing_mode',
  'selected_model_policy',
  'provider',
];

function redactInternalModelFields(payload: any): any {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const redacted: any = redactSecretPayload({ ...payload });
  STREAM_INTERNAL_MODEL_KEYS.forEach(key => {
    if (key in redacted) delete redacted[key];
  });
  return redacted;
}

async function generateFromPrompt(prompt: string, requestedMode: ChatMode, useLastPlan = false, extra: Record<string, unknown> = {}, displayText = prompt) {
  const safePrompt = redactSecrets(prompt).trim();
  const safeDisplayText = redactSecrets(displayText);
  if (isGenerating || !safePrompt) return;
  const handoff = getInitialBuilderHandoff();
  const effectiveExtra = {
    ...extra,
    ...(extra.studioContext === undefined && activeWorkshop !== 'chat' ? { studioContext: studioPromptContextPayload() } : {}),
    ...(extra.importContext === undefined && handoff.importContext ? { importContext: handoff.importContext } : {}),
  };
  if (handoff.importContext && effectiveExtra.importContext === handoff.importContext) {
    delete handoff.importContext;
  }
  stopRequested = false;
  setBusy(true);
  activeAbort = new AbortController();
  clearInlineBlocks();

  appendMessage('user', safeDisplayText);
  const speaksFrench = isLikelyFrenchText(safePrompt);
  const quickConversation = isQuickConversationPrompt(safePrompt, requestedMode);
  const initialLabel = requestedMode === 'plan' ? 'Planning' : 'Thinking';
  const firstWorkingLabel = quickConversation
    ? (speaksFrench ? 'Huggy écrit...' : 'Huggy is writing...')
    : initialLabel;
  const status = appendMessage('assistant', firstWorkingLabel, { working: true });
  if (quickConversation) {
    setMessageShimmer(status, firstWorkingLabel, false);
  } else {
    setMessageShimmer(status, initialLabel, true);
    startWorkingTimer(status, initialLabel);
  }
  let generationTouchesPreview = false;
  activeGenerationTouchesPreview = false;
  let streamedText = '';
  let assistantHasFinalContent = false;
  const say = (fr: string, en: string) => speaksFrench ? fr : en;
  const agentSteps = new Map<string, { label: string; state: 'done' | 'now'; detail?: string }>();
  const shownStreamBlocks = new Set<string>();
  const streamCodeCards = new Map<string, HTMLElement>();
  const liveFileSnippets = new Map<string, { code: string; language: string; title: string }>();
  let responseCard: HTMLElement | null = status;
  let agentActivityState: AgentStreamUiState | null = null;
  let agentActivityFrame = 0;
  let lastActivityTickAt = 0;
  const elapsedForStatus = () => {
    const startedAt = Number(status?.dataset.workingStartedAt || 0);
    return startedAt ? formatWorkingDuration(Date.now() - startedAt) : undefined;
  };
  const ensureAgentActivity = (headline = speaksFrench ? 'Huggy comprend la demande' : 'Huggy understands the request') => {
    if (quickConversation && !generationTouchesPreview) return null;
    if (!status) return null;
    const id = messageHandleId(status);
    if (id) activeAgentActivityMessageId = id;
    if (!agentActivityState) {
      agentActivityState = createInitialAgentStreamState({
        headline,
        detail: speaksFrench
          ? 'Je garde uniquement les etapes reelles du serveur.'
          : 'I am showing only real server-side steps.',
        elapsed: elapsedForStatus(),
        runHeader: {
          workflow: requestedMode === 'plan' ? 'Plan' : requestedMode === 'build' ? 'Build' : 'Auto',
          objective: safePrompt.length > 96 ? `${safePrompt.slice(0, 93)}...` : safePrompt,
          scope: currentProjectName && currentProjectName !== 'Untitled app' ? currentProjectName : 'Current project',
          rollbackAvailable: Boolean(currentProjectId && currentFiles.length),
          status: speaksFrench ? 'Preparation du run' : 'Preparing run',
        },
      });
      setAgentActivityBlock(status, agentActivityState);
    }
    return agentActivityState;
  };
  const flushAgentActivity = () => {
    agentActivityFrame = 0;
    if (agentActivityState) setAgentActivityBlock(status, agentActivityState);
  };
  const pushAgentActivity = (type: string, payload: Record<string, any> = {}, message?: string) => {
    if (type === 'working_tick') {
      const now = Date.now();
      if (now - lastActivityTickAt < 1600) return;
      lastActivityTickAt = now;
    }
    const current = ensureAgentActivity();
    if (!current) return;
    agentActivityState = reduceAgentStreamEvent(current, {
      type,
      payload,
      message,
      elapsed: elapsedForStatus(),
    });
    if (!agentActivityFrame) agentActivityFrame = window.requestAnimationFrame(flushAgentActivity);
  };
  if (!quickConversation) {
    ensureAgentActivity(initialLabel === 'Planning'
      ? (speaksFrench ? 'Huggy prepare le plan' : 'Huggy is preparing the plan')
      : (speaksFrench ? 'Huggy prepare le travail' : 'Huggy is preparing the work'));
  }
  const showStreamCodeBlock = (key: string, options: Parameters<typeof appendCodePreviewBlock>[0]) => {
    if (quickConversation && !generationTouchesPreview) return;
    if (shownStreamBlocks.has(key)) return;
    shownStreamBlocks.add(key);
    appendCodePreviewBlock(options);
  };
  const upsertStreamCodeBlock = (key: string, options: Parameters<typeof appendCodePreviewBlock>[0]) => {
    if (quickConversation && !generationTouchesPreview) return;
    const existing = streamCodeCards.get(key);
    if (existing) {
      setMessageBlock(existing, {
        type: 'code_preview',
        title: options.title,
        subtitle: options.subtitle,
        language: options.language || 'text',
        code: redactStreamingCodeSnippet(options.code),
        status: options.status || 'done',
        defaultOpen: options.defaultOpen ?? false,
      });
      return existing;
    }
    const card = appendCodePreviewBlock(options);
    if (card) streamCodeCards.set(key, card);
    return card;
  };
  const syncAgentSteps = (headline = activeWorkingLabel) => {
    if (quickConversation && !generationTouchesPreview) return;
    activeWorkingDetails = Array.from(agentSteps.values()).map(step => `${step.state}: ${step.label}`);
    activeWorkingSteps = Array.from(agentSteps.entries()).map(([id, step]) => ({
      id,
      label: step.label,
      detail: step.detail,
      status: step.state === 'now' ? 'active' : 'done',
    }));
    renderWorkingLabel(headline);
  };
  const markAgentStep = (key: string, label: string, headline = label, detail?: string) => {
    if (quickConversation && !generationTouchesPreview) return;
    for (const [stepKey, step] of agentSteps) {
      if (stepKey !== key && step.state === 'now') agentSteps.set(stepKey, { ...step, state: 'done' });
    }
    agentSteps.set(key, { label, state: 'now', detail });
    syncAgentSteps(headline);
  };
  const finishAgentStep = (key: string, label?: string, detail?: string) => {
    if (quickConversation && !generationTouchesPreview) return;
    const current = agentSteps.get(key);
    if (!current && !label) return;
    agentSteps.set(key, { label: label || current?.label || key, state: 'done', detail: detail ?? current?.detail });
    syncAgentSteps();
  };
  const setAssistantWorking = (label: string) => {
    if (assistantHasFinalContent) return;
    if (quickConversation && !generationTouchesPreview) return;
    setMessageShimmer(status, label);
    if (activeWorkingDetails.length) syncAgentSteps(label);
  };
  const shouldPreserveWorkingTrace = () => Boolean(generationTouchesPreview && !quickConversation && status);
  const promoteToPreviewWork = (label = activeWorkingLabel || initialLabel) => {
    if (generationTouchesPreview) return;
    generationTouchesPreview = true;
    activeGenerationTouchesPreview = true;
    ensureAgentActivity(label);
    activateBuilderView('preview');
    setEmptyPreviewState('working', label);
  };
  const ensureResponseCard = (traceLabel = say('Terminé', 'Completed')) => {
    if (assistantHasFinalContent) return responseCard;
    if (shouldPreserveWorkingTrace()) {
      completeMessageShimmer(status, traceLabel);
      responseCard = appendMessage('assistant', '');
    } else if (!status) {
      responseCard = appendMessage('assistant', '');
    } else {
      clearMessageShimmer(status);
      responseCard = status;
    }
    assistantHasFinalContent = true;
    return responseCard;
  };
  const commitAssistantText = (content: unknown, fallback = 'Done.', traceLabel = say('Terminé', 'Completed')) => {
    const text = String(content || '').trim() || fallback;
    const target = ensureResponseCard(traceLabel);
    streamedText = text;
    updateMessage(target, text);
    return target;
  };
  try {
    await ensureProjectForPrompt(safePrompt);
    if (activeWorkshop === 'media') {
      generationTouchesPreview = true;
      activeGenerationTouchesPreview = true;
      activateBuilderView('preview');
      setAssistantWorking('Generating media');
      markAgentStep('media_brief', say('Brief media prepare.', 'Media brief prepared.'), 'Thinking', say('Je comprends le format, le modele et le type de contenu.', 'I am reading the format, model and content type.'));
      setMediaPreviewHtml(mediaPreviewShellHtml('working', 'Generating media'), 'media.huggy.local / rendering');
      const mediaPayload = await apiFetch<MediaGeneratePayload>(`/api/projects/${encodeURIComponent(currentProjectId)}/media/generate`, {
        method: 'POST',
        body: JSON.stringify({
          prompt: safePrompt,
          settings: mediaSettings,
          studioContext: studioPromptContextPayload(),
        }),
      });
      finishAgentStep('media_brief', say('Brief media pret.', 'Media brief ready.'));
      finishAgentStep('media_render', mediaPayload.assets?.length
        ? say('Asset media pret.', 'Media asset ready.')
        : mediaPayload.status === 'not_configured'
          ? say('Brief pret, provider a connecter.', 'Brief ready, provider needs connection.')
          : say('Resultat media pret.', 'Media result ready.'));
      if (mediaPayload.preview?.html) {
        setMediaPreviewHtml(mediaPayload.preview.html, `${mediaPayload.status}.media.huggy.local`);
      }
      const target = commitAssistantText(mediaPayload.text || 'Media ready.', 'Media ready.', say('Media pret', 'Media ready'));
      if (mediaPayload.assets?.[0]?.url) {
        addInlineAction(target, 'Download', () => window.open(mediaPayload.assets[0].url, '_blank', 'noopener,noreferrer'));
      }
      addInlineAction(target, speaksFrench ? 'Variation' : 'Variation', () => void generateFromPrompt(`${safePrompt}\n\nMake a fresh variation with the same goal.`, 'auto', false, { studioContext: studioPromptContextPayload() }, safeDisplayText));
      addInlineAction(target, speaksFrench ? 'Utiliser dans l app' : 'Use in app', () => {
        setActiveWorkshop('chat', { focusInput: true });
        const promptInput = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
        if (promptInput) {
          promptInput.value = speaksFrench
            ? 'Utilise le dernier asset Huggy Media dans la landing de cette app, sans casser le design actuel.'
            : 'Use the latest Huggy Media asset in this app landing without breaking the current design.';
          promptInput.dispatchEvent(new Event('input', { bubbles: true }));
          promptInput.focus();
        }
      });
      return;
    }
    await apiStream(`/api/projects/${encodeURIComponent(currentProjectId)}/generate/stream`, {
      prompt: safePrompt,
      requestedMode,
      useLastPlan,
      modelId: selectedModel(),
      ...effectiveExtra,
    }, (eventType, event) => {
      const payload = redactInternalModelFields(event.payload || {});
      const realLabel = (fallback: string) => {
        const raw = String(payload.step_label || payload.message || event.message || fallback || '').trim();
        return raw.replace(/\s+/g, ' ').slice(0, 140) || fallback;
      };
      const visibleStepLabel = (fallback: string) => {
        const raw = String(payload.step_label || '').trim();
        return raw ? raw.replace(/\s+/g, ' ').slice(0, 140) : fallback;
      };
      const runnerLabel = (fallback: string) => {
        const checks = Array.isArray(payload.checks) ? payload.checks : [];
        if (!checks.length) return realLabel(fallback);
        const failed = checks.filter((check: any) => check?.status === 'failed').length;
        const passed = checks.filter((check: any) => check?.status === 'passed').length;
        const skipped = checks.length - failed - passed;
        return failed
          ? `${failed} check${failed === 1 ? '' : 's'} need attention`
          : `${passed} check${passed === 1 ? '' : 's'} passed${skipped ? `, ${skipped} skipped` : ''}`;
      };
      const fileDiffLabel = () => {
        const summary = String(payload.diff?.summary || '').trim();
        return summary ? `Files updated: ${summary}` : realLabel('Files updated.');
      };
      const normalizedIntent = String(payload.intent?.intent || payload.intent || '').replace(/_/g, ' ').trim();
      const visibleIntentLabel = () => {
        const intent = normalizedIntent.toLowerCase();
        if (intent.includes('clarification')) return visibleStepLabel(say('Un point doit etre precise.', 'One detail needs clarification.'));
        if (intent.includes('debug')) return visibleStepLabel(say('Bug concret identifie.', 'Concrete issue identified.'));
        if (intent.includes('edit')) return visibleStepLabel(say('Modification ciblee detectee.', 'Targeted change detected.'));
        if (intent.includes('build')) return visibleStepLabel(say('Construction utile detectee.', 'Build request understood.'));
        if (intent.includes('plan')) return visibleStepLabel(say('Plan utile detecte.', 'Useful plan requested.'));
        if (intent.includes('verify')) return visibleStepLabel(say('Verification demandee.', 'Check requested.'));
        if (intent.includes('deploy')) return visibleStepLabel(say('Publication ou domaine a traiter.', 'Publish or domain work detected.'));
        return visibleStepLabel(say('Demande comprise.', 'Request understood.'));
      };
      const trustDetail = (fr: string, en: string) => String(payload.step_detail || say(fr, en)).replace(/\s+/g, ' ').slice(0, 180);
      const intentTrustDetail = () => {
        const intent = String(payload.intent?.intent || '').trim();
        const mutates = Boolean(payload.intent?.requiresFileChanges || payload.intent?.requiresPreviewRebuild);
        if (intent === 'build') return trustDetail('Je vais creer une vraie app interactive, puis la verifier avant de montrer la preview.', 'I will create a real interactive app, then verify it before showing the preview.');
        if (intent === 'edit') return trustDetail('Je preserve l app existante et je modifie seulement la partie demandee.', 'I will preserve the existing app and change only the requested part.');
        if (intent === 'debug_fix') return trustDetail('Je cherche la cause probable, je corrige de facon ciblee, puis je relance les checks.', 'I will find the likely cause, apply a targeted fix, then rerun checks.');
        if (intent === 'plan') return trustDetail('Je prepare un plan sans modifier les fichiers.', 'I will prepare a plan without changing files.');
        if (intent === 'verify') return trustDetail('Je controle le projet actuel sans le modifier.', 'I will inspect the current project without changing it.');
        if (!mutates) return trustDetail('Je reponds simplement sans toucher a la preview ni aux fichiers.', 'I will answer without touching the preview or files.');
        return trustDetail('Je choisis l action la plus sure avant de modifier le projet.', 'I am choosing the safest action before changing the project.');
      };
      if (payload.build_session_id) lastBuildSessionId = payload.build_session_id;
      if (payload.agent_run_id) lastAgentRunId = String(payload.agent_run_id);
      if (isSeniorStreamEvent(eventType) || eventType === 'working_tick') {
        pushAgentActivity(eventType, payload, event.message);
      }
      if (eventType === 'thinking_step' || eventType === 'planning_step' || eventType === 'action_step' || eventType === 'file_step' || eventType === 'tool_step' || eventType === 'validation_step') {
        const stepKey = `${eventType}_${String(payload.id || payload.key || payload.label || event.message || '').slice(0, 28)}`;
        const label = eventType === 'planning_step'
          ? 'Planning'
          : eventType === 'action_step' || eventType === 'file_step' || eventType === 'tool_step'
            ? 'Building'
            : eventType === 'validation_step'
              ? 'Checking'
              : 'Thinking';
        markAgentStep(stepKey, realLabel(say('Etape en cours.', 'Step in progress.')), label);
        setAssistantWorking(label);
        if (eventType === 'action_step' || eventType === 'file_step' || eventType === 'tool_step') promoteToPreviewWork(label);
        if (generationTouchesPreview) setEmptyPreviewState('working', label);
        return;
      }
      if (eventType === 'answer_stream_started') {
        if (generationTouchesPreview) markAgentStep('answer', realLabel(say('Réponse en cours.', 'Writing the answer.')), 'Answering');
        return;
      }
      if (eventType === 'token' || eventType === 'answer_token' || eventType === 'delta') {
        const target = ensureResponseCard(say('Réponse prête', 'Answer ready'));
        streamedText += String(payload.text_delta || payload.delta || payload.content || event.message || '');
        updateMessage(target, streamedText || (speaksFrench ? 'Réponse en cours...' : 'Writing...'));
        return;
      }
      if (eventType === 'run_started') {
        markAgentStep('start', visibleStepLabel(say('Demande recue.', 'Request received.')), 'Thinking', trustDetail('Je garde une trace claire du travail reel effectue.', 'I keep a clear trace of the real work performed.'));
        return;
      }
      if (eventType === 'context_loaded') {
        markAgentStep('context', visibleStepLabel(say('Projet inspecte.', 'Project inspected.')), 'Thinking', trustDetail('Je lis l etat actuel pour garder ce qui fonctionne deja.', 'I am reading the current state so I keep what already works.'));
        return;
      }
      if (eventType === 'agent_thinking') {
        markAgentStep('thinking', visibleStepLabel(say('Demande analysee.', 'Request analyzed.')), 'Thinking', trustDetail('Je choisis l action la plus sure avant de toucher au projet.', 'I am choosing the safest action before touching the project.'));
        return;
      }
      if (eventType === 'intent_detected') {
        markAgentStep('intent', visibleIntentLabel(), 'Thinking', intentTrustDetail());
        if (payload.intent?.requiresPreviewRebuild || payload.intent?.requiresFileChanges) {
          promoteToPreviewWork('Thinking');
        }
        return;
      }
      if (eventType === 'working_tick') {
        if (!quickConversation || generationTouchesPreview) {
          if (payload.step_label) {
            const phase = String(payload.phase || 'working').replace(/[^a-z0-9_-]/gi, '_').slice(0, 40) || 'working';
            markAgentStep(`working_${phase}`, visibleStepLabel(say('Travail en cours.', 'Work in progress.')), activeWorkingLabel, trustDetail('Je continue cette etape cote serveur.', 'I am continuing this server-side step.'));
          }
          renderWorkingLabel(activeWorkingLabel);
          if (generationTouchesPreview) setEmptyPreviewState('working', activeWorkingLabel);
        }
        return;
      }
      if (eventType === 'file_stream_started' || eventType === 'file_token' || eventType === 'file_stream_completed' || eventType === 'file_stream_preview') {
        const path = String(payload.path || payload.file || 'src/App.tsx').trim() || 'src/App.tsx';
        const language = String(payload.language || inferCodeLanguage(path));
        const existing = liveFileSnippets.get(path) || {
          code: '',
          language,
          title: path,
        };
        const incoming = String(payload.text_delta || payload.delta || payload.snippet || payload.preview || payload.content || '');
        const nextCode = eventType === 'file_stream_preview' && incoming
          ? incoming
          : `${existing.code}${incoming}`;
        const status = eventType === 'file_stream_completed' ? 'done' : 'writing';
        const code = nextCode.trim()
          ? nextCode
          : `// ${path}\n// ${say('Huggy prépare ce fichier...', 'Huggy is preparing this file...')}`;
        liveFileSnippets.set(path, { code, language, title: path });
        promoteToPreviewWork('Building');
        if (status === 'done') {
          finishAgentStep(`file_${path}`, `${path} ${say('pret.', 'ready.')}`, trustDetail('Ce fichier est pret pour la fusion.', 'This file is ready to merge.'));
        } else {
          markAgentStep(`file_${path}`, `${say('Ecriture', 'Writing')} ${path}`, 'Building', trustDetail('Je montre un extrait public base sur le flux reel.', 'I am showing a public snippet based on the real stream.'));
        }
        upsertStreamCodeBlock(`live_file_${path}`, {
          title: `${status === 'done' ? say('Fichier prêt', 'File ready') : say('Fichier en cours', 'Writing file')} - ${path}`,
          subtitle: String(payload.reason || payload.step_detail || event.message || '').trim() || undefined,
          language,
          code,
          status,
          defaultOpen: false,
        });
        setAssistantWorking('Building');
        setEmptyPreviewState('working', 'Building');
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
        if (eventType === 'planning') markAgentStep('plan', visibleStepLabel(say('Planification du travail utile.', 'Planning the useful work.')), label, trustDetail('Je pose une sequence courte pour reduire les changements inutiles.', 'I am setting a short sequence to reduce unnecessary changes.'));
        if (eventType === 'research_started') markAgentStep('research', visibleStepLabel(say('Recherche des informations utiles.', 'Looking up useful context.')), label, trustDetail('Je cherche seulement si la demande depend d informations recentes ou externes.', 'I only research when the request depends on recent or external information.'));
        if (eventType === 'tool_loop_started') markAgentStep('tools', visibleStepLabel(say('Preparation des actions techniques.', 'Preparing technical actions.')), label, trustDetail('Je limite les outils pour garder le run rapide et controlable.', 'I am limiting tool work so the run stays fast and controlled.'));
        setAssistantWorking(label);
        if (generationTouchesPreview) setEmptyPreviewState('working', label);
        return;
      }
      if (eventType === 'research_result' || eventType === 'research_skipped') {
        finishAgentStep('research', eventType === 'research_result'
          ? realLabel(say('Recherche terminée.', 'Research completed.'))
          : realLabel(say('Recherche non nécessaire.', 'Research not needed.')),
          eventType === 'research_result'
            ? trustDetail('J integre seulement les sources utiles au contexte.', 'I am keeping only useful sources in context.')
            : trustDetail('Le contexte projet suffit pour continuer.', 'The project context is enough to continue.'));
        setAssistantWorking(eventType === 'research_result' ? 'Researching' : 'Thinking');
        if (generationTouchesPreview) setEmptyPreviewState('working', eventType === 'research_result' ? 'Researching' : 'Thinking');
        return;
      }
      if (eventType === 'plan_ready' || eventType === 'answering') {
        const text = payload.text || event.message || '';
        if (eventType === 'plan_ready' && payload.auto_plan_required) {
          finishAgentStep('plan', say('Plan pret, je passe a la realisation.', 'Plan ready, moving into the build.'), trustDetail('Le plan sert maintenant de garde-fou pour la generation.', 'The plan now acts as a guardrail for generation.'));
          setAssistantWorking('Building');
        } else {
          const target = commitAssistantText(text, eventType === 'plan_ready' ? 'Plan ready.' : 'Done.');
          if (eventType === 'plan_ready') {
            setMessageBlock(target, buildPlanBlock(String(text || ''), safePrompt, true));
          }
        }
        if (eventType === 'plan_ready' && !payload.auto_plan_required) {
          lastPlan = payload.text || event.message || '';
          addInlineAction(responseCard, 'Build this plan', () => void generateFromPrompt('Build this plan', 'build', true));
        }
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Ready for build');
        return;
      }
      if (eventType === 'clarification_required') {
        const target = commitAssistantText(payload.text || event.message, say('J’ai besoin d’un détail avant d’agir.', 'I need one detail before acting.'));
        if (!showClarificationActions(target, payload, safePrompt, requestedMode)) {
          showClarificationBlock(payload, safePrompt, requestedMode);
        }
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
        const target = commitAssistantText('External API keys are needed or can be skipped.');
        setMessageBlock(target, {
          type: 'confirmation',
          title: 'External API keys',
          body: speaksFrench
            ? 'Cette action peut utiliser des clés API externes. Tu peux les ajouter maintenant ou continuer avec des valeurs sûres provisoires.'
            : 'This action can use external API keys. You can add them now or continue with safe placeholders.',
          state: 'approval-requested',
          approveLabel: speaksFrench ? 'Ajouter les clés' : 'Add keys',
          rejectLabel: speaksFrench ? 'Continuer sans clés' : 'Continue without keys',
        });
        addInlineAction(target, speaksFrench ? 'Ajouter les clés' : 'Add keys', () => showApiKeyModal(payload.requirements || []));
        addInlineAction(target, speaksFrench ? 'Continuer sans clés' : 'Continue without keys', () => {
          void generateFromPrompt(safePrompt, requestedMode, useLastPlan, { ...extra, skipExternalKeys: true }, safeDisplayText);
        });
        showApiKeyModal(payload.requirements || []);
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Waiting for keys');
        return;
      }
      if (eventType === 'error_detected' || eventType === 'auto_fix_failed') {
        markAgentStep('fix', realLabel(say('Erreur detectee, correction en preparation.', 'Issue detected, preparing a fix.')), 'Fixing', trustDetail('Je tente de reparer avant de te montrer une preview cassee.', 'I am trying to fix it before showing you a broken preview.'));
        showFixBugBox(payload.errors || [{ message: event.message }]);
      }
      if (eventType === 'verification_started' && payload.text) {
        commitAssistantText(payload.text || event.message, say('Vérification terminée.', 'Verification complete.'));
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Ready when you are');
        return;
      }
      if (eventType === 'queued' || eventType === 'routing' || eventType === 'codebase_indexed' || eventType === 'task_decomposed' || eventType === 'policy_checked' || eventType === 'import_started' || eventType === 'import_analyzed' || eventType === 'model_started' || eventType === 'model_streaming' || eventType === 'build_started' || eventType === 'diff_ready' || eventType === 'files_changed' || eventType === 'building' || eventType === 'preview_skeleton_started' || eventType === 'preview_building' || eventType === 'runner_started' || eventType === 'runner_failed' || eventType === 'runner_passed' || eventType === 'visual_inspection_started' || eventType === 'visual_inspection_failed' || eventType === 'visual_inspection_passed' || eventType === 'quality_gate_started' || eventType === 'verification_started' || eventType === 'verification_failed' || eventType === 'quality_checked' || eventType === 'retest_started' || eventType === 'auto_fix_started' || eventType === 'patch_applied' || eventType === 'auto_fix_succeeded' || eventType === 'memory_updated') {
        const label = eventType === 'build_started' || eventType === 'building' || eventType === 'preview_skeleton_started' || eventType === 'preview_building'
          ? 'Building'
          : eventType === 'model_started' || eventType === 'model_streaming' || eventType === 'diff_ready' || eventType === 'files_changed'
            ? 'Building'
          : eventType === 'runner_started' || eventType === 'quality_gate_started' || eventType === 'verification_started' || eventType === 'visual_inspection_started'
            ? 'Running checks'
            : eventType === 'retest_started' || eventType === 'runner_failed' || eventType === 'runner_passed' || eventType === 'visual_inspection_failed' || eventType === 'visual_inspection_passed'
              ? 'Retesting'
              : eventType === 'auto_fix_started' || eventType === 'patch_applied' || eventType === 'auto_fix_succeeded'
                ? 'Fixing'
                : 'Thinking';
        if (eventType === 'queued' || eventType === 'routing') markAgentStep('prepare', visibleStepLabel(say('Espace de travail prepare.', 'Workspace prepared.')), label);
        if (eventType === 'codebase_indexed') markAgentStep('index', visibleStepLabel(say('Projet indexe.', 'Project indexed.')), 'Thinking', trustDetail('Je repere les routes, composants, APIs et fichiers critiques avant toute action.', 'I map routes, components, APIs, and critical files before any action.'));
        if (eventType === 'task_decomposed') markAgentStep('decompose', visibleStepLabel(say('Tache decomposee.', 'Task decomposed.')), 'Planning', trustDetail('Je transforme la demande en etapes produit et qualite pour eviter une sortie generique.', 'I turn the request into product and quality steps to avoid a generic output.'));
        if (eventType === 'policy_checked') finishAgentStep('guardrails', visibleStepLabel(say('Garde-fous valides.', 'Guardrails checked.')), trustDetail('Je garde les limites, rollback et verifications avant de livrer.', 'I keep scope limits, rollback, and checks in place before delivery.'));
        if (eventType === 'import_started') markAgentStep('import', visibleStepLabel(say('Source importee.', 'Import source prepared.')), 'Thinking', trustDetail('Je transforme la source en produit utilisable, pas en copie statique.', 'I am turning the source into a usable product, not a static copy.'));
        if (eventType === 'import_analyzed') finishAgentStep('import', visibleStepLabel(say('Import analyse.', 'Import analyzed.')), trustDetail('Les etats, interactions et responsive manquants seront completes.', 'Missing states, interactions, and responsive behavior will be completed.'));
        if (eventType === 'model_started') markAgentStep('model', visibleStepLabel(say('Generation des fichiers.', 'Generating files.')), label, trustDetail('Je cree une structure moderne avec composants, styles et interactions utiles.', 'I am creating a modern structure with useful components, styles, and interactions.'));
        if (eventType === 'model_streaming') markAgentStep('model', visibleStepLabel(say('Fichiers en cours de generation.', 'Files are being generated.')), label, trustDetail('Je recois les changements cote serveur sans afficher de donnees internes.', 'I am receiving server-side changes without showing internal data.'));
        if (eventType === 'build_started' || eventType === 'preview_building') markAgentStep('build', visibleStepLabel(say('Construction de la preview.', 'Building the preview.')), label, trustDetail('Je prepare la preview sans changer la version publiee.', 'I am preparing the preview without changing the published version.'));
        if (eventType === 'preview_skeleton_started') markAgentStep('preview', visibleStepLabel(say('Preview en preparation.', 'Preview is being prepared.')), label, trustDetail('L animation preview correspond au build en cours.', 'The preview animation matches the active build.'));
        if (eventType === 'diff_ready' || eventType === 'files_changed') markAgentStep('build', fileDiffLabel(), label, trustDetail('J integre les changements avant les checks.', 'I am merging changes before checks.'));
        if (eventType === 'runner_started' || eventType === 'quality_gate_started' || eventType === 'verification_started') markAgentStep('verify', visibleStepLabel(say('Verification technique.', 'Technical checks.')), label, trustDetail('Je verifie le build, la preview et les interactions essentielles.', 'I am checking the build, preview, and essential interactions.'));
        if (eventType === 'visual_inspection_started') markAgentStep('visual', visibleStepLabel(say('Inspection des interactions.', 'Interaction inspection.')), label, trustDetail('Je controle les boutons, formulaires, filtres, modals et etats visibles.', 'I am checking buttons, forms, filters, modals, and visible states.'));
        if (eventType === 'visual_inspection_failed') markAgentStep('visual', visibleStepLabel(say('Interaction a corriger.', 'Interaction issue found.')), 'Fixing', trustDetail('Je ne valide pas une interface avec des controles morts.', 'I do not approve an interface with dead controls.'));
        if (eventType === 'visual_inspection_passed') finishAgentStep('visual', visibleStepLabel(say('Interactions essentielles verifiees.', 'Essential interactions checked.')), trustDetail('Les controles principaux sont utilisables ou affichent un etat honnete.', 'Primary controls are usable or show an honest state.'));
        if (eventType === 'verification_failed') markAgentStep('fix', visibleStepLabel(say('Blocage detecte.', 'Blocker detected.')), 'Fixing', trustDetail('Je ne valide pas une app qui reste cassee.', 'I do not mark a still-broken app as ready.'));
        if (eventType === 'runner_passed') finishAgentStep('verify', runnerLabel(say('Verifications terminees.', 'Checks completed.')), trustDetail('Les checks critiques sont passes.', 'Critical checks passed.'));
        if (eventType === 'quality_checked') finishAgentStep('verify', visibleStepLabel(say('Qualite verifiee.', 'Quality checked.')), trustDetail('Je garde les warnings comme notes sans bloquer si l app fonctionne.', 'I keep warnings as notes without blocking when the app works.'));
        if (eventType === 'runner_failed') markAgentStep('fix', runnerLabel(say('Des verifications demandent une correction.', 'Checks need a fix.')), label, trustDetail('Je corrige les blocages concrets avant de finaliser.', 'I am fixing concrete blockers before finishing.'));
        if (eventType === 'auto_fix_started' || eventType === 'patch_applied') markAgentStep('fix', visibleStepLabel(say('Correction ciblee appliquee.', 'Targeted fix applied.')), label, trustDetail('Je touche seulement les fichiers utiles pour reduire le risque.', 'I am changing only useful files to reduce risk.'));
        if (eventType === 'retest_started') markAgentStep('retest', visibleStepLabel(say('Nouvelle verification apres correction.', 'Retesting after the fix.')), label, trustDetail('Je relance les checks pour confirmer que la correction tient.', 'I am rerunning checks to confirm the fix holds.'));
        if (eventType === 'auto_fix_succeeded') finishAgentStep('fix', visibleStepLabel(say('Correction terminee.', 'Fix completed.')), trustDetail('Le blocage detecte a ete resolu.', 'The detected blocker has been resolved.'));
        if (eventType === 'memory_updated') finishAgentStep('memory', visibleStepLabel(say('Memoire mise a jour.', 'Memory updated.')), trustDetail('Je garde les decisions utiles pour les prochaines iterations.', 'I keep useful decisions for future iterations.'));
        setAssistantWorking(label);
        const fileChangingEvent = eventType !== 'verification_started' || generationTouchesPreview;
        if (fileChangingEvent) promoteToPreviewWork(label);
        if (eventType === 'diff_ready' || eventType === 'files_changed') {
          showStreamCodeBlock('files_changed', {
            title: say('Fichiers mis a jour', 'Files updated'),
            subtitle: String(payload.diff?.summary || event.message || '').trim() || undefined,
            language: 'diff',
            code: diffPreviewSnippet(payload.diff),
            status: 'done',
          });
        }
        if (eventType === 'quality_checked') {
          const quality = payload.quality || {};
          const reliability = payload.reliability || {};
          showStreamCodeBlock('quality_checked', {
            title: say('Controle qualite', 'Quality gate'),
            subtitle: String((quality as any)?.status || (reliability as any)?.status || event.message || '').trim() || undefined,
            language: 'json',
            code: JSON.stringify({ quality, reliability }, null, 2),
            status: String((reliability as any)?.status || (quality as any)?.status || '').includes('fail') ? 'failed' : 'done',
            defaultOpen: false,
          });
        }
        if (eventType === 'patch_applied') {
          const targetFile = String(payload.patch?.target_file || payload.patch?.file || '').trim();
          showStreamCodeBlock(`patch_${targetFile || 'auto_fix'}`, {
            title: targetFile ? `${say('Correction', 'Patch')} - ${targetFile}` : say('Correction appliquee', 'Patch applied'),
            subtitle: String(payload.patch?.summary || event.message || '').trim() || undefined,
            language: 'diff',
            code: targetFile ? `~ ${targetFile}\n${String(payload.patch?.summary || event.message || 'Targeted patch applied.')}` : String(payload.patch?.summary || event.message || 'Targeted patch applied.'),
            status: 'done',
          });
        }
        if (generationTouchesPreview) setEmptyPreviewState('working', label);
        return;
      }
      if (eventType === 'preview_ready') {
        finishAgentStep('build', say('Preview prete.', 'Preview ready.'), trustDetail('La preview montre maintenant le resultat le plus recent.', 'The preview now shows the latest result.'));
        finishAgentStep('verify', say('Derniere verification terminee.', 'Final check completed.'), trustDetail('Les controles finaux sont termines avant le resume.', 'Final checks are complete before the summary.'));
        activateBuilderView('preview');
        renderFiles(payload.files || []);
        if (payload.preview?.html) setPreview(payload.preview.html, payload.preview.status);
        const previewSnippet = filePreviewSnippet(payload.files || [], [
          ...(Array.isArray(payload.diff?.created) ? payload.diff.created : []),
          ...(Array.isArray(payload.diff?.modified) ? payload.diff.modified : []),
        ]);
        if (previewSnippet) {
          showStreamCodeBlock(`preview_${previewSnippet.path}`, {
            title: `${say('Apercu du fichier', 'File preview')} - ${previewSnippet.path}`,
            subtitle: say('Extrait reel du resultat genere.', 'Real snippet from the generated result.'),
            language: previewSnippet.language,
            code: previewSnippet.code,
            status: 'done',
          });
        }
        const diff = payload.diff?.summary ? ` ${payload.diff.summary}.` : '';
        const finalText = speaksFrench
          ? `${event.message || 'C’est prêt. J’ai mis à jour la preview.'}${diff}`
          : `${event.message || 'Done. I updated the preview.'}${diff}`;
        const target = commitAssistantText(finalText, 'Preview ready.', say('Preview prête', 'Preview ready'));
        addInlineAction(target, speaksFrench ? 'Garder' : 'Keep', () => {
          void recordAgentFeedback('keep');
          appendMessage('system', speaksFrench ? 'Version gardee comme preview actuelle.' : 'Kept as the current preview.');
        });
        addInlineAction(target, speaksFrench ? 'Modifier' : 'Modify', () => {
          void recordAgentFeedback('modify');
          const promptInput = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
          promptInput?.focus();
          if (promptInput && !promptInput.value.trim()) promptInput.placeholder = workshopPlaceholderForFollowUp(speaksFrench);
        });
        addInlineAction(target, speaksFrench ? 'Regenerer' : 'Regenerate', () => {
          void recordAgentFeedback('regenerate');
          void generateFromPrompt(safePrompt, 'build', false, { regenerate: true }, safeDisplayText);
        });
        addInlineAction(target, 'Publish', () => {
          void recordAgentFeedback('publish');
          void openPublishPanel();
        });
        addInlineAction(target, speaksFrench ? 'Historique' : 'History', () => void openHistoryPanel());
        if (payload.errors?.length) showFixBugBox(payload.errors);
        return;
      }
      if (eventType === 'cancelled') {
        pushAgentActivity('cancelled', payload, event.message || 'Generation stopped.');
        commitAssistantText(event.message || 'Generation stopped.', 'Generation stopped.', say('Arrêté', 'Stopped'));
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Generation stopped');
        setBusy(false);
        return;
      }
      if (eventType === 'done') {
        if (!assistantHasFinalContent) {
          commitAssistantText(event.message || (generationTouchesPreview ? 'Done. Preview is ready.' : 'Done.'), 'Done.', say('Terminé', 'Completed'));
        } else {
          clearMessageShimmer(status);
        }
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Ready when you are');
        setBusy(false);
      }
      if (eventType === 'error') {
        pushAgentActivity('error', payload, event.message);
        commitAssistantText(formatAgentErrorMessage(event), 'Generation failed.', say('Erreur', 'Error'));
        if (generationTouchesPreview) setEmptyPreviewState('idle', 'Ready when you are');
      }
    }, activeAbort.signal);
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      const stoppedText = stopRequested ? 'Generation stopped.' : 'Build cancelled.';
      const id = messageHandleId(status);
      if (id && conversationApi?.setTrace && id !== activeAgentActivityMessageId) {
        conversationApi.setTrace(id, buildWorkingTrace(status, stoppedText, 'cancelled'));
      }
      if (agentActivityState) {
        agentActivityState = reduceAgentStreamEvent(agentActivityState, {
          type: 'cancelled',
          message: stoppedText,
          elapsed: elapsedForStatus(),
        });
        setAgentActivityBlock(status, agentActivityState);
      }
      clearMessageShimmer(status);
      appendMessage('assistant', stoppedText);
      if (generationTouchesPreview) setEmptyPreviewState('idle', stopRequested ? 'Generation stopped' : 'Build cancelled');
    } else {
      const errorText = error instanceof Error ? error.message : 'Generation failed.';
      const id = messageHandleId(status);
      if (id && conversationApi?.setTrace && id !== activeAgentActivityMessageId) {
        conversationApi.setTrace(id, buildWorkingTrace(status, say('Erreur', 'Error'), 'failed'));
      }
      if (agentActivityState) {
        agentActivityState = reduceAgentStreamEvent(agentActivityState, {
          type: 'error',
          message: errorText,
          elapsed: elapsedForStatus(),
        });
        setAgentActivityBlock(status, agentActivityState);
      }
      clearMessageShimmer(status);
      appendMessage('assistant', errorText);
      if (generationTouchesPreview) setEmptyPreviewState('idle', 'Ready when you are');
    }
  } finally {
    if (agentActivityFrame) window.cancelAnimationFrame(agentActivityFrame);
    setBusy(false);
    activeAbort = null;
    stopRequested = false;
    activeGenerationTouchesPreview = false;
    activeAgentActivityMessageId = '';
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
  if (activeGenerationTouchesPreview) setEmptyPreviewState('idle', 'Generation stopped');
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
  const isFrench = isLikelyFrenchText(`${originalPrompt} ${question}`);
  const choices: string[] = Array.isArray(payload.choices)
    ? payload.choices.filter((choice: unknown): choice is string => typeof choice === 'string' && choice.trim().length > 0).slice(0, 4)
    : [];
  const recommendation = payload.recommendation || choices[0] || '';
  const eyebrow = isFrench ? 'Un detail utile' : 'One useful detail';
  const placeholder = isFrench ? 'Ajoute la precision qui manque...' : 'Add the missing detail...';
  const recommendLabel = isFrench ? 'Utiliser la suggestion' : 'Use suggestion';
  const continueLabel = isFrench ? 'Envoyer la precision' : 'Send detail';
  host.innerHTML = `
    <div id="clarification-block" style="border:1px solid var(--border-focus, var(--border));background:var(--bg-surface);border-radius:13px;padding:12px;color:var(--text);box-shadow:0 18px 50px rgba(0,0,0,.16);">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px;">
        <div>
          <div style="font-size:11px;color:var(--text-muted);font-weight:800;margin-bottom:4px;">${escapeHtml(eyebrow)}</div>
          <div style="font-size:13px;line-height:1.45;font-weight:650;">${escapeHtml(question)}</div>
        </div>
        <button type="button" data-action="dismiss" aria-label="Dismiss" style="border:0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:18px;line-height:1;">&times;</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;">
        ${choices.map(choice => `<button type="button" data-choice="${escapeHtml(choice)}" style="border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:999px;padding:6px 9px;font-size:11px;font-weight:700;cursor:pointer;">${escapeHtml(choice)}</button>`).join('')}
      </div>
      <textarea data-free-answer placeholder="${escapeHtml(placeholder)}" style="width:100%;min-height:42px;max-height:90px;resize:vertical;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:9px;padding:9px;font-size:12px;line-height:1.4;outline:none;"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:9px;">
        ${recommendation ? `<button type="button" data-action="recommend" style="height:30px;border:1px solid var(--border);background:transparent;color:var(--text);border-radius:8px;padding:0 10px;font-size:11px;font-weight:750;cursor:pointer;">${escapeHtml(recommendLabel)}</button>` : ''}
        <button type="button" data-action="continue" style="height:30px;border:0;background:var(--text);color:var(--bg);border-radius:8px;padding:0 12px;font-size:11px;font-weight:850;cursor:pointer;">${escapeHtml(continueLabel)}</button>
      </div>
    </div>
  `;

  host.querySelectorAll('[data-choice]').forEach(button => {
    button.addEventListener('click', async () => {
      const selectedAnswer = (button as HTMLElement).dataset.choice || '';
      await resumeFromClarification(selectedAnswer, originalPrompt, requestedMode);
    });
  });
  host.querySelector('[data-action="dismiss"]')?.addEventListener('click', clearInlineBlocks);
  host.querySelector('[data-action="recommend"]')?.addEventListener('click', async () => {
    await resumeFromClarification(recommendation || choices[0] || 'Use the recommended product structure.', originalPrompt, requestedMode);
  });
  host.querySelector('[data-action="continue"]')?.addEventListener('click', async () => {
    const freeAnswer = (host.querySelector('[data-free-answer]') as HTMLTextAreaElement | null)?.value.trim() || '';
    await resumeFromClarification(freeAnswer || recommendation, originalPrompt, requestedMode);
  });
}

function showClarificationActions(card: HTMLElement | null, payload: any, originalPrompt: string, requestedMode: ChatMode) {
  if (!card) return false;
  clearInlineBlocks();
  const choices: string[] = Array.isArray(payload.choices)
    ? payload.choices.filter((choice: unknown): choice is string => typeof choice === 'string' && choice.trim().length > 0).slice(0, 4)
    : [];
  const recommendation = typeof payload.recommendation === 'string' ? payload.recommendation.trim() : '';
  const actions = choices.length ? choices : (recommendation ? [recommendation] : []);
  if (!actions.length) return false;

  actions.forEach(choice => {
    addInlineAction(card, choice, () => {
      void resumeFromClarification(choice, originalPrompt, requestedMode);
    });
  });

  return true;
}

async function resumeFromClarification(answer: string, originalPrompt: string, requestedMode: ChatMode) {
  const safeAnswer = redactSecrets(answer).trim();
  const safeOriginalPrompt = redactSecrets(originalPrompt).trim();
  if (!safeAnswer) return;
  clearInlineBlocks();
  const response = await apiFetch<{ prompt: string; requestedMode?: ChatMode }>(`/api/projects/${encodeURIComponent(currentProjectId)}/agent/answer`, {
    method: 'POST',
    body: JSON.stringify({ answer: safeAnswer, originalPrompt: safeOriginalPrompt, requestedMode, recommendation: safeAnswer }),
  });
  await generateFromPrompt(response.prompt || `${safeOriginalPrompt}\n\nClarification answer: ${safeAnswer}`, response.requestedMode || requestedMode, false, {}, safeAnswer);
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
    void generateFromPrompt(value, mode, false, { studioContext: studioPromptContextPayload() });
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
  refreshWorkshopInputContext();
}

function initStudioWorkshops() {
  loadActiveWorkshop();
  const chatTab = document.getElementById('btn-sidebar-chat');
  const studioTab = document.getElementById('btn-sidebar-studio');
  const studioWrapper = document.getElementById('pane-studio-wrapper');
  const studioMenu = document.getElementById('pane-studio-menu');

  chatTab?.addEventListener('click', () => {
    setActiveWorkshop('chat', { focusInput: true });
  });

  studioTab?.addEventListener('click', () => {
    refreshWorkshopInputContext();
  });

  studioMenu?.addEventListener('click', (event) => {
    const option = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-studio-panel]') : null;
    if (!option) return;
    const workshop = normalizeWorkshop(option.dataset.studioPanel);
    if (WORKSHOP_CONFIG[workshop]?.disabled) return;
    setActiveWorkshop(workshop, { focusInput: true });
    studioWrapper?.classList.remove('open');
    studioTab?.setAttribute('aria-expanded', 'false');
  });

  refreshWorkshopInputContext();
  syncWorkshopPreview();
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

function maybeStartInitialGeneration() {
  if (initialGenerationStarted || isGenerating) return;
  const handoff = getInitialBuilderHandoff();
  if (!handoff.shouldAutoRun) return;
  const prompt = handoff.prompt.trim();
  if (!prompt) return;
  initialGenerationStarted = true;

  const input = document.getElementById('chat-textarea-box') as HTMLTextAreaElement | null;
  if (input && input.value.trim() === prompt) {
    input.value = '';
    input.style.height = '48px';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  scheduleWorkspaceSave({ draft_prompt: '', selected_mode: handoff.mode }, true);
  void generateFromPrompt(prompt, handoff.mode, false, {
    importContext: handoff.importContext,
    createFlowSource: handoff.source || new URLSearchParams(window.location.search).get('source') || 'builder',
    initialRun: true,
  });
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

type MobileBuilderView = 'chat' | 'preview' | 'code' | 'design' | 'more';

function setMobileBuilderView(view: MobileBuilderView) {
  const body = document.querySelector('.workspace-body') as HTMLElement | null;
  if (!body) return;
  body.dataset.mobileView = view;
  document.querySelectorAll<HTMLButtonElement>('[data-mobile-builder-view]').forEach(button => {
    const active = button.dataset.mobileBuilderView === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  if (view === 'preview') {
    closeProjectMenu();
    activateBuilderView('preview');
    return;
  }
  if (view === 'code') {
    closeProjectMenu();
    activateBuilderView('code');
    return;
  }
  if (view === 'design') {
    closeProjectMenu();
    setActiveWorkshop('design', { focusInput: true });
    return;
  }
  if (view === 'more') {
    openProjectMenu();
    return;
  }
  closeProjectMenu();
  setActiveWorkshop('chat', { focusInput: true });
}

function bindMobileBuilderShell() {
  const body = document.querySelector('.workspace-body') as HTMLElement | null;
  if (body && !body.dataset.mobileView) body.dataset.mobileView = 'chat';
  document.querySelectorAll<HTMLButtonElement>('[data-mobile-builder-view]').forEach(button => {
    if (button.dataset.huggyMobileBuilderBound === 'true') return;
    button.dataset.huggyMobileBuilderBound = 'true';
    button.addEventListener('click', event => {
      event.preventDefault();
      setMobileBuilderView((button.dataset.mobileBuilderView || 'chat') as MobileBuilderView);
    });
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
  bindMobileBuilderShell();
  initStudioWorkshops();
  initPromptInputActions({
    persistForBuilder: false,
    onFiles: uploadPromptAttachments,
    onNotice: (message, kind) => appendMessage(kind === 'error' ? 'system' : 'system', message),
  });
  normalizeAiChatInputs();
  bindChat();
  hydrateDashboardPrompt();
  void loadProject().then(() => maybeStartInitialGeneration());
}

window.addEventListener('huggy:auth-ready', init);
if (document.documentElement.dataset.authReady === 'true') init();
