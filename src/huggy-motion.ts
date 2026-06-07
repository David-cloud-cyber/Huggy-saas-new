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
        --motion-page: 360ms;
        --ease-huggy: cubic-bezier(0.22, 1, 0.36, 1);
        --ease-huggy-enter: cubic-bezier(0.16, 1, 0.3, 1);
      }

      .huggy-motion-ready body {
        text-rendering: optimizeLegibility;
      }

      .huggy-motion-ready .app-layout,
      .huggy-motion-ready .dashboard-shell,
      .huggy-motion-ready .hero-content,
      .huggy-motion-ready .page-hero,
      .huggy-motion-ready .auth-card {
        animation: huggy-page-enter var(--motion-page) var(--ease-huggy-enter) both;
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
        transition:
          opacity var(--motion-normal) var(--ease-huggy),
          visibility var(--motion-normal) var(--ease-huggy),
          transform var(--motion-normal) var(--ease-huggy),
          border-color var(--motion-fast) var(--ease-huggy),
          box-shadow var(--motion-normal) var(--ease-huggy);
        transform-origin: top center;
      }

      .huggy-motion-ready .toast,
      .huggy-motion-ready .attachment-chip,
      .huggy-motion-ready .prompt-attachment-chip,
      .huggy-motion-ready .analysis-metric-card,
      .huggy-motion-ready .analysis-chart-card,
      .huggy-motion-ready .usage-row,
      .huggy-motion-ready .model-rate-row,
      .huggy-motion-ready .message-row,
      .huggy-motion-ready .huggy-workline-note,
      .huggy-motion-ready .huggy-workline-file,
      .huggy-motion-ready .huggy-workline-command {
        animation: huggy-soft-enter var(--motion-panel) var(--ease-huggy) both;
      }

      .huggy-motion-ready .project-card,
      .huggy-motion-ready .pricing-card,
      .huggy-motion-ready .template-card,
      .huggy-motion-ready .feature-card,
      .huggy-motion-ready .testimonial-card,
      .huggy-motion-ready .create-section,
      .huggy-motion-ready .activity-list,
      .huggy-motion-ready .settings-card,
      .huggy-motion-ready .main-panel,
      .huggy-motion-ready .preview-panel,
      .huggy-motion-ready .preview-frame-wrapper,
      .huggy-motion-ready .preview-empty,
      .huggy-motion-ready .preview-toolbar,
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
      .huggy-motion-ready .template-card:hover,
      .huggy-motion-ready .feature-card:hover,
      .huggy-motion-ready .testimonial-card:hover,
      .huggy-motion-ready .settings-card:hover {
        transform: translateY(-1px);
      }

      .huggy-motion-ready button,
      .huggy-motion-ready .icon-btn,
      .huggy-motion-ready .submit-btn,
      .huggy-motion-ready .model-select,
      .huggy-motion-ready .prompt-mode-btn,
      .huggy-motion-ready .tab-btn,
      .huggy-motion-ready .sub-tab,
      .huggy-motion-ready .btn-upgrade,
      .huggy-motion-ready .btn-deploy,
      .huggy-motion-ready .project-menu-trigger,
      .huggy-motion-ready .preview-device-btn {
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
      .huggy-motion-ready .prompt-mode-btn:hover,
      .huggy-motion-ready .tab-btn:hover,
      .huggy-motion-ready .sub-tab:hover,
      .huggy-motion-ready .btn-upgrade:hover,
      .huggy-motion-ready .btn-deploy:hover,
      .huggy-motion-ready .project-menu-trigger:hover,
      .huggy-motion-ready .preview-device-btn:hover {
        transform: translateY(-1px);
      }

      .huggy-motion-ready button:active:not(:disabled),
      .huggy-motion-ready .icon-btn:active,
      .huggy-motion-ready .submit-btn:active,
      .huggy-motion-ready .model-select:active,
      .huggy-motion-ready .prompt-mode-btn:active,
      .huggy-motion-ready .tab-btn:active,
      .huggy-motion-ready .sub-tab:active,
      .huggy-motion-ready .btn-upgrade:active,
      .huggy-motion-ready .btn-deploy:active,
      .huggy-motion-ready .project-menu-trigger:active,
      .huggy-motion-ready .preview-device-btn:active {
        transform: scale(0.98);
      }

      .huggy-motion-ready .huggy-ai-input,
      .huggy-motion-ready .input-wrapper,
      .huggy-motion-ready .chat-input-area,
      .huggy-motion-ready textarea,
      .huggy-motion-ready input {
        transition:
          transform var(--motion-normal) var(--ease-huggy),
          border-color var(--motion-fast) var(--ease-huggy),
          box-shadow var(--motion-normal) var(--ease-huggy),
          background-color var(--motion-fast) var(--ease-huggy);
      }

      .huggy-motion-ready .huggy-ai-input:focus-within,
      .huggy-motion-ready .input-wrapper:focus-within {
        transform: translateY(-1px);
      }

      .huggy-motion-ready .input-wrapper:focus-within {
        box-shadow:
          0 1px 0 rgba(255,255,255,0.38) inset,
          0 0 0 3px color-mix(in srgb, var(--accent-blue, #2f6df6) 10%, transparent),
          0 18px 46px rgba(9,9,11,0.10);
      }

      .huggy-motion-ready .preview-frame,
      .huggy-motion-ready iframe {
        transition: opacity var(--motion-panel) var(--ease-huggy), filter var(--motion-panel) var(--ease-huggy);
      }

      .huggy-motion-ready .analysis-skeleton,
      .huggy-motion-ready .skeleton,
      .huggy-motion-ready .preview-skeleton,
      .huggy-motion-ready .huggy-shimmer {
        background-size: 260% 100%;
        animation: huggy-shimmer 1.4s var(--ease-huggy) infinite;
      }

      @keyframes huggy-page-enter {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
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
        .huggy-motion-ready .feature-card:hover,
        .huggy-motion-ready .testimonial-card:hover,
        .huggy-motion-ready .settings-card:hover,
        .huggy-motion-ready .huggy-ai-input:focus-within,
        .huggy-motion-ready .input-wrapper:focus-within,
        .huggy-motion-ready button:hover:not(:disabled),
        .huggy-motion-ready .icon-btn:hover,
        .huggy-motion-ready .submit-btn:hover,
        .huggy-motion-ready .model-select:hover,
        .huggy-motion-ready .prompt-mode-btn:hover,
        .huggy-motion-ready .tab-btn:hover,
        .huggy-motion-ready .sub-tab:hover,
        .huggy-motion-ready .btn-upgrade:hover,
        .huggy-motion-ready .btn-deploy:hover,
        .huggy-motion-ready .project-menu-trigger:hover,
        .huggy-motion-ready .preview-device-btn:hover {
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
