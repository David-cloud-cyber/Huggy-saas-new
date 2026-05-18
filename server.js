import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

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

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
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
