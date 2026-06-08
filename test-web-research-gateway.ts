import assert from 'node:assert/strict';
import { WebResearchGateway, buildWebResearchPlan, researchToPromptContext, shouldUseWebResearch } from './src/services/web-research-gateway.ts';

assert.equal(shouldUseWebResearch({ prompt: 'bonjour', intent: 'conversation' }), false);
assert.equal(shouldUseWebResearch({ prompt: 'Check the latest Supabase auth docs', intent: 'build', requiresFileChanges: true }), true);
assert.equal(shouldUseWebResearch({ prompt: 'Add Stripe billing integration', intent: 'build', requiresFileChanges: true }), true);
assert.equal(shouldUseWebResearch({ prompt: 'crée une mini app pomodoro moderne', intent: 'build', requiresFileChanges: true }), false);
assert.equal(shouldUseWebResearch({ prompt: 'corrige le bug du bouton publish', intent: 'debug', requiresFileChanges: true }), false);
assert.equal(shouldUseWebResearch({ prompt: 'Recherche en ligne les dernières docs Vercel pour les domaines', intent: 'build', requiresFileChanges: true }), true);

const urlPlan = buildWebResearchPlan({
  prompt: 'Huggy import context:\nSource URL: firecrawl.dev\nUser request: analyse ce site web',
  intent: 'build',
  requiresFileChanges: true,
});
assert.equal(urlPlan.shouldResearch, true);
assert.equal(urlPlan.action, 'scrape');
assert.equal(urlPlan.query, 'https://firecrawl.dev');

const gateway = new WebResearchGateway({});
const skipped = await gateway.search('latest OpenRouter model availability');
assert.equal(skipped.status, 'skipped');
assert.equal(skipped.diagnostic_code, 'WEB_RESEARCH_NOT_CONFIGURED');
assert.equal(skipped.results.length, 0);

const calls: Array<{ url: string; body?: any }> = [];
const mockFetch: any = async (url: string, init: any) => {
  calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
  return {
    ok: true,
    status: 200,
    async json() {
      if (url.includes('/scrape')) {
        return { data: { url: 'https://firecrawl.dev', markdown: 'Firecrawl clean markdown', metadata: { title: 'Firecrawl' } } };
      }
      return { data: [{ url: 'https://docs.firecrawl.dev', title: 'Firecrawl Docs', markdown: 'Search result markdown' }] };
    },
  };
};

const firecrawlGateway = new WebResearchGateway({ FIRECRAWL_API_KEY: 'fc-test' }, mockFetch);
assert.equal(firecrawlGateway.isConfigured(), true);

const firecrawlSearch = await firecrawlGateway.search('Firecrawl docs search');
assert.equal(firecrawlSearch.status, 'completed');
assert.equal(firecrawlSearch.provider, 'firecrawl');
assert.equal(firecrawlSearch.results[0]?.source, 'firecrawl');
assert.ok(calls.some(call => call.url.includes('/search')));

const firecrawlScrape = await firecrawlGateway.search('https://firecrawl.dev');
assert.equal(firecrawlScrape.status, 'completed');
assert.equal(firecrawlScrape.provider, 'firecrawl');
assert.ok(firecrawlScrape.results[0]?.snippet.includes('Firecrawl clean markdown'));
assert.ok(calls.some(call => call.url.includes('/scrape')));

const bareDomainScrape = await firecrawlGateway.scrape('firecrawl.dev');
assert.equal(bareDomainScrape.status, 'completed');
assert.equal(calls.at(-1)?.body.url, 'https://firecrawl.dev');

const embeddedUrlScrape = await firecrawlGateway.search('Huggy import context:\nSource URL: firecrawl.dev\nUser request: analyse ce site web');
assert.equal(embeddedUrlScrape.status, 'completed');
assert.equal(embeddedUrlScrape.provider, 'firecrawl');
assert.equal(calls.at(-1)?.body.url, 'https://firecrawl.dev');

const fallbackCalls: Array<{ url: string; body?: any }> = [];
const fallbackFetch: any = async (url: string, init: any) => {
  fallbackCalls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
  return {
    ok: true,
    status: 200,
    async json() {
      if (url.includes('firecrawl.dev')) return { data: [] };
      return {
        results: [{
          url: 'https://docs.tavily.com',
          title: 'Tavily Docs',
          content: 'Tavily fallback result from current docs.',
        }],
      };
    },
  };
};
const fallbackGateway = new WebResearchGateway({ FIRECRAWL_API_KEY: 'fc-test', TAVILY_API_KEY: 'tv-test' }, fallbackFetch);
const fallbackResult = await fallbackGateway.search('latest Tavily API documentation');
assert.equal(fallbackResult.status, 'completed');
assert.equal(fallbackResult.provider, 'tavily');
assert.equal(fallbackResult.results[0]?.url, 'https://docs.tavily.com');
assert.ok(fallbackCalls.some(call => call.url.includes('firecrawl.dev')));
assert.ok(fallbackCalls.some(call => call.url.includes('tavily.com')));

const context = researchToPromptContext({
  status: 'completed',
  provider: 'firecrawl',
  query: 'docs',
  message: 'Research completed.',
  results: [{ title: 'Official docs', url: 'https://example.com/docs', snippet: 'Use the current API.' }],
});
assert.ok(context.includes('https://example.com/docs'));
assert.ok(context.includes('Recent web research context'));

console.log('test-web-research-gateway passed');
