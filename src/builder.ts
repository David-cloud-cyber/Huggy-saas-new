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
  const extColor: Record<string, string> = { tsx: '#60A5FA', css: '#A78BFA', ts: '#34D399', json: '#FBBF24', js: '#FBBF24', html: '#F87171' };
  
  function getColor(name: string) {
    const ext = name.split('.').pop() || '';
    return extColor[ext] || '#606060';
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
          <span class="file-dot" style="background:${getColor(item.name)}"></span>
          <span class="file-name">${item.name}</span>
          <span class="file-size">${item.size}</span>`;
        fi.addEventListener('click', () => {
          document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
          fi.classList.add('active');
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
  let currentMode = 'agent';

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
      const mode = (opt as HTMLElement).dataset.mode || 'agent';
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

  function handleSend() {
    const text = chatTextarea.value.trim();
    if (!text) return;
    const container = document.getElementById('chat-container');
    if (container) {
      const msg = document.createElement('div');
      msg.className = 'msg-user';
      msg.innerHTML = `<div class="msg-user-bubble">${text}</div><div class="msg-time">just now</div>`;
      container.appendChild(msg);
      container.scrollTop = container.scrollHeight;
      chatTextarea.value = '';
      chatTextarea.style.height = 'auto';
      btnSend.disabled = true;

      setTimeout(() => {
        const sysMsg = document.createElement('div');
        sysMsg.className = 'msg-system';
        if (currentMode === 'plan') {
          sysMsg.innerHTML = '── plan generated ──';
        } else {
          sysMsg.innerHTML = '── change applied ──';
        }
        container.appendChild(sysMsg);
        container.scrollTop = container.scrollHeight;
      }, 2000);

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
  document.getElementById('btn-copy')?.addEventListener('click', function() {
    this.textContent = 'Copied!';
    addToHistory(`Copied code to clipboard`);
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
  const curtain = document.getElementById('curtain-overlay');
  document.getElementById('btn-theme-builder')?.addEventListener('click', () => {
    const isDark = html.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    localStorage.setItem('huggy-theme', newTheme);
    
    if (curtain) {
      curtain.style.background = isDark ? '#F8F5F0' : '#060606';
      curtain.classList.remove('sweep');
      void curtain.offsetWidth; // reflow
      curtain.classList.add('sweep');
      setTimeout(() => {
        html.setAttribute('data-theme', newTheme);
      }, 250);
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
