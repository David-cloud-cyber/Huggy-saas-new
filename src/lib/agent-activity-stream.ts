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
} from './stream-protocol.ts';

export type ActivityPhase = 'idle' | 'streaming' | 'done' | 'error';
export type FileActivityStatus = 'writing' | 'done';

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
};

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

function milestoneOrder(key: string): number {
  const index = MILESTONE_ORDER.indexOf(key as HuggyStreamMilestone);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

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
    const activeOrder = milestoneOrder(key);
    for (let i = 0; i < next.length; i++) {
      if (next[i].key !== key && next[i].state === 'active' && milestoneOrder(next[i].key) < activeOrder) {
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
      next.collapsed = true; // calm: condense to the recap line
      // Any milestone still active is now complete.
      next.milestones = next.milestones.map(m => (m.state === 'active' ? { ...m, state: 'done' } : m));
      next.files = next.files.map(f => (f.status === 'writing' ? { ...f, status: 'done' } : f));
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
