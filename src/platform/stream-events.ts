import type { UUID } from './types';

export type StreamEventType =
  | 'chat.message.created'
  | 'ai.token'
  | 'ai.message.completed'
  | 'agent.run.started'
  | 'agent.step.started'
  | 'agent.step.progress'
  | 'agent.step.completed'
  | 'agent.step.failed'
  | 'tool.call.started'
  | 'tool.call.output'
  | 'tool.call.completed'
  | 'tool.call.failed'
  | 'file.created'
  | 'file.updated'
  | 'file.deleted'
  | 'file.patch.applied'
  | 'build.queued'
  | 'build.started'
  | 'build.log'
  | 'build.completed'
  | 'build.failed'
  | 'preview.created'
  | 'preview.ready'
  | 'preview.failed'
  | 'deploy.started'
  | 'deploy.progress'
  | 'deploy.completed'
  | 'deploy.failed'
  | 'domain.verification.required'
  | 'domain.verified'
  | 'security.scan.started'
  | 'security.scan.completed'
  | 'credits.consumed'
  | 'error';

export type StreamVisibility = 'public' | 'internal';
export type StreamSeverity = 'info' | 'success' | 'warning' | 'error';
export type ChatMessageRole = 'user' | 'assistant' | 'system';
export type AgentRunMode = 'generate' | 'edit' | 'fix' | 'deploy' | 'retry';
export type AgentPhase =
  | 'requirement_analysis'
  | 'planning'
  | 'file_generation'
  | 'dependency_installation'
  | 'build'
  | 'error_fixing'
  | 'preview'
  | 'deployment'
  | 'rollback';

export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'patch_file'
  | 'run_command'
  | 'install_dependency'
  | 'build_project'
  | 'run_tests'
  | 'deploy_vercel'
  | 'verify_domain';

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type FileChangeType = 'created' | 'updated' | 'deleted' | 'renamed';
export type PreviewState = 'building' | 'ready' | 'failed' | 'expired';
export type DeploymentTarget = 'preview' | 'production';
export type DeploymentProvider = 'vercel';
export type BuildRuntime = 'node' | 'bun' | 'pnpm' | 'npm' | 'yarn';

export interface ChatMessageCreatedPayload {
  message_id: UUID;
  role: ChatMessageRole;
  content: string;
  parent_message_id?: UUID | null;
}

export interface AiTokenPayload {
  message_id: UUID;
  token: string;
  index: number;
}

export interface AiMessageCompletedPayload {
  message_id: UUID;
  content: string;
  finish_reason: 'stop' | 'length' | 'tool_call' | 'cancelled' | 'error';
  token_count?: number;
}

export interface AgentRunStartedPayload {
  run_id: UUID;
  objective: string;
  model?: string;
  mode: AgentRunMode;
}

export interface AgentStepStartedPayload {
  step_id: UUID;
  title: string;
  phase: AgentPhase;
  description?: string;
}

export interface AgentStepProgressPayload {
  step_id: UUID;
  progress?: number;
  message: string;
}

export interface AgentStepCompletedPayload {
  step_id: UUID;
  summary: string;
  output?: unknown;
}

export interface AgentStepFailedPayload {
  step_id: UUID;
  error_code?: string;
  message: string;
  recoverable: boolean;
}

export interface ToolCallStartedPayload {
  tool_call_id: UUID;
  name: ToolName;
  status?: ToolCallStatus;
  input_summary: string;
  started_at?: string;
}

export interface ToolCallOutputPayload {
  tool_call_id: UUID;
  output_summary: string;
  chunk_index?: number;
  is_truncated?: boolean;
}

export interface ToolCallCompletedPayload {
  tool_call_id: UUID;
  name: ToolName;
  status?: ToolCallStatus;
  output_summary: string;
  started_at?: string;
  completed_at?: string;
  duration_ms: number;
}

export interface ToolCallFailedPayload {
  tool_call_id: UUID;
  name: ToolName;
  status?: ToolCallStatus;
  error: {
    code?: string;
    message: string;
    retryable: boolean;
  };
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
}

export interface FileChangePayload {
  file_change_id: UUID;
  path: string;
  previous_path?: string | null;
  change_type: FileChangeType;
  summary: string;
  additions?: number;
  deletions?: number;
  patch_preview?: string;
  patch_storage_path?: string | null;
}

export interface FilePatchAppliedPayload {
  file_change_id: UUID;
  path: string;
  summary: string;
  hunks: number;
  additions: number;
  deletions: number;
  patch_preview?: string;
  patch_storage_path?: string | null;
}

export interface BuildQueuedPayload {
  build_id: UUID;
  reason: 'initial_build' | 'retry' | 'post_fix' | 'deployment';
}

export interface BuildStartedPayload {
  build_id: UUID;
  command: string;
  runtime: BuildRuntime;
}

export interface BuildLogPayload {
  build_id: UUID;
  chunk_id: UUID;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  is_truncated?: boolean;
}

export interface BuildDiagnostic {
  tool: 'typescript' | 'vite' | 'next' | 'npm' | 'eslint' | 'unknown';
  message: string;
  file_path?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface BuildCompletedPayload {
  build_id: UUID;
  duration_ms: number;
  artifact_url?: string;
}

export interface BuildFailedPayload {
  build_id: UUID;
  duration_ms?: number;
  main_error: string;
  diagnostics: BuildDiagnostic[];
  fix_available: boolean;
}

export interface PreviewCreatedPayload {
  preview_id: UUID;
  status: 'building';
}

export interface PreviewReadyPayload {
  preview_id: UUID;
  url: string;
  screenshot_url?: string;
}

export interface PreviewFailedPayload {
  preview_id: UUID;
  message: string;
  retryable: boolean;
}

export interface DeployStartedPayload {
  deployment_id: UUID;
  provider: DeploymentProvider;
  target: DeploymentTarget;
}

export interface DeployProgressPayload {
  deployment_id: UUID;
  phase: 'creating_project' | 'uploading_files' | 'building' | 'assigning_domain' | 'verifying_dns';
  message: string;
  progress?: number;
}

export interface DeployCompletedPayload {
  deployment_id: UUID;
  url: string;
  provider_project_id?: string;
}

export interface DeployFailedPayload {
  deployment_id: UUID;
  phase?: string;
  message: string;
  retryable: boolean;
}

export interface DomainVerificationRequiredPayload {
  deployment_id: UUID;
  domain: string;
  records: Array<{
    type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
    name: string;
    value: string;
  }>;
}

export interface DomainVerifiedPayload {
  deployment_id: UUID;
  domain: string;
}

export interface SecurityScanStartedPayload {
  scan_id: UUID;
  scope: 'files' | 'dependencies' | 'env' | 'deployment';
}

export interface SecurityScanCompletedPayload {
  scan_id: UUID;
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    file_path?: string;
  }>;
}

export interface CreditsConsumedPayload {
  amount: number;
  reason: 'ai_tokens' | 'build_minutes' | 'deployment' | 'storage';
  remaining?: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}

export interface StreamEventPayloadMap {
  'chat.message.created': ChatMessageCreatedPayload;
  'ai.token': AiTokenPayload;
  'ai.message.completed': AiMessageCompletedPayload;
  'agent.run.started': AgentRunStartedPayload;
  'agent.step.started': AgentStepStartedPayload;
  'agent.step.progress': AgentStepProgressPayload;
  'agent.step.completed': AgentStepCompletedPayload;
  'agent.step.failed': AgentStepFailedPayload;
  'tool.call.started': ToolCallStartedPayload;
  'tool.call.output': ToolCallOutputPayload;
  'tool.call.completed': ToolCallCompletedPayload;
  'tool.call.failed': ToolCallFailedPayload;
  'file.created': FileChangePayload;
  'file.updated': FileChangePayload;
  'file.deleted': FileChangePayload;
  'file.patch.applied': FilePatchAppliedPayload;
  'build.queued': BuildQueuedPayload;
  'build.started': BuildStartedPayload;
  'build.log': BuildLogPayload;
  'build.completed': BuildCompletedPayload;
  'build.failed': BuildFailedPayload;
  'preview.created': PreviewCreatedPayload;
  'preview.ready': PreviewReadyPayload;
  'preview.failed': PreviewFailedPayload;
  'deploy.started': DeployStartedPayload;
  'deploy.progress': DeployProgressPayload;
  'deploy.completed': DeployCompletedPayload;
  'deploy.failed': DeployFailedPayload;
  'domain.verification.required': DomainVerificationRequiredPayload;
  'domain.verified': DomainVerifiedPayload;
  'security.scan.started': SecurityScanStartedPayload;
  'security.scan.completed': SecurityScanCompletedPayload;
  'credits.consumed': CreditsConsumedPayload;
  error: ErrorPayload;
}

export type StreamEventPayload<TType extends StreamEventType> = StreamEventPayloadMap[TType];

export interface StreamEventEnvelope<TType extends StreamEventType = StreamEventType> {
  event_id: UUID;
  organization_id: UUID;
  project_id: UUID;
  conversation_id: UUID;
  agent_run_id: UUID | null;
  step_id?: UUID | null;
  type: TType;
  payload: StreamEventPayloadMap[TType];
  visibility: StreamVisibility;
  severity: StreamSeverity;
  sequence_number: number;
  created_at: string;
}

export type AnyStreamEventEnvelope = {
  [TType in StreamEventType]: StreamEventEnvelope<TType>;
}[StreamEventType];

export interface EmitEventInput<TType extends StreamEventType = StreamEventType> {
  organization_id: UUID;
  project_id: UUID;
  conversation_id: UUID;
  agent_run_id?: UUID | null;
  step_id?: UUID | null;
  type: TType;
  payload: StreamEventPayloadMap[TType];
  visibility?: StreamVisibility;
  severity?: StreamSeverity;
}
