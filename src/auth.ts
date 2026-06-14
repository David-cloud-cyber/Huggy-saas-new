import './styles/huggy-light-theme.css';
import {
  getAuthRedirectUrl,
  getRedirectTarget,
  getVerifiedSession,
  safeRedirectTarget,
  supabase,
} from './lib/supabase-browser';
import { installSmartBackNavigation } from './public-page-enhancements';

type AuthMode = 'login' | 'signup';
type StatusTone = 'info' | 'error' | 'success';

const form = document.getElementById('auth-form') as HTMLFormElement | null;
const emailInput = document.getElementById('input-email') as HTMLInputElement | null;
const passwordInput = document.getElementById('input-password') as HTMLInputElement | null;
const nameInput = document.getElementById('input-name') as HTMLInputElement | null;
const submitButton = document.getElementById('btn-submit') as HTMLButtonElement | null;
const tabLogin = document.getElementById('tab-login') as HTMLButtonElement | null;
const tabSignup = document.getElementById('tab-signup') as HTMLButtonElement | null;
const nameField = document.getElementById('name-field') as HTMLElement | null;
const statusEl = document.getElementById('auth-status') as HTMLElement | null;
const modeTitle = document.getElementById('auth-title') as HTMLElement | null;
const modeSubtitle = document.getElementById('auth-subtitle') as HTMLElement | null;
const footerText = document.getElementById('auth-footer-text') as HTMLElement | null;
const socialButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-provider]'));

installSmartBackNavigation({ backFallback: '/' });

let mode: AuthMode = new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'login';
let redirecting = false;

function setStatus(message: string, tone: StatusTone = 'info') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function setBusy(isBusy: boolean, label?: string) {
  if (submitButton) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? label || 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in';
  }

  socialButtons.forEach((button) => {
    button.disabled = isBusy;
    button.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  });
}

function setOAuthBusy(activeButton: HTMLButtonElement | null, isBusy: boolean) {
  socialButtons.forEach((button) => {
    button.disabled = isBusy;
    button.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    const label = button.querySelector('[data-oauth-label]');
    if (label) {
      label.textContent = isBusy && button === activeButton ? 'Opening Google...' : 'Continue with Google';
      return;
    }

    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent?.trim() || 'Continue with Google';
    }
    const textNode = Array.from(button.childNodes).reverse().find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) {
      textNode.textContent = isBusy && button === activeButton ? ' Opening Google...' : ` ${button.dataset.defaultLabel}`;
    }
  });
}

function setMode(nextMode: AuthMode) {
  mode = nextMode;
  document.documentElement.dataset.authMode = mode;
  tabLogin?.classList.toggle('active', mode === 'login');
  tabSignup?.classList.toggle('active', mode === 'signup');
  tabLogin?.setAttribute('aria-selected', mode === 'login' ? 'true' : 'false');
  tabSignup?.setAttribute('aria-selected', mode === 'signup' ? 'true' : 'false');
  if (nameField) nameField.hidden = mode !== 'signup';
  if (nameInput) nameInput.required = mode === 'signup';
  if (passwordInput) {
    passwordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  }
  if (modeTitle) modeTitle.textContent = mode === 'signup' ? 'Create your Huggy account' : 'Welcome back';
  if (modeSubtitle) {
    modeSubtitle.textContent = mode === 'signup'
      ? 'Start building, keep every project saved, and publish only when you are ready.'
      : 'Sign in once and return to your projects, previews, usage and publish controls.';
  }
  if (footerText) {
    footerText.innerHTML = mode === 'signup'
      ? 'Already have an account? <button type="button" data-auth-switch="login">Sign in</button>'
      : 'New to Huggy? <button type="button" data-auth-switch="signup">Create an account</button>';
  }
  setBusy(false);
}

function redirectToApp() {
  if (redirecting) return;
  redirecting = true;
  setStatus('Opening your workspace...', 'success');
  window.location.href = safeRedirectTarget(getRedirectTarget());
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

function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email before signing in.';
  if (/password/i.test(message) && /six|6|weak|short/i.test(message)) {
    return 'Use a stronger password with at least 6 characters.';
  }
  if (/fetch|network|failed/i.test(message)) return 'Network issue. Please check your connection and try again.';
  return message || 'Authentication failed. Please try again.';
}

async function handleEmailAuth(event: Event) {
  event.preventDefault();
  const email = emailInput?.value.trim().toLowerCase() || '';
  const password = passwordInput?.value || '';
  const fullName = nameInput?.value.trim() || '';

  if (!email || !password) {
    setStatus('Enter your email and password to continue.', 'error');
    return;
  }
  if (mode === 'signup' && password.length < 6) {
    setStatus('Use at least 6 characters for your password.', 'error');
    return;
  }

  setBusy(true, mode === 'signup' ? 'Creating account...' : 'Signing in...');
  setStatus(mode === 'signup' ? 'Creating your account...' : 'Signing you in...', 'info');

  try {
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });
      if (error) throw error;
      if (data.session) {
        redirectToApp();
        return;
      }
      setStatus('Account created. Check your email to confirm it, then sign in.', 'success');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    redirectToApp();
  } catch (error) {
    setStatus(friendlyAuthError(error), 'error');
  } finally {
    setBusy(false);
  }
}

async function handleOAuth(button: HTMLButtonElement) {
  setOAuthBusy(button, true);
  setStatus('Opening Google sign-in...', 'info');
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
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
    setStatus(friendlyAuthError(error), 'error');
  }
}

form?.addEventListener('submit', handleEmailAuth);

tabLogin?.addEventListener('click', () => setMode('login'));
tabSignup?.addEventListener('click', () => setMode('signup'));

document.addEventListener('click', (event) => {
  const target = (event.target as Element | null)?.closest('[data-auth-switch]') as HTMLElement | null;
  if (!target) return;
  event.preventDefault();
  setMode(target.dataset.authSwitch === 'signup' ? 'signup' : 'login');
});

socialButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    if (button.dataset.provider === 'google') void handleOAuth(button);
  });
});

const returnedAuthError = getReturnedAuthError();
setMode(mode);
if (returnedAuthError) {
  setStatus(`Google sign-in could not finish: ${returnedAuthError}`, 'error');
}

supabase.auth.onAuthStateChange((event, session) => {
  if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.access_token) {
    void getVerifiedSession({ allowRefresh: false }).then((verified) => {
      if (verified) redirectToApp();
    });
  }
});

void getVerifiedSession({ allowRefresh: true }).then((verified) => {
  if (verified) redirectToApp();
});
