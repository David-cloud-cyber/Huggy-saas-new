export type DemoProject = {
  id: string;
  name: string;
  slug: string;
  prompt: string;
  template: string;
  theme: string;
  model_id: string;
  status: string;
  preview_status: string;
  preview_html: string;
  publish_status: string;
  live_url?: string | null;
  created_at: string;
  updated_at: string;
};

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

export function demoBuilderUrl(projectId = 'demo-pulseboard'): string {
  return `/builder.html?project=${encodeURIComponent(projectId)}&demo=1`;
}

export function demoDelay(milliseconds: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

function previewShell(title: string, accent: string, subtitle: string, metrics: string[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f7f8fc;color:#172033;padding:28px}.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}.brand{display:flex;gap:10px;align-items:center;font-weight:800}.mark{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:${accent};color:white}.muted{color:#748096;font-size:12px}.btn{border:0;border-radius:10px;background:#172033;color:#fff;padding:10px 14px;font-weight:700}.hero{padding:24px;border-radius:22px;background:linear-gradient(135deg,${accent}18,#fff 70%);border:1px solid #e5e8f0}.hero h1{font-size:25px;margin:0 0 8px}.hero p{margin:0;color:#68758a}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}.card{background:#fff;border:1px solid #e7eaf1;border-radius:16px;padding:16px;box-shadow:0 10px 24px #17203308}.label{color:#748096;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.value{font-size:25px;font-weight:800;margin-top:8px}.chart{height:130px;margin-top:18px;border-radius:14px;background:linear-gradient(180deg,${accent}20,transparent),repeating-linear-gradient(90deg,transparent 0 38px,#edf0f6 39px 40px);position:relative;overflow:hidden}.chart:after{content:"";position:absolute;inset:35px 14px 18px;background:linear-gradient(145deg,transparent 0 20%,${accent} 21% 23%,transparent 24% 39%,${accent} 40% 42%,transparent 43% 59%,${accent} 60% 62%,transparent 63%);opacity:.8}.activity{display:grid;gap:10px;margin-top:18px}.row{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid #eef0f4;font-size:13px}@media(max-width:650px){body{padding:18px}.grid{grid-template-columns:1fr}.top{align-items:flex-start;gap:12px}}
  </style></head><body><div class="top"><div class="brand"><span class="mark">H</span>${title}</div><button class="btn">${title === 'PulseBoard' ? 'Export' : 'Open app'}</button></div><section class="hero"><h1>${title}</h1><p>${subtitle}</p><div class="chart"></div></section><div class="grid">${metrics.map((metric, index) => `<div class="card"><div class="label">${['Active users','Conversion','Revenue'][index] || 'Metric'}</div><div class="value">${metric}</div><div class="muted">+${index + 4}.2% this month</div></div>`).join('')}</div><div class="card activity"><div class="label">Recent activity</div><div class="row"><span>New workspace created</span><span class="muted">2m ago</span></div><div class="row"><span>Weekly report generated</span><span class="muted">18m ago</span></div><div class="row"><span>Team member invited</span><span class="muted">1h ago</span></div></div></body></html>`;
}

const pulsePreview = previewShell('PulseBoard', '#7c5cff', 'A calm analytics workspace for product teams.', ['12,480', '8.6%', '$24,680']);
const studioPreview = previewShell('Northstar Studio', '#0ea5a4', 'A focused portfolio for an independent design studio.', ['2,840', '14.2%', '$8,920']);
const launchPreview = previewShell('LaunchKit', '#f59e0b', 'A conversion-ready launch page for a new product.', ['4,920', '11.8%', '$16,340']);

const demoProjects: DemoProject[] = [
  {
    id: 'demo-pulseboard', name: 'PulseBoard', slug: 'pulseboard',
    prompt: 'Analytics SaaS with KPI cards, a revenue chart and a recent activity feed.',
    template: 'dashboard', theme: 'light', model_id: 'auto', status: 'ready', preview_status: 'ready',
    preview_html: pulsePreview, publish_status: 'published', live_url: 'pulseboard.demo.huggy.local',
    created_at: '2026-08-08T09:20:00.000Z', updated_at: '2026-08-10T08:42:00.000Z',
  },
  {
    id: 'demo-northstar', name: 'Northstar Studio', slug: 'northstar-studio',
    prompt: 'Minimal portfolio for a creative studio with selected work and contact CTA.',
    template: 'portfolio', theme: 'light', model_id: 'claude-sonnet', status: 'ready', preview_status: 'ready',
    preview_html: studioPreview, publish_status: 'draft', live_url: null,
    created_at: '2026-08-04T14:00:00.000Z', updated_at: '2026-08-09T16:18:00.000Z',
  },
  {
    id: 'demo-launchkit', name: 'LaunchKit', slug: 'launchkit',
    prompt: 'Product launch landing page with social proof, pricing and a waitlist form.',
    template: 'saas', theme: 'light', model_id: 'auto', status: 'building', preview_status: 'building',
    preview_html: launchPreview, publish_status: 'draft', live_url: null,
    created_at: '2026-08-10T07:05:00.000Z', updated_at: '2026-08-10T08:12:00.000Z',
  },
];

export function getDemoProjects(): DemoProject[] {
  return demoProjects.map(project => ({ ...project }));
}

export function getDemoBuilderPayload(projectId?: string) {
  const project = demoProjects.find(item => item.id === projectId) || demoProjects[0];
  return {
    success: true,
    project: { id: project.id, name: project.name, slug: project.slug, model_id: project.model_id, preview_status: project.preview_status },
    files: [
      { path: 'index.html', language: 'html', content: project.preview_html },
      { path: 'src/App.tsx', language: 'tsx', content: `export default function App() {\n  return <main>${project.name}</main>\n}` },
      { path: 'src/styles.css', language: 'css', content: ':root { color-scheme: light; }\nbody { margin: 0; }' },
      { path: 'README.md', language: 'markdown', content: `# ${project.name}\n\nGenerated with Huggy demo mode.` },
    ],
    messages: [
      { role: 'user', content: `Peux-tu me montrer l'état de ${project.name} ?` },
      { role: 'assistant', content: `Bien sûr ! ${project.name} est prêt à être prévisualisé. Tu peux modifier l'interface depuis le chat, puis vérifier le résultat ici.` },
    ],
    events: [],
    workspace_state: { draft_prompt: '', selected_mode: 'auto', selected_model: project.model_id, active_tab: 'preview', preview_device: 'desktop' },
    preview: { status: 'ready', html: project.preview_html },
  };
}

export function getDemoAssistantReply(prompt: string): string {
  const normalized = prompt.toLowerCase();
  if (/bug|erreur|corrige|fix/.test(normalized)) return 'Je vois ce que tu veux faire. En mode démo, je simule la correction : la mise en page reste responsive, les cartes gardent leur contraste et la preview est prête à revérifier.';
  if (/database|base de donn|supabase|auth/.test(normalized)) return 'Très bien. Je peux brancher une base, l’authentification et les rôles utilisateurs. Ici, les données affichées sont fictives pour te permettre de parcourir l’expérience.';
  if (/bonjour|salut|hello/.test(normalized)) return 'Salut ! Je suis Huggy. Décris-moi une idée, une page ou une amélioration et je te montrerai comment le builder s’en occupe.';
  return `Compris — je préparerais cette évolution pour toi : « ${prompt.trim()} ». La preview démo est mise à jour avec une interface claire, responsive et prête à itérer.`;
}

export function getDemoUsage() {
  return {
    success: true,
    wallet: { balance: 742, monthly_credits: 600, daily_promo_credits: 92, topup_credits: 50, cloud: { balance_usd: 18.4, ai_app_balance_usd: 12.8, database_storage_gb: 0.42, file_storage_gb: 1.8, bandwidth_gb: 6.4, topup_min_usd: 5 } },
    history: [
      { id: 'demo-usage-1', project_name: 'PulseBoard', model_name: 'Auto', mode: 'Build', credits_charged: 18, status: 'completed', created_at: '2026-08-10T08:42:00.000Z' },
      { id: 'demo-usage-2', project_name: 'Northstar Studio', model_name: 'Claude Sonnet', mode: 'Plan', credits_charged: 4, status: 'completed', created_at: '2026-08-09T16:18:00.000Z' },
    ],
  };
}

export function installDemoBanner(label = 'Mode démo local · données fictives') {
  if (!isDemoMode() || document.getElementById('huggy-demo-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'huggy-demo-banner';
  banner.textContent = label;
  banner.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:100000;padding:7px 12px;border:1px solid rgba(124,92,255,.22);border-radius:999px;background:rgba(255,255,255,.9);color:#5b43c7;font:700 11px/1.2 Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(31,25,66,.12);backdrop-filter:blur(12px);pointer-events:none;';
  document.body.appendChild(banner);
}
