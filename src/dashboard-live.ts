import { apiFetch } from './lib/api';

type ProjectResponse = {
  success: boolean;
  project: {
    id: string;
    name: string;
    slug: string;
    template?: string;
    theme?: string;
    model_id?: string;
    prompt?: string;
    created_at?: string;
  };
};

function getTemplateDescription(template: string): string {
  const labels: Record<string, string> = {
    dashboard: 'analytics dashboard with charts, logs and KPI cards',
    ecommerce: 'e-commerce storefront with catalogue, cart and checkout-ready sections',
    saas: 'AI assistant SaaS with chat, sidebar, billing and project workspace',
    portfolio: 'creative developer portfolio with responsive visual sections',
  };
  return labels[template] || 'modern responsive web application';
}

function selectedFeatures(): string[] {
  return [
    (document.getElementById('features-db') as HTMLInputElement | null)?.checked ? 'Supabase data persistence' : '',
    (document.getElementById('features-auth') as HTMLInputElement | null)?.checked ? 'authentication' : '',
    (document.getElementById('features-export') as HTMLInputElement | null)?.checked ? 'export actions' : '',
    (document.getElementById('features-seo') as HTMLInputElement | null)?.checked ? 'SEO metadata' : '',
  ].filter(Boolean);
}

function setCreateBusy(button: HTMLButtonElement, busy: boolean) {
  button.disabled = busy;
  button.textContent = busy ? 'Creating...' : 'Create Project';
}

function showProjectError(message: string) {
  let status = document.getElementById('new-project-live-status');
  if (!status) {
    status = document.createElement('div');
    status.id = 'new-project-live-status';
    status.setAttribute('role', 'alert');
    status.style.cssText = 'margin-top:10px;color:#fca5a5;font-size:12px;line-height:1.5;';
    document.querySelector('#new-project-modal .modal-content')?.appendChild(status);
  }
  status.textContent = message;
}

function bindLiveProjectCreation() {
  const oldButton = document.getElementById('btn-new-proj-create') as HTMLButtonElement | null;
  if (!oldButton) return;

  const button = oldButton.cloneNode(true) as HTMLButtonElement;
  oldButton.replaceWith(button);

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const nameInput = document.getElementById('new-proj-name') as HTMLInputElement | null;
    const templateSelect = document.getElementById('new-proj-template') as HTMLSelectElement | null;
    const themeSelect = document.getElementById('new-proj-theme') as HTMLSelectElement | null;
    const modelSelect = document.getElementById('new-proj-model') as HTMLSelectElement | null;
    const name = nameInput?.value.trim() || '';

    if (!name) {
      showProjectError('Please enter a valid project name.');
      return;
    }

    const template = templateSelect?.value || 'dashboard';
    const theme = themeSelect?.value || 'dark';
    const model = modelSelect?.value || 'auto';
    const features = selectedFeatures();
    const prompt = `Create a ${getTemplateDescription(template)} named "${name}". Include ${features.join(', ') || 'a polished responsive UI'}.`;

    setCreateBusy(button, true);
    showProjectError('');

    try {
      const response = await apiFetch<ProjectResponse>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name, template, theme, model, prompt, features }),
      });

      const project = {
        id: response.project.id,
        name: response.project.name,
        slug: response.project.slug,
        template,
        theme,
        model,
        desc: prompt,
        features,
        createdAt: response.project.created_at || new Date().toISOString(),
      };

      localStorage.setItem('huggy-current-project', JSON.stringify(project));
      const projects = JSON.parse(localStorage.getItem('huggy-projects') || '[]');
      localStorage.setItem('huggy-projects', JSON.stringify([project, ...projects.filter((item: any) => item.id !== project.id)]));
      window.location.href = `/builder.html?project=${encodeURIComponent(project.id)}`;
    } catch (error) {
      showProjectError(error instanceof Error ? error.message : 'Unable to create the project.');
    } finally {
      setCreateBusy(button, false);
    }
  });
}

window.addEventListener('huggy:auth-ready', bindLiveProjectCreation);
if (document.documentElement.dataset.authReady === 'true') bindLiveProjectCreation();
