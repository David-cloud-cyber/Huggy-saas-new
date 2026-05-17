export type UUID = string;

export type OrgRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type ProjectStatus = 'draft' | 'generating' | 'ready' | 'building' | 'deployed' | 'archived';
export type JobStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
export type DeploymentStatus = 'queued' | 'building' | 'ready' | 'error' | 'cancelled';
export type EnvironmentType = 'preview' | 'production';
export type AgentName =
  | 'ProductAgent'
  | 'PlannerAgent'
  | 'ArchitectAgent'
  | 'UIAgent'
  | 'BackendAgent'
  | 'DatabaseAgent'
  | 'IntegrationAgent'
  | 'SecurityAgent'
  | 'QAAgent'
  | 'DebugAgent'
  | 'DeployAgent'
  | 'ReviewerAgent';

export interface RequestContext {
  correlationId: UUID;
  userId: UUID;
  organizationId: UUID;
  projectId?: UUID;
  role: OrgRole;
  ipAddress?: string;
  userAgent?: string;
}

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  createdBy: UUID;
  stripeCustomerId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface OrganizationMember {
  id: UUID;
  organizationId: UUID;
  userId: UUID;
  role: OrgRole;
  invitedBy?: UUID;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: UUID;
  organizationId: UUID;
  createdBy: UUID;
  name: string;
  slug: string;
  description?: string;
  status: ProjectStatus;
  templateId?: UUID;
  currentVersionId?: UUID;
  vercelProjectId?: string;
  defaultSubdomain?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ProjectPrompt {
  id: UUID;
  projectId: UUID;
  organizationId: UUID;
  userId: UUID;
  prompt: string;
  mode: 'plan' | 'agent' | 'code' | 'visual';
  createdAt: string;
}

export interface ProjectFile {
  id: UUID;
  projectId: UUID;
  organizationId: UUID;
  versionId?: UUID;
  path: string;
  content?: string;
  storagePath?: string;
  contentHash?: string;
  sizeBytes: number;
  mimeType?: string;
  isBinary: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ProjectVersion {
  id: UUID;
  projectId: UUID;
  organizationId: UUID;
  createdBy?: UUID;
  versionNumber: number;
  label?: string;
  snapshotStoragePath?: string;
  manifest: Record<string, unknown>;
  sourceHash?: string;
  buildJobId?: UUID;
  deploymentId?: UUID;
  createdAt: string;
  deletedAt?: string;
}

export interface AgentRun {
  id: UUID;
  projectId: UUID;
  organizationId: UUID;
  promptId?: UUID;
  status: JobStatus;
  modelProvider?: string;
  modelName?: string;
  inputTokens: number;
  outputTokens: number;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface AgentStep {
  id: UUID;
  agentRunId: UUID;
  projectId: UUID;
  organizationId: UUID;
  agentName: AgentName;
  stepOrder: number;
  status: JobStatus;
  input: Record<string, unknown>;
  output: AgentOutput;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface BuildJob {
  id: UUID;
  projectId: UUID;
  organizationId: UUID;
  versionId?: UUID;
  status: JobStatus;
  sandboxId?: string;
  command?: string;
  artifactStoragePath?: string;
  previewUrl?: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface Deployment {
  id: UUID;
  projectId: UUID;
  organizationId: UUID;
  versionId?: UUID;
  buildJobId?: UUID;
  environment: EnvironmentType;
  status: DeploymentStatus;
  vercelProjectId?: string;
  vercelDeploymentId?: string;
  url?: string;
  createdBy?: UUID;
  errorMessage?: string;
  createdAt: string;
  readyAt?: string;
  deletedAt?: string;
}

export interface DomainRecord {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  hostname: string;
  status: 'pending' | 'verified' | 'failed' | 'removed';
  vercelDomainId?: string;
  addedBy?: UUID;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface SecretDescriptor {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  key: string;
  environment: EnvironmentType;
  createdAt: string;
  updatedAt: string;
}

export interface UsageEvent {
  id: UUID;
  organizationId: UUID;
  projectId?: UUID;
  userId?: UUID;
  eventType: string;
  quantity: number;
  unit: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreditLedgerEntry {
  id: UUID;
  organizationId: UUID;
  userId?: UUID;
  projectId?: UUID;
  amount: number;
  reason: string;
  referenceType?: string;
  referenceId?: UUID;
  createdAt: string;
}

export interface AuditLogEntry {
  id: UUID;
  organizationId?: UUID;
  projectId?: UUID;
  actorUserId?: UUID;
  action: string;
  targetType?: string;
  targetId?: UUID;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AgentSpec {
  type: 'spec';
  projectName: string;
  summary: string;
  targetUsers: string[];
  features: { name: string; description: string; priority: 'must' | 'should' | 'could' }[];
  constraints: string[];
  acceptanceCriteria: string[];
  openQuestions: string[];
}

export interface TaskList {
  type: 'task_list';
  tasks: { id: string; title: string; description: string; agent: AgentName; dependsOn: string[]; status: 'pending' }[];
}

export interface FilePatch {
  type: 'file_patch';
  operations: { op: 'create' | 'update' | 'delete'; path: string; content?: string; diff?: string; reason: string }[];
}

export interface CommandRequest {
  type: 'command_request';
  command: 'npm_install' | 'npm_build' | 'npm_test' | 'npm_lint' | 'typecheck';
  args: string[];
  cwd: string;
  reason: string;
}

export interface BuildResult {
  type: 'build_result';
  status: 'success' | 'failed';
  logsRef: string;
  artifactRef?: string;
  errors: { file?: string; line?: number; message: string; severity: 'info' | 'warning' | 'error' }[];
}

export interface DebugReport {
  type: 'debug_report';
  rootCause: string;
  proposedFixes: FilePatch[];
  retryRecommended: boolean;
}

export interface SecurityReport {
  type: 'security_report';
  riskLevel: 'low' | 'medium' | 'high' | 'blocked';
  findings: { category: 'secret' | 'ssrf' | 'xss' | 'rls' | 'abuse' | 'dependency' | 'malware'; severity: 'low' | 'medium' | 'high' | 'critical'; message: string; file?: string }[];
  publishAllowed: boolean;
}

export interface DeployPlan {
  type: 'deploy_plan';
  target: EnvironmentType;
  vercelProjectName: string;
  domains: string[];
  envVars: { key: string; scope: 'build' | 'runtime'; required: boolean }[];
  rollbackDeploymentId?: string;
}

export type AgentOutput = AgentSpec | TaskList | FilePatch | CommandRequest | BuildResult | DebugReport | SecurityReport | DeployPlan;

export interface AgentContext {
  request: RequestContext;
  prompt: string;
  project?: Project;
  files: ProjectFile[];
  memory: Record<string, unknown>;
  previousOutputs: AgentOutput[];
}

export interface Agent<TOutput extends AgentOutput = AgentOutput> {
  name: AgentName;
  run(context: AgentContext): Promise<TOutput>;
}

export interface QueueJob<TPayload = Record<string, unknown>> {
  id: UUID;
  type: 'agent_run' | 'build' | 'deploy' | 'security_scan' | 'billing_sync';
  payload: TPayload;
  status: JobStatus;
  attempts: number;
  createdAt: string;
}

export interface RealtimeEvent {
  channel: string;
  event: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
