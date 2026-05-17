import type { AgentPhase, AnyStreamEventEnvelope, FileChangePayload, ToolCallCompletedPayload, ToolCallFailedPayload, ToolCallOutputPayload, ToolCallStartedPayload } from './stream-events';
import type { UUID } from './types';

export type GenerationState =
  | 'idle'
  | 'sending'
  | 'thinking'
  | 'planning'
  | 'editing_files'
  | 'installing'
  | 'building'
  | 'fixing'
  | 'preview_ready'
  | 'deploying'
  | 'deployed'
  | 'failed'
  | 'cancelled';

export interface AssistantMessageViewModel {
  messageId: UUID;
  content: string;
  completed: boolean;
}

export interface TimelineStepViewModel {
  stepId: UUID;
  title: string;
  phase: AgentPhase;
  status: 'running' | 'completed' | 'failed';
  severity: AnyStreamEventEnvelope['severity'];
  progress?: number;
  summary?: string;
  events: AnyStreamEventEnvelope[];
  fileChanges: FileChangePayload[];
  toolCalls: ToolCallViewModel[];
}

export interface ToolCallViewModel {
  id: UUID;
  name: string;
  status: 'running' | 'completed' | 'failed';
  inputSummary?: string;
  outputSummary?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

export interface PreviewCardViewModel {
  previewId: UUID;
  status: 'building' | 'ready' | 'failed';
  url?: string;
  screenshotUrl?: string;
  message?: string;
}

export interface DeploymentCardViewModel {
  deploymentId: UUID;
  status: 'running' | 'completed' | 'failed';
  provider: string;
  target?: string;
  phase?: string;
  message?: string;
  progress?: number;
  url?: string;
}

export interface DomainVerificationViewModel {
  deploymentId: UUID;
  domain: string;
  records: Array<{ type: string; name: string; value: string }>;
  verified: boolean;
}

export interface CreditUsageViewModel {
  amount: number;
  reason: string;
  remaining?: number;
}

export interface ConversationStreamViewModel {
  events: AnyStreamEventEnvelope[];
  assistantMessages: AssistantMessageViewModel[];
  timelineSteps: TimelineStepViewModel[];
  previews: PreviewCardViewModel[];
  deployments: DeploymentCardViewModel[];
  domains: DomainVerificationViewModel[];
  credits: CreditUsageViewModel[];
  state: GenerationState;
  lastSequenceNumber: number;
}

export function reduceStreamEvents(current: AnyStreamEventEnvelope[], incoming: AnyStreamEventEnvelope | AnyStreamEventEnvelope[]): AnyStreamEventEnvelope[] {
  const nextEvents = Array.isArray(incoming) ? incoming : [incoming];
  const byId = new Map(current.map((event) => [event.event_id, event]));
  for (const event of nextEvents) {
    if (event.visibility !== 'public') continue;
    byId.set(event.event_id, event);
  }
  return Array.from(byId.values()).sort((a, b) => a.sequence_number - b.sequence_number);
}

export function buildConversationStreamViewModel(events: AnyStreamEventEnvelope[]): ConversationStreamViewModel {
  const publicEvents = reduceStreamEvents([], events);
  return {
    events: publicEvents,
    assistantMessages: buildAssistantMessages(publicEvents),
    timelineSteps: buildTimelineSteps(publicEvents),
    previews: buildPreviewCards(publicEvents),
    deployments: buildDeploymentCards(publicEvents),
    domains: buildDomainVerificationCards(publicEvents),
    credits: buildCreditUsage(publicEvents),
    state: deriveGenerationState(publicEvents),
    lastSequenceNumber: publicEvents.at(-1)?.sequence_number ?? 0,
  };
}

export function buildAssistantMessages(events: AnyStreamEventEnvelope[]): AssistantMessageViewModel[] {
  const messages = new Map<UUID, AssistantMessageViewModel>();
  for (const event of events) {
    if (event.type === 'chat.message.created' && event.payload.role === 'assistant') {
      messages.set(event.payload.message_id, {
        messageId: event.payload.message_id,
        content: event.payload.content,
        completed: event.payload.content.length > 0,
      });
    }
    if (event.type === 'ai.token') {
      const current = messages.get(event.payload.message_id) ?? { messageId: event.payload.message_id, content: '', completed: false };
      messages.set(event.payload.message_id, { ...current, content: current.content + event.payload.token });
    }
    if (event.type === 'ai.message.completed') {
      messages.set(event.payload.message_id, {
        messageId: event.payload.message_id,
        content: event.payload.content,
        completed: true,
      });
    }
  }
  return Array.from(messages.values());
}

export function buildTimelineSteps(events: AnyStreamEventEnvelope[]): TimelineStepViewModel[] {
  const steps = new Map<UUID, TimelineStepViewModel>();
  for (const event of events) {
    if (event.type === 'agent.step.started') {
      steps.set(event.payload.step_id, {
        stepId: event.payload.step_id,
        title: event.payload.title,
        phase: event.payload.phase,
        status: 'running',
        severity: event.severity,
        events: [event],
        fileChanges: [],
        toolCalls: [],
      });
      continue;
    }
    const stepId = event.step_id;
    if (!stepId) continue;
    const step = steps.get(stepId) ?? {
      stepId,
      title: 'Étape agent',
      phase: 'planning' as AgentPhase,
      status: 'running' as const,
      severity: 'info' as const,
      events: [],
      fileChanges: [],
      toolCalls: [],
    };
    step.events.push(event);
    if (event.type === 'agent.step.progress') {
      step.progress = event.payload.progress;
      step.summary = event.payload.message;
    }
    if (event.type === 'agent.step.completed') {
      step.status = 'completed';
      step.severity = event.severity;
      step.summary = event.payload.summary;
    }
    if (event.type === 'agent.step.failed') {
      step.status = 'failed';
      step.severity = 'error';
      step.summary = event.payload.message;
    }
    if (event.type === 'file.created' || event.type === 'file.updated' || event.type === 'file.deleted') {
      step.fileChanges.push(event.payload);
    }
    if (event.type === 'tool.call.started' || event.type === 'tool.call.output' || event.type === 'tool.call.completed' || event.type === 'tool.call.failed') {
      step.toolCalls = upsertToolCall(step.toolCalls, event.payload);
    }
    steps.set(stepId, step);
  }
  return Array.from(steps.values());
}

function upsertToolCall(toolCalls: ToolCallViewModel[], payload: ToolCallStartedPayload | ToolCallOutputPayload | ToolCallCompletedPayload | ToolCallFailedPayload): ToolCallViewModel[] {
  const existing = toolCalls.find((toolCall) => toolCall.id === payload.tool_call_id) ?? { id: payload.tool_call_id, name: 'tool', status: 'running' as const };
  let next = existing;
  if ('input_summary' in payload) {
    next = { ...next, name: payload.name, status: 'running', inputSummary: payload.input_summary, startedAt: payload.started_at };
  }
  if ('output_summary' in payload) {
    next = { ...next, outputSummary: payload.output_summary };
  }
  if ('duration_ms' in payload && 'name' in payload && 'output_summary' in payload) {
    next = { ...next, name: payload.name, status: 'completed', outputSummary: payload.output_summary, startedAt: payload.started_at, completedAt: payload.completed_at, durationMs: payload.duration_ms };
  }
  if ('error' in payload) {
    next = { ...next, name: payload.name, status: 'failed', error: payload.error.message, startedAt: payload.started_at, completedAt: payload.completed_at, durationMs: payload.duration_ms };
  }
  return [...toolCalls.filter((toolCall) => toolCall.id !== payload.tool_call_id), next];
}

export function buildPreviewCards(events: AnyStreamEventEnvelope[]): PreviewCardViewModel[] {
  const previews = new Map<UUID, PreviewCardViewModel>();
  for (const event of events) {
    if (event.type === 'preview.created') previews.set(event.payload.preview_id, { previewId: event.payload.preview_id, status: 'building' });
    if (event.type === 'preview.ready') previews.set(event.payload.preview_id, { previewId: event.payload.preview_id, status: 'ready', url: event.payload.url, screenshotUrl: event.payload.screenshot_url });
    if (event.type === 'preview.failed') previews.set(event.payload.preview_id, { previewId: event.payload.preview_id, status: 'failed', message: event.payload.message });
  }
  return Array.from(previews.values());
}

export function buildDeploymentCards(events: AnyStreamEventEnvelope[]): DeploymentCardViewModel[] {
  const deployments = new Map<UUID, DeploymentCardViewModel>();
  for (const event of events) {
    if (event.type === 'deploy.started') deployments.set(event.payload.deployment_id, { deploymentId: event.payload.deployment_id, provider: event.payload.provider, target: event.payload.target, status: 'running' });
    if (event.type === 'deploy.progress') {
      const current = deployments.get(event.payload.deployment_id) ?? { deploymentId: event.payload.deployment_id, provider: 'vercel', status: 'running' as const };
      deployments.set(event.payload.deployment_id, { ...current, phase: event.payload.phase, message: event.payload.message, progress: event.payload.progress, status: 'running' });
    }
    if (event.type === 'deploy.completed') {
      const current = deployments.get(event.payload.deployment_id) ?? { deploymentId: event.payload.deployment_id, provider: 'vercel', status: 'running' as const };
      deployments.set(event.payload.deployment_id, { ...current, status: 'completed', url: event.payload.url });
    }
    if (event.type === 'deploy.failed') {
      const current = deployments.get(event.payload.deployment_id) ?? { deploymentId: event.payload.deployment_id, provider: 'vercel', status: 'running' as const };
      deployments.set(event.payload.deployment_id, { ...current, status: 'failed', phase: event.payload.phase, message: event.payload.message });
    }
  }
  return Array.from(deployments.values());
}

export function buildDomainVerificationCards(events: AnyStreamEventEnvelope[]): DomainVerificationViewModel[] {
  const domains = new Map<string, DomainVerificationViewModel>();
  for (const event of events) {
    if (event.type === 'domain.verification.required') {
      domains.set(`${event.payload.deployment_id}:${event.payload.domain}`, {
        deploymentId: event.payload.deployment_id,
        domain: event.payload.domain,
        records: event.payload.records,
        verified: false,
      });
    }
    if (event.type === 'domain.verified') {
      const key = `${event.payload.deployment_id}:${event.payload.domain}`;
      const current = domains.get(key) ?? { deploymentId: event.payload.deployment_id, domain: event.payload.domain, records: [], verified: false };
      domains.set(key, { ...current, verified: true });
    }
  }
  return Array.from(domains.values());
}

export function buildCreditUsage(events: AnyStreamEventEnvelope[]): CreditUsageViewModel[] {
  return events.filter((event) => event.type === 'credits.consumed').map((event) => ({
    amount: event.payload.amount,
    reason: event.payload.reason,
    remaining: event.payload.remaining,
  }));
}

export function deriveGenerationState(events: AnyStreamEventEnvelope[]): GenerationState {
  const last = events.at(-1);
  if (!last) return 'idle';
  if (last.type === 'error' && last.payload.code === 'generation_cancelled') return 'cancelled';
  if (last.type.endsWith('.failed') || last.severity === 'error') return 'failed';
  if (last.type === 'agent.run.started') return 'thinking';
  if (last.type === 'preview.ready') return 'preview_ready';
  if (last.type === 'deploy.completed') return 'deployed';
  if (last.type === 'deploy.started' || last.type === 'deploy.progress') return 'deploying';
  if (last.type === 'build.started' || last.type === 'build.log') return 'building';
  if (last.type === 'agent.step.started') return stateFromPhase(last.payload.phase);
  if (last.type === 'agent.step.progress') {
    const step = events.find((event) => event.type === 'agent.step.started' && event.payload.step_id === last.payload.step_id);
    return step && step.type === 'agent.step.started' ? stateFromPhase(step.payload.phase) : 'thinking';
  }
  return 'thinking';
}

function stateFromPhase(phase: AgentPhase): GenerationState {
  if (phase === 'planning' || phase === 'requirement_analysis') return 'planning';
  if (phase === 'file_generation') return 'editing_files';
  if (phase === 'dependency_installation') return 'installing';
  if (phase === 'build') return 'building';
  if (phase === 'error_fixing') return 'fixing';
  if (phase === 'preview') return 'preview_ready';
  if (phase === 'deployment') return 'deploying';
  return 'thinking';
}

export function shouldAutoScroll(input: { scrollTop: number; scrollHeight: number; clientHeight: number; threshold?: number }): boolean {
  return input.scrollHeight - input.scrollTop - input.clientHeight <= (input.threshold ?? 96);
}

export function compactTimelineLabel(step: TimelineStepViewModel): string {
  const fileCount = step.fileChanges.length;
  if (fileCount > 0) return `${step.title} — ${fileCount} fichier(s)`;
  if (step.progress !== undefined && step.status === 'running') return `${step.title} — ${Math.round(step.progress)}%`;
  return step.summary ? `${step.title} — ${step.summary}` : step.title;
}
