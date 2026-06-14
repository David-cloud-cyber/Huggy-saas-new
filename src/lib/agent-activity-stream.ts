// Agent Activity Stream — pure state model for the MIX in-chat streaming UI.
//
// Folds the Huggy Stream v2 SSE events into a single, renderable view model.
// This is the source of truth the new conversation stream component renders,
// replacing the old DOM-driven `huggy-buildstream` / `huggy-flowline` markup
// that desynced because it mutated the DOM directly from the event callback.
//
// MIX behaviour:
//  - Bolt-style transparency: a decision header + live per-step / per-file rows.
//  - Lovable-style calm: on completion the block collapses to a one-line recap.

import type {
  HuggyStreamEvent,
  HuggyStreamMilestone,
  HuggyReasoningPhase,
  HuggyPlanStep,
} from './stream-protocol.ts';
import { HUGGY_REASONING_PHASE_ORDER } from './stream-protocol.ts';

export type ActivityPhase = 'idle' | 'streaming' | 'done' | 'error';
export type FileActivityStatus = 'writing' | 'done';

/** A reasoning-pipeline phase row in the transparent timeline. */
export type ActivityReasoningPhase = {
  key: HuggyReasoningPhase;
  label: string;
  state: 'active' | 'done' | 'failed';
  order: number;
};

/** A plan checklist row, ticked off as the build progresses. */
export type ActivityPlanStep = HuggyPlanStep & {
  state: 'pending' | 'active' | 'done' | 'failed';
  order: number;
};

/** What the agent understood, surfaced before it touches any file. */
export type ActivityUnderstanding = {
  summary: string;
  projectType?: string;
  requirements: string[];
  confidence?: number;
};

export type ActivityFile = {
  path: string;
  language?: string;
  status: FileActivityStatus;
  chars: number;
  bytes?: number;
  order: number;
};

export type ActivityMilestone = {
  // HuggyStreamMilestone for protocol events; free-form id when adapted from
  // the builder's work_journal entries.
  key: string;
  label: string;
  state: 'active' | 'done' | 'failed' | 'cancelled';
  order: number;
};

export type ActivityCheck = {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail?: string;
};

export type AgentActivityState = {
  phase: ActivityPhase;
  /** "Décision : Coder · …" — set from the DecisionCore output. */
  decisionLine?: string;
  statusLine?: string;
  assistantText: string;
  milestones: ActivityMilestone[];
  files: ActivityFile[];
  checks: ActivityCheck[];
  warnings: string[];
  error?: { message: string; recoverable: boolean };
  donePayload?: unknown;
  startedAt?: number;
  endedAt?: number;
  /** True once finished — the UI condenses to the summary recap. */
  collapsed: boolean;
  lastEventId: number;

  // ── Reasoning pipeline (transparent "thinking" UI) ──────────────────────
  /** Ordered phase timeline: understand → decide → plan → reason → build → … */
  phases: ActivityReasoningPhase[];
  /** Accumulated reasoning text — shown in the collapsible "Réflexion" panel. */
  reasoningText: string;
  /** What the agent understood from the request. */
  understanding?: ActivityUnderstanding;
  /** Explicit assumptions surfaced at medium confidence. */
  assumptions: string[];
  /** Set when the agent pauses to ask instead of guessing. */
  clarification?: { question: string; options?: string[] };
  /** The plan checklist, ticked off during the build. */
  planSteps: ActivityPlanStep[];
};

const REASONING_PHASE_LABELS: Record<HuggyReasoningPhase, string> = {
  understand: 'Comprendre',
  decide: 'Décider',
  plan: 'Planifier',
  reason: 'Raisonner',
  build: 'Construire',
  verify: 'Vérifier',
  fix: 'Corriger',
  recap: 'Récapitulatif',
};

function upsertPhase(
  phases: ActivityReasoningPhase[],
  key: HuggyReasoningPhase,
  state: 'active' | 'done' | 'failed',
  label?: string,
): ActivityReasoningPhase[] {
  const next = phases.slice();
  const idx = next.findIndex(item => item.key === key);
  const resolvedLabel = label || REASONING_PHASE_LABELS[key] || key;
  if (idx === -1) {
    next.push({ key, label: resolvedLabel, state, order: HUGGY_REASONING_PHASE_ORDER.indexOf(key) });
  } else {
    next[idx] = { ...next[idx], state, label: resolvedLabel };
  }
  // When a phase becomes active, mark any earlier still-active phase as done.
  if (state === 'active') {
    const activeOrder = HUGGY_REASONING_PHASE_ORDER.indexOf(key);
    for (let i = 0; i < next.length; i++) {
      if (
        next[i].key !== key &&
        next[i].state === 'active' &&
        HUGGY_REASONING_PHASE_ORDER.indexOf(next[i].key) < activeOrder
      ) {
        next[i] = { ...next[i], state: 'done' };
      }
    }
  }
  next.sort((a, b) => a.order - b.order);
  return next;
}

const MILESTONE_LABELS: Record<HuggyStreamMilestone, string> = {
  understanding: 'Analyse de la demande',
  inspecting: 'Inspection du projet',
  planning: 'Plan',
  generating: 'Génération des fichiers',
  checking: 'Vérification',
  fixing: 'Corrections',
  preview_ready: 'Aperçu prêt',
};

const MILESTONE_ORDER: HuggyStreamMilestone[] = [
  'understanding',
  'inspecting',
  'planning',
  'generating',
  'checking',
  'fixing',
  'preview_ready',
];

export function createInitialActivityState(): AgentActivityState {
  return {
    phase: 'idle',
    assistantText: '',
    milestones: [],
    files: [],
    checks: [],
    warnings: [],
    collapsed: false,
    lastEventId: 0,
    phases: [],
    reasoningText: '',
    assumptions: [],
    planSteps: [],
  };
}

export function withDecisionLine(state: AgentActivityState, decisionLine: string): AgentActivityState {
  return { ...state, decisionLine };
}

function upsertMilestone(
  milestones: ActivityMilestone[],
  key: HuggyStreamMilestone,
  state: 'active' | 'done',
  label?: string,
): ActivityMilestone[] {
  const next = milestones.slice();
  const idx = next.findIndex(item => item.key === key);
  const resolvedLabel = label || MILESTONE_LABELS[key] || key;
  if (idx === -1) {
    next.push({ key, label: resolvedLabel, state, order: next.length });
  } else {
    next[idx] = { ...next[idx], state, label: resolvedLabel };
  }
  // When a milestone becomes active, any earlier still-active milestone is done.
  if (state === 'active') {
    const activeOrder = MILESTONE_ORDER.indexOf(key);
    for (let i = 0; i < next.length; i++) {
      if (next[i].key !== key && next[i].state === 'active' && MILESTONE_ORDER.indexOf(next[i].key as HuggyStreamMilestone) < activeOrder) {
        next[i] = { ...next[i], state: 'done' };
      }
    }
  }
  return next;
}

function upsertFile(
  files: ActivityFile[],
  path: string,
  patch: Partial<ActivityFile>,
): ActivityFile[] {
  const next = files.slice();
  const idx = next.findIndex(item => item.path === path);
  if (idx === -1) {
    next.push({ path, status: 'writing', chars: 0, order: next.length, ...patch });
  } else {
    next[idx] = { ...next[idx], ...patch };
  }
  return next;
}

export function reduceActivity(state: AgentActivityState, event: HuggyStreamEvent): AgentActivityState {
  // Ignore stale / duplicate events (resume safety).
  if (event.id <= state.lastEventId && state.phase !== 'idle') {
    return state;
  }

  let next: AgentActivityState = { ...state, lastEventId: Math.max(state.lastEventId, event.id) };

  if (next.phase === 'idle' && event.type !== 'done' && event.type !== 'error') {
    next.phase = 'streaming';
    next.startedAt = event.ts;
    next.collapsed = false;
  }

  switch (event.type) {
    case 'status':
      next.statusLine = event.message;
      break;
    case 'milestone':
      next.milestones = upsertMilestone(next.milestones, event.milestone, event.state, event.label);
      break;
    case 'phase':
      next.phases = upsertPhase(next.phases, event.phase, event.state, event.label);
      break;
    case 'understanding':
      next.understanding = {
        summary: event.summary,
        projectType: event.projectType,
        requirements: event.requirements ?? [],
        confidence: event.confidence,
      };
      break;
    case 'assumption':
      next.assumptions = [...next.assumptions, event.text];
      break;
    case 'clarification':
      next.clarification = { question: event.question, options: event.options };
      break;
    case 'plan':
      next.planSteps = event.steps.map((step, index) => ({
        ...step,
        state: 'pending',
        order: index,
      }));
      break;
    case 'plan_step': {
      const idx = next.planSteps.findIndex(s => s.id === event.stepId);
      if (idx !== -1) {
        const planSteps = next.planSteps.slice();
        planSteps[idx] = { ...planSteps[idx], state: event.state };
        next.planSteps = planSteps;
      }
      break;
    }
    case 'reasoning_delta':
      next.reasoningText = next.reasoningText + (next.reasoningText && !next.reasoningText.endsWith('\n') ? '\n' : '') + event.text;
      break;
    case 'assistant_delta':
      next.assistantText = next.assistantText + event.text;
      break;
    case 'file_start':
      next.files = upsertFile(next.files, event.path, { status: 'writing', language: event.language, chars: 0 });
      break;
    case 'file_delta':
      next.files = upsertFile(next.files, event.path, { chars: event.chars });
      break;
    case 'file_done':
      next.files = upsertFile(next.files, event.path, { status: 'done', bytes: event.bytes });
      break;
    case 'check':
      next.checks = [...next.checks, { name: event.name, status: event.status, detail: event.detail }];
      break;
    case 'warning':
      next.warnings = [...next.warnings, event.message];
      break;
    case 'error':
      next.phase = 'error';
      next.error = { message: event.message, recoverable: event.recoverable };
      next.endedAt = event.ts;
      next.collapsed = false; // keep errors visible
      break;
    case 'done':
      next.phase = 'done';
      next.donePayload = event.payload;
      next.endedAt = event.ts;
      // Calm completion collapses to a recap — unless we paused to ask the user,
      // in which case the question must stay visible.
      next.collapsed = !next.clarification;
      // Any milestone / phase / file / plan step still in flight is now complete.
      next.milestones = next.milestones.map(m => (m.state === 'active' ? { ...m, state: 'done' } : m));
      next.phases = next.phases.map(p => (p.state === 'active' ? { ...p, state: 'done' } : p));
      next.files = next.files.map(f => (f.status === 'writing' ? { ...f, status: 'done' } : f));
      next.planSteps = next.planSteps.map(s => (s.state === 'active' ? { ...s, state: 'done' } : s));
      break;
  }

  return next;
}

export function reduceActivityAll(events: HuggyStreamEvent[]): AgentActivityState {
  return events.reduce(reduceActivity, createInitialActivityState());
}

export function activeMilestone(state: AgentActivityState): ActivityMilestone | undefined {
  return state.milestones.find(m => m.state === 'active');
}

export type ActivitySummary = {
  filesChanged: number;
  elapsedMs: number;
  checksPassed: number;
  checksFailed: number;
  hasError: boolean;
};

export function summarizeActivity(state: AgentActivityState): ActivitySummary {
  const elapsedMs = state.startedAt && state.endedAt ? Math.max(0, state.endedAt - state.startedAt) : 0;
  return {
    filesChanged: state.files.length,
    elapsedMs,
    checksPassed: state.checks.filter(c => c.status === 'pass').length,
    checksFailed: state.checks.filter(c => c.status === 'fail').length,
    hasError: state.phase === 'error',
  };
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** One-line recap shown once the stream completes (Lovable-style collapse). */
export function recapLine(state: AgentActivityState): string {
  const summary = summarizeActivity(state);
  if (summary.hasError) {
    return `Échec · ${state.error?.message || 'erreur inconnue'}`;
  }
  const parts: string[] = ['Terminé'];
  if (summary.filesChanged > 0) {
    parts.push(`${summary.filesChanged} fichier${summary.filesChanged > 1 ? 's' : ''}`);
  }
  if (summary.checksFailed > 0) {
    parts.push(`${summary.checksFailed} échec${summary.checksFailed > 1 ? 's' : ''} de vérification`);
  } else if (summary.checksPassed > 0) {
    parts.push(`${summary.checksPassed} vérification${summary.checksPassed > 1 ? 's' : ''} OK`);
  }
  if (summary.elapsedMs > 0) {
    parts.push(formatElapsed(summary.elapsedMs));
  }
  return parts.join(' · ');
}
