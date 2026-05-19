import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { handleRuntimeApi } from './src/platform/runtime-api.mjs';

const root = resolve('dist');
const port = Number(process.env.PORT ?? 3000);

const routeMap = new Map([
  ['/', 'index.html'],
  ['/dashboard', 'dashboard.html'],
  ['/projects', 'dashboard.html'],
  ['/projects/new', 'dashboard.html'],
  ['/billing', 'pricing.html'],
  ['/login', 'index.html'],
  ['/signup', 'index.html'],
  ['/organization/settings', 'dashboard.html'],
]);

const dynamicRoutePatterns = [
  { pattern: /^\/projects\/[^/]+$/, file: 'builder.html' },
  { pattern: /^\/projects\/[^/]+\/editor$/, file: 'builder.html' },
  { pattern: /^\/projects\/[^/]+\/preview$/, file: 'builder.html' },
  { pattern: /^\/projects\/[^/]+\/versions$/, file: 'builder.html' },
  { pattern: /^\/projects\/[^/]+\/deployments$/, file: 'builder.html' },
  { pattern: /^\/projects\/[^/]+\/domains$/, file: 'builder.html' },
  { pattern: /^\/projects\/[^/]+\/settings$/, file: 'builder.html' },
];

function apiCorsHeaders(request) {
  const headers = {
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  const origin = request.headers.origin;
  if (!origin) return headers;
  try {
    const hostname = new URL(origin).hostname;
    const publicDomain = process.env.APP_PUBLIC_DOMAIN;
    const appUrl = process.env.VITE_APP_URL ? new URL(process.env.VITE_APP_URL) : null;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    const isAppUrl = appUrl ? hostname === appUrl.hostname : false;
    const isPublicDomain = publicDomain ? hostname === publicDomain || hostname.endsWith(`.${publicDomain}`) : false;
    if (isLocal || isAppUrl || isPublicDomain) headers['access-control-allow-origin'] = origin;
  } catch {
    // Ignore invalid Origin headers; the browser will enforce the missing ACAO response.
  }
  return headers;
}

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

function resolveRoute(pathname) {
  if (routeMap.has(pathname)) return routeMap.get(pathname);
  const dynamicMatch = dynamicRoutePatterns.find((entry) => entry.pattern.test(pathname));
  if (dynamicMatch) return dynamicMatch.file;
  if (pathname.endsWith('.html')) return pathname.slice(1);
  return pathname.slice(1);
}

function safePath(relativePath) {
  const candidate = resolve(root, normalize(relativePath));
  if (!candidate.startsWith(root)) return null;
  return candidate;
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (url.pathname.startsWith('/api/') && request.method === 'OPTIONS') {
    response.writeHead(204, apiCorsHeaders(request));
    response.end();
    return;
  }
  if (url.pathname === '/api/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...apiCorsHeaders(request) });
    response.end(JSON.stringify({ ok: true, service: 'huggy-control-center', timestamp: new Date().toISOString() }));
    return;
  }
  if (url.pathname === '/api/platform/status') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...apiCorsHeaders(request) });
    response.end(JSON.stringify({
      railway: true,
      vercel: Boolean(process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN),
      supabase: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_URL),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    }));
    return;
  }
  if (await handleRuntimeApi(request, response, url)) return;
  if (url.pathname === '/api/webhooks/vercel') {
    if (request.method !== 'POST') {
      response.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    response.writeHead(202, { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' });
    response.end(JSON.stringify({ accepted: true }));
    return;
  }
  const relativePath = resolveRoute(url.pathname);
  const filePath = safePath(relativePath);

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Not found</title><h1>Page not found</h1>');
    return;
  }

  response.writeHead(200, {
    'content-type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'SAMEORIGIN',
  });
  createReadStream(filePath).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`Huggy production server listening on ${port}`);
});
