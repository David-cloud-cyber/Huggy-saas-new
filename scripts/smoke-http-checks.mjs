const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';

const routes = [
  '/',
  '/dashboard',
  '/projects',
  '/projects/new',
  '/projects/project_test',
  '/projects/project_test/editor',
  '/projects/project_test/preview',
  '/projects/project_test/versions',
  '/projects/project_test/deployments',
  '/projects/project_test/domains',
  '/projects/project_test/settings',
  '/billing',
  '/organization/settings',
  '/login',
  '/signup',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const route of routes) {
  const response = await fetch(`${baseUrl}${route}`);
  assert(response.ok, `${route} returned ${response.status}`);
  const html = await response.text();
  assert(html.includes('<!DOCTYPE html>') || html.includes('<!doctype html>'), `${route} did not return HTML`);
  assert(!html.includes('OPENROUTER_API_KEY'), `${route} leaked OpenRouter env name into HTML`);
  assert(!/sk-[a-zA-Z0-9_-]{20,}/.test(html), `${route} leaked a secret-like token`);
}

const dashboard = await fetch(`${baseUrl}/dashboard`).then((response) => response.text());
assert(dashboard.includes('Nouveau projet'), 'dashboard missing Nouveau projet CTA');
assert(dashboard.includes('id="ai-textarea"'), 'dashboard missing AI prompt textarea');
assert(dashboard.includes('id="model-dropdown"'), 'dashboard missing model selector');

const editor = await fetch(`${baseUrl}/projects/project_test/editor`).then((response) => response.text());
assert(editor.includes('id="chat-container"'), 'editor missing chat container');
assert(editor.includes('id="preview-frame"'), 'editor missing preview frame');
assert(editor.includes('btn-deploy'), 'editor missing deploy action');

console.log('HTTP smoke checks passed');
