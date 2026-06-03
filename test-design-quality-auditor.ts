import assert from 'node:assert/strict';
import {
  auditGeneratedDesign,
  auditGeneratedFunctionality,
} from './src/services/design-quality-auditor.ts';

const goodFiles = [
  {
    path: 'package.json',
    language: 'json',
    content: JSON.stringify({
      scripts: {
        dev: 'vite',
        build: 'vite build',
        test: 'vitest run',
        lint: 'tsc --noEmit',
      },
      dependencies: {
        '@vitejs/plugin-react': 'latest',
        vite: 'latest',
        react: 'latest',
        'react-dom': 'latest',
      },
    }),
  },
  {
    path: 'index.html',
    language: 'html',
    content: '<!doctype html><html><head><title>AI Studio</title><meta name="description" content="AI tool"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  },
  {
    path: 'src/main.tsx',
    language: 'tsx',
    content: 'import React from "react"; import { createRoot } from "react-dom/client"; import App from "./App"; createRoot(document.getElementById("root")!).render(<App />);',
  },
  {
    path: 'src/App.tsx',
    language: 'tsx',
    content: `
      import { useState } from "react";
      export default function App() {
        const [prompt, setPrompt] = useState("");
        const [status, setStatus] = useState("empty");
        const [messages, setMessages] = useState(["Prompt history"]);
        function send() {
          if (!prompt.trim()) { setStatus("error"); return; }
          setMessages([...messages, prompt]);
          setStatus("success");
        }
        return <main aria-label="AI tool workspace">
          <h1>AI workflow preview</h1>
          <p>Prompt, message stream, model status, preview output and usage status.</p>
          <form onSubmit={(event) => { event.preventDefault(); send(); }}>
            <label>Prompt <input required value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
            <button type="submit" onClick={send}>Generate preview</button>
          </form>
          <section>{status === "error" ? "Validation error" : status === "success" ? "Output ready" : "Empty conversation"}</section>
          <aside>Model selector and streaming checks</aside>
        </main>;
      }
    `,
  },
  {
    path: 'src/index.css',
    language: 'css',
    content: `
      :root { --bg: #fcfbf8; --text: #1c1c1c; --space-4: 16px; --radius: 16px; --motion: 160ms; }
      body { background: var(--bg); color: var(--text); }
      button { transition: transform var(--motion) cubic-bezier(.22,1,.36,1); }
      button:hover { transform: translateY(-1px); }
      button:focus-visible, input:focus-visible { outline: 2px solid #2457d6; }
      .skeleton { animation: pulse 1.2s infinite; }
      @keyframes pulse { from { opacity: .6; } to { opacity: 1; } }
      @media (max-width: 720px) { main { display: grid; grid-template-columns: 1fr; } }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    `,
  },
];

const weakFiles = [
  {
    path: 'index.html',
    language: 'html',
    content: '<!doctype html><html><head><title>Demo</title></head><body><h1>Welcome to your app</h1><button>Click me</button><section>Feature 1</section><style>.hero{background:linear-gradient(135deg,#667eea,#764ba2)}</style></body></html>',
  },
];

const designChecks = auditGeneratedDesign({
  files: goodFiles,
  previewHtml: goodFiles[1].content,
  platformType: 'ai_tool',
  designDirection: 'dense_devtool',
});
assert.equal(designChecks.find(check => check.key === 'design_score')?.status, 'pass');
assert.equal(designChecks.find(check => check.key === 'design_platform_fit')?.status, 'pass');

const functionalityChecks = auditGeneratedFunctionality({
  files: goodFiles,
  previewHtml: goodFiles[1].content,
  platformType: 'ai_tool',
  hasExistingFiles: false,
});
assert.equal(functionalityChecks.find(check => check.key === 'functionality_modern_project')?.status, 'pass');
assert.equal(functionalityChecks.find(check => check.key === 'functionality_score')?.status, 'pass');

const weakDesign = auditGeneratedDesign({
  files: weakFiles,
  previewHtml: weakFiles[0].content,
  platformType: 'landing_page',
  designDirection: 'cinematic_landing',
});
assert.equal(weakDesign.find(check => check.key === 'design_no_ai_gradient')?.status, 'fail');
assert.notEqual(weakDesign.find(check => check.key === 'design_score')?.status, 'pass');

const weakFunctionality = auditGeneratedFunctionality({
  files: weakFiles,
  previewHtml: weakFiles[0].content,
  platformType: 'landing_page',
  hasExistingFiles: false,
});
assert.equal(weakFunctionality.find(check => check.key === 'functionality_modern_project')?.status, 'fail');
assert.equal(weakFunctionality.find(check => check.key === 'functionality_primary_controls')?.status, 'fail');

console.log('test-design-quality-auditor passed');
