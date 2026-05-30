import {
  MODEL_REGISTRY,
  PROVIDER_META,
  getModelsByProvider,
  normalizeModelSelectionId,
  type ModelProvider,
} from './config/ai-models';

type SelectorOptions = {
  selector?: string;
  storageKey?: string;
};

const DEFAULT_SELECTOR = '.input-wrapper .model-select';
const DEFAULT_STORAGE_KEY = 'huggy-selected-model';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function injectProviderSelectorStyle() {
  if (document.getElementById('huggy-provider-model-selector-style')) return;
  const style = document.createElement('style');
  style.id = 'huggy-provider-model-selector-style';
  style.textContent = `
    .huggy-provider-model-select {
      position: relative;
      min-height: 28px;
      max-width: min(176px, 40vw);
      padding: 0 8px;
      isolation: isolate;
    }
    .huggy-provider-model-select .provider-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 2px rgba(9,9,11,.08);
      flex: 0 0 auto;
    }
    .huggy-provider-model-select .current-model-label,
    .huggy-provider-model-select #current-model-label {
      min-width: 0;
      max-width: 104px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 650;
    }
    .huggy-provider-model-select .provider-chevron {
      width: 11px;
      height: 11px;
      flex: 0 0 auto;
      transition: transform 180ms cubic-bezier(0.22,1,0.36,1);
    }
    .huggy-provider-model-select[aria-expanded="true"] .provider-chevron {
      transform: rotate(180deg);
    }
    .huggy-provider-model-menu {
      width: 224px;
      overflow: visible;
      display: grid;
      gap: 4px;
    }
    .huggy-provider-model-menu.open {
      overflow: visible;
    }
    .huggy-provider-list {
      display: grid;
      gap: 4px;
    }
    .huggy-auto-model-option,
    .huggy-provider-card {
      width: 100%;
      border: 1px solid var(--border);
      background: var(--bg-input);
      color: var(--text);
      border-radius: 8px;
      min-height: 30px;
      padding: 5px 6px;
      display: flex;
      align-items: center;
      gap: 6px;
      text-align: left;
      cursor: pointer;
      transition:
        background 160ms cubic-bezier(0.22,1,0.36,1),
        border-color 160ms cubic-bezier(0.22,1,0.36,1),
        transform 160ms cubic-bezier(0.22,1,0.36,1);
    }
    .huggy-auto-model-option:hover,
    .huggy-auto-model-option.active,
    .huggy-provider-card:hover,
    .huggy-provider-card.active {
      background: var(--accent-hover, rgba(9,9,11,.08));
      border-color: var(--border-focus, var(--border));
    }
    .huggy-provider-card.open {
      background: var(--accent-hover, rgba(9,9,11,.10));
      border-color: var(--border-focus, var(--border));
      transform: translateX(2px);
    }
    .provider-icon {
      width: 18px;
      height: 18px;
      border-radius: 5px;
      color: var(--provider-text);
      background: var(--provider-color);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 850;
      line-height: 1;
      flex: 0 0 auto;
    }
    .provider-card-main {
      min-width: 0;
      display: grid;
      gap: 1px;
      flex: 1 1 auto;
    }
    .provider-name-row {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
    }
    .provider-name {
      color: var(--text);
      font-size: 11px;
      font-weight: 720;
    }
    .provider-selected-label,
    .provider-count {
      color: var(--text-muted);
      font-size: 9px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .provider-expand-btn {
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
      transition:
        background 160ms cubic-bezier(0.22,1,0.36,1),
        color 160ms cubic-bezier(0.22,1,0.36,1),
        transform 220ms cubic-bezier(0.34,1.56,0.64,1);
    }
    .provider-expand-btn:hover,
    .provider-expand-btn.open {
      background: var(--bg-elevated, var(--bg-input));
      color: var(--text);
    }
    .provider-expand-btn.open {
      transform: rotate(90deg);
    }
    .huggy-model-list-panel {
      position: absolute;
      left: calc(100% + 6px);
      top: 0;
      width: 236px;
      max-height: min(320px, 66vh);
      border: 1px solid var(--border);
      background: var(--bg-elevated, var(--bg-surface));
      color: var(--text);
      border-radius: 12px;
      box-shadow: 0 14px 36px rgba(0,0,0,.16), 0 3px 10px rgba(0,0,0,.08);
      opacity: 0;
      transform: translateX(-8px) scale(.97);
      pointer-events: none;
      overflow: hidden;
      z-index: 5200;
      transition:
        opacity 180ms cubic-bezier(0,0,0.2,1),
        transform 260ms cubic-bezier(0.34,1.56,0.64,1);
    }
    .huggy-model-list-panel.visible {
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
    .huggy-model-item {
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
      animation: huggy-model-enter 220ms cubic-bezier(0.34,1.56,0.64,1) both;
      transition:
        background 150ms cubic-bezier(0.22,1,0.36,1),
        transform 150ms cubic-bezier(0.34,1.56,0.64,1);
    }
    .huggy-model-item:hover {
      background: var(--accent-dim, rgba(9,9,11,.08));
      transform: translateX(2px);
    }
    .huggy-model-item.selected {
      background: var(--accent-hover, rgba(9,9,11,.10));
    }
    .huggy-model-item.selected::before {
      content: "";
      position: absolute;
      left: 0;
      top: 22%;
      bottom: 22%;
      width: 3px;
      border-radius: 0 999px 999px 0;
      background: var(--accent);
    }
    .model-item-name {
      font-size: 11px;
      font-weight: 720;
      color: var(--text);
      line-height: 1.25;
    }
    .model-item-meta {
      font-size: 9px;
      color: var(--text-muted);
      line-height: 1.35;
    }
    .model-item-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
    }
    .huggy-model-badge {
      border-radius: 999px;
      padding: 1px 5px;
      font-size: 8px;
      font-weight: 850;
      letter-spacing: .05em;
      text-transform: uppercase;
      line-height: 1;
      background: var(--bg-input);
      color: var(--text-muted);
      border: 1px solid var(--border);
    }
    .huggy-model-badge.new { color: #166534; background: #dcfce7; border-color: #bbf7d0; }
    .huggy-model-badge.fast { color: #854d0e; background: #fef9c3; border-color: #fde68a; }
    .huggy-model-badge.premium { color: #6b21a8; background: #f3e8ff; border-color: #e9d5ff; }
    @keyframes huggy-model-enter {
      from { opacity: 0; transform: translateX(-8px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @media (max-width: 767px) {
      .huggy-provider-model-menu {
        left: 12px !important;
        right: 12px !important;
        bottom: 12px !important;
        top: auto !important;
        width: auto !important;
        max-width: none !important;
      }
      .huggy-model-list-panel {
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
      .huggy-model-list-panel.visible {
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
}

function providerInitial(provider: ModelProvider) {
  return PROVIDER_META[provider].label.slice(0, 1).toUpperCase();
}

function modelLabel(modelId: string) {
  if (modelId === 'auto') return 'Auto';
  return MODEL_REGISTRY.find(model => model.id === modelId)?.label || 'Auto';
}

function modelProvider(modelId: string): ModelProvider | null {
  return MODEL_REGISTRY.find(model => model.id === modelId)?.provider || null;
}

function updateAllSelectors(selectedId: string, storageKey: string) {
  const normalized = normalizeModelSelectionId(selectedId);
  localStorage.setItem(storageKey, normalized);
  document.querySelectorAll<HTMLElement>('.huggy-provider-model-select').forEach(root => {
    const label = root.querySelector<HTMLElement>('.current-model-label, #current-model-label');
    const dot = root.querySelector<HTMLElement>('.provider-dot');
    const selectedProvider = normalized === 'auto' ? null : modelProvider(normalized);
    if (label) label.textContent = modelLabel(normalized);
    if (dot) dot.style.background = selectedProvider ? PROVIDER_META[selectedProvider].color : 'var(--accent)';
    root.querySelectorAll<HTMLElement>('[data-model-id]').forEach(item => {
      item.classList.toggle('active', item.dataset.modelId === normalized);
      item.classList.toggle('selected', item.dataset.modelId === normalized);
    });
    root.querySelectorAll<HTMLElement>('[data-provider]').forEach(card => {
      const provider = card.dataset.provider as ModelProvider;
      card.classList.toggle('active', selectedProvider === provider);
      const selectedLabel = card.querySelector<HTMLElement>('.provider-selected-label');
      if (selectedLabel) {
        selectedLabel.textContent = selectedProvider === provider ? modelLabel(normalized) : `${getModelsByProvider()[provider].length} models`;
      }
    });
  });
  window.dispatchEvent(new CustomEvent('huggy:model-selected', { detail: { modelId: normalized } }));
  window.dispatchEvent(new CustomEvent('huggy:legacy-model-selected', { detail: { modelId: normalized } }));
}

function renderModelPanel(provider: ModelProvider, selectedId: string) {
  const models = getModelsByProvider()[provider] || [];
  const meta = PROVIDER_META[provider];
  return `
    <div class="huggy-model-list-header">
      <span class="huggy-model-list-title">${escapeHtml(meta.label)}</span>
      <span class="huggy-model-list-count">${models.length} models</span>
    </div>
    <div class="huggy-model-list-scroll">
      ${models.map((model, index) => `
        <button type="button" class="huggy-model-item${selectedId === model.id ? ' selected' : ''}" data-model-id="${escapeHtml(model.id)}" data-model-name="${escapeHtml(model.label)}" style="animation-delay:${index * 25}ms">
          <span class="model-item-name">${escapeHtml(model.label)}</span>
          <span class="model-item-meta">${escapeHtml(model.tier)} · ${Math.round(model.contextWindow / 1000)}K ctx</span>
          <span class="model-item-badges">
            <span class="huggy-model-badge">${escapeHtml(model.tier)}</span>
            ${model.isNew ? '<span class="huggy-model-badge new">New</span>' : ''}
            ${model.isFast ? '<span class="huggy-model-badge fast">Fast</span>' : ''}
            ${model.isPremium ? '<span class="huggy-model-badge premium">Premium</span>' : ''}
            ${model.minPlan !== 'free' ? `<span class="huggy-model-badge">Upgrade</span>` : ''}
          </span>
        </button>
      `).join('')}
    </div>
  `;
}

export function initProviderModelSelectors(options: SelectorOptions = {}) {
  injectProviderSelectorStyle();
  const selector = options.selector || DEFAULT_SELECTOR;
  const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
  const groups = getModelsByProvider();
  const providers = Object.keys(groups) as ModelProvider[];

  document.querySelectorAll<HTMLElement>(selector).forEach(oldRoot => {
    if (oldRoot.dataset.providerModelEnhanced === 'true') return;
    const id = oldRoot.id;
    const selectedId = normalizeModelSelectionId(localStorage.getItem(storageKey) || 'auto');
    const selectedProvider = selectedId === 'auto' ? null : modelProvider(selectedId);
    const root = document.createElement('div');
    if (id) root.id = id;
    root.className = `${oldRoot.className} huggy-provider-model-select`;
    root.dataset.providerModelEnhanced = 'true';
    root.setAttribute('role', 'button');
    root.setAttribute('tabindex', '0');
    root.setAttribute('aria-haspopup', 'listbox');
    root.setAttribute('aria-expanded', 'false');
    root.innerHTML = `
      <span class="model-label-prefix">Model</span>
      <span class="provider-dot" style="background:${selectedProvider ? PROVIDER_META[selectedProvider].color : 'var(--accent)'}"></span>
      <span class="${id ? '' : 'current-model-label'}" ${id ? 'id="current-model-label"' : ''}>${escapeHtml(modelLabel(selectedId))}</span>
      <svg class="provider-chevron" id="${id ? 'chevron-icon' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      <div class="dropdown huggy-provider-model-menu" id="${id ? 'model-dropdown' : ''}">
        <div class="dropdown-header">Models</div>
        <button type="button" class="huggy-auto-model-option${selectedId === 'auto' ? ' active' : ''}" data-model-id="auto" data-model-name="Auto">
          <span class="provider-icon" style="--provider-color:var(--accent);--provider-text:var(--bg);">A</span>
          <span class="provider-card-main">
            <span class="provider-name">Auto</span>
            <span class="provider-count">Best fit</span>
          </span>
        </button>
        <div class="huggy-provider-list">
          ${providers.map(provider => {
            const meta = PROVIDER_META[provider];
            const isActive = selectedProvider === provider;
            return `
              <div class="huggy-provider-card${isActive ? ' active' : ''}" data-provider="${provider}" style="--provider-color:${meta.color};--provider-text:${meta.textColor};">
                <span class="provider-icon">${providerInitial(provider)}</span>
                <span class="provider-card-main">
                  <span class="provider-name-row">
                    <span class="provider-name">${escapeHtml(meta.label)}</span>
                  </span>
                  <span class="provider-selected-label">${escapeHtml(isActive ? modelLabel(selectedId) : `${groups[provider].length} models`)}</span>
                </span>
                <button class="provider-expand-btn" type="button" aria-label="Open ${escapeHtml(meta.label)} models" data-provider-arrow="${provider}">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              </div>
            `;
          }).join('')}
        </div>
        <div class="huggy-model-list-panel" role="listbox" aria-label="Provider models"></div>
      </div>
    `;

    oldRoot.replaceWith(root);

    const menu = root.querySelector<HTMLElement>('.huggy-provider-model-menu');
    const panel = root.querySelector<HTMLElement>('.huggy-model-list-panel');
    let activeProvider: ModelProvider | null = null;

    const closePanel = () => {
      activeProvider = null;
      panel?.classList.remove('visible');
      root.querySelectorAll('.provider-expand-btn.open, .huggy-provider-card.open').forEach(item => item.classList.remove('open'));
    };
    const closeMenu = () => {
      menu?.classList.remove('open');
      root.setAttribute('aria-expanded', 'false');
      closePanel();
    };
    const openMenu = () => {
      menu?.classList.add('open');
      root.setAttribute('aria-expanded', 'true');
    };
    const toggleProvider = (provider: ModelProvider) => {
      if (!panel) return;
      if (activeProvider === provider) {
        closePanel();
        return;
      }
      activeProvider = provider;
      root.querySelectorAll('.provider-expand-btn.open, .huggy-provider-card.open').forEach(item => item.classList.remove('open'));
      root.querySelector<HTMLElement>(`[data-provider="${provider}"]`)?.classList.add('open');
      root.querySelector<HTMLElement>(`[data-provider-arrow="${provider}"]`)?.classList.add('open');
      panel.innerHTML = renderModelPanel(provider, normalizeModelSelectionId(localStorage.getItem(storageKey) || selectedId));
      panel.classList.add('visible');
    };

    root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-provider-arrow]')) {
        event.preventDefault();
        event.stopPropagation();
        openMenu();
        toggleProvider(target.closest<HTMLElement>('[data-provider-arrow]')?.dataset.providerArrow as ModelProvider);
        return;
      }
      const modelTarget = target.closest<HTMLElement>('[data-model-id]');
      if (modelTarget) {
        event.preventDefault();
        event.stopPropagation();
        updateAllSelectors(modelTarget.dataset.modelId || 'auto', storageKey);
        closeMenu();
        return;
      }
      if (target.closest('.huggy-model-list-panel, .huggy-provider-model-menu')) {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (menu?.classList.contains('open')) closeMenu();
      else openMenu();
    });

    root.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (menu?.classList.contains('open')) closeMenu();
        else openMenu();
      }
      if (event.key === 'Escape') closeMenu();
    });

    document.addEventListener('click', event => {
      if (!root.contains(event.target as Node)) closeMenu();
    });
  });

  updateAllSelectors(normalizeModelSelectionId(localStorage.getItem(storageKey) || 'auto'), storageKey);
}
