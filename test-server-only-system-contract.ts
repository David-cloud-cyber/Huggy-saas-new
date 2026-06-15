import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const clientEntryFiles = [
  'src/builder-live.ts',
  'src/dashboard-live.ts',
  'src/auth.ts',
  'src/settings-panel.ts',
  'src/builder-conversation-island.tsx',
];

for (const relativePath of clientEntryFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert.ok(
    !source.includes('agent-prompt-stack') && !source.includes('huggy-system-contract'),
    `${relativePath} must not import or expose server-only Huggy prompts`,
  );
}

const viteConfig = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
assert.ok(!viteConfig.includes('process.env.GEMINI_API_KEY'), 'Vite must never inject GEMINI_API_KEY into client bundles');
assert.ok(!viteConfig.includes('loadEnv('), 'Vite config must not load unrestricted server environment variables');

console.log('server-only system contract ok');
