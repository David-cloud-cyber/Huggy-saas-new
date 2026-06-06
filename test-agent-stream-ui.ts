import assert from 'node:assert/strict';

import { createInitialAgentStreamState, reduceAgentStreamEvent } from './src/streaming/agent-stream-reducer.ts';

let state = createInitialAgentStreamState();
state.runHeader = {
  workflow: 'Build',
  objective: 'Create a todo app',
  scope: 'Projet courant',
  autonomy: 'L4 - modification avec rollback',
  risk: 'Faible',
  rollbackAvailable: false,
  status: 'Je comprends la mission.',
};

state = reduceAgentStreamEvent(state, {
  type: 'run_started',
  payload: { run_id: 'run_1', provider: 'hidden-provider' },
  message: 'Request received',
  elapsed: '0m 01s',
});

assert.equal(state.runId, 'run_1');
assert.equal(state.status, 'active');
assert.equal(state.runHeader?.workflow, 'Build');
assert.equal(state.phases[0]?.id, 'understanding');
assert.ok(!state.detail.toLowerCase().includes('provider'));
assert.ok(state.headline.includes('mission'));
assert.ok(state.tasks.some(task => task.label.includes('mission')));

state = reduceAgentStreamEvent(state, {
  type: 'files_changed',
  payload: {
    diff: {
      created: ['package.json'],
      modified: ['src/App.tsx'],
      deleted: [],
    },
  },
  elapsed: '0m 06s',
});

assert.equal(state.files.length, 2);
assert.equal(state.files.find(file => file.path === 'package.json')?.reason, 'created');
assert.equal(state.files.find(file => file.path === 'src/App.tsx')?.language, 'React');
assert.ok(state.agents.some(agent => agent.id === 'frontend_agent'));

state = reduceAgentStreamEvent(state, {
  type: 'runner_started',
  message: 'Running checks',
});
assert.equal(state.checks.status, 'running');
assert.ok(state.checkItems.some(check => check.label === 'Runner'));

state = reduceAgentStreamEvent(state, {
  type: 'runner_failed',
  message: 'Security checks need attention',
  payload: {
    checks: [
      { check_type: 'production_database_security', status: 'failed', message: 'RLS missing' },
      { check_type: 'fullstack_rls_policies', status: 'failed', message: 'Policy missing' },
    ],
  },
});
assert.ok(state.agents.some(agent => agent.id === 'security_agent'));
assert.ok(state.agents.some(agent => agent.id === 'supabase_agent') || state.agents.some(agent => agent.id === 'security_agent'));

state = reduceAgentStreamEvent(state, {
  type: 'runner_passed',
  message: 'Critical checks passed',
});
assert.equal(state.checks.status, 'passed');
assert.ok(state.checkItems.some(check => check.status === 'done'));

state = reduceAgentStreamEvent(state, {
  type: 'preview_ready',
  message: 'Preview ready',
});
assert.equal(state.preview.status, 'ready');

state = reduceAgentStreamEvent(state, {
  type: 'done',
  message: 'Done',
  elapsed: '0m 12s',
});

assert.equal(state.status, 'done');
assert.ok(state.finalSummary?.bullets.some(bullet => bullet.includes('fichier')));
assert.ok(state.finalSummary?.bullets.some(bullet => bullet.includes('Mission comprise')));
assert.equal(state.elapsed, '0m 12s');

console.log('agent stream ui reducer ok');
