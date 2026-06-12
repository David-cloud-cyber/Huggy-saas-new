import assert from 'node:assert/strict';
import {
  workJournalToActivityState,
  type WorkJournalBlockLike,
} from './src/lib/agent-activity-stream-adapter.ts';
import { recapLine, summarizeActivity } from './src/lib/agent-activity-stream.ts';

// Active block with mixed entries → streaming state, files + steps separated.
const active: WorkJournalBlockLike = {
  type: 'work_journal',
  status: 'active',
  activeText: 'Génération en cours',
  entries: [
    { id: 's1', kind: 'update', text: 'Analyse de la demande', status: 'done' },
    { id: 's2', kind: 'thinking', text: 'Plan des composants', status: 'active' },
    { id: 'f1', kind: 'file_edit', text: 'App', path: 'src/App.tsx', action: 'created', status: 'active' },
    { id: 'f2', kind: 'file_edit', text: 'main', path: 'src/main.tsx', action: 'created', status: 'done' },
    { id: 'd1', kind: 'divider', text: '—' },
    { id: 'c1', kind: 'command', text: 'install', command: 'npm install', status: 'done' },
  ],
};

let state = workJournalToActivityState(active);
assert.equal(state.phase, 'streaming');
assert.equal(state.statusLine, 'Génération en cours');
// Files separated from steps.
assert.deepEqual(state.files.map(f => f.path), ['src/App.tsx', 'src/main.tsx']);
assert.equal(state.files.find(f => f.path === 'src/main.tsx')?.status, 'done');
assert.equal(state.files.find(f => f.path === 'src/App.tsx')?.status, 'writing');
// Divider dropped; command uses its command text.
assert.ok(state.milestones.some(m => m.label === 'npm install'));
assert.ok(!state.milestones.some(m => m.label === '—'));
assert.equal(state.milestones.find(m => m.key === 's1')?.state, 'done');
assert.equal(state.milestones.find(m => m.key === 's2')?.state, 'active');
assert.equal(state.collapsed, false);

// Done block → collapsed, recap reflects files.
const done: WorkJournalBlockLike = {
  type: 'work_journal',
  status: 'done',
  finalText: 'La version est prête.',
  elapsed: '12s',
  entries: [
    { id: 'f1', kind: 'file_edit', text: 'App', path: 'src/App.tsx', status: 'done' },
    { id: 'f2', kind: 'file_edit', text: 'styles', path: 'src/index.css', status: 'done' },
  ],
};
state = workJournalToActivityState(done);
assert.equal(state.phase, 'done');
assert.equal(state.collapsed, true);
assert.equal(state.statusLine, 'La version est prête.');
assert.equal(summarizeActivity(state).filesChanged, 2);
assert.match(recapLine(state), /Terminé/);
assert.match(recapLine(state), /2 fichiers/);

// Failed block → error phase, error message, not collapsed.
const failed: WorkJournalBlockLike = {
  type: 'work_journal',
  status: 'failed',
  finalText: 'Le build a échoué.',
  entries: [{ id: 's1', kind: 'update', text: 'Vérification', status: 'failed' }],
};
state = workJournalToActivityState(failed);
assert.equal(state.phase, 'error');
assert.equal(state.collapsed, false);
assert.equal(state.error?.message, 'Le build a échoué.');
assert.equal(state.milestones[0].state, 'failed');
assert.match(recapLine(state), /Échec · Le build a échoué\./);

// Empty entries → safe.
state = workJournalToActivityState({ type: 'work_journal', status: 'active', entries: [] });
assert.equal(state.milestones.length, 0);
assert.equal(state.files.length, 0);

console.log('test-agent-activity-stream-adapter passed');
