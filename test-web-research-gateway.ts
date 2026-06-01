import assert from 'node:assert/strict';
import { WebResearchGateway, researchToPromptContext, shouldUseWebResearch } from './src/services/web-research-gateway.ts';

assert.equal(shouldUseWebResearch({ prompt: 'bonjour', intent: 'conversation' }), false);
assert.equal(shouldUseWebResearch({ prompt: 'Check the latest Supabase auth docs', intent: 'build', requiresFileChanges: true }), true);
assert.equal(shouldUseWebResearch({ prompt: 'Add Stripe billing integration', intent: 'build', requiresFileChanges: true }), true);

const gateway = new WebResearchGateway({});
const skipped = await gateway.search('latest OpenRouter model availability');
assert.equal(skipped.status, 'skipped');
assert.equal(skipped.diagnostic_code, 'WEB_RESEARCH_NOT_CONFIGURED');
assert.equal(skipped.results.length, 0);

const context = researchToPromptContext({
  status: 'completed',
  provider: 'brave',
  query: 'docs',
  message: 'Research completed.',
  results: [{ title: 'Official docs', url: 'https://example.com/docs', snippet: 'Use the current API.' }],
});
assert.ok(context.includes('https://example.com/docs'));
assert.ok(context.includes('Recent web research context'));

console.log('test-web-research-gateway passed');
