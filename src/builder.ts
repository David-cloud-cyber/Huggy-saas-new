import { getCurrentSession } from './lib/supabase';

function initBuilder() {
  // ── INITIAL THEME ───────────────────────────────────────────
  const savedTheme = localStorage.getItem('huggy-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // ── CODE CONTENT ────────────────────────────────────────────────
  const codeLines = [
    [`<span class="tok-keyword">import</span> React, { useState, useEffect } <span class="tok-keyword">from</span> <span class="tok-string">'react'</span>`, false],
    [`<span class="tok-keyword">import</span> { MetricsCard } <span class="tok-keyword">from</span> <span class="tok-string">'./MetricsCard'</span>`, false],
    [`<span class="tok-keyword">import</span> { Sidebar } <span class="tok-keyword">from</span> <span class="tok-string">'./Sidebar'</span>`, false],
    [`<span class="tok-keyword">import</span> { useData } <span class="tok-keyword">from</span> <span class="tok-string">'../hooks/useData'</span>`, false],
    [``, false],
    [`<span class="tok-keyword">interface</span> <span class="tok-function">DashboardProps</span> {`, false],
    [`  title: <span class="tok-keyword">string</span>`, false],
    [`  userId: <span class="tok-keyword">number</span>`, false],
    [`}`, false],
    [``, false],
    [`<span class="tok-keyword">export default function</span> <span class="tok-function">Dashboard</span>({ title, userId }: <span class="tok-function">DashboardProps</span>) {`, false],
    [`  <span class="tok-keyword">const</span> { metrics, isLoading } = <span class="tok-function">useData</span>(userId)`, false],
    [`  <span class="tok-keyword">const</span> [activeTab, setActiveTab] = <span class="tok-function">useState</span>(<span class="tok-string">'overview'</span>)`, false],
    [``, false],
    [`  <span class="tok-function">useEffect</span>(() => {`, false],
    [`    document.title = <span class="tok-string">\`\${title} — Dashboard\`</span>`, false],
    [`  }, [title])`, false],
    [``, false],
    [`  <span class="tok-keyword">if</span> (isLoading) <span class="tok-keyword">return</span> <span class="tok-tag">&lt;LoadingState /&gt;</span>`, false],
    [``, false],
    [`  <span class="tok-keyword">return</span> (`, false],
    [`    <span class="tok-tag">&lt;div</span> <span class="tok-attr">className</span>=<span class="tok-string">"dashboard"</span><span class="tok-tag">&gt;</span>`, false],
    [`      <span class="tok-tag">&lt;Sidebar</span> <span class="tok-attr">activeTab</span>={activeTab} <span class="tok-attr">onTabChange</span>={setActiveTab} <span class="tok-tag">/&gt;</span>`, false],
    [`      <span class="tok-tag">&lt;main</span> <span class="tok-attr">className</span>=<span class="tok-string">"main-content"</span><span class="tok-tag">&gt;</span>`, true],
    [`        <span class="tok-tag">&lt;div</span> <span class="tok-attr">className</span>=<span class="tok-string">"metrics-grid"</span><span class="tok-tag">&gt;</span>`, false],
    [`          {metrics.<span class="tok-function">map</span>(m => (`, false],
    [`            <span class="tok-tag">&lt;MetricsCard</span> <span class="tok-attr">key</span>={m.id} {...m} <span class="tok-tag">/&gt;</span>`, false],
    [`          ))}`, false],
    [`        <span class="tok-tag">&lt;/div&gt;</span>`, false],
    [`      <span class="tok-tag">&lt;/main&gt;</span>`, false],
    [`    <span class="tok-tag">&lt;/div&gt;</span>`, false],
    [`  )`, false],
    [`}`, false],
  ];

  const codeArea = document.getElementById('code-area');
  if (codeArea) {
    codeArea.innerHTML = '';
    codeLines.forEach((lineData, i) => {
      const html = lineData[0] as string;
      const isActive = lineData[1] as boolean;
      const line = document.createElement('div');
      line.className = 'code-line' + (isActive ? ' cursor-line' : '');
      line.innerHTML = `<span class="line-num">${i + 1}</span><span class="code-content">${html}${isActive ? '<span class="cursor"></span>' : ''}</span>`;
      codeArea.appendChild(line);
    });
  }

  // ── FILE TREE ───────────────────────────────────────────────────
  const fileTree = document.getElementById('file-tree');
  const previewArea = document.getElementById('file-preview-area');
  const previewEmpty = document.querySelector('.preview-empty');
  const previewContent = document.getElementById('preview-content');
  const previewCode = document.getElementById('preview-code');
  const previewFilename = document.getElementById('preview-filename');

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
    'Dashboard.tsx': `import React from 'react';\n\nexport default function Dashboard() {\n  return <div>Hello Huggy</div>;\n}`,
    'Sidebar.tsx': `import React from 'react';\n\nexport const Sidebar = () => <aside>Sidebar Content</aside>;`,
    'Header.tsx': `export const Header = () => <header>Logo</header>;`,
    'MetricsCard.tsx': `export const MetricsCard = ({ val }) => <div className="card">{val}</div>;`,
    'useData.ts': `export const useData = () => ({ data: [], loading: false });`,
    'useTheme.ts': `export const useTheme = () => 'dark';`,
    'utils.ts': `export const cn = (...args) => args.filter(Boolean).join(' ');`,
    'api.ts': `export const fetchData = async () => fetch('/api');`,
    'App.tsx': `import { Dashboard } from './components/Dashboard';\n\nexport const App = () => <Dashboard />;`,
    'main.tsx': `import React from 'react';\nimport ReactDOM from 'react-dom';\nimport { App } from './App';\n\nReactDOM.render(<App />, document.getElementById('root'));`,
    'index.html': `<!DOCTYPE html>\n<html>\n<head>\n  <title>App</title>\n</head>\n<body>\n  <div id="root"></div>\n</body>\n</html>`,
    'package.json': `{\n  "name": "huggy-app",\n  "version": "1.0.0",\n  "dependencies": {\n    "react": "^18.0.0"\n  }\n}`,
    'tailwind.config.js': `module.exports = {\n  content: ["./src/**/*.{ts,tsx}"],\n  theme: { extend: {} }\n};`,
    'tsconfig.json': `{\n  "compilerOptions": {\n    "target": "ESNext",\n    "module": "ESNext"\n  }\n}`
  };
  
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
    previewCode.textContent = fileContents[name] || `// Content for ${name}\n// File content will appear after the next generation or sync.`;
  }

  const structure = [
    { type: 'folder', name: 'src', children: [
      { type: 'folder', name: 'components', children: [
        { type: 'file', name: 'Dashboard.tsx', size: '2.4kb', active: true },
        { type: 'file', name: 'Sidebar.tsx', size: '1.8kb' },
        { type: 'file', name: 'Header.tsx', size: '0.9kb' },
        { type: 'file', name: 'MetricsCard.tsx', size: '1.2kb' },
      ]},
      { type: 'folder', name: 'hooks', children: [
        { type: 'file', name: 'useData.ts', size: '0.6kb' },
        { type: 'file', name: 'useTheme.ts', size: '0.4kb' },
      ]},
      { type: 'folder', name: 'lib', children: [
        { type: 'file', name: 'utils.ts', size: '0.3kb' },
        { type: 'file', name: 'api.ts', size: '1.1kb' },
      ]},
      { type: 'file', name: 'App.tsx', size: '0.8kb' },
      { type: 'file', name: 'main.tsx', size: '0.2kb' },
    ]},
    { type: 'folder', name: 'public', children: [
      { type: 'file', name: 'index.html', size: '0.4kb' },
    ]},
    { type: 'file', name: 'package.json', size: '0.5kb' },
    { type: 'file', name: 'tailwind.config.js', size: '0.3kb' },
    { type: 'file', name: 'tsconfig.json', size: '0.3kb' },
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
        fi.className = 'file-item' + (item.active ? ' active' : '');
        fi.innerHTML = `
          ${getIcon(item)}
          <span class="file-name">${item.name}</span>
          <span class="file-size">${item.size}</span>`;
        fi.addEventListener('click', () => {
          document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
          fi.classList.add('active');
          updatePreview(item.name);
          addToHistory(`Viewed ${item.name}`);
        });
        container.appendChild(fi);
      }
    });
  }

  if (fileTree) {
    fileTree.innerHTML = '';
    renderTree(structure, fileTree);
  }

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
    const tabVersions = document.getElementById('tab-versions');
    const tabDomains = document.getElementById('tab-domains');
    const tabBackend = document.getElementById('tab-backend');
    
    if (tabChat) tabChat.classList.toggle('hidden', sub !== 'chat');
    if (tabCode) tabCode.classList.toggle('hidden', sub !== 'code');
    if (tabFiles) tabFiles.classList.toggle('hidden', sub !== 'files');
    if (tabVersions) tabVersions.classList.toggle('hidden', sub !== 'versions');
    if (tabDomains) tabDomains.classList.toggle('hidden', sub !== 'domains');
    if (tabBackend) tabBackend.classList.toggle('hidden', sub !== 'backend');
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
  const previewFrame = document.getElementById('preview-frame') as HTMLIFrameElement | null;
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

  async function handleSend() {
    const text = chatTextarea.value.trim();
    if (!text) return;
    const container = document.getElementById('chat-container');
    if (container) {
      const msg = document.createElement('div');
      msg.className = 'msg-user';
      const bubble = document.createElement('div');
      bubble.className = 'msg-user-bubble';
      bubble.textContent = text;
      const time = document.createElement('div');
      time.className = 'msg-time';
      time.textContent = 'just now';
      msg.append(bubble, time);
      container.appendChild(msg);
      container.scrollTop = container.scrollHeight;
      chatTextarea.value = '';
      chatTextarea.style.height = 'auto';
      btnSend.disabled = true;

      try {
        const activeModel = document.querySelector('.model-option.active') as HTMLElement | null;
        const modelName = activeModel?.dataset.name || 'Gemini 3 Flash';
        const modelMap: Record<string, string> = {
          'Claude Sonnet 4.6': 'anthropic/claude-sonnet-4.6',
          'Claude Opus 4.7': 'anthropic/claude-opus-4.7',
          'Gemini 3 Pro': 'google/gemini-3-pro',
          'Gemini 3 Flash': 'google/gemini-3-flash',
          Auto: 'google/gemini-3-flash',
        };
        const result = await platformApi<{ message?: string; version?: { id: string }; files?: { path: string }[] }>(`/api/projects/${requireProjectId()}/messages`, {
          prompt: text,
          mode: currentMode,
          model: modelMap[modelName] || 'google/gemini-3-flash',
        });
        const sysMsg = document.createElement('div');
        sysMsg.className = 'msg-system';
        sysMsg.textContent = currentMode === 'plan' ? '── plan generated from OpenRouter ──' : '── AI generation persisted ──';
        container.appendChild(sysMsg);
        const assistantMsg = document.createElement('div');
        assistantMsg.className = 'msg-system';
        assistantMsg.textContent = (result.message || 'Application generated.').slice(0, 900);
        container.appendChild(assistantMsg);
        if (result.files?.length) {
          structure.length = 0;
          result.files.forEach((file) => structure.push({ type: 'file', name: file.path, size: 'persisted' }));
          if (fileTree) {
            fileTree.innerHTML = '';
            renderTree(structure, fileTree);
          }
        }
        container.scrollTop = container.scrollHeight;
        showToast(`Version ${result.version?.id?.slice(0, 8) || 'active'} persistée`);
      } catch (error) {
        const sysMsg = document.createElement('div');
        sysMsg.className = 'msg-system';
        sysMsg.textContent = error instanceof Error ? error.message : 'Erreur IA backend';
        container.appendChild(sysMsg);
        container.scrollTop = container.scrollHeight;
      } finally {
        btnSend.disabled = false;
      }

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
    const code = codeLines.map(l => {
      const temp = document.createElement('div');
      temp.innerHTML = l[0] as string;
      return temp.textContent || '';
    }).join('\n');
    copyToClipboard(code);
    this.textContent = 'Copied!';
    addToHistory(`Copied editor code`);
    setTimeout(() => { this.textContent = 'Copy'; }, 1500);
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
    showToast('Redirecting to upgrade page...');
  });

  const previewStatus = document.getElementById('preview-status');
  const previewUrl = document.getElementById('preview-url');
  const projectId = window.location.pathname.match(/\/projects\/([^/]+)/)?.[1];

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

  function requireProjectId(): string {
    if (!projectId) throw new Error('Projet introuvable dans l’URL.');
    return projectId;
  }

  function appendConsoleLine(message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const logArea = document.querySelector('.console-log-area');
    if (!logArea) return;
    const line = document.createElement('div');
    line.className = 'log-line';
    const seconds = (performance.now() / 1000).toFixed(1).padStart(4, '0');
    line.innerHTML = `<span class="log-ts">[${seconds}]</span><span class="log-${level}">${message}</span>`;
    logArea.appendChild(line);
    logArea.scrollTop = logArea.scrollHeight;
  }

  async function syncProjectStream() {
    const stream = await platformApi<{ events: { type: string; severity?: 'info' | 'success' | 'warning' | 'error'; payload?: Record<string, unknown> }[]; build_logs: { level: 'info' | 'success' | 'warning' | 'error'; message: string }[] }>(`/api/projects/${requireProjectId()}/stream`);
    const logArea = document.querySelector('.console-log-area');
    if (logArea) logArea.innerHTML = '';
    stream.events.forEach((event) => appendConsoleLine(`${event.type}${event.payload?.version_id ? ` · ${event.payload.version_id}` : ''}`, event.severity || 'info'));
    stream.build_logs.forEach((log) => appendConsoleLine(log.message, log.level || 'info'));
    return stream;
  }

  function setPreviewState(status: string, url: string) {
    if (previewStatus) previewStatus.textContent = status;
    if (previewUrl) previewUrl.textContent = url;
    if (previewFrame && /^https?:\/\//.test(url)) previewFrame.src = url;
  }

  document.getElementById('btn-build-preview')?.addEventListener('click', async () => {
    try {
      setPreviewState('building', 'build queued');
      showToast('Build job lancé');
      const buildResult = await platformApi<{ logs?: { level: 'info' | 'success' | 'warning' | 'error'; message: string }[] }>(`/api/projects/${requireProjectId()}/build`, {});
      buildResult.logs?.forEach((log) => appendConsoleLine(log.message, log.level));
      const result = await platformApi<{ deployment: { url?: string; preview_url?: string } }>('/api/deploy', { project_id: requireProjectId(), target: 'preview' });
      setPreviewState('ready', result.deployment.preview_url || result.deployment.url || 'preview ready');
      appendConsoleLine('Preview Vercel deployment created', 'success');
      showToast('Preview Vercel créé');
    } catch (error) {
      setPreviewState('failed', 'preview failed');
      appendConsoleLine(error instanceof Error ? error.message : 'Erreur preview', 'error');
      showToast(error instanceof Error ? error.message : 'Erreur preview');
    }
  });

  document.getElementById('btn-refresh-preview')?.addEventListener('click', async () => {
    try {
      const stream = await syncProjectStream();
      showToast(`Logs synchronisés: ${stream.events.length} events, ${stream.build_logs.length} logs`);
      setPreviewState('ready', previewUrl?.textContent || 'stream refreshed');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erreur refresh');
    }
  });

  document.getElementById('btn-deploy-project')?.addEventListener('click', async () => {
    try {
      showToast('Déploiement production Vercel...');
      setPreviewState('deploying', 'deployment pending');
      const result = await platformApi<{ deployment: { url?: string; production_url?: string } }>('/api/deploy', { project_id: requireProjectId(), target: 'production' });
      setPreviewState('ready', result.deployment.production_url || result.deployment.url || 'production deployed');
      appendConsoleLine('Production Vercel deployment created', 'success');
      showToast('Production Vercel déployée');
    } catch (error) {
      setPreviewState('failed', 'deployment failed');
      appendConsoleLine(error instanceof Error ? error.message : 'Erreur déploiement', 'error');
      showToast(error instanceof Error ? error.message : 'Erreur déploiement');
    }
  });

  document.getElementById('btn-rollback-version')?.addEventListener('click', () => {
    showToast('Rollback restored selected version');
  });

  document.getElementById('btn-add-domain')?.addEventListener('click', async () => {
    const hostname = window.prompt('Domaine custom à ajouter');
    if (!hostname) return;
    try {
      const result = await platformApi<{ dns: { type: string; name: string; value: string } }>('/api/domains', { project_id: requireProjectId(), hostname });
      showToast(`DNS ${result.dns.type}: ${result.dns.name} → ${result.dns.value}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erreur domaine');
    }
  });

  // ── KEYBOARD SHORTCUTS ────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        document.getElementById('btn-redo')?.click();
      } else {
        document.getElementById('btn-undo')?.click();
      }
    }
    if (mod && key === 'y') {
      e.preventDefault();
      document.getElementById('btn-redo')?.click();
    }
    if (mod && key === 'enter') {
      e.preventDefault();
      if (chatTextarea.value.trim()) void handleSend();
    }
    if (mod && key === 'k') {
      e.preventDefault();
      setSubTab('chat');
      chatTextarea.focus();
      showToast('Chat prêt');
    }
    if (mod && key === 'b') {
      e.preventDefault();
      document.getElementById('btn-build-preview')?.click();
    }
    if (mod && key === 'd') {
      e.preventDefault();
      document.getElementById('btn-deploy-project')?.click();
    }
    if (mod && e.shiftKey && key === 'p') {
      e.preventDefault();
      (document.querySelector('[data-view="preview"]') as HTMLButtonElement | null)?.click();
    }
    if (mod && e.key === '`') {
      e.preventDefault();
      consolePanel?.classList.toggle('open');
    }
    if (e.key === 'Escape') {
      consolePanel?.classList.remove('open');
      modelDropdown?.classList.remove('open');
      modeDropdownUI?.classList.remove('open');
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
