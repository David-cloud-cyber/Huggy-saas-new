import { supabase } from './lib/api';

const form = document.getElementById('auth-form') as HTMLFormElement | null;
const btnSubmit = document.getElementById('btn-submit') as HTMLButtonElement | null;
const emailInput = document.getElementById('input-email') as HTMLInputElement | null;
const passwordInput = document.getElementById('input-password') as HTMLInputElement | null;
const nameInput = document.getElementById('input-name') as HTMLInputElement | null;
const footer = document.getElementById('auth-footer-text');

function setStatus(message: string, isError = false) {
  if (!footer) return;
  footer.innerHTML = `<span style="color:${isError ? 'var(--error)' : 'var(--text-muted)'}">${message}</span>`;
}

async function handleRealAuth() {
  if (!emailInput || !passwordInput || !btnSubmit) return;
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const isSignup = btnSubmit.textContent?.toLowerCase().includes('create');

  btnSubmit.disabled = true;
  btnSubmit.textContent = isSignup ? 'Creating...' : 'Signing in...';

  try {
    if (!supabase) {
      localStorage.setItem('huggy-dev-token', 'local-dev-token');
      window.location.href = '/dashboard.html';
      return;
    }

    const result = isSignup
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: nameInput?.value || '' } } })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) throw result.error;
    window.location.href = '/dashboard.html';
  } catch (error: any) {
    setStatus(error.message || 'Authentication failed', true);
    btnSubmit.disabled = false;
    btnSubmit.textContent = isSignup ? 'Create Account' : 'Sign In';
  }
}

if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleRealAuth();
  }, { capture: true });
}

(window as any).handleAuth = handleRealAuth;
