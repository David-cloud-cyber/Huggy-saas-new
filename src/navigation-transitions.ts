let navigationInstalled = false;

function isModifiedClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function isNavigableLink(link: HTMLAnchorElement): boolean {
  if (!link.href || link.target === '_blank' || link.hasAttribute('download')) return false;
  if (link.dataset.noTransition === 'true' || link.getAttribute('aria-disabled') === 'true') return false;

  const destination = new URL(link.href, window.location.href);
  if (destination.origin !== window.location.origin) return false;
  if (destination.pathname === window.location.pathname && destination.search === window.location.search) {
    return destination.hash.length > 0;
  }
  return destination.protocol === window.location.protocol;
}

function installNavigationStyles() {
  if (document.getElementById('huggy-navigation-style')) return;
  const style = document.createElement('style');
  style.id = 'huggy-navigation-style';
  style.textContent = `
    :root { --huggy-navigation-duration: 220ms; }
    .huggy-navigation-layer {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      pointer-events: none;
      background: var(--bg, #0e1116);
      opacity: 0;
      transition: opacity var(--huggy-navigation-duration) cubic-bezier(.22, 1, .36, 1);
    }
    .huggy-navigation-ready body {
      transition: opacity var(--huggy-navigation-duration) cubic-bezier(.22, 1, .36, 1);
    }
    .huggy-navigation-ready[data-navigation-state="leaving"] body { opacity: .72; }
    .huggy-navigation-ready[data-navigation-state="leaving"] .huggy-navigation-layer { opacity: .18; }
    @media (prefers-reduced-motion: reduce) {
      .huggy-navigation-ready body,
      .huggy-navigation-layer { transition: none !important; }
    }
  `;
  document.head.appendChild(style);
}

export function initHuggyNavigationTransitions(): void {
  if (navigationInstalled || typeof document === 'undefined') return;
  navigationInstalled = true;
  installNavigationStyles();
  document.documentElement.classList.add('huggy-navigation-ready');

  const layer = document.createElement('div');
  layer.className = 'huggy-navigation-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  document.addEventListener('click', (event) => {
    if (!(event instanceof MouseEvent) || isModifiedClick(event)) return;
    const target = event.target instanceof Element ? event.target.closest('a') : null;
    if (!(target instanceof HTMLAnchorElement) || !isNavigableLink(target)) return;

    const destination = new URL(target.href, window.location.href);
    if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash) {
      return;
    }

    event.preventDefault();
    if (document.documentElement.dataset.navigationState === 'leaving') return;
    document.documentElement.dataset.navigationState = 'leaving';
    window.setTimeout(() => window.location.assign(destination.href), 150);
  });

  window.addEventListener('pageshow', () => {
    delete document.documentElement.dataset.navigationState;
  });
}
