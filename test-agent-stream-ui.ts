import assert from 'node:assert/strict';

import { createInitialAgentStreamState, reduceAgentStreamEvent } from './src/streaming/agent-stream-reducer.ts';

let state = createInitialAgentStreamState();
state.runHeader = {
  workflow: 'Build',
  objective: 'Create a todo app',
  scope: 'Current project',
  rollbackAvailable: false,
  status: 'Preparing run',
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

state = reduceAgentStreamEvent(state, {
  type: 'runner_started',
  message: 'Running checks',
});
assert.equal(state.checks.status, 'running');

state = reduceAgentStreamEvent(state, {
  type: 'runner_passed',
  message: 'Critical checks passed',
});
assert.equal(state.checks.status, 'passed');

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
assert.ok(state.finalSummary?.bullets.some(bullet => bullet.includes('file')));
assert.ok(state.finalSummary?.bullets.some(bullet => bullet.includes('Objective understood')));
assert.equal(state.elapsed, '0m 12s');

console.log('agent stream ui reducer ok');
