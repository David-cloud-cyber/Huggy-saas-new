import { ensureDevSession, supabase } from './lib/api';

const form = document.getElementById('auth-form') as HTMLFormElement | null;
const submit = document.getElementById('btn-submit') as HTMLButtonElement | null;
const email = document.getElementById('input-email') as HTMLInputElement | null;
const password = document.getElementById('input-password') as HTMLInputElement | null;

if (!supabase) ensureDevSession();

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!submit || !email || !password) return;

  submit.disabled = true;
  const original = submit.textContent || 'Continue';
  submit.textContent = 'Checking session...';

  try {
    if (supabase) {
      const isSignup = document.getElementById('tab-signup')?.classList.contains('active');
      const result = isSignup
        ? await supabase.auth.signUp({ email: email.value, password: password.value })
        : await supabase.auth.signInWithPassword({ email: email.value, password: password.value });
      if (result.error) throw result.error;
    } else {
      localStorage.setItem('huggy-dev-token', 'local-dev-token');
      localStorage.setItem('huggy-dev-email', email.value || 'local@huggy.dev');
    }

    window.location.href = '/dashboard.html';
  } catch (error) {
    submit.textContent = error instanceof Error ? error.message : 'Authentication failed';
    setTimeout(() => {
      submit.textContent = original;
      submit.disabled = false;
    }, 2200);
  }
}, true);
