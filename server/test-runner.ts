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

  const generate = await app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/generate`,
    headers: auth,
    payload: { prompt: 'Generate a responsive analytics app' }
  });
  assert.equal(generate.statusCode, 200, 'generation route succeeds with safe fallback');
  assert.ok(generate.json().files.every((file: any) => !file.path.includes('..')), 'generation sanitizes file paths');

  const preview = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/preview`, headers: auth });
  assert.equal(preview.statusCode, 200, 'preview route succeeds');
  assert.match(preview.json().html, /<html|<!doctype/i, 'preview returns sandboxable HTML');

  const deploy = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/deploy`, headers: auth });
  assert.equal(deploy.statusCode, 200, 'deploy route returns mocked deployment without VERCEL_TOKEN');
  assert.ok(deploy.json().deployment.deployment_url, 'deployment includes URL');

  await app.close();
  console.log('All backend tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
