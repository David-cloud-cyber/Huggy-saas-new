const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicPages = [
  'index.html', 'pricing.html', 'features.html', 'documentation.html',
  'enterprise.html', 'security.html', 'privacy.html', 'about.html',
  'showcase.html', 'blog.html', 'community.html', 'careers.html',
  'api-reference.html', 'discover.html', 'terms.html',
];
const privatePages = ['auth.html', 'dashboard.html', 'builder.html', 'checkout.html', 'admin.html'];
const failures = [];

function read(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    failures.push(`${file}: file is missing`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

function assert(file, condition, message) {
  if (!condition) failures.push(`${file}: ${message}`);
}

for (const file of publicPages) {
  const html = read(file);
  if (!html) continue;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || '';
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || '';
  const robots = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i)?.[1] || '';
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  assert(file, title.length >= 10 && title.length <= 70, `title must be 10–70 characters (got ${title.length})`);
  assert(file, description.length >= 50 && description.length <= 170, `description must be 50–170 characters (got ${description.length})`);
  assert(file, /^https:\/\/huggy\.fun\//.test(canonical), 'canonical must use https://huggy.fun/');
  assert(file, /index\s*,\s*follow/i.test(robots), 'public page must be indexable');
  assert(file, h1Count === 1, `expected exactly one h1 (got ${h1Count})`);
  assert(file, /property=["']og:image["']/i.test(html), 'missing og:image');
}

for (const file of privatePages) {
  const html = read(file);
  if (!html) continue;
  const robots = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i)?.[1] || '';
  assert(file, /noindex\s*,\s*nofollow/i.test(robots), 'private page must be noindex,nofollow');
}

const robots = read('public/robots.txt');
assert('public/robots.txt', /Sitemap:\s*https:\/\/huggy\.fun\/sitemap\.xml/i.test(robots), 'sitemap URL is missing');
const sitemap = read('public/sitemap.xml');
assert('public/sitemap.xml', /<urlset[\s>]/i.test(sitemap), 'invalid sitemap root');
assert('public/sitemap.xml', !/<loc>https:\/\/huggy\.fun\/(auth|dashboard|builder|checkout|admin)\.html<\/loc>/i.test(sitemap), 'private page must not be in sitemap');

if (failures.length) {
  console.error(`SEO check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`SEO check passed for ${publicPages.length} public pages and ${privatePages.length} private pages.`);
