import assert from 'node:assert/strict';
import { messagePartsToActivityState } from './src/lib/agent-activity-stream-adapter.ts';
import { recapLine, summarizeActivity } from './src/lib/agent-activity-stream.ts';

const active = messagePartsToActivityState({
  status: 'active',
  activeText: 'Génération en cours',
  parts: [
    { id: 's1', type: 'tool_call', name: 'Analyse de la demande', status: 'done' },
    { id: 's2', type: 'reasoning', text: 'Plan des composants', status: 'active' },
    { id: 'f1', type: 'file_edit', text: 'App', path: 'src/App.tsx', action: 'created', status: 'active' },
    { id: 'f2', type: 'file_edit', text: 'main', path: 'src/main.tsx', action: 'created', status: 'done' },
    { id: 'c1', type: 'terminal', command: 'npm install', status: 'done' },
  ],
});

assert.equal(active.phase, 'streaming');
assert.equal(active.statusLine, 'Génération en cours');
assert.deepEqual(active.files.map(f => f.path), ['src/App.tsx', 'src/main.tsx']);
assert.equal(active.files.find(f => f.path === 'src/main.tsx')?.status, 'done');
assert.equal(active.files.find(f => f.path === 'src/App.tsx')?.status, 'writing');
assert.ok(active.milestones.some(m => m.label === 'npm install'));
assert.equal(active.milestones.find(m => m.key === 's1')?.state, 'done');
assert.equal(active.milestones.find(m => m.key === 's2')?.state, 'active');

let done = messagePartsToActivityState({
  status: 'done',
  finalText: 'La version est prête.',
  parts: [
    { id: 'f1', type: 'file_edit', text: 'App', path: 'src/App.tsx', status: 'done' },
    { id: 'f2', type: 'file_edit', text: 'styles', path: 'src/index.css', status: 'done' },
  ],
});
assert.equal(done.phase, 'done');
assert.equal(done.collapsed, true);
assert.equal(done.statusLine, 'La version est prête.');
assert.equal(summarizeActivity(done).filesChanged, 2);
assert.match(recapLine(done), /Terminé/);
assert.match(recapLine(done), /2 fichiers/);

const failed = messagePartsToActivityState({
  status: 'failed',
  finalText: 'Le build a échoué.',
  parts: [{ id: 's1', type: 'tool_call', name: 'Inspection finale', status: 'failed' }],
});
assert.equal(failed.phase, 'error');
assert.equal(failed.collapsed, false);
assert.equal(failed.error?.message, 'Le build a échoué.');
assert.equal(failed.milestones[0].state, 'failed');
assert.match(recapLine(failed), /Échec · Le build a échoué\./);

done = messagePartsToActivityState({ status: 'active', parts: [] });
assert.equal(done.milestones.length, 0);
assert.equal(done.files.length, 0);

console.log('test-agent-activity-stream-adapter passed');
