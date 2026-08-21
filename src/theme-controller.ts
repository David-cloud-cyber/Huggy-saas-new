export type HuggyTheme = 'dark' | 'light';

export const HUGGY_THEME_KEY = 'huggy-theme';

function isTheme(value: string | null): value is HuggyTheme {
  return value === 'dark' || value === 'light';
}

export function getInitialTheme(): HuggyTheme {
  try {
    const stored = localStorage.getItem(HUGGY_THEME_KEY);
    return isTheme(stored) ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: HuggyTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === 'dark' ? '#0f1014' : '#fafafa';

  document.querySelectorAll<HTMLElement>('[data-theme-icon="dark"], #moon-icon').forEach((icon) => {
    icon.classList.toggle('hidden', theme !== 'dark');
    icon.style.display = theme === 'dark' ? '' : 'none';
  });
  document.querySelectorAll<HTMLElement>('[data-theme-icon="light"], #sun-icon').forEach((icon) => {
    icon.classList.toggle('hidden', theme === 'dark');
    icon.style.display = theme === 'dark' ? 'none' : '';
  });

  document.querySelectorAll<HTMLElement>('[data-theme-toggle], #theme-btn, #theme-btn-dashboard').forEach((button) => {
    button.setAttribute('aria-label', theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre');
    button.setAttribute('title', theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre');
    button.setAttribute('data-current-theme', theme);
  });
}

export function toggleTheme(): HuggyTheme {
  const current = document.documentElement.getAttribute('data-theme');
  const next: HuggyTheme = current === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(HUGGY_THEME_KEY, next); } catch { /* theme remains applied for this session */ }
  const transition = (document as Document & { startViewTransition?: (callback: () => void) => unknown }).startViewTransition;
  if (typeof transition === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    transition(() => applyTheme(next));
  } else {
    applyTheme(next);
  }
  return next;
}

export function initThemeController(): HuggyTheme {
  const initial = getInitialTheme();
  applyTheme(initial);

  document.querySelectorAll<HTMLElement>('[data-theme-toggle], #theme-btn, #theme-btn-dashboard').forEach((button) => {
    if (button.dataset.themeBound === 'true') return;
    button.dataset.themeBound = 'true';
    button.addEventListener('click', () => toggleTheme());
  });

  window.addEventListener('storage', (event) => {
    if (event.key && event.key !== HUGGY_THEME_KEY) return;
    if (isTheme(event.newValue)) applyTheme(event.newValue);
  });

  return initial;
}
