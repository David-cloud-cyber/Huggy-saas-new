import { apiRequest, Project, setCurrentProjectId } from './lib/api';

const grid = document.querySelector('.projects-grid') as HTMLElement | null;
const aiTextarea = document.getElementById('ai-textarea') as HTMLTextAreaElement | null;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement | null;

function projectCard(project: Project) {
  return `
    <div class="project-card" data-project-id="${project.id}">
      <div class="card-header">
        <div class="card-title-row">
          <span class="project-dot" style="background:#60A5FA;"></span>
          <h3 class="card-name">${escapeHtml(project.name)}</h3>
        </div>
        <span class="status-badge">${escapeHtml(project.status || 'draft')}</span>
      </div>
      <p class="card-desc">${escapeHtml(project.description || 'Application generated with Huggy.')}</p>
      <div class="card-stats">
        <span class="score-badge sec">SEC 96</span>
        <span class="score-badge sec">QA 91</span>
        <span class="score-badge meta">Fullstack</span>
      </div>
      <div class="card-footer">
        <span class="card-meta">Updated ${new Date(project.updated_at).toLocaleDateString()}</span>
        <button class="btn-open-project" data-project-id="${project.id}">Ouvrir</button>
      </div>
    </div>`;
}

async function loadProjects() {
  if (!grid) return;
  try {
    const { projects } = await apiRequest<{ projects: Project[] }>('/api/projects');
    if (!projects.length) return;
    grid.innerHTML = projects.map(projectCard).join('');
  } catch (error) {
    console.warn(error);
  }
}

async function createProjectFromPrompt(prompt?: string) {
  const cleanPrompt = prompt?.trim() || aiTextarea?.value.trim() || 'New fullstack application';
  const { project } = await apiRequest<{ project: Project }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ prompt: cleanPrompt, description: cleanPrompt })
  });
  setCurrentProjectId(project.id);
  sessionStorage.setItem('huggy-initial-prompt', cleanPrompt);
  window.location.href = `/builder.html?project=${project.id}`;
}

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const newProject = target.closest('.btn-create-top, .btn-new-project-sidebar');
  const submit = target.closest('#submit-btn');
  const open = target.closest('.btn-open-project, .project-card') as HTMLElement | null;

  if (newProject || submit) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (submit && !submitBtn?.classList.contains('active')) return;
    createProjectFromPrompt();
    return;
  }

  if (open && !target.closest('.btn-card-delete')) {
    const id = open.dataset.projectId || open.closest<HTMLElement>('.project-card')?.dataset.projectId;
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setCurrentProjectId(id);
    window.location.href = `/builder.html?project=${id}`;
  }
}, true);

loadProjects();

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]!));
}
