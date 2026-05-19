function initBuilder() {
  // ── INITIAL THEME ───────────────────────────────────────────
  const savedTheme = localStorage.getItem('huggy-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // ── CODE CONTENT & WORKSPACE DEFINITION ────────────────────────
  const extColor: Record<string, string> = { 
    tsx: '#60A5FA', 
    css: '#A78BFA', 
    ts: '#34D399', 
    json: '#FBBF24', 
    js: '#FBBF24', 
    html: '#F87171',
    png: '#EC4899',
    jpg: '#EC4899'
  };

  const fileContents: Record<string, string> = {
    'Dashboard.tsx': `import React from 'react';
import Sidebar from './Sidebar';
import MetricCard from './MetricCard';
import Chart from './Chart';
import { useMetrics } from '../hooks/useMetrics';

export default function Dashboard() {
  const { data, loading, error } = useMetrics();

  if (loading) return <div className="loading text-slate-400">Loading dashboard...</div>;
  if (error) return <div className="error text-rose-500">Error loading metrics</div>;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <header className="flex justify-between items-center mb-8 border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">SaaS Analytics</h1>
            <p className="text-slate-400 text-sm mt-1">Welcome back to your workspace overview.</p>
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg font-medium text-sm text-white transition-all duration-150">
            Export CSV
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <MetricCard title="Active Users" value={data?.activeUsers || '0'} change="+12.3%" trend="up" />
          <MetricCard title="Monthly Recurring Revenue" value={data?.mrr || '$0'} change="+8.1%" trend="up" />
          <MetricCard title="Churn Rate" value={data?.churnRate || '0%'} change="-1.2%" trend="down" />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-4 text-white">Growth Analysis</h2>
          <Chart data={data?.revenueHistory || []} />
        </div>
      </main>
    </div>
  );
}`,
    'Sidebar.tsx': `import React from 'react';

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
          Huggy Workspace
        </span>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        <a href="#" className="flex items-center space-x-3 px-4 py-2.5 bg-indigo-600/10 text-indigo-400 rounded-lg font-medium">
          <span>Overview</span>
        </a>
        <a href="#" className="flex items-center space-x-3 px-4 py-2.5 text-slate-400 hover:bg-slate-800/50 rounded-lg transition-colors">
          <span>Analytics</span>
        </a>
        <a href="#" className="flex items-center space-x-3 px-4 py-2.5 text-slate-400 hover:bg-slate-800/50 rounded-lg transition-colors">
          <span>Settings</span>
        </a>
      </nav>
    </aside>
  );
}`,
    'MetricCard.tsx': `import React from 'react';

interface MetricProps {
  title: string;
  value: string | number;
  change: string;
  trend: 'up' | 'down';
}

export default function MetricCard({ title, value, change, trend }: MetricProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md hover:border-slate-700 transition">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</span>
      <div className="flex items-baseline space-x-2 mt-2">
        <span className="text-3xl font-bold tracking-tight text-white">{value}</span>
        <span className={\`text-xs font-semibold \${trend === 'up' ? 'text-emerald-400' : 'text-rose-400'}\`}>
          {change}
        </span>
      </div>
    </div>
  );
}`,
    'Chart.tsx': `import React from 'react';

export default function Chart({ data }: { data: any[] }) {
  return (
    <div className="h-64 flex items-end justify-between gap-3 pt-6">
      {data.map((item, index) => (
        <div key={index} className="flex-1 flex flex-col items-center gap-2">
          <div 
            className="w-full bg-gradient-to-t from-indigo-600 to-cyan-500 rounded-t-lg shadow-lg hover:brightness-110 transition-all duration-300" 
            style={{ height: \`\${(item.val / 120) * 100}%\` }}
          />
          <span className="text-[10px] text-slate-500 font-mono mt-1">{item.month}</span>
        </div>
      ))}
    </div>
  );
}`,
    'useMetrics.ts': `import { useState, useEffect } from 'react';
import { fetchMetrics } from '../services/api';
import { MetricsData } from '../types';

export function useMetrics() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchMetrics()
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}`,
    'api.ts': `import { MetricsData } from '../types';

export async function fetchMetrics(): Promise<MetricsData> {
  await new Promise(resolve => setTimeout(resolve, 800));
  
  return {
    activeUsers: '14,204',
    mrr: '$45,820',
    churnRate: '2.4%',
    revenueHistory: [
      { month: 'Jan', val: 40 },
      { month: 'Feb', val: 45 },
      { month: 'Mar', val: 55 },
      { month: 'Apr', val: 72 },
      { month: 'May', val: 89 },
      { month: 'Jun', val: 110 }
    ]
  };
}`,
    'index.ts': `export interface MetricsData {
  activeUsers: string;
  mrr: string;
  churnRate: string;
  revenueHistory: Array<{
    month: string;
    val: number;
  }>;
}`,
    'App.tsx': `import React from 'react';
import Dashboard from './components/Dashboard';

export default function App() {
  return (
    <div className="app bg-slate-950 min-h-screen">
      <Dashboard />
    </div>
  );
}`,
    'main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
    'index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  background-color: #020617;
  color: #f8fafc;
}

.loading {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}`,
    'package.json': `{
  "name": "huggy-saas-dashboard",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.2.2",
    "vite": "^5.3.1"
  }
}`,
    'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
  }
});`,
    'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true
  }
}`,
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SaaS Dashboard</title>
  </head>
  <body class="bg-slate-950">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`
  };

  let openFiles: string[] = ['Dashboard.tsx', 'App.tsx', 'index.css'];
  let activeFile = 'Dashboard.tsx';

  // ── FILE TREE UI CONFIGURATION ─────────────────────────────────
  const fileTree = document.getElementById('file-tree');
  const previewArea = document.getElementById('file-preview-area');
  const previewEmpty = document.querySelector('.preview-empty');
  const previewContent = document.getElementById('preview-content');
  const previewCode = document.getElementById('preview-code');
  const previewFilename = document.getElementById('preview-filename');

  function getColor(name: string) {
    const ext = name.split('.').pop() || '';
    return extColor[ext] || '#606060';
  }

  function getIcon(item: any) {
    if (item.type === 'folder') {
      return `<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
    }
    const ext = item.name.split('.').pop() || '';
    if (['tsx', 'ts', 'js'].includes(ext)) {
      return `<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="${getColor(item.name)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
    }
    if (ext === 'css') {
      return `<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="${getColor(item.name)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>`;
    }
    return `<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="${getColor(item.name)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
  }

  function updatePreview(name: string) {
    if (!previewEmpty || !previewContent || !previewCode || !previewFilename) return;
    previewEmpty.classList.add('hidden');
    previewContent.classList.remove('hidden');
    previewFilename.textContent = name;
    previewCode.textContent = fileContents[name] || `// Content for ${name}\n// ... dynamic content mock ...`;
  }

  const structure = [
    {
      type: 'folder',
      name: 'src',
      children: [
        {
          type: 'folder',
          name: 'components',
          children: [
            { type: 'file', name: 'Dashboard.tsx', size: '2.4kb' },
            { type: 'file', name: 'Sidebar.tsx', size: '1.2kb' },
            { type: 'file', name: 'MetricCard.tsx', size: '0.8kb' },
            { type: 'file', name: 'Chart.tsx', size: '1.5kb' }
          ]
        },
        {
          type: 'folder',
          name: 'hooks',
          children: [
            { type: 'file', name: 'useMetrics.ts', size: '1.1kb' }
          ]
        },
        {
          type: 'folder',
          name: 'services',
          children: [
            { type: 'file', name: 'api.ts', size: '0.9kb' }
          ]
        },
        {
          type: 'folder',
          name: 'types',
          children: [
            { type: 'file', name: 'index.ts', size: '0.4kb' }
          ]
        },
        { type: 'file', name: 'App.tsx', size: '1.6kb' },
        { type: 'file', name: 'main.tsx', size: '0.5kb' },
        { type: 'file', name: 'index.css', size: '0.8kb' }
      ]
    },
    { type: 'file', name: 'package.json', size: '0.6kb' },
    { type: 'file', name: 'vite.config.ts', size: '0.3kb' },
    { type: 'file', name: 'tsconfig.json', size: '0.2kb' },
    { type: 'file', name: 'index.html', size: '0.3kb' }
  ];

  function renderTree(items: any[], container: HTMLElement) {
    items.forEach(item => {
      if (item.type === 'folder') {
        const group = document.createElement('div');
        group.className = 'file-group';
        const header = document.createElement('div');
        header.className = 'folder-header open';
        header.innerHTML = `
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          ${getIcon(item)}
          <span class="folder-name">${item.name}/</span>`;
        const children = document.createElement('div');
        children.className = 'folder-children';
        renderTree(item.children, children);
        header.addEventListener('click', () => {
          const open = header.classList.toggle('open');
          children.style.display = open ? '' : 'none';
        });
        group.appendChild(header);
        group.appendChild(children);
        container.appendChild(group);
      } else {
        const fi = document.createElement('div');
        fi.className = 'file-item' + (item.name === activeFile ? ' active' : '');
        fi.innerHTML = `
          ${getIcon(item)}
          <span class="file-name">${item.name}</span>
          <span class="file-size">${item.size}</span>`;
        fi.addEventListener('click', () => {
          document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
          fi.classList.add('active');
          updatePreview(item.name);
          setActiveFile(item.name);
          setSubTab('code'); // Auto-switch to Code tab for premium editor feedback
          addToHistory(`Viewed & Opened ${item.name}`);
        });
        container.appendChild(fi);
      }
    });
  }

  function renderTabs() {
    const tabsBar = document.getElementById('file-tabs-bar');
    if (!tabsBar) return;
    tabsBar.innerHTML = '';
    
    openFiles.forEach(file => {
      const tab = document.createElement('div');
      tab.className = 'file-tab' + (file === activeFile ? ' active' : '');
      tab.innerHTML = `
        <span class="tab-dot" style="background: ${getColor(file)}"></span>
        <span class="tab-name">${file}</span>
        <button class="tab-close">✕</button>
      `;
      
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('tab-close')) {
          e.stopPropagation();
          closeFile(file);
        } else {
          setActiveFile(file);
        }
      });
      
      tabsBar.appendChild(tab);
    });
  }

  function closeFile(name: string) {
    openFiles = openFiles.filter(f => f !== name);
    if (activeFile === name) {
      activeFile = openFiles[openFiles.length - 1] || '';
    }
    renderTabs();
    loadCodeEditor();
  }

  function setActiveFile(name: string) {
    if (!openFiles.includes(name)) {
      openFiles.push(name);
    }
    activeFile = name;
    renderTabs();
    loadCodeEditor();
  }

  function loadCodeEditor() {
    const codeArea = document.getElementById('code-area');
    if (!codeArea) return;
    codeArea.innerHTML = '';
    
    if (!activeFile) {
      codeArea.innerHTML = `<div style="height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-sub); font-size:13px; font-style:italic;">No files open. Select a file from the Files tab.</div>`;
      return;
    }
    
    const content = fileContents[activeFile] || `// No content for ${activeFile}`;
    const lines = content.split('\n');
    lines.forEach((lineText, i) => {
      const line = document.createElement('div');
      line.className = 'code-line';
      
      const escaped = lineText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
        
      line.innerHTML = `<span class="line-num">${i + 1}</span><span class="code-content">${escaped}</span>`;
      codeArea.appendChild(line);
    });
    
    // Update status bar
    const stats = document.querySelectorAll('.code-statusbar .code-stat');
    if (stats.length >= 3) {
      stats[0].textContent = `Ln 1`;
      stats[1].textContent = `Col 1`;
      const ext = activeFile.split('.').pop() || '';
      stats[2].textContent = ext.toUpperCase() === 'TSX' ? 'TypeScript React' : ext.toUpperCase() === 'TS' ? 'TypeScript' : ext.toUpperCase() === 'CSS' ? 'CSS' : 'JSON';
    }
  }

  if (fileTree) {
    fileTree.innerHTML = '';
    renderTree(structure, fileTree);
  }

  // Render editor on initialization
  renderTabs();
  loadCodeEditor();

  // ── UPLOAD LOGIC ───────────────────────────────────────────────
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const uploadActions = document.getElementById('upload-actions');
  const selectedFilesList = document.getElementById('selected-files-list');
  const btnDoUpload = document.getElementById('btn-do-upload');
  let pendingFiles: File[] = [];

  fileInput?.addEventListener('change', () => {
    if (fileInput.files) {
      pendingFiles = Array.from(fileInput.files);
      if (pendingFiles.length > 0) {
        uploadActions?.classList.remove('hidden');
        if (selectedFilesList) {
          selectedFilesList.innerHTML = '';
          pendingFiles.forEach(file => {
            const item = document.createElement('div');
            item.className = 'sel-file-item';
            item.innerHTML = `<span>${file.name}</span><span>${(file.size / 1024).toFixed(1)}kb</span>`;
            selectedFilesList.appendChild(item);
          });
        }
      }
    }
  });

  btnDoUpload?.addEventListener('click', () => {
    if (pendingFiles.length === 0) return;
    
    showToast(`Uploading ${pendingFiles.length} files...`);
    
    // Add to structure (Mock)
    pendingFiles.forEach(file => {
      structure.push({
        type: 'file',
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)}kb`
      });
    });

    // Re-render tree
    if (fileTree) {
      fileTree.innerHTML = '';
      renderTree(structure, fileTree);
    }

    addToHistory(`Uploaded ${pendingFiles.length} files`);

    // Reset
    pendingFiles = [];
    fileInput.value = '';
    uploadActions?.classList.add('hidden');
    if (selectedFilesList) selectedFilesList.innerHTML = '';
  });

  // ── VIEW TABS ──────────────────────────────────────────────────
  const mainPanel = document.getElementById('main-panel') as HTMLElement;
  const handleR = document.getElementById('handle-right') as HTMLElement;
  const previewPanel = document.getElementById('preview-panel') as HTMLElement;
  const layout = document.querySelector('.app-layout') as HTMLElement;

  let currentView = 'split';
  let isCollapsed = false;

  function updateLayout() {
    const collapseBtn = document.getElementById('btn-collapse-chat');
    if (collapseBtn) {
      if (isCollapsed) collapseBtn.classList.add('collapsed');
      else collapseBtn.classList.remove('collapsed');
    }

    if (currentView === 'preview') {
      mainPanel.style.display = 'none';
      handleR.style.display = 'none';
      previewPanel.style.display = '';
      layout.style.gridTemplateColumns = `0px 0px 1fr`;
      return;
    }

    mainPanel.style.display = '';
    
    if (isCollapsed) {
      layout.classList.add('chat-collapsed');
      const sideW = '40px'; 
      if (currentView === 'code') {
        isCollapsed = false;
        layout.classList.remove('chat-collapsed');
        handleR.style.display = 'none';
        previewPanel.style.display = 'none';
        layout.style.gridTemplateColumns = `1fr 0px 0px`;
      } else {
        handleR.style.display = 'none';
        previewPanel.style.display = '';
        layout.style.gridTemplateColumns = `${sideW} 0px 1fr`;
      }
    } else {
      layout.classList.remove('chat-collapsed');
      if (currentView === 'code') {
        handleR.style.display = 'none';
        previewPanel.style.display = 'none';
        layout.style.gridTemplateColumns = `1fr 0px 0px`;
      } else {
        handleR.style.display = '';
        previewPanel.style.display = '';
        const sideW = layout.style.getPropertyValue('--side-w') || '360px';
        layout.style.gridTemplateColumns = `${sideW} 4px 1fr`;
      }
    }
    window.dispatchEvent(new Event('resize'));
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = (btn as HTMLElement).dataset.view || 'split';
      addToHistory(`Changed view to ${currentView}`);
      updateLayout();
    });
  });

  // ── SUB TABS ──────────────────────────────────────────────────
  const savedSubTab = localStorage.getItem('huggy-sub-tab') || 'chat';
  const subTabs = document.querySelectorAll('.sub-tab');
  
  function setSubTab(sub: string) {
    subTabs.forEach(t => t.classList.toggle('active', (t as HTMLElement).dataset.sub === sub));
    const tabChat = document.getElementById('tab-chat');
    const tabCode = document.getElementById('tab-code');
    const tabFiles = document.getElementById('tab-files');
    
    if (tabChat) tabChat.classList.toggle('hidden', sub !== 'chat');
    if (tabCode) tabCode.classList.toggle('hidden', sub !== 'code');
    if (tabFiles) tabFiles.classList.toggle('hidden', sub !== 'files');
    localStorage.setItem('huggy-sub-tab', sub);
  }

  subTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const sub = (tab as HTMLElement).dataset.sub || 'chat';
      setSubTab(sub);
      addToHistory(`Switched to ${sub} tab`);
    });
  });

  // Initial tab
  setSubTab(savedSubTab);

  // ── DEVICE SWITCHER ──────────────────────────────────────────
  const savedDevice = localStorage.getItem('huggy-preview-device') || 'desktop';
  const previewFrame = document.getElementById('preview-frame');
  const deviceBtns = document.querySelectorAll('.device-btn');

  function setDevice(device: string) {
    deviceBtns.forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.device === device));
    if (previewFrame) {
      previewFrame.className = 'preview-frame';
      if (device !== 'desktop') previewFrame.classList.add(device);
    }
    localStorage.setItem('huggy-preview-device', device);
  }

  deviceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const d = (btn as HTMLElement).dataset.device || 'desktop';
      setDevice(d);
      addToHistory(`Toggle device: ${d}`);
    });
  });

  // Initial device
  setDevice(savedDevice);

  // ── CONSOLE TOGGLE ──────────────────────────────────────────
  const consolePanel = document.getElementById('console-panel');
  document.getElementById('console-toggle')?.addEventListener('click', () => {
    consolePanel?.classList.add('open');
  });
  document.getElementById('console-close')?.addEventListener('click', () => {
    consolePanel?.classList.remove('open');
  });

  // ── CONSOLE SUB TABS ────────────────────────────────────────
  document.querySelectorAll('.console-sub-tab:not(#console-close)').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.console-sub-tab:not(#console-close)').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // ── MODE SELECT LOGIC ────────────────────────────────────
  const chatTextarea = document.getElementById('ai-textarea') as HTMLTextAreaElement;
  const btnSend = document.getElementById('btn-send-builder') as HTMLButtonElement;
  const modeSelectWrap = document.getElementById('mode-select-wrap');
  const modeDropdownUI = document.getElementById('mode-dropdown-ui');
  const currentModeLabelUI = document.getElementById('current-mode-label-ui');
  const modeDotIndicator = document.getElementById('mode-dot-indicator');
  const modeOptions = document.querySelectorAll('.mode-opt');
  let currentMode = 'build';

  modeSelectWrap?.addEventListener('click', (e) => {
    e.stopPropagation();
    modeDropdownUI?.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    modeDropdownUI?.classList.remove('open');
  });

  modeOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = (opt as HTMLElement).dataset.mode || 'build';
      currentMode = mode;
      
      modeOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      
      if (currentModeLabelUI) currentModeLabelUI.textContent = mode;
      if (modeDotIndicator) {
        modeDotIndicator.className = 'mode-dot ' + mode;
      }
      
      if (currentMode === 'plan') {
        chatTextarea.placeholder = 'Search, brainstorm or explore...';
      } else {
        chatTextarea.placeholder = 'Ask a question or request a change...';
      }
      
      modeDropdownUI?.classList.remove('open');
      addToHistory(`Switched to ${currentMode} mode`);
    });
  });

  const modelSelectBtn = document.getElementById('model-select-btn');
  const modelDropdown = document.getElementById('model-dropdown');
  const modelLabel = document.getElementById('current-model-label');
  const modelOptions = document.querySelectorAll('.model-option');

  // Model Selector Logic
  modelSelectBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!modelDropdown) return;
    const isOpen = modelDropdown.classList.contains('open');
    modelDropdown.classList.toggle('open', !isOpen);
  });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (modelDropdown && !modelDropdown.contains(target)) {
      modelDropdown.classList.remove('open');
    }
  });

  modelOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      modelOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      if (modelLabel) modelLabel.textContent = (opt as HTMLElement).dataset.name || 'Auto';
      modelDropdown?.classList.remove('open');
    });
  });

  // Chat History context
  interface ChatMsg {
    role: 'user' | 'assistant' | 'system';
    content: string;
  }
  const chatHistory: ChatMsg[] = [
    { role: 'assistant', content: "Hello! I'm here to help you build your application. What would you like to create today?" }
  ];

  function handleSend() {
    const text = chatTextarea.value.trim();
    if (!text) return;
    const container = document.getElementById('chat-container');
    if (container) {
      // 1. Render user message
      const msg = document.createElement('div');
      msg.className = 'msg-user';
      msg.innerHTML = `<div class="msg-user-bubble">${text}</div><div class="msg-time">just now</div>`;
      container.appendChild(msg);
      container.scrollTop = container.scrollHeight;
      
      chatHistory.push({ role: 'user', content: text });
      chatTextarea.value = '';
      chatTextarea.style.height = 'auto';
      btnSend.disabled = true;

      // 2. Render thinking/typing indicator
      const loader = document.createElement('div');
      loader.className = 'msg-ai loading-ai';
      loader.innerHTML = `
        <div class="msg-ai-bubble" style="display:flex; align-items:center; gap:8px;">
          <span class="spinner" style="width:12px; height:12px;"></span>
          <span style="font-size:12px; color:var(--text-sub);">Thinking...</span>
        </div>
      `;
      container.appendChild(loader);
      container.scrollTop = container.scrollHeight;

      // 3. Extract customModelId
      const activeModelElement = document.querySelector('.model-option.active') as HTMLElement;
      const modelId = activeModelElement ? (activeModelElement.dataset.id || 'auto') : 'auto';

      // 4. API Request
      fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: chatHistory.map(m => ({ role: m.role, content: m.content })),
          mode: currentMode,
          customModelId: modelId,
          userId: 'anonymous'
        })
      })
      .then(async (response) => {
        const loadingBubble = container.querySelector('.loading-ai');
        if (loadingBubble) loadingBubble.remove();

        if (!response.ok) {
          let errMsg = 'Request failed';
          try {
            const errJson = await response.json() as any;
            errMsg = errJson.message || errJson.error || errMsg;
          } catch(e) {}
          throw new Error(errMsg);
        }

        const data = await response.json() as any;
        const aiReply = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || JSON.stringify(data);

        // Add to history
        chatHistory.push({ role: 'assistant', content: aiReply });

        // Render AI bubble
        const msgAi = document.createElement('div');
        msgAi.className = 'msg-ai';
        msgAi.innerHTML = `<div class="msg-ai-bubble">${aiReply.replace(/\n/g, '<br>')}</div><div class="msg-time">just now</div>`;
        container.appendChild(msgAi);
        container.scrollTop = container.scrollHeight;

        // Render system indicator
        const sysMsg = document.createElement('div');
        sysMsg.className = 'msg-system';
        if (currentMode === 'plan') {
          sysMsg.innerHTML = '── plan generated ──';
        } else {
          sysMsg.innerHTML = '── change applied ──';
        }
        container.appendChild(sysMsg);
        container.scrollTop = container.scrollHeight;
      })
      .catch((error) => {
        const loadingBubble = container.querySelector('.loading-ai');
        if (loadingBubble) loadingBubble.remove();

        const msgError = document.createElement('div');
        msgError.className = 'msg-ai';
        msgError.innerHTML = `
          <div class="msg-ai-bubble" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#f87171;">
            <strong>Error:</strong> ${error.message}
          </div>
        `;
        container.appendChild(msgError);
        container.scrollTop = container.scrollHeight;
      })
      .finally(() => {
        btnSend.disabled = chatTextarea.value.trim() === '';
      });

      addToHistory(`Chat: ${text.substring(0, 20)}...`);
    }
  }

  if (chatTextarea && btnSend) {
    chatTextarea.addEventListener('input', () => {
      btnSend.disabled = chatTextarea.value.trim() === '';
      chatTextarea.style.height = 'auto';
      chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 160) + 'px';
    });
    chatTextarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (chatTextarea.value.trim()) handleSend();
      }
    });
    btnSend.onclick = handleSend;
  }

  // ── COPY CODE ────────────────────────────────────────────────
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!');
    });
  }

  document.getElementById('btn-copy')?.addEventListener('click', function() {
    if (activeFile) {
      copyToClipboard(fileContents[activeFile] || '');
      this.textContent = 'Copied!';
      addToHistory(`Copied editor code`);
      setTimeout(() => { this.textContent = 'Copy'; }, 1500);
    }
  });

  document.getElementById('btn-copy-preview')?.addEventListener('click', function() {
    const code = previewCode?.textContent || '';
    copyToClipboard(code);
    this.textContent = 'Copied!';
    addToHistory(`Copied preview code`);
    setTimeout(() => { this.textContent = 'Copy'; }, 1500);
  });

  // ── DRAG RESIZE ─────────────────────────────────────────────
  function initResize() {
    const handleR = document.getElementById('handle-right');
    const layout = document.querySelector('.app-layout') as HTMLElement;
    
    if (handleR) {
        handleR.addEventListener('mousedown', e => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = mainPanel.offsetWidth;
        handleR.classList.add('dragging');
        const move = (ev: MouseEvent) => {
          const delta = ev.clientX - startX;
          const maxW = Math.max(360, window.innerWidth * 0.45); // Max 45% or 360px
          const w = Math.max(300, Math.min(startW + delta, maxW)); 
          layout.style.setProperty('--side-w', w + 'px');
          layout.style.gridTemplateColumns = `${w}px 4px 1fr`;
        };
        const up = () => {
          handleR.classList.remove('dragging');
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    }
  }
  initResize();

  // ── THEME TOGGLE ─────────────────────────────────────────────
  const html = document.documentElement;
  const curtain = document.getElementById('curtain');
  
  window.addEventListener('load', () => {
    if (curtain) curtain.classList.add('rising');
  });

  function navigate(url: string) {
    if (curtain) {
      curtain.classList.remove('rising');
      curtain.classList.add('falling');
      setTimeout(() => {
        window.location.href = url;
      }, 600);
    } else {
      window.location.href = url;
    }
  }

  // Intercept logo click
  document.querySelector('.logo')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/');
  });

  document.getElementById('btn-theme-builder')?.addEventListener('click', () => {
    const isDark = html.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    localStorage.setItem('huggy-theme', newTheme);
    
    if (curtain) {
      curtain.style.background = isDark ? '#F8F5F0' : '#060606';
      curtain.style.transformOrigin = 'top';
      curtain.classList.add('falling');
      setTimeout(() => {
        html.setAttribute('data-theme', newTheme);
        curtain.classList.remove('falling');
        requestAnimationFrame(() => {
          curtain.style.transformOrigin = 'bottom';
          curtain.classList.add('rising');
          setTimeout(() => {
            curtain.classList.remove('rising');
          }, 620);
        });
      }, 600);
    }
  });

  // ── UNDO / REDO MOCK ──────────────────────────────────────────
  let history: string[] = [];
  let historyIndex = -1;

  function addToHistory(action: string) {
    history = history.slice(0, historyIndex + 1);
    history.push(action);
    historyIndex++;
    console.log(`History: ${action} pushed`);
  }

  document.getElementById('btn-undo')?.addEventListener('click', () => {
    if (historyIndex >= 0) {
      const action = history[historyIndex];
      historyIndex--;
      console.log(`Undid: ${action}`);
      showToast(`Undid: ${action}`);
    }
  });

  document.getElementById('btn-redo')?.addEventListener('click', () => {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      const action = history[historyIndex];
      console.log(`Redid: ${action}`);
      showToast(`Redid: ${action}`);
    }
  });

  function showToast(msg: string) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 48px; left: 50%; transform: translateX(-50%);
      background: var(--bg-elevated); color: var(--text); padding: 8px 16px;
      border-radius: 6px; border: 1px solid var(--border-mid); font-size: 12px;
      z-index: 10000; animation: toastIn 0.3s ease forwards;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // Add styles for toast
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
    @keyframes toastOut { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, 20px); } }
  `;
  document.head.appendChild(style);

  // ── COLLAPSE LOGIC ────────────────────────────────────────────
  const btnCollapse = document.getElementById('btn-collapse-chat');

  btnCollapse?.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    btnCollapse.classList.toggle('collapsed', isCollapsed);
    updateLayout();
  });

  document.getElementById('btn-upgrade')?.addEventListener('click', () => {
    navigate('/pricing.html');
  });

  // ── KEYBOARD SHORTCUTS ────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        document.getElementById('btn-redo')?.click();
      } else {
        document.getElementById('btn-undo')?.click();
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
      e.preventDefault();
      document.getElementById('btn-redo')?.click();
    }
  });

  // ── INITIALIZE ────────────────────────────────────────────────
  updateLayout();

  // Check for initial prompt sync
  const initialPrompt = sessionStorage.getItem('huggy-initial-prompt');
  if (initialPrompt && chatTextarea) {
    chatTextarea.value = initialPrompt;
    handleSend();
    sessionStorage.removeItem('huggy-initial-prompt');
  }

  console.log('Builder initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBuilder);
} else {
  initBuilder();
}
