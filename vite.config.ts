import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function discoverHtmlInputs(root: string) {
  const ignored = new Set(['dist', 'node_modules', '.git', '.vscode', '.railway']);
  const inputs: Record<string, string> = {};

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      const relative = path.relative(root, fullPath).replace(/\\/g, '/');
      const key = relative.replace(/\/index\.html$/, '').replace(/\.html$/, '').replace(/\//g, '_') || 'main';
      inputs[key] = fullPath;
    }
  }

  walk(root);
  return inputs;
}

export default defineConfig(() => {
  return {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        input: discoverHtmlInputs(__dirname),
        output: {
          manualChunks(id) {
            const normalized = id.replace(/\\/g, '/');
            if (normalized.includes('/node_modules/@supabase/')) return 'vendor-supabase';
            if (
              normalized.includes('/node_modules/react/') ||
              normalized.includes('/node_modules/react-dom/') ||
              normalized.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (
              normalized.includes('/node_modules/lucide-react/') ||
              normalized.includes('/node_modules/motion/') ||
              normalized.includes('/node_modules/nanoid/')
            ) {
              return 'vendor-ai-ui';
            }
            if (
              normalized.includes('/src/builder-conversation-island') ||
              normalized.includes('/src/components/ai-elements/')
            ) {
              return 'builder-chat-ui';
            }
            if (normalized.includes('/src/settings-panel')) return 'settings-panel';
          },
        },
        onwarn(warning, defaultHandler) {
          const message = String(warning.message || '');
          if (
            warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
            message.includes('use client')
          ) {
            return;
          }
          if (
            message.includes("Module level directives cause errors when bundled") &&
            message.includes('use client')
          ) {
            return;
          }
          defaultHandler(warning);
        },
      },
    },
  };
});
