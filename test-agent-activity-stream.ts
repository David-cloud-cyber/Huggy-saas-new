import assert from 'node:assert/strict';
import {
  HUGGY_STREAM_PROTOCOL_VERSION,
  type HuggyStreamEvent,
  type HuggyStreamEventType,
} from './src/lib/stream-protocol.ts';
import {
  activeMilestone,
  createInitialActivityState,
  formatElapsed,
  reduceActivity,
  reduceActivityAll,
  recapLine,
  summarizeActivity,
  withDecisionLine,
} from './src/lib/agent-activity-stream.ts';

let seq = 0;
let clock = 1_000;
function ev<T extends HuggyStreamEventType>(type: T, body: Record<string, unknown> = {}, dt = 1000): HuggyStreamEvent {
  seq += 1;
  clock += dt;
  return { v: HUGGY_STREAM_PROTOCOL_VERSION, id: seq, ts: clock, type, ...body } as unknown as HuggyStreamEvent;
}

// ── Empty / initial ─────────────────────────────────────────────────────────
const initial = createInitialActivityState();
assert.equal(initial.phase, 'idle');
assert.equal(initial.assistantText, '');
assert.equal(initial.collapsed, false);

// ── Phase transition on first event ─────────────────────────────────────────
let state = reduceActivity(initial, ev('milestone', { milestone: 'understanding', state: 'active' }));
assert.equal(state.phase, 'streaming');
assert.ok(state.startedAt);
assert.equal(activeMilestone(state)?.key, 'understanding');
assert.equal(activeMilestone(state)?.label, 'Analyse de la demande');

// ── Milestone advancement marks earlier active ones done ────────────────────
state = reduceActivity(state, ev('milestone', { milestone: 'planning', state: 'active' }));
assert.equal(state.milestones.find(m => m.key === 'understanding')?.state, 'done');
assert.equal(activeMilestone(state)?.key, 'planning');

// ── Assistant token streaming accumulates ───────────────────────────────────
state = reduceActivity(state, ev('assistant_delta', { text: 'Je vais ' }));
state = reduceActivity(state, ev('assistant_delta', { text: 'créer la page.' }));
assert.equal(state.assistantText, 'Je vais créer la page.');

// ── File lifecycle: start → delta → done ────────────────────────────────────
state = reduceActivity(state, ev('milestone', { milestone: 'generating', state: 'active' }));
state = reduceActivity(state, ev('file_start', { path: 'src/App.tsx', language: 'tsx' }));
state = reduceActivity(state, ev('file_delta', { path: 'src/App.tsx', chars: 240 }));
let appFile = state.files.find(f => f.path === 'src/App.tsx');
assert.equal(appFile?.status, 'writing');
assert.equal(appFile?.chars, 240);
assert.equal(appFile?.language, 'tsx');
state = reduceActivity(state, ev('file_done', { path: 'src/App.tsx', bytes: 1024 }));
appFile = state.files.find(f => f.path === 'src/App.tsx');
assert.equal(appFile?.status, 'done');
assert.equal(appFile?.bytes, 1024);

// A second file keeps insertion order.
state = reduceActivity(state, ev('file_start', { path: 'src/main.tsx', language: 'tsx' }));
assert.deepEqual(state.files.map(f => f.path), ['src/App.tsx', 'src/main.tsx']);

// ── Checks + warnings ───────────────────────────────────────────────────────
state = reduceActivity(state, ev('check', { name: 'build', status: 'pass' }));
state = reduceActivity(state, ev('check', { name: 'rls', status: 'fail', detail: 'missing policy' }));
state = reduceActivity(state, ev('warning', { message: 'large bundle' }));
assert.equal(state.checks.length, 2);
assert.equal(state.warnings.length, 1);

// ── Done collapses + completes pending work ─────────────────────────────────
state = reduceActivity(state, ev('done', { payload: { ok: true } }));
assert.equal(state.phase, 'done');
assert.equal(state.collapsed, true);
assert.ok(!state.files.some(f => f.status === 'writing'), 'pending files completed on done');
assert.ok(!state.milestones.some(m => m.state === 'active'), 'pending milestones completed on done');

const summary = summarizeActivity(state);
assert.equal(summary.filesChanged, 2);
assert.equal(summary.checksPassed, 1);
assert.equal(summary.checksFailed, 1);
assert.equal(summary.hasError, false);
assert.ok(summary.elapsedMs > 0);

const recap = recapLine(state);
assert.match(recap, /Terminé/);
assert.match(recap, /2 fichiers/);
assert.match(recap, /1 échec de vérification/);

// ── Decision line wiring (MIX header) ───────────────────────────────────────
const withDecision = withDecisionLine(state, 'Décision : Coder · nouvelle app');
assert.equal(withDecision.decisionLine, 'Décision : Coder · nouvelle app');

// ── Error path keeps the block expanded ─────────────────────────────────────
let errState = reduceActivityAll([
  ev('milestone', { milestone: 'generating', state: 'active' }),
  ev('error', { message: 'Provider timeout', recoverable: true }),
]);
assert.equal(errState.phase, 'error');
assert.equal(errState.collapsed, false, 'errors stay visible, not collapsed');
assert.equal(errState.error?.recoverable, true);
assert.match(recapLine(errState), /Échec · Provider timeout/);

// ── Stale/duplicate events ignored ──────────────────────────────────────────
const before = reduceActivityAll([
  ev('milestone', { milestone: 'understanding', state: 'active' }),
  ev('assistant_delta', { text: 'hello' }),
]);
const stale = { ...before };
const replayed = reduceActivity(stale, { v: HUGGY_STREAM_PROTOCOL_VERSION, id: 1, ts: clock, type: 'assistant_delta', text: 'DUP' } as HuggyStreamEvent);
assert.equal(replayed.assistantText, 'hello', 'stale lower-id event must be ignored');

// ── formatElapsed ───────────────────────────────────────────────────────────
assert.equal(formatElapsed(12_000), '12s');
assert.equal(formatElapsed(63_000), '1m 03s');
assert.equal(formatElapsed(125_000), '2m 05s');

console.log('test-agent-activity-stream passed');
