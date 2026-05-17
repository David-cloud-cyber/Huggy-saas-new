import type { EventBus } from './event-bus';
import { PlatformEventBus } from './event-bus';
import type { StreamEventEnvelope } from './stream-events';
import type { Project, QueueJob, RequestContext, UUID } from './types';
import { PlatformError } from './security';
import { CreditService, PromptService, QueueWorkerService, UsageMeteringService } from './services';

export interface CreateMessageInput {
  project: Project;
  conversationId?: UUID;
  prompt: string;
  model?: string;
  mode?: 'generate' | 'edit' | 'fix' | 'deploy' | 'retry';
  retryAgentRunId?: UUID;
}

export interface CreateMessageResult {
  conversation_id: UUID;
  agent_run_id: UUID;
  user_message_id: UUID;
  assistant_message_id: UUID;
  queued_job: QueueJob<Record<string, unknown>>;
}

export interface StreamRequestInput {
  project: Project;
  conversationId: UUID;
  lastEventId?: string | number;
  afterSequenceNumber?: number;
  limit?: number;
}

export interface StreamSnapshot {
  conversation_id: UUID;
  events: StreamEventEnvelope[];
  last_sequence_number: number;
}

export interface CancelAgentRunInput {
  project: Project;
  conversationId: UUID;
  agentRunId: UUID;
}

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): UUID {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${value}`;
}

function assertProjectAccess(context: RequestContext, project: Project): void {
  if (context.organizationId !== project.organizationId || context.projectId && context.projectId !== project.id) {
    throw new PlatformError('forbidden', 'You cannot access this project.', 403);
  }
}

export class VisualStreamingApiHandlers {
  constructor(
    private readonly eventBus: EventBus = new PlatformEventBus(),
    private readonly queue: QueueWorkerService = new QueueWorkerService(),
    private readonly prompts: PromptService = new PromptService(),
    private readonly credits: CreditService = new CreditService(),
    private readonly usage: UsageMeteringService = new UsageMeteringService(),
  ) {}

  async postProjectMessage(context: RequestContext, input: CreateMessageInput): Promise<CreateMessageResult> {
    assertProjectAccess(context, input.project);
    const projectContext = { ...context, projectId: input.project.id };
    await this.prompts.createPrompt(projectContext, input.project, input.prompt);
    await this.credits.reserveCredits(projectContext, 20, 'prompt_generation');
    await this.usage.record(projectContext, 'prompt_generation');

    const conversationId = input.conversationId ?? id('conversation');
    const agentRunId = id('agent_run');
    const userMessageId = id('message');
    const assistantMessageId = id('message');

    await this.eventBus.emitEvent({
      organization_id: input.project.organizationId,
      project_id: input.project.id,
      conversation_id: conversationId,
      agent_run_id: agentRunId,
      type: 'chat.message.created',
      payload: {
        message_id: userMessageId,
        role: 'user',
        content: input.prompt,
      },
      visibility: 'public',
      severity: 'info',
    });

    await this.eventBus.emitEvent({
      organization_id: input.project.organizationId,
      project_id: input.project.id,
      conversation_id: conversationId,
      agent_run_id: agentRunId,
      type: 'chat.message.created',
      payload: {
        message_id: assistantMessageId,
        role: 'assistant',
        content: '',
        parent_message_id: userMessageId,
      },
      visibility: 'public',
      severity: 'info',
    });

    await this.eventBus.emitEvent({
      organization_id: input.project.organizationId,
      project_id: input.project.id,
      conversation_id: conversationId,
      agent_run_id: agentRunId,
      type: 'agent.run.started',
      payload: {
        run_id: agentRunId,
        objective: input.prompt,
        model: input.model,
        mode: input.mode ?? 'generate',
      },
      visibility: 'public',
      severity: 'info',
    });

    const queuedJob = this.queue.enqueue('agent_run', {
      context: projectContext,
      project: input.project,
      prompt: input.prompt,
      conversationId,
      agentRunId,
      assistantMessageId,
      retryAgentRunId: input.retryAgentRunId,
      requestedAt: now(),
    });

    return {
      conversation_id: conversationId,
      agent_run_id: agentRunId,
      user_message_id: userMessageId,
      assistant_message_id: assistantMessageId,
      queued_job: queuedJob as QueueJob<Record<string, unknown>>,
    };
  }

  async getProjectStream(context: RequestContext, input: StreamRequestInput): Promise<StreamSnapshot> {
    assertProjectAccess(context, input.project);
    const afterSequenceNumber = typeof input.lastEventId === 'number' ? input.lastEventId : input.lastEventId ? Number(input.lastEventId) : input.afterSequenceNumber ?? 0;
    const events = await this.eventBus.listEventsAfter({
      conversationId: input.conversationId,
      afterSequenceNumber: Number.isFinite(afterSequenceNumber) ? afterSequenceNumber : 0,
      limit: input.limit ?? 500,
      publicOnly: true,
    });
    return {
      conversation_id: input.conversationId,
      events,
      last_sequence_number: events.at(-1)?.sequence_number ?? afterSequenceNumber,
    };
  }

  subscribeProjectStream(context: RequestContext, input: StreamRequestInput, onEvent: (event: StreamEventEnvelope) => void): () => void {
    assertProjectAccess(context, input.project);
    return this.eventBus.subscribe(input.conversationId, (event) => {
      if (event.project_id !== input.project.id || event.visibility !== 'public') return;
      onEvent(event);
    });
  }

  async cancelAgentRun(context: RequestContext, input: CancelAgentRunInput): Promise<{ ok: true }> {
    assertProjectAccess(context, input.project);
    await this.eventBus.emitEvent({
      organization_id: input.project.organizationId,
      project_id: input.project.id,
      conversation_id: input.conversationId,
      agent_run_id: input.agentRunId,
      type: 'error',
      payload: {
        code: 'generation_cancelled',
        message: 'La génération a été annulée.',
        retryable: true,
      },
      visibility: 'public',
      severity: 'warning',
    });
    return { ok: true };
  }
}
