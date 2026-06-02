import { getRedirectTarget, getVerifiedSession, supabase } from './lib/supabase-browser';

const form = document.getElementById('auth-form') as HTMLFormElement | null;
const emailInput = document.getElementById('input-email') as HTMLInputElement | null;
const passwordInput = document.getElementById('input-password') as HTMLInputElement | null;
const nameInput = document.getElementById('input-name') as HTMLInputElement | null;
const submitButton = document.getElementById('btn-submit') as HTMLButtonElement | null;
const authCard = document.querySelector('.auth-card');
const socialButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.btn-social'));

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

function setOAuthBusy(activeButton: HTMLButtonElement | null, isBusy: boolean) {
  socialButtons.forEach((button) => {
    button.disabled = isBusy;
    button.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    const provider = button.dataset.provider || button.textContent?.trim() || 'provider';
    if (isBusy && button === activeButton) {
      button.dataset.oauthLabel = button.textContent?.trim() || '';
      button.lastChild && (button.lastChild.textContent = ` Opening ${provider}...`);
    }
    if (!isBusy && button.dataset.oauthLabel) {
      button.lastChild && (button.lastChild.textContent = ` ${button.dataset.oauthLabel}`);
      delete button.dataset.oauthLabel;
    }
  });
}

function goToApp() {
  window.location.href = getRedirectTarget();
}

function getAuthRedirectUrl() {
  const target = encodeURIComponent(getRedirectTarget());
  return `${window.location.origin}/auth.html?redirect=${target}`;
}

function getReturnedAuthError(): string | null {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return (
    search.get('error_description') ||
    hash.get('error_description') ||
    search.get('error') ||
    hash.get('error')
  );
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
          emailRedirectTo: getAuthRedirectUrl(),
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

async function handleOAuth(provider: 'google', button: HTMLButtonElement | null) {
  setOAuthBusy(button, true);
  setStatus('Opening Google sign-in...', 'info');
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getAuthRedirectUrl(),
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) throw error;
  } catch (error) {
    setOAuthBusy(button, false);
    setStatus(error instanceof Error ? error.message : 'Google sign-in failed.', 'error');
  }
}

form?.addEventListener('submit', handleEmailAuth);

socialButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    const provider = button.dataset.provider;
    if (provider === 'google') void handleOAuth('google', button);
  });
});

const returnedAuthError = getReturnedAuthError();
if (returnedAuthError) {
  setStatus(`Google sign-in could not finish: ${returnedAuthError}`, 'error');
}

getVerifiedSession().then((verified) => {
  if (verified) goToApp();
});
