import assert from 'node:assert/strict';
import { HybridProjectRunner, runnerChecksToVerificationChecks } from './src/services/project-runner.ts';

const goodHtml = '<!doctype html><html><head><title>Demo</title><meta name="description" content="Demo app"></head><body><h1>Demo</h1></body></html>';

{
  const runner = new HybridProjectRunner({ executeScripts: false });
  const result = await runner.run({
    runId: 'run_good',
    projectId: 'project_good',
    previewHtml: goodHtml,
    files: [
      { path: 'index.html', language: 'html', content: goodHtml },
      { path: 'package.json', language: 'json', content: JSON.stringify({ scripts: { build: 'vite build', lint: 'tsc --noEmit' } }) },
    ],
  });

  assert.equal(result.status, 'passed');
  assert.ok(result.checks.some(check => check.check_type === 'script_build_safe' && check.status === 'passed'));
  assert.ok(result.checks.some(check => check.check_type === 'script_build_exec' && check.status === 'skipped'));
}

{
  const runner = new HybridProjectRunner();
  const result = await runner.run({
    runId: 'run_bad',
    projectId: 'project_bad',
    previewHtml: '',
    files: [
      { path: '../.env', content: 'OPENROUTER_API_KEY=sk-test-secret' },
      { path: 'package.json', content: JSON.stringify({ scripts: { build: 'rm -rf /' } }) },
      { path: 'data.json', content: '{broken' },
    ],
  });

  assert.equal(result.status, 'failed');
  assert.ok(result.checks.some(check => check.check_type === 'safe_path' && check.status === 'failed'));
  assert.ok(result.checks.some(check => check.check_type === 'script_build_safe' && check.status === 'failed'));
  assert.ok(result.checks.some(check => check.check_type === 'json_parse' && check.status === 'failed'));
  const verification = runnerChecksToVerificationChecks(result.checks);
  assert.ok(verification.some(check => check.key === 'runner_safe_path' && check.status === 'fail'));
}

console.log('test-project-runner passed');
