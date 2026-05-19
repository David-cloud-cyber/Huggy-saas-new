import { supabase } from './supabase';

const tabLogin = document.getElementById('tab-login') as HTMLButtonElement;
const tabSignup = document.getElementById('tab-signup') as HTMLButtonElement;
const authTitle = document.getElementById('auth-title') as HTMLElement;
const authSubtitle = document.getElementById('auth-subtitle') as HTMLElement;
const nameGroup = document.getElementById('name-group') as HTMLElement;
const btnSubmit = document.getElementById('btn-submit') as HTMLButtonElement;
const authFooter = document.getElementById('auth-footer-text') as HTMLElement;
const curtain = document.getElementById('curtain') as HTMLElement;
const html = document.documentElement;
const themeBtn = document.getElementById('theme-btn') as HTMLButtonElement;
const moonIcon = document.getElementById('moon-icon') as HTMLElement;
const sunIcon = document.getElementById('sun-icon') as HTMLElement;

const inputEmail = document.getElementById('input-email') as HTMLInputElement;
const inputPassword = document.getElementById('input-password') as HTMLInputElement;
const inputName = document.getElementById('input-name') as HTMLInputElement;
const authForm = document.getElementById('auth-form') as HTMLFormElement;

const btnGoogle = document.getElementById('btn-google') as HTMLButtonElement;
const btnGithub = document.getElementById('btn-github') as HTMLButtonElement;

let isLogin = true;

// Create error container dynamically
const errorContainer = document.createElement('div');
errorContainer.style.color = 'var(--error)';
errorContainer.style.fontSize = '13px';
errorContainer.style.marginTop = '12px';
errorContainer.style.textAlign = 'center';
errorContainer.style.display = 'none';
authForm.prepend(errorContainer);

function showError(msg: string) {
  errorContainer.textContent = msg;
  errorContainer.style.display = 'block';
}

function clearError() {
  errorContainer.style.display = 'none';
  errorContainer.textContent = '';
}

function setMode(login: boolean) {
  isLogin = login;
  clearError();
  if (login) {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    authTitle.textContent = 'Welcome back';
    authSubtitle.textContent = 'Enter your details to access your workspace';
    nameGroup.style.display = 'none';
    btnSubmit.textContent = 'Sign In';
    authFooter.innerHTML = `Don't have an account? <a href="#" id="link-signup">Sign up for free</a>`;
    document.getElementById('link-signup')?.addEventListener('click', (e) => {
      e.preventDefault();
      setMode(false);
    });
  } else {
    tabLogin.classList.remove('active');
    tabSignup.classList.add('active');
    authTitle.textContent = 'Create an account';
    authSubtitle.textContent = 'Join thousands of builders creating amazing SaaS';
    nameGroup.style.display = 'block';
    btnSubmit.textContent = 'Create Account';
    authFooter.innerHTML = `Already have an account? <a href="#" id="link-login">Log in</a>`;
    document.getElementById('link-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      setMode(true);
    });
  }
}

tabLogin?.addEventListener('click', () => setMode(true));
tabSignup?.addEventListener('click', () => setMode(false));
document.getElementById('link-signup')?.addEventListener('click', (e) => {
  e.preventDefault();
  setMode(false);
});

// Handle Auth flow
authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const email = inputEmail.value.trim();
  const password = inputPassword.value;
  const name = inputName.value.trim();

  btnSubmit.disabled = true;
  btnSubmit.textContent = isLogin ? 'Signing In...' : 'Registering...';

  try {
    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name || undefined,
          },
        },
      });
      if (error) throw error;
    }

    // Success redirect transition
    curtain.classList.remove('rising');
    curtain.classList.add('falling');
    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 600);
  } catch (err: any) {
    showError(err.message || 'An error occurred during authentication.');
    btnSubmit.disabled = false;
    btnSubmit.textContent = isLogin ? 'Sign In' : 'Create Account';
  }
});

// Social Login
btnGoogle?.addEventListener('click', async () => {
  try {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) throw error;
  } catch (err: any) {
    showError(err.message || 'Google Authentication failed.');
  }
});

btnGithub?.addEventListener('click', async () => {
  try {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'github' });
    if (error) throw error;
  } catch (err: any) {
    showError(err.message || 'GitHub Authentication failed.');
  }
});

// Theme management
function updateIcons(theme: string) {
  if (theme === 'dark') {
    moonIcon.classList.remove('hidden');
    sunIcon.classList.add('hidden');
  } else {
    moonIcon.classList.add('hidden');
    sunIcon.classList.remove('hidden');
  }
}

themeBtn?.addEventListener('click', () => {
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('huggy-theme', next);
  updateIcons(next);
});

// Initialize theme state
const currentTheme = html.getAttribute('data-theme') || 'dark';
updateIcons(currentTheme);

// Page load transition
window.addEventListener('load', () => {
  curtain.classList.add('rising');
});
