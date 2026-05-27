import { getRedirectTarget, getVerifiedSession, supabase } from './lib/supabase-browser';

const form = document.getElementById('auth-form') as HTMLFormElement | null;
const emailInput = document.getElementById('input-email') as HTMLInputElement | null;
const passwordInput = document.getElementById('input-password') as HTMLInputElement | null;
const nameInput = document.getElementById('input-name') as HTMLInputElement | null;
const submitButton = document.getElementById('btn-submit') as HTMLButtonElement | null;
const authCard = document.querySelector('.auth-card');

let statusEl = document.getElementById('auth-status');
if (!statusEl && authCard) {
  statusEl = document.createElement('div');
  statusEl.id = 'auth-status';
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');
  authCard.appendChild(statusEl);
}

function isSignupMode(): boolean {
  return document.getElementById('tab-signup')?.classList.contains('active') || false;
}

function setStatus(message: string, type: 'info' | 'error' | 'success' = 'info') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `auth-status ${type}`;
}

function setBusy(isBusy: boolean) {
  if (!submitButton) return;
  submitButton.disabled = isBusy;
  submitButton.textContent = isBusy
    ? 'Please wait...'
    : isSignupMode()
      ? 'Create Account'
      : 'Sign In';
}

function goToApp() {
  window.location.href = getRedirectTarget();
}

async function handleEmailAuth(event: Event) {
  event.preventDefault();

  const email = emailInput?.value.trim();
  const password = passwordInput?.value || '';

  if (!email || !password) {
    setStatus('Enter your email and password to continue.', 'error');
    return;
  }

  setBusy(true);
  setStatus(isSignupMode() ? 'Creating your account...' : 'Signing you in...', 'info');

  try {
    if (isSignupMode()) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: nameInput?.value.trim() || '',
          },
          emailRedirectTo: `${window.location.origin}/dashboard.html`,
        },
      });

      if (error) throw error;

      if (data.session) {
        setStatus('Account created. Opening your workspace...', 'success');
        goToApp();
        return;
      }

      setStatus('Account created. Check your email to confirm your account, then sign in.', 'success');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    setStatus('Signed in. Opening your workspace...', 'success');
    goToApp();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Authentication failed.', 'error');
  } finally {
    setBusy(false);
  }
}

async function handleOAuth(provider: 'google' | 'github') {
  setStatus(`Redirecting to ${provider}...`, 'info');
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/dashboard.html`,
    },
  });
  if (error) setStatus(error.message, 'error');
}

form?.addEventListener('submit', handleEmailAuth);

document.querySelectorAll<HTMLButtonElement>('.btn-social').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    const label = button.textContent?.toLowerCase() || '';
    if (label.includes('google')) void handleOAuth('google');
    if (label.includes('github')) void handleOAuth('github');
  });
});

getVerifiedSession().then((verified) => {
  if (verified) goToApp();
});
