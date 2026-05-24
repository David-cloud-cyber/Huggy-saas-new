import { apiRequest, ensureDevSession, Project, safeText, setCurrentProjectId } from './lib/api';

ensureDevSession();
injectDashboardStyles();
void bootDashboard();

async function bootDashboard() {
  await refreshWallet();
  await refreshProjects();
  installUpgradeModal();
  installCreateProjectHandlers();
}

async function refreshWallet() {
  try {
    const { wallet } = await apiRequest<{ wallet: { balance: number; monthly_credits: number; plan_id: string } }>('/api/billing/wallet');
    document.querySelectorAll('.credits-count').forEach((node) => {
      node.textContent = `${wallet.balance.toFixed(1)} credits`;
    });
    document.querySelectorAll('.credits-total').forEach((node) => {
      node.textContent = `/ ${wallet.monthly_credits} monthly`;
    });
    document.querySelectorAll('.plan-badge').forEach((node) => {
      node.textContent = wallet.plan_id;
    });
  } catch {
    showToast('Billing status unavailable. Check backend configuration.');
  }
}

async function refreshProjects() {
  try {
    const { projects } = await apiRequest<{ projects: Project[] }>('/api/projects');
    const grid = document.querySelector('.projects-grid');
    if (!grid) return;

    if (!projects.length) {
      grid.innerHTML = `
        <div class="empty-state live-empty">
          <div class="empty-icon">+</div>
          <h3 class="empty-title">Your workspace is ready</h3>
          <p class="empty-desc">Describe an app above or use New Project to generate your first working preview.</p>
        </div>`;
      return;
    }

    grid.innerHTML = projects.map((project) => `
      <article class="project-card live-project-card" data-project-id="${project.id}">
        <div>
          <span class="section-label">Project</span>
          <h3 class="card-name">${safeText(project.name)}</h3>
          <p class="card-desc">${safeText(project.description || 'Generated with Huggy')}</p>
        </div>
        <div class="project-card-footer">
          <span class="quality-badge">${safeText(project.status)}</span>
          <button class="btn-open-project" data-project-id="${project.id}">Open builder</button>
        </div>
      </article>
    `).join('');
  } catch {
    showToast('Projects unavailable. Check auth or Supabase configuration.');
  }
}

function installCreateProjectHandlers() {
  document.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const trigger = target.closest('#submit-btn, .btn-create-top, .btn-new-project-sidebar, #btn-new-project') as HTMLElement | null;
    const openProject = target.closest('.btn-open-project, .live-project-card') as HTMLElement | null;

    if (openProject && !trigger) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = openProject.dataset.projectId || openProject.closest('[data-project-id]')?.getAttribute('data-project-id');
      if (id) {
        setCurrentProjectId(id);
        window.location.href = `/builder.html?project=${encodeURIComponent(id)}`;
      }
      return;
    }

    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const textarea = document.getElementById('ai-textarea') as HTMLTextAreaElement | null;
    const prompt = textarea?.value.trim() || 'Create a modern SaaS dashboard with auth, billing, analytics, and deployment controls.';
    await createProject(prompt);
  }, true);
}

async function createProject(prompt: string) {
  showToast('Creating project...');
  try {
    const { project } = await apiRequest<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
    setCurrentProjectId(project.id);
    sessionStorage.setItem('huggy-initial-prompt', prompt);
    window.location.href = `/builder.html?project=${encodeURIComponent(project.id)}`;
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Project creation failed');
  }
}

function installUpgradeModal() {
  const button = document.createElement('button');
  button.className = 'btn-promo-upgrade live-upgrade-button';
  button.type = 'button';
  button.textContent = 'Upgrade';
  document.querySelector('.topbar-right')?.prepend(button);

  const modal = document.createElement('div');
  modal.className = 'live-modal';
  modal.innerHTML = `
    <div class="live-modal-card">
      <button class="live-modal-close" aria-label="Close upgrade modal">x</button>
      <span class="section-label">Upgrade</span>
      <h3>More credits, custom domains, and stronger models.</h3>
      <p>Starter includes 100 credits and 1 custom domain. Pro unlocks advanced code models, 5 domains, GitHub sync, and priority builds.</p>
      <div class="live-modal-actions">
        <button data-plan="starter">Starter $20</button>
        <button data-plan="pro">Pro $49</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  button.addEventListener('click', () => modal.classList.add('open'));
  modal.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('live-modal') || target.classList.contains('live-modal-close')) {
      modal.classList.remove('open');
      return;
    }
    const plan = target.dataset.plan;
    if (!plan) return;
    try {
      const checkout = await apiRequest<{ checkout_url: string }>('/api/billing/checkout/subscription', {
        method: 'POST',
        body: JSON.stringify({ planId: plan })
      });
      window.location.href = checkout.checkout_url;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Checkout unavailable');
    }
  });
}

function showToast(message: string) {
  const toast = document.createElement('div');
  toast.className = 'live-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function injectDashboardStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .live-project-card{min-height:180px;background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;padding:18px;display:flex;flex-direction:column;justify-content:space-between;cursor:pointer}
    .live-project-card:hover{border-color:var(--border-focus);transform:translateY(-1px)}
    .project-card-footer{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .live-upgrade-button{margin-top:12px}
    .live-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:20000;background:var(--bg-elevated);border:1px solid var(--border-focus);color:var(--text);padding:10px 14px;border-radius:10px;font-size:13px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
    .live-modal{position:fixed;inset:0;z-index:15000;background:rgba(0,0,0,.56);display:none;align-items:center;justify-content:center;padding:20px}
    .live-modal.open{display:flex}
    .live-modal-card{width:min(420px,100%);background:var(--bg-surface);border:1px solid var(--border-focus);border-radius:16px;padding:22px;position:relative;box-shadow:0 32px 100px rgba(0,0,0,.5)}
    .live-modal-card h3{font-size:22px;margin:10px 0;color:var(--text)}
    .live-modal-card p{font-size:14px;line-height:1.6;color:var(--text-muted);margin-bottom:18px}
    .live-modal-close{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--text)}
    .live-modal-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .live-modal-actions button{padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--accent);color:var(--bg);font-weight:700}
    @media(max-width:700px){.live-modal{align-items:flex-end}.live-modal-card{border-radius:18px 18px 0 0}.live-modal-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}
