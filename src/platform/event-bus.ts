import type { EmitEventInput, StreamEventEnvelope, StreamEventType } from './stream-events';
import type { UUID } from './types';

export interface EventStore {
  insertEvent<TType extends StreamEventType>(input: EmitEventInput<TType>): Promise<StreamEventEnvelope<TType>>;
  listEventsAfter(input: { conversationId: UUID; afterSequenceNumber?: number; limit?: number; publicOnly?: boolean }): Promise<StreamEventEnvelope[]>;
  listEventsBefore(input: { conversationId: UUID; beforeSequenceNumber?: number; limit?: number; publicOnly?: boolean }): Promise<StreamEventEnvelope[]>;
}

export interface RealtimePublisher {
  publish(event: StreamEventEnvelope): Promise<void>;
}

export type StreamEventSubscriber = (event: StreamEventEnvelope) => void | Promise<void>;

export interface EventBus {
  emitEvent<TType extends StreamEventType>(input: EmitEventInput<TType>): Promise<StreamEventEnvelope<TType>>;
  subscribe(conversationId: UUID, subscriber: StreamEventSubscriber): () => void;
  listEventsAfter(input: { conversationId: UUID; afterSequenceNumber?: number; limit?: number; publicOnly?: boolean }): Promise<StreamEventEnvelope[]>;
}

function now(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): UUID {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${value}`;
}

export class InMemoryEventStore implements EventStore {
  private readonly events: StreamEventEnvelope[] = [];
  private readonly counters = new Map<UUID, number>();

  async insertEvent<TType extends StreamEventType>(input: EmitEventInput<TType>): Promise<StreamEventEnvelope<TType>> {
    const nextSequence = (this.counters.get(input.conversation_id) ?? 0) + 1;
    this.counters.set(input.conversation_id, nextSequence);
    const event: StreamEventEnvelope<TType> = {
      event_id: randomId('event'),
      organization_id: input.organization_id,
      project_id: input.project_id,
      conversation_id: input.conversation_id,
      agent_run_id: input.agent_run_id ?? null,
      step_id: input.step_id ?? null,
      type: input.type,
      payload: input.payload,
      visibility: input.visibility ?? 'public',
      severity: input.severity ?? 'info',
      sequence_number: nextSequence,
      created_at: now(),
    };
    this.events.push(event);
    return event;
  }

  async listEventsAfter(input: { conversationId: UUID; afterSequenceNumber?: number; limit?: number; publicOnly?: boolean }): Promise<StreamEventEnvelope[]> {
    const after = input.afterSequenceNumber ?? 0;
    const limit = input.limit ?? 500;
    return this.events
      .filter((event) => event.conversation_id === input.conversationId)
      .filter((event) => event.sequence_number > after)
      .filter((event) => !input.publicOnly || event.visibility === 'public')
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .slice(0, limit);
  }

  async listEventsBefore(input: { conversationId: UUID; beforeSequenceNumber?: number; limit?: number; publicOnly?: boolean }): Promise<StreamEventEnvelope[]> {
    const before = input.beforeSequenceNumber ?? Number.MAX_SAFE_INTEGER;
    const limit = input.limit ?? 100;
    return this.events
      .filter((event) => event.conversation_id === input.conversationId)
      .filter((event) => event.sequence_number < before)
      .filter((event) => !input.publicOnly || event.visibility === 'public')
      .sort((a, b) => b.sequence_number - a.sequence_number)
      .slice(0, limit)
      .reverse();
  }
}

export class InMemoryRealtimePublisher implements RealtimePublisher {
  private readonly published: StreamEventEnvelope[] = [];

  async publish(event: StreamEventEnvelope): Promise<void> {
    this.published.push(event);
  }

  list(): StreamEventEnvelope[] {
    return [...this.published];
  }
}

export class SseHub {
  private readonly subscribers = new Map<UUID, Set<StreamEventSubscriber>>();

  subscribe(conversationId: UUID, subscriber: StreamEventSubscriber): () => void {
    const subscribers = this.subscribers.get(conversationId) ?? new Set<StreamEventSubscriber>();
    subscribers.add(subscriber);
    this.subscribers.set(conversationId, subscribers);
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) {
        this.subscribers.delete(conversationId);
      }
    };
  }

  publish(event: StreamEventEnvelope): void {
    const subscribers = this.subscribers.get(event.conversation_id);
    if (!subscribers) return;
    for (const subscriber of subscribers) {
      void subscriber(event);
    }
  }
}

export class PlatformEventBus implements EventBus {
  constructor(
    private readonly store: EventStore = new InMemoryEventStore(),
    private readonly realtime: RealtimePublisher = new InMemoryRealtimePublisher(),
    private readonly sseHub: SseHub = new SseHub(),
  ) {}

  async emitEvent<TType extends StreamEventType>(input: EmitEventInput<TType>): Promise<StreamEventEnvelope<TType>> {
    const event = await this.store.insertEvent(input);
    if (event.visibility === 'public') {
      await this.realtime.publish(event);
      this.sseHub.publish(event);
    }
    return event;
  }

  subscribe(conversationId: UUID, subscriber: StreamEventSubscriber): () => void {
    return this.sseHub.subscribe(conversationId, subscriber);
  }

  listEventsAfter(input: { conversationId: UUID; afterSequenceNumber?: number; limit?: number; publicOnly?: boolean }): Promise<StreamEventEnvelope[]> {
    return this.store.listEventsAfter(input);
  }
}

export function formatSseEvent(event: StreamEventEnvelope): string {
  return `id: ${event.sequence_number}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function formatSseHeartbeat(): string {
  return 'event: heartbeat\ndata: {}\n\n';
}
