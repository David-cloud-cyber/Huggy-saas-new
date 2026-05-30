let motionInstalled = false;

export function initHuggyMotion(root: ParentNode = document) {
  if (!motionInstalled && typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.id = 'huggy-motion-style';
    style.textContent = `
      :root {
        --motion-fast: 120ms;
        --motion-normal: 180ms;
        --motion-panel: 260ms;
        --ease-huggy: cubic-bezier(0.22, 1, 0.36, 1);
      }

      .huggy-motion-ready .settings-overlay {
        transition: opacity var(--motion-panel) var(--ease-huggy), visibility var(--motion-panel) var(--ease-huggy);
      }

      .huggy-motion-ready .settings-panel {
        transition: transform var(--motion-panel) var(--ease-huggy);
        will-change: transform;
      }

      .huggy-motion-ready .project-menu-panel,
      .huggy-motion-ready .huggy-model-dropdown,
      .huggy-motion-ready .model-provider-panel,
      .huggy-motion-ready .dropdown,
      .huggy-motion-ready .prompt-mode-menu,
      .huggy-motion-ready #chat-mode-menu,
      .huggy-motion-ready #huggy-live-modal > div {
        transition: opacity var(--motion-normal) var(--ease-huggy), transform var(--motion-normal) var(--ease-huggy);
      }

      .huggy-motion-ready .toast,
      .huggy-motion-ready .attachment-chip,
      .huggy-motion-ready .prompt-attachment-chip,
      .huggy-motion-ready .analysis-metric-card,
      .huggy-motion-ready .analysis-chart-card,
      .huggy-motion-ready .usage-row,
      .huggy-motion-ready .model-rate-row {
        animation: huggy-soft-enter var(--motion-panel) var(--ease-huggy) both;
      }

      .huggy-motion-ready .project-card,
      .huggy-motion-ready .pricing-card,
      .huggy-motion-ready .template-card,
      .huggy-motion-ready .model-rate-row,
      .huggy-motion-ready .usage-row {
        transition:
          transform var(--motion-normal) var(--ease-huggy),
          border-color var(--motion-fast) var(--ease-huggy),
          box-shadow var(--motion-normal) var(--ease-huggy),
          background-color var(--motion-fast) var(--ease-huggy);
      }

      .huggy-motion-ready .project-card:hover,
      .huggy-motion-ready .pricing-card:hover,
      .huggy-motion-ready .template-card:hover {
        transform: translateY(-1px);
      }

      .huggy-motion-ready button,
      .huggy-motion-ready .icon-btn,
      .huggy-motion-ready .submit-btn,
      .huggy-motion-ready .model-select,
      .huggy-motion-ready .prompt-mode-btn {
        transition:
          transform var(--motion-fast) var(--ease-huggy),
          border-color var(--motion-fast) var(--ease-huggy),
          background-color var(--motion-fast) var(--ease-huggy),
          color var(--motion-fast) var(--ease-huggy),
          box-shadow var(--motion-fast) var(--ease-huggy),
          opacity var(--motion-fast) var(--ease-huggy);
      }

      .huggy-motion-ready button:hover:not(:disabled),
      .huggy-motion-ready .icon-btn:hover,
      .huggy-motion-ready .submit-btn:hover,
      .huggy-motion-ready .model-select:hover,
      .huggy-motion-ready .prompt-mode-btn:hover {
        transform: translateY(-1px);
      }

      .huggy-motion-ready button:active:not(:disabled),
      .huggy-motion-ready .icon-btn:active,
      .huggy-motion-ready .submit-btn:active,
      .huggy-motion-ready .model-select:active,
      .huggy-motion-ready .prompt-mode-btn:active {
        transform: scale(0.98);
      }

      .huggy-motion-ready .huggy-ai-input {
        transition:
          transform var(--motion-normal) var(--ease-huggy),
          border-color var(--motion-fast) var(--ease-huggy),
          box-shadow var(--motion-normal) var(--ease-huggy),
          background-color var(--motion-fast) var(--ease-huggy);
      }

      .huggy-motion-ready .huggy-ai-input:focus-within {
        transform: translateY(-1px);
      }

      .huggy-motion-ready .analysis-skeleton,
      .huggy-motion-ready .skeleton {
        background-size: 260% 100%;
        animation: huggy-shimmer 1.4s var(--ease-huggy) infinite;
      }

      @keyframes huggy-soft-enter {
        from { opacity: 0; transform: translateY(6px) scale(0.99); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes huggy-shimmer {
        0% { background-position: 100% 0; }
        100% { background-position: -100% 0; }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
        }

        .huggy-motion-ready .project-card:hover,
        .huggy-motion-ready .pricing-card:hover,
        .huggy-motion-ready .template-card:hover,
        .huggy-motion-ready .huggy-ai-input:focus-within,
        .huggy-motion-ready button:hover:not(:disabled),
        .huggy-motion-ready .icon-btn:hover,
        .huggy-motion-ready .submit-btn:hover,
        .huggy-motion-ready .model-select:hover,
        .huggy-motion-ready .prompt-mode-btn:hover {
          transform: none !important;
        }
      }
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add('huggy-motion-ready');
    motionInstalled = true;
  }

  if (root instanceof Document) {
    document.documentElement.classList.add('huggy-motion-ready');
  }
}
