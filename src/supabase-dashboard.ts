import { getCurrentSession, getSupabaseClient, getSupabaseConfigStatus, signOut } from './lib/supabase';

interface ProfileRow {
  display_name: string | null;
  email: string | null;
}

interface OrganizationMemberRow {
  role: string;
  organizations: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  updated_at: string;
}

function text(selector: string, value: string): void {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function showNotice(message: string, tone: 'info' | 'error' = 'info'): void {
  let notice = document.getElementById('supabase-status-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'supabase-status-notice';
    notice.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9999;max-width:360px;padding:12px 14px;border-radius:12px;font:13px/1.4 Instrument Sans,system-ui,sans-serif;border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 40px rgba(0,0,0,.35);';
    document.body.appendChild(notice);
  }
  notice.style.background = tone === 'error' ? 'rgba(127,29,29,.96)' : 'rgba(15,15,15,.96)';
  notice.style.color = '#f8f5f0';
  notice.textContent = message;
}

function renderProjects(projects: ProjectRow[]): void {
  text('.section-label span', `(${projects.length})`);
  const grid = document.querySelector('.projects-grid');
  if (!grid) return;
  if (projects.length === 0) {
    grid.innerHTML = `
      <div class="project-empty-state">
        <div class="project-empty-icon">+</div>
        <h3>Aucun projet pour le moment</h3>
        <p>Decris ta premiere application et Huggy creera le projet, les fichiers, une version et une validation build.</p>
        <button class="btn-create-top" type="button">Nouveau projet</button>
      </div>
    `;
    return;
  }
  grid.innerHTML = projects.map((project) => `
    <div class="project-card" data-project-id="${project.id}">
      <div class="card-header">
        <div class="card-title-row">
          <span class="project-dot" style="background: #60A5FA;"></span>
          <h3 class="card-name">${escapeHtml(project.name)}</h3>
        </div>
        <span class="status-badge">${escapeHtml(project.status)}</span>
      </div>
      <p class="card-desc">${escapeHtml(project.description || 'Projet Huggy connecté à Supabase.')}</p>
      <div class="card-stats">
        <span class="score-badge sec">DB</span>
        <span class="score-badge meta">${escapeHtml(project.slug)}</span>
      </div>
      <div class="card-footer">
        <span class="card-meta">Mis à jour ${formatDate(project.updated_at)}</span>
        <button class="btn-open-project" data-project-id="${project.id}" data-supabase-project-link="true">Ouvrir</button>
      </div>
    </div>
  `).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
}

async function platformApi<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const session = await getCurrentSession();
  if (!session?.access_token) throw new Error('Session Supabase requise.');
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${session.access_token}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Erreur API ${response.status}`);
  return payload as T;
}

async function initSupabaseDashboard(): Promise<void> {
  const status = getSupabaseConfigStatus();
  if (!status.configured) {
    showNotice(`Supabase non configuré: ${status.missing.join(', ')}`, 'error');
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const session = await getCurrentSession();
    if (!session) {
      showNotice('Connecte-toi pour charger tes projets Supabase.');
      return;
    }

    const user = session.user;
    const { data: profile } = await supabase
      .from('users_profile')
      .select('display_name,email')
      .eq('id', user.id)
      .maybeSingle<ProfileRow>();

    const displayName = profile?.display_name || user.user_metadata?.full_name || user.email || 'Utilisateur';
    const email = profile?.email || user.email || '';
    text('.profile-name', displayName);
    text('.profile-email', email);
    text('.profile-avatar', displayName.slice(0, 2).toUpperCase());

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role, organizations(id,name,slug)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle<OrganizationMemberRow>();

    let organizationId = membership?.organizations?.id;
    let role = membership?.role;
    if (!organizationId) {
      const bootstrap = await platformApi<{ organization: { id: string; name: string; slug: string }; role: string }>('/api/platform/bootstrap', {});
      organizationId = bootstrap.organization.id;
      role = bootstrap.role;
      showNotice('Workspace Supabase créé automatiquement.');
    }

    text('.plan-badge', role || 'member');

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id,name,slug,description,status,updated_at')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(12)
      .returns<ProjectRow[]>();

    if (projectsError) throw projectsError;
    renderProjects(projects || []);
    showNotice('Dashboard connecté à Supabase.');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Erreur Supabase inconnue.', 'error');
  }
}

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const projectLink = target?.closest('[data-supabase-project-link]') as HTMLElement | null;
  if (projectLink?.dataset.projectId) {
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(`/projects/${projectLink.dataset.projectId}/editor`);
    return;
  }

  if (target?.closest('[data-action="sign-out"]')) {
    event.preventDefault();
    signOut().then(() => window.location.assign('/'));
  }
});

document.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement | null;
  if (!target?.closest('.btn-new-project-sidebar, .btn-create-top, #submit-btn')) return;
  event.preventDefault();
  event.stopPropagation();
  const promptText = (document.getElementById('ai-textarea') as HTMLTextAreaElement | null)?.value?.trim();
  const name = window.prompt('Nom du projet Supabase à créer', promptText ? promptText.slice(0, 48) : 'Nouveau projet Huggy');
  if (!name) return;
  try {
    showNotice('Création du projet Supabase...');
    const result = await platformApi<{ project: { id: string } }>('/api/projects', { name, prompt: promptText || name });
    window.location.assign(`/projects/${result.project.id}/editor`);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Erreur de création projet.', 'error');
  }
});

void initSupabaseDashboard();
