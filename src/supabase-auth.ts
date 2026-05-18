import { getCurrentSession, getSupabaseConfigStatus, signInWithMagicLink } from './lib/supabase';

function renderAuthPanel(): void {
  const isAuthRoute = ['/login', '/signup'].includes(window.location.pathname);
  if (!isAuthRoute || document.getElementById('supabase-auth-panel')) return;

  const panel = document.createElement('section');
  panel.id = 'supabase-auth-panel';
  panel.style.cssText = 'position:fixed;inset:0;z-index:9998;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.62);backdrop-filter:blur(18px);';
  panel.innerHTML = `
    <form id="supabase-auth-form" style="width:min(420px,100%);padding:28px;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:#0f0f0f;color:#f8f5f0;box-shadow:0 28px 90px rgba(0,0,0,.45);font-family:Instrument Sans,system-ui,sans-serif;">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9ca3af;margin-bottom:10px;">Huggy</div>
      <h1 style="margin:0 0 10px;font-size:28px;font-weight:600;">${window.location.pathname === '/signup' ? 'Créer un compte' : 'Connexion'}</h1>
      <p style="margin:0 0 22px;color:#a1a1aa;line-height:1.5;">Reçois un lien magique Supabase pour accéder à ton espace de travail.</p>
      <label style="display:block;font-size:13px;color:#d4d4d8;margin-bottom:8px;">Email</label>
      <input id="supabase-auth-email" type="email" required autocomplete="email" placeholder="toi@exemple.com" style="width:100%;box-sizing:border-box;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#111;color:#fff;margin-bottom:14px;">
      <button id="supabase-auth-submit" type="submit" style="width:100%;padding:13px 16px;border:0;border-radius:12px;background:#f0ebe3;color:#060606;font-weight:700;cursor:pointer;">Envoyer le lien magique</button>
      <p id="supabase-auth-status" style="min-height:20px;margin:14px 0 0;color:#a1a1aa;font-size:13px;line-height:1.4;"></p>
      <button type="button" id="supabase-auth-close" style="margin-top:10px;width:100%;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:transparent;color:#d4d4d8;cursor:pointer;">Retour</button>
    </form>
  `;
  document.body.appendChild(panel);

  document.getElementById('supabase-auth-close')?.addEventListener('click', () => window.location.assign('/'));
}

async function handleAuthSubmit(email: string, statusElement: HTMLElement | null): Promise<void> {
  const status = getSupabaseConfigStatus();
  if (!status.configured) {
    if (statusElement) statusElement.textContent = `Supabase non configuré: ${status.missing.join(', ')}`;
    return;
  }

  if (statusElement) statusElement.textContent = 'Envoi du lien magique...';
  try {
    await signInWithMagicLink(email);
    if (statusElement) statusElement.textContent = 'Lien envoyé. Vérifie ta boîte email.';
  } catch (error) {
    if (statusElement) statusElement.textContent = error instanceof Error ? error.message : 'Erreur de connexion Supabase.';
  }
}

document.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement | null;
  if (form?.id !== 'supabase-auth-form') return;
  event.preventDefault();
  const input = document.getElementById('supabase-auth-email') as HTMLInputElement | null;
  void handleAuthSubmit(input?.value.trim() || '', document.getElementById('supabase-auth-status'));
});

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const button = target?.closest('button');
  if (!button || button.id === 'supabase-auth-submit') return;
  if (button.textContent?.trim().toLowerCase() !== 'send magic link') return;
  const modal = button.closest('#modal-body') || document;
  const input = modal.querySelector('input[type="email"]') as HTMLInputElement | null;
  event.preventDefault();
  void handleAuthSubmit(input?.value.trim() || '', button.parentElement);
});

getCurrentSession().then((session) => {
  if (session && ['/login', '/signup'].includes(window.location.pathname)) {
    window.location.assign('/dashboard');
    return;
  }
  renderAuthPanel();
}).catch(() => renderAuthPanel());
