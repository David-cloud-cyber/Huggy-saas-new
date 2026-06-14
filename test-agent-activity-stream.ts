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

// ════════════════════════════════════════════════════════════════════════════
// Reasoning pipeline reducer tests
// ════════════════════════════════════════════════════════════════════════════

// ── createInitialActivityState initializes the new fields ───────────────────
const freshInitial = createInitialActivityState();
assert.deepEqual(freshInitial.phases, []);
assert.equal(freshInitial.reasoningText, '');
assert.deepEqual(freshInitial.assumptions, []);
assert.deepEqual(freshInitial.planSteps, []);
assert.equal(freshInitial.understanding, undefined);
assert.equal(freshInitial.clarification, undefined);

// ── phase: active adds a row; later active marks earlier active ones done ────
let ph = reduceActivity(createInitialActivityState(), ev('phase', { phase: 'understand', state: 'active' }));
assert.equal(ph.phases.length, 1);
assert.equal(ph.phases[0].key, 'understand');
assert.equal(ph.phases[0].state, 'active');
assert.equal(ph.phases[0].label, 'Comprendre');
assert.equal(ph.phases[0].order, 0);

ph = reduceActivity(ph, ev('phase', { phase: 'plan', state: 'active' }));
assert.equal(ph.phases.find(p => p.key === 'understand')?.state, 'done', 'earlier active phase auto-completes');
assert.equal(ph.phases.find(p => p.key === 'plan')?.state, 'active');

// ── phases stay sorted by canonical order even when emitted out of order ─────
let sorted = reduceActivityAll([
  ev('phase', { phase: 'verify', state: 'active' }),
  ev('phase', { phase: 'understand', state: 'done' }),
  ev('phase', { phase: 'reason', state: 'done' }),
  ev('phase', { phase: 'decide', state: 'done' }),
]);
assert.deepEqual(
  sorted.phases.map(p => p.key),
  ['understand', 'decide', 'reason', 'verify'],
  'phases sorted by HUGGY_REASONING_PHASE_ORDER',
);

// ── understanding populates summary, projectType, requirements, confidence ──
let und = reduceActivity(createInitialActivityState(), ev('understanding', {
  summary: 'Construire une calculatrice',
  projectType: 'calculatrice React',
  requirements: ['addition', 'soustraction'],
  confidence: 0.82,
}));
assert.equal(und.understanding?.summary, 'Construire une calculatrice');
assert.equal(und.understanding?.projectType, 'calculatrice React');
assert.deepEqual(und.understanding?.requirements, ['addition', 'soustraction']);
assert.equal(und.understanding?.confidence, 0.82);

// ── assumption events accumulate ────────────────────────────────────────────
let asn = reduceActivityAll([
  ev('assumption', { text: 'Thème clair par défaut' }),
  ev('assumption', { text: 'Pas de backend requis' }),
]);
assert.deepEqual(asn.assumptions, ['Thème clair par défaut', 'Pas de backend requis']);

// ── clarification sets question + options ───────────────────────────────────
let clr = reduceActivity(createInitialActivityState(), ev('clarification', {
  question: 'Quelle base de données ?',
  options: ['Supabase', 'SQLite'],
}));
assert.equal(clr.clarification?.question, 'Quelle base de données ?');
assert.deepEqual(clr.clarification?.options, ['Supabase', 'SQLite']);

// ── plan populates steps (all pending, correct order) ───────────────────────
let pl = reduceActivity(createInitialActivityState(), ev('plan', {
  steps: [
    { id: 's1', title: 'Créer App', kind: 'create', path: 'src/App.tsx' },
    { id: 's2', title: 'Modifier index', kind: 'edit', path: 'index.html' },
  ],
}));
assert.equal(pl.planSteps.length, 2);
assert.deepEqual(pl.planSteps.map(s => s.state), ['pending', 'pending']);
assert.deepEqual(pl.planSteps.map(s => s.order), [0, 1]);
assert.deepEqual(pl.planSteps.map(s => s.id), ['s1', 's2']);

// plan_step with a matching id updates that step's state
pl = reduceActivity(pl, ev('plan_step', { stepId: 's1', state: 'active' }));
assert.equal(pl.planSteps.find(s => s.id === 's1')?.state, 'active');
pl = reduceActivity(pl, ev('plan_step', { stepId: 's1', state: 'done' }));
assert.equal(pl.planSteps.find(s => s.id === 's1')?.state, 'done');
assert.equal(pl.planSteps.find(s => s.id === 's2')?.state, 'pending', 'unrelated step untouched');

// plan_step with an unknown id is a no-op
const beforeUnknown = pl.planSteps.map(s => s.state).join(',');
pl = reduceActivity(pl, ev('plan_step', { stepId: 'does-not-exist', state: 'active' }));
assert.equal(pl.planSteps.map(s => s.state).join(','), beforeUnknown, 'unknown plan_step id is a no-op');

// ── reasoning_delta accumulates with newline separation ─────────────────────
let rd = reduceActivity(createInitialActivityState(), ev('reasoning_delta', { text: 'D\'abord, je lis la demande.' }));
assert.equal(rd.reasoningText, 'D\'abord, je lis la demande.');
rd = reduceActivity(rd, ev('reasoning_delta', { text: 'Ensuite, je planifie.' }));
assert.equal(rd.reasoningText, 'D\'abord, je lis la demande.\nEnsuite, je planifie.', 'deltas concatenate with newline');

// ── done: active phase + plan step complete; clarification keeps it expanded ─
let doneWithClar = reduceActivityAll([
  ev('phase', { phase: 'understand', state: 'active' }),
  ev('clarification', { question: 'Quelle couleur ?' }),
  ev('done', { payload: { ok: true } }),
]);
assert.equal(doneWithClar.phase, 'done');
assert.equal(doneWithClar.phases.find(p => p.key === 'understand')?.state, 'done', 'active phase completes on done');
assert.equal(doneWithClar.collapsed, false, 'clarification keeps the block expanded');

let doneNoClar = reduceActivityAll([
  ev('plan', { steps: [{ id: 'a', title: 'Faire X', kind: 'task' }] }),
  ev('plan_step', { stepId: 'a', state: 'active' }),
  ev('phase', { phase: 'build', state: 'active' }),
  ev('done', { payload: { ok: true } }),
]);
assert.equal(doneNoClar.planSteps.find(s => s.id === 'a')?.state, 'done', 'active plan step completes on done');
assert.equal(doneNoClar.phases.find(p => p.key === 'build')?.state, 'done');
assert.equal(doneNoClar.collapsed, true, 'no clarification collapses on done');

console.log('test-agent-activity-stream passed');
