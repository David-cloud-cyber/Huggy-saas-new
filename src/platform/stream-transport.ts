import type { EventBus } from './event-bus';
import { formatSseEvent, formatSseHeartbeat } from './event-bus';
import type { AnyStreamEventEnvelope } from './stream-events';
import type { Project, RequestContext, UUID } from './types';
import { PlatformError } from './security';

export interface SseStreamInput {
  context: RequestContext;
  project: Project;
  conversationId: UUID;
  lastEventId?: string | number;
  afterSequenceNumber?: number;
  heartbeatMs?: number;
  replayLimit?: number;
  signal?: AbortSignal;
}

export interface SseStreamResult {
  stream: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
}

export interface PollingEventsInput {
  context: RequestContext;
  project: Project;
  conversationId: UUID;
  afterSequenceNumber?: number;
  limit?: number;
}

export interface PollingEventsResult {
  events: AnyStreamEventEnvelope[];
  lastSequenceNumber: number;
  hasMore: boolean;
}

export interface SupabaseRealtimeStreamConfig {
  channel: string;
  schema: 'public';
  table: 'stream_events';
  filter: string;
  event: 'INSERT';
}

const encoder = new TextEncoder();

function assertProjectAccess(context: RequestContext, project: Project): void {
  if (context.organizationId !== project.organizationId || context.projectId && context.projectId !== project.id) {
    throw new PlatformError('forbidden', 'You cannot access this project.', 403);
  }
}

function sequenceFromInput(input: Pick<SseStreamInput, 'lastEventId' | 'afterSequenceNumber'>): number {
  if (typeof input.lastEventId === 'number') return input.lastEventId;
  if (typeof input.lastEventId === 'string' && input.lastEventId.trim()) return Number(input.lastEventId);
  return input.afterSequenceNumber ?? 0;
}

export async function createSseStream(eventBus: EventBus, input: SseStreamInput): Promise<SseStreamResult> {
  assertProjectAccess(input.context, input.project);
  const afterSequenceNumber = Number.isFinite(sequenceFromInput(input)) ? sequenceFromInput(input) : 0;
  const heartbeatMs = input.heartbeatMs ?? 15_000;
  const replayLimit = input.replayLimit ?? 500;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (value: string) => controller.enqueue(encoder.encode(value));
      const replayed = await eventBus.listEventsAfter({
        conversationId: input.conversationId,
        afterSequenceNumber,
        limit: replayLimit,
        publicOnly: true,
      });
      for (const event of replayed) {
        write(formatSseEvent(event));
      }
      const unsubscribe = eventBus.subscribe(input.conversationId, (event) => {
        if (event.project_id !== input.project.id || event.visibility !== 'public') return;
        write(formatSseEvent(event));
      });
      const heartbeat = setInterval(() => write(formatSseHeartbeat()), heartbeatMs);
      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          return;
        }
      };
      input.signal?.addEventListener('abort', close, { once: true });
    },
  });

  return {
    stream,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  };
}

export async function listPollingEvents(eventBus: EventBus, input: PollingEventsInput): Promise<PollingEventsResult> {
  assertProjectAccess(input.context, input.project);
  const limit = input.limit ?? 500;
  const events = await eventBus.listEventsAfter({
    conversationId: input.conversationId,
    afterSequenceNumber: input.afterSequenceNumber ?? 0,
    limit: limit + 1,
    publicOnly: true,
  });
  const page = events.slice(0, limit) as AnyStreamEventEnvelope[];
  return {
    events: page,
    lastSequenceNumber: page.at(-1)?.sequence_number ?? input.afterSequenceNumber ?? 0,
    hasMore: events.length > limit,
  };
}

export function createSupabaseRealtimeStreamConfig(conversationId: UUID): SupabaseRealtimeStreamConfig {
  return {
    channel: `conversation:${conversationId}`,
    schema: 'public',
    table: 'stream_events',
    filter: `conversation_id=eq.${conversationId}`,
    event: 'INSERT',
  };
}
