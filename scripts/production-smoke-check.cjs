const baseUrl = (process.env.HUGGY_PROD_URL || 'https://www.huggy.fun').replace(/\/+$/, '');
const paths = ['/', '/auth.html', '/pricing.html', '/builder.html'];

async function check(path) {
  const url = `${baseUrl}${path}`;
  const startedAt = Date.now();
  const response = await fetch(url, { redirect: 'follow' });
  const duration = Date.now() - startedAt;
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/javascript|text\/css/i.test(contentType)) {
    throw new Error(`${url} returned unexpected content-type: ${contentType || 'unknown'}`);
  }
  console.log(`[prod-smoke] ${path} ${response.status} ${duration}ms`);
}

for (const path of paths) {
  await check(path);
}

console.log('[prod-smoke] public pages reachable');
