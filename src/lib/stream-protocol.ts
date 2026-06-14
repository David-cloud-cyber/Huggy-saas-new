/**
 * Huggy Stream Protocol v2
 *
 * Typed SSE event contract shared by the server (producer) and the
 * frontend stream client (consumer). Every event is emitted as:
 *
 *   id: <sequence>\n
 *   event: <type>\n
 *   data: <JSON of the full event object>\n\n
 *
 * The numeric `id` mirrors the SSE `id:` field so clients can resume a
 * dropped connection with the `Last-Event-ID` header.
 */

export const HUGGY_STREAM_PROTOCOL_VERSION = 'huggy-stream-v2' as const;

export const HUGGY_SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

/** SSE comment line used as keepalive. Parsers must skip it. */
export const HUGGY_SSE_HEARTBEAT = ': keepalive\n\n';
export const HUGGY_SSE_HEARTBEAT_INTERVAL_MS = 15_000;

export type HuggyStreamMilestone =
  | 'understanding'
  | 'inspecting'
  | 'planning'
  | 'generating'
  | 'checking'
  | 'fixing'
  | 'preview_ready';

/**
 * Reasoning phases the agent walks through, in order. These power the new
 * transparent pipeline UI (understand → decide → plan → reason → build →
 * verify → fix → recap) so the user sees the agent *think*, never guess.
 */
export type HuggyReasoningPhase =
  | 'understand'
  | 'decide'
  | 'plan'
  | 'reason'
  | 'build'
  | 'verify'
  | 'fix'
  | 'recap';

export const HUGGY_REASONING_PHASE_ORDER: readonly HuggyReasoningPhase[] = [
  'understand',
  'decide',
  'plan',
  'reason',
  'build',
  'verify',
  'fix',
  'recap',
];

/** A single actionable step in the agent's plan, shown as a live checklist. */
export type HuggyPlanStep = {
  id: string;
  title: string;
  /** What the step does to the workspace. */
  kind: 'create' | 'edit' | 'delete' | 'task';
  path?: string;
};

export type HuggyStreamEventType =
  | 'status'
  | 'milestone'
  | 'phase'
  | 'understanding'
  | 'assumption'
  | 'clarification'
  | 'plan'
  | 'plan_step'
  | 'reasoning_delta'
  | 'assistant_delta'
  | 'file_start'
  | 'file_delta'
  | 'file_done'
  | 'check'
  | 'warning'
  | 'error'
  | 'done';

const EVENT_TYPES: readonly HuggyStreamEventType[] = [
  'status',
  'milestone',
  'phase',
  'understanding',
  'assumption',
  'clarification',
  'plan',
  'plan_step',
  'reasoning_delta',
  'assistant_delta',
  'file_start',
  'file_delta',
  'file_done',
  'check',
  'warning',
  'error',
  'done',
];

interface HuggyStreamEventBase {
  v: typeof HUGGY_STREAM_PROTOCOL_VERSION;
  /** Monotonic sequence number, mirrored in the SSE `id:` field. */
  id: number;
  /** Epoch milliseconds at emission time. */
  ts: number;
  type: HuggyStreamEventType;
}

export interface HuggyStatusEvent extends HuggyStreamEventBase {
  type: 'status';
  /** Short user-facing status line in the user language. */
  message: string;
}

export interface HuggyMilestoneEvent extends HuggyStreamEventBase {
  type: 'milestone';
  milestone: HuggyStreamMilestone;
  state: 'active' | 'done';
  /** Optional user-facing label override. */
  label?: string;
}

/**
 * Phase transition. Drives the transparent pipeline timeline. `state: 'active'`
 * highlights the phase; earlier active phases auto-complete on the client.
 */
export interface HuggyPhaseEvent extends HuggyStreamEventBase {
  type: 'phase';
  phase: HuggyReasoningPhase;
  state: 'active' | 'done' | 'failed';
  /** Optional user-facing label override. */
  label?: string;
}

/** What the agent understood from the request — shown before it acts. */
export interface HuggyUnderstandingEvent extends HuggyStreamEventBase {
  type: 'understanding';
  /** One-sentence restatement of the goal, in the user's language. */
  summary: string;
  /** Detected project kind, e.g. "calculatrice React". */
  projectType?: string;
  /** Concrete requirements the agent extracted. */
  requirements: string[];
  /** Calibrated confidence 0–1 from the decision core. */
  confidence?: number;
}

/** An explicit assumption surfaced when acting at medium confidence. */
export interface HuggyAssumptionEvent extends HuggyStreamEventBase {
  type: 'assumption';
  text: string;
}

/**
 * The agent stops and asks ONE focused question instead of guessing.
 * Optional `options` render as quick-reply chips.
 */
export interface HuggyClarificationEvent extends HuggyStreamEventBase {
  type: 'clarification';
  question: string;
  options?: string[];
}

/** The full plan, emitted once as a checklist the build phase ticks off. */
export interface HuggyPlanEvent extends HuggyStreamEventBase {
  type: 'plan';
  steps: HuggyPlanStep[];
}

/** A plan step changing state (the live checklist tick). */
export interface HuggyPlanStepEvent extends HuggyStreamEventBase {
  type: 'plan_step';
  stepId: string;
  state: 'active' | 'done' | 'failed';
}

/**
 * Incremental reasoning text — the agent thinking out loud. Rendered in a
 * collapsible "Réflexion" panel, separate from the assistant's final answer.
 */
export interface HuggyReasoningDeltaEvent extends HuggyStreamEventBase {
  type: 'reasoning_delta';
  text: string;
}

export interface HuggyAssistantDeltaEvent extends HuggyStreamEventBase {
  type: 'assistant_delta';
  /** Incremental assistant text chunk for fluid rendering. */
  text: string;
}

export interface HuggyFileStartEvent extends HuggyStreamEventBase {
  type: 'file_start';
  path: string;
  language?: string;
  index?: number;
  total?: number;
}

export interface HuggyFileDeltaEvent extends HuggyStreamEventBase {
  type: 'file_delta';
  path: string;
  /** Number of characters generated so far for this file. */
  chars: number;
}

export interface HuggyFileDoneEvent extends HuggyStreamEventBase {
  type: 'file_done';
  path: string;
  bytes?: number;
}

export interface HuggyCheckEvent extends HuggyStreamEventBase {
  type: 'check';
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail?: string;
}

export interface HuggyWarningEvent extends HuggyStreamEventBase {
  type: 'warning';
  message: string;
}

export interface HuggyErrorEvent extends HuggyStreamEventBase {
  type: 'error';
  message: string;
  recoverable: boolean;
  diagnostic_code?: string;
}

export interface HuggyDoneEvent extends HuggyStreamEventBase {
  type: 'done';
  /** Final response payload (same shape as the non-streaming JSON response). */
  payload: unknown;
}

export type HuggyStreamEvent =
  | HuggyStatusEvent
  | HuggyMilestoneEvent
  | HuggyPhaseEvent
  | HuggyUnderstandingEvent
  | HuggyAssumptionEvent
  | HuggyClarificationEvent
  | HuggyPlanEvent
  | HuggyPlanStepEvent
  | HuggyReasoningDeltaEvent
  | HuggyAssistantDeltaEvent
  | HuggyFileStartEvent
  | HuggyFileDeltaEvent
  | HuggyFileDoneEvent
  | HuggyCheckEvent
  | HuggyWarningEvent
  | HuggyErrorEvent
  | HuggyDoneEvent;

export function isHuggyStreamEvent(value: unknown): value is HuggyStreamEvent {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<HuggyStreamEventBase>;
  return (
    record.v === HUGGY_STREAM_PROTOCOL_VERSION &&
    typeof record.id === 'number' &&
    typeof record.type === 'string' &&
    (EVENT_TYPES as readonly string[]).includes(record.type)
  );
}

/** Serializes one event into a spec-compliant SSE block. */
export function serializeHuggyStreamEvent(event: HuggyStreamEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

type HuggyStreamEventInput<T extends HuggyStreamEventType> = Omit<
  Extract<HuggyStreamEvent, { type: T }>,
  'v' | 'id' | 'ts' | 'type'
>;

export interface HuggyStreamEmitter {
  emit<T extends HuggyStreamEventType>(type: T, body: HuggyStreamEventInput<T>): HuggyStreamEvent;
  heartbeat(): void;
  readonly lastId: number;
}

/**
 * Server-side helper: creates a sequenced emitter bound to a raw write
 * function (e.g. `res.write` on an Express response).
 *
 *   const stream = createHuggyStreamEmitter((chunk) => res.write(chunk));
 *   stream.emit('milestone', { milestone: 'generating', state: 'active' });
 */
export function createHuggyStreamEmitter(
  write: (chunk: string) => void,
  startId = 0,
): HuggyStreamEmitter {
  let sequence = startId;
  return {
    emit(type, body) {
      sequence += 1;
      const event = {
        v: HUGGY_STREAM_PROTOCOL_VERSION,
        id: sequence,
        ts: Date.now(),
        type,
        ...body,
      } as unknown as HuggyStreamEvent;
      write(serializeHuggyStreamEvent(event));
      return event;
    },
    heartbeat() {
      write(HUGGY_SSE_HEARTBEAT);
    },
    get lastId() {
      return sequence;
    },
  };
}
