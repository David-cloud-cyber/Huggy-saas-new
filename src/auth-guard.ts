import { getVerifiedSession, supabase } from './lib/supabase-browser';

const currentPath = `${window.location.pathname}${window.location.search}`;

function redirectToAuth() {
  const redirect = encodeURIComponent(currentPath || '/dashboard.html');
  window.location.href = `/auth.html?redirect=${redirect}`;
}

async function guardPage() {
  const verified = await getVerifiedSession();
  if (!verified) {
    redirectToAuth();
    return;
  }

  document.documentElement.dataset.authReady = 'true';
  (window as any).huggyAuthReady = verified;
  window.dispatchEvent(new CustomEvent('huggy:auth-ready', { detail: verified }));
}

document.addEventListener('click', (event) => {
  const logoutButton = (event.target as Element | null)?.closest('[data-auth-logout]');
  if (!logoutButton) return;
  event.preventDefault();
  void supabase.auth.signOut().then(() => {
    window.location.href = '/auth.html';
  });
});

void guardPage();
