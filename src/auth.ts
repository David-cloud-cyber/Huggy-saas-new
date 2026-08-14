import './styles/huggy-light-theme.css';
import './styles/huggy-shell.css';
import { initThemeController } from './theme-controller';
import {
  getAuthRedirectUrl,
  getRedirectTarget,
  getVerifiedSession,
  safeRedirectTarget,
  supabase,
} from './lib/supabase-browser';
import { installSmartBackNavigation } from './public-page-enhancements';
import { readPricingSelection } from './public-pricing-flow';
import { trackFunnelEvent } from './conversion-events';

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
initThemeController();

let mode: AuthMode = new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'login';
let redirecting = false;
const pricingSelection = readPricingSelection();

trackFunnelEvent('auth_viewed', {
  mode,
  plan: pricingSelection.plan,
  billing: pricingSelection.billing,
});

function setStatus(message: string, tone: StatusTone = 'info') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function setBusy(isBusy: boolean, label?: string) {
  if (submitButton) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? label || 'Patientez…' : mode === 'signup' ? 'Créer mon compte' : 'Se connecter';
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
      label.textContent = isBusy && button === activeButton ? 'Ouverture de Google…' : 'Continuer avec Google';
      return;
    }

    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent?.trim() || 'Continuer avec Google';
    }
    const textNode = Array.from(button.childNodes).reverse().find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) {
      textNode.textContent = isBusy && button === activeButton ? ' Ouverture de Google…' : ` ${button.dataset.defaultLabel}`;
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
  if (modeTitle) modeTitle.textContent = mode === 'signup' ? 'Créez votre compte Huggy' : 'Bon retour';
  if (modeSubtitle) {
    modeSubtitle.textContent = mode === 'signup'
      ? 'Commencez à construire, gardez vos projets et publiez quand vous êtes prêt.'
      : 'Connectez-vous pour retrouver vos projets, aperçus, usages et publications.';
  }
  if (footerText) {
    footerText.innerHTML = mode === 'signup'
      ? 'Vous avez déjà un compte ? <button type="button" data-auth-switch="login">Se connecter</button>'
      : 'Nouveau sur Huggy ? <button type="button" data-auth-switch="signup">Créer un compte</button>';
  }
  setBusy(false);
}

function redirectToApp() {
  if (redirecting) return;
  redirecting = true;
  setStatus('Ouverture de votre espace…', 'success');
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
  if (/invalid login credentials/i.test(message)) return 'L’e-mail ou le mot de passe est incorrect.';
  if (/email not confirmed/i.test(message)) return 'Confirmez votre e-mail avant de vous connecter.';
  if (/password/i.test(message) && /six|6|weak|short/i.test(message)) {
    return 'Utilisez un mot de passe plus robuste d’au moins 6 caractères.';
  }
  if (/fetch|network|failed/i.test(message)) return 'Un problème réseau est survenu. Vérifiez votre connexion puis réessayez.';
  return message || 'La connexion a échoué. Réessayez.';
}

async function handleEmailAuth(event: Event) {
  event.preventDefault();
  const email = emailInput?.value.trim().toLowerCase() || '';
  const password = passwordInput?.value || '';
  const fullName = nameInput?.value.trim() || '';

  if (!email || !password) {
    setStatus('Saisissez votre e-mail et votre mot de passe pour continuer.', 'error');
    return;
  }
  if (mode === 'signup' && password.length < 6) {
    setStatus('Utilisez au moins 6 caractères pour votre mot de passe.', 'error');
    return;
  }

  setBusy(true, mode === 'signup' ? 'Création du compte…' : 'Connexion…');
  setStatus(mode === 'signup' ? 'Création de votre compte…' : 'Connexion à votre espace…', 'info');
  trackFunnelEvent('auth_started', { mode, plan: pricingSelection.plan, billing: pricingSelection.billing });

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
        trackFunnelEvent('auth_completed', { mode, plan: pricingSelection.plan, billing: pricingSelection.billing });
        redirectToApp();
        return;
      }
      trackFunnelEvent('auth_completed', { mode, plan: pricingSelection.plan, billing: pricingSelection.billing });
      setStatus('Compte créé. Vérifiez votre e-mail pour le confirmer.', 'success');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    trackFunnelEvent('auth_completed', { mode, plan: pricingSelection.plan, billing: pricingSelection.billing });
    redirectToApp();
  } catch (error) {
    setStatus(friendlyAuthError(error), 'error');
  } finally {
    setBusy(false);
  }
}

async function handleOAuth(button: HTMLButtonElement) {
  setOAuthBusy(button, true);
  setStatus('Ouverture de la connexion Google…', 'info');
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
  setStatus(`La connexion Google n’a pas abouti : ${returnedAuthError}`, 'error');
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
