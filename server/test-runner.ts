import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

async function run() {
  const { createServer } = await import('./src/index');
  const app = createServer();
  await app.ready();

  const unauth = await app.inject({ method: 'GET', url: '/api/projects' });
  assert.equal(unauth.statusCode, 401, 'protected routes reject missing JWT');

  const auth = { authorization: 'Bearer test-user-1' };
  const create = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: auth,
    payload: { prompt: 'A CRM dashboard with auth and billing' }
  });
  assert.equal(create.statusCode, 200, 'project creation succeeds');
  const projectId = create.json().project.id;

  const list = await app.inject({ method: 'GET', url: '/api/projects', headers: auth });
  assert.equal(list.json().projects.length, 1, 'created project is tied to authenticated user');

  const plans = await app.inject({ method: 'GET', url: '/api/billing/plans', headers: auth });
  assert.equal(plans.statusCode, 200, 'plans endpoint is available');
  assert.equal(plans.json().plans.find((plan: any) => plan.id === 'starter').monthlyCredits, 100, 'Starter includes 100 credits');

  const autoEstimate = await app.inject({
    method: 'POST',
    url: '/api/ai/estimate',
    headers: auth,
    payload: { actionKind: 'chat_simple', prompt: 'Rename a button' }
  });
  assert.equal(autoEstimate.statusCode, 200, 'Auto is the default routing mode');
  assert.equal(autoEstimate.json().mode, 'auto', 'Auto remains selected by default');
  assert.ok(autoEstimate.json().estimate.marginProtected, 'estimation protects margin');

  const customModel = await app.inject({
    method: 'POST',
    url: '/api/ai/route',
    headers: auth,
    payload: { actionKind: 'component_change', mode: 'custom', customModelId: 'openai/gpt-5-mini' }
  });
  assert.equal(customModel.statusCode, 200, 'custom model selector backend accepts allowed models');

  const premiumBlocked = await app.inject({
    method: 'POST',
    url: '/api/ai/route',
    headers: auth,
    payload: { actionKind: 'mvp_generation', mode: 'custom', customModelId: 'google/gemini-3-pro' }
  });
  assert.equal(premiumBlocked.statusCode, 403, 'premium model requires upgrade on Starter');

  const generate = await app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/generate`,
    headers: auth,
    payload: { prompt: 'Generate a responsive analytics app' }
  });
  assert.equal(generate.statusCode, 200, 'generation route succeeds with safe fallback');
  assert.ok(generate.json().files.every((file: any) => !file.path.includes('..')), 'generation sanitizes file paths');
  assert.ok(generate.json().credits.charged > 0, 'generation charges credits through ledger');

  const ledger = await app.inject({ method: 'GET', url: '/api/billing/ledger', headers: auth });
  assert.ok(ledger.json().ledger.some((entry: any) => entry.type === 'debit'), 'ledger records debit');

  const preview = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/preview`, headers: auth });
  assert.equal(preview.statusCode, 200, 'preview route succeeds');
  assert.match(preview.json().html, /<html|<!doctype/i, 'preview returns sandboxable HTML');

  const domain = await app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/domains`,
    headers: auth,
    payload: { domain: 'starter-example.com', type: 'custom' }
  });
  assert.equal(domain.statusCode, 200, 'Starter can add 1 custom domain');

  const secondDomain = await app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/domains`,
    headers: auth,
    payload: { domain: 'starter-second.com', type: 'custom' }
  });
  assert.equal(secondDomain.statusCode, 402, 'Starter cannot add a second custom domain without add-on');

  const deploy = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/deploy`, headers: auth });
  assert.equal(deploy.statusCode, 200, 'deploy route returns mocked deployment without VERCEL_TOKEN');
  assert.ok(deploy.json().deployment.deployment_url, 'deployment includes URL');

  const freeAuth = { authorization: 'Bearer test-user-free' };
  const freeCreate = await app.inject({ method: 'POST', url: '/api/projects', headers: freeAuth, payload: { prompt: 'Free app' } });
  const freeProjectId = freeCreate.json().project.id;
  const freeDomain = await app.inject({
    method: 'POST',
    url: `/api/projects/${freeProjectId}/domains`,
    headers: freeAuth,
    payload: { domain: 'free-example.com', type: 'custom' }
  });
  assert.equal(freeDomain.statusCode, 402, 'Free cannot add a custom domain');

  const proAuth = { authorization: 'Bearer test-user-pro' };
  const proCreate = await app.inject({ method: 'POST', url: '/api/projects', headers: proAuth, payload: { prompt: 'Pro app' } });
  const proProjectId = proCreate.json().project.id;
  for (let index = 0; index < 5; index += 1) {
    const proDomain = await app.inject({
      method: 'POST',
      url: `/api/projects/${proProjectId}/domains`,
      headers: proAuth,
      payload: { domain: `pro-${index}.example.com`, type: 'custom' }
    });
    assert.equal(proDomain.statusCode, 200, 'Pro can add 5 custom domains');
  }

  const studioPremium = await app.inject({
    method: 'POST',
    url: '/api/ai/route',
    headers: { authorization: 'Bearer test-user-studio' },
    payload: { actionKind: 'mvp_generation', mode: 'custom', customModelId: 'google/gemini-3-pro' }
  });
  assert.equal(studioPremium.statusCode, 200, 'Studio can select premium model');
  assert.equal(studioPremium.json().requiresConfirmation, true, 'premium asks for confirmation');

  await app.close();
  console.log('All backend tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
