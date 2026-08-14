import { getCurrentPrivatePath, getVerifiedSession, signOutCurrentDevice } from './lib/supabase-browser';
import { isDemoMode } from './demo-mode';

function redirectToAuth() {
  const redirect = encodeURIComponent(getCurrentPrivatePath());
  window.location.href = `/auth.html?redirect=${redirect}`;
}

async function guardPage() {
  document.documentElement.dataset.authReady = 'checking';
  if (isDemoMode()) {
    const demoUser = {
      user: { id: 'demo-user', email: 'demo@huggy.local', user_metadata: { full_name: 'Demo Huggy' } },
      session: { access_token: 'demo-preview-token' },
    };
    document.documentElement.dataset.authReady = 'true';
    (window as any).huggyAuthReady = demoUser;
    window.dispatchEvent(new CustomEvent('huggy:auth-ready', { detail: demoUser }));
    return;
  }
  const verified = await getVerifiedSession({ allowRefresh: true });
  if (!verified?.user?.id || !verified.session?.access_token) {
    document.documentElement.dataset.authReady = 'false';
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
  void signOutCurrentDevice().then(() => {
    window.location.href = '/auth.html';
  });
});

void guardPage();
