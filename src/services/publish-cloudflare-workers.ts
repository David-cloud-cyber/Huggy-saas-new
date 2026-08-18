import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CF_API = 'https://api.cloudflare.com/client/v4';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function accountId() { return env('CLOUDFLARE_ACCOUNT_ID'); }
function apiToken() { return env('CLOUDFLARE_API_TOKEN'); }
function zoneId() { return env('CLOUDFLARE_ZONE_ID_HUGGY_FUN'); }

async function cfJson<T = any>(endpoint: string, init: RequestInit = {}, token = apiToken()): Promise<T> {
  const bodyIsMultipart = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!bodyIsMultipart && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${CF_API}${endpoint}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.errors?.[0]?.message || payload?.message || `Cloudflare returned ${response.status}`) as any;
    error.statusCode = response.status;
    throw error;
  }
  return (payload?.result ?? payload) as T;
}

function safeWorkerName(slug: string) {
  const safe = String(slug || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 51) || 'app';
  return `huggy-${safe}`;
}

function walkFiles(root: string) {
  const result: Array<{ path: string; absolutePath: string; content: Buffer }> = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolutePath);
      else if (entry.isFile()) {
        result.push({
          path: `/${path.relative(root, absolutePath).split(path.sep).join('/')}`,
          absolutePath,
          content: fs.readFileSync(absolutePath),
        });
      }
    }
  };
  walk(root);
  return result;
}

function contentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  } as Record<string, string>)[ext] || 'application/octet-stream';
}

async function uploadAssetBatch(token: string, batch: Array<{ hash: string; content: Buffer; filePath: string }>) {
  const form = new FormData();
  for (const asset of batch) {
    // Cloudflare expects the file part value to be base64 encoded and the
    // hash to be used as the multipart field name.
    form.append(asset.hash, new Blob([asset.content.toString('base64')], {
      type: contentType(asset.filePath),
    }));
  }
  const response = await fetch(`${CF_API}/accounts/${accountId()}/workers/assets/upload?base64=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.errors?.[0]?.message || `Cloudflare asset upload failed (${response.status})`);
  }
  return String(payload?.result?.jwt || payload?.jwt || '');
}

function workerSource() {
  return [
    'export default {',
    '  async fetch(request, env) {',
    '    return env.ASSETS.fetch(request);',
    '  },',
    '};',
    '',
  ].join('\n');
}

export type CloudflareWorkerPublishResult = {
  cfName: string;
  subdomain: string;
  defaultUrl: string;
  huggyUrl: string;
  deploymentId: string;
  deploymentUrl: string;
};

export async function publishProjectToCloudflareWorkers(input: {
  slug: string;
  distDir: string;
}): Promise<CloudflareWorkerPublishResult> {
  if (!fs.existsSync(input.distDir)) throw new Error(`dist directory not found: ${input.distDir}`);

  const workerName = safeWorkerName(input.slug);
  const files = walkFiles(input.distDir);
  if (!files.length) throw new Error('Cannot publish an empty Worker asset directory.');

  const assets = files.map(file => ({
    ...file,
    hash: crypto.createHash('sha256').update(file.content).digest('hex').slice(0, 32),
  }));
  const manifest = Object.fromEntries(assets.map(file => [file.path, { hash: file.hash, size: file.content.length }]));
  const uploadSession: any = await cfJson(`/accounts/${accountId()}/workers/scripts/${workerName}/assets-upload-session`, {
    method: 'POST',
    body: JSON.stringify({ manifest }),
  });
  const uploadToken = String(uploadSession?.jwt || '');
  if (!uploadToken) throw new Error('Cloudflare did not return an asset upload token.');

  const requestedHashes = new Set<string>(
    (uploadSession?.buckets || []).flatMap((bucket: unknown) => Array.isArray(bucket) ? bucket.map(String) : []),
  );
  let completionToken = uploadToken;
  if (requestedHashes.size) {
    const byHash = new Map(assets.map(file => [file.hash, file]));
    const batches = Array.from(requestedHashes).map(hash => byHash.get(hash)).filter(Boolean).map(file => ({
      hash: file!.hash,
      content: file!.content,
      filePath: file!.path,
    }));
    for (let index = 0; index < batches.length; index += 20) {
      const result = await uploadAssetBatch(uploadToken, batches.slice(index, index + 20));
      if (result) completionToken = result;
    }
  }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({
    main_module: 'main.js',
    compatibility_date: process.env.CLOUDFLARE_COMPATIBILITY_DATE || '2026-07-03',
    assets: { jwt: completionToken, not_found_handling: 'single-page-application' },
    bindings: [{ name: 'ASSETS', type: 'assets' }],
  })], { type: 'application/json' }), 'metadata.json');
  form.append('main.js', new Blob([workerSource()], { type: 'application/javascript' }), 'main.js');

  const deployment = await cfJson<any>(`/accounts/${accountId()}/workers/scripts/${workerName}`, {
    method: 'PUT',
    body: form,
  });

  const host = `${String(input.slug).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}.huggy.fun`;
  await cfJson(`/accounts/${accountId()}/workers/domains`, {
    method: 'PUT',
    body: JSON.stringify({ hostname: host, service: workerName }),
  });

  const url = `https://${host}`;
  const workersDevUrl = `https://${workerName}.workers.dev`;
  return {
    cfName: workerName,
    subdomain: `${workerName}.workers.dev`,
    defaultUrl: workersDevUrl,
    huggyUrl: url,
    deploymentId: String(deployment?.id || deployment?.etag || deployment?.version_id || `${workerName}-${Date.now()}`),
    deploymentUrl: workersDevUrl,
  };
}

export async function attachWorkerCustomDomain(workerName: string, domain: string) {
  return cfJson(`/accounts/${accountId()}/workers/domains`, {
    method: 'PUT',
    body: JSON.stringify({ hostname: domain, service: workerName }),
  });
}

export async function getWorkerDomainStatus(workerName: string, domain: string) {
  const query = new URLSearchParams({ hostname: domain, service: workerName });
  const domains = await cfJson<any[]>(`/accounts/${accountId()}/workers/domains?${query.toString()}`);
  const match = domains.find(item => item.hostname === domain && item.service === workerName);
  return {
    domain,
    status: match ? 'active' : 'pending',
    certificate_status: match?.cert_id ? 'active' : 'pending',
  };
}

export async function removeCloudflareWorker(workerName: string) {
  await cfJson(`/accounts/${accountId()}/workers/scripts/${workerName}`, { method: 'DELETE' });
}
