import type {
  Agent,
  AgentContext,
  AgentOutput,
  BuildJob,
  BuildResult,
  CommandRequest,
  CreditLedgerEntry,
  Deployment,
  DeployPlan,
  DomainRecord,
  EnvironmentType,
  FilePatch,
  Project,
  ProjectFile,
  ProjectPrompt,
  ProjectVersion,
  QueueJob,
  RealtimeEvent,
  RequestContext,
  SecretDescriptor,
  SecurityReport,
  UsageEvent,
  UUID,
} from './types';
import { canAdmin, canEdit, createSecurityReport, PlatformError, redactSecrets, requireRole, resolveAllowedCommand, validateFilePatch } from './security';
import { createDefaultAgents, isPatchOutput } from './agents';

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): UUID {
  return `${prefix}_${cryptoRandom()}`;
}

function cryptoRandom(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'project';
}

export class AuthService {
  async assertAuthenticated(context: RequestContext): Promise<RequestContext> {
    if (!context.userId || !context.organizationId) {
      throw new PlatformError('unauthorized', 'Authentication is required.', 401);
    }
    return context;
  }
}

export class OrganizationService {
  async assertMember(context: RequestContext): Promise<void> {
    await new AuthService().assertAuthenticated(context);
  }

  async assertAdmin(context: RequestContext): Promise<void> {
    requireRole(context, ['owner', 'admin']);
  }
}

export class ProjectService {
  async createProject(context: RequestContext, input: { name: string; description?: string }): Promise<Project> {
    if (!canEdit(context.role)) {
      throw new PlatformError('forbidden', 'Editor role or higher is required to create projects.', 403);
    }
    const createdAt = now();
    return {
      id: id('project'),
      organizationId: context.organizationId,
      createdBy: context.userId,
      name: input.name,
      slug: slugify(input.name),
      description: input.description,
      status: 'draft',
      defaultSubdomain: `${slugify(input.name)}.monsaas.com`,
      createdAt,
      updatedAt: createdAt,
    };
  }

  async assertEditable(context: RequestContext, project: Project): Promise<void> {
    if (project.organizationId !== context.organizationId || !canEdit(context.role)) {
      throw new PlatformError('forbidden', 'You cannot edit this project.', 403);
    }
  }
}

export class PromptService {
  async createPrompt(context: RequestContext, project: Project, prompt: string): Promise<ProjectPrompt> {
    await new ProjectService().assertEditable(context, project);
    return {
      id: id('prompt'),
      projectId: project.id,
      organizationId: project.organizationId,
      userId: context.userId,
      prompt,
      mode: 'agent',
      createdAt: now(),
    };
  }
}

export class AgentMemoryService {
  async loadProjectMemory(project: Project): Promise<Record<string, unknown>> {
    return {
      projectId: project.id,
      projectName: project.name,
      architecture: 'template-based Vite/React/Tailwind-compatible app generation',
      safety: ['No frontend secrets', 'Sandboxed builds', 'RLS enforced server-side'],
    };
  }

  async summarizeOutputs(outputs: AgentOutput[]): Promise<Record<string, unknown>> {
    return { outputTypes: outputs.map((output) => output.type), updatedAt: now() };
  }
}

export class FileSystemService {
  applyPatch(files: ProjectFile[], patch: FilePatch, context: RequestContext, project: Project): ProjectFile[] {
    const safePatch = validateFilePatch(patch);
    const byPath = new Map(files.map((file) => [file.path, file]));
    for (const operation of safePatch.operations) {
      if (operation.op === 'delete') {
        byPath.delete(operation.path);
        continue;
      }
      const content = operation.content ?? operation.diff ?? '';
      byPath.set(operation.path, {
        id: byPath.get(operation.path)?.id ?? id('file'),
        projectId: project.id,
        organizationId: project.organizationId,
        path: operation.path,
        content,
        contentHash: String(content.length),
        sizeBytes: content.length,
        isBinary: false,
        createdAt: byPath.get(operation.path)?.createdAt ?? now(),
        updatedAt: now(),
      });
    }
    return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  }
}

export class SnapshotService {
  async createVersion(context: RequestContext, project: Project, files: ProjectFile[], label?: string): Promise<ProjectVersion> {
    if (!canEdit(context.role)) {
      throw new PlatformError('forbidden', 'Editor role or higher is required to create versions.', 403);
    }
    return {
      id: id('version'),
      projectId: project.id,
      organizationId: project.organizationId,
      createdBy: context.userId,
      versionNumber: Date.now(),
      label,
      manifest: { files: files.map((file) => ({ path: file.path, hash: file.contentHash, size: file.sizeBytes })) },
      sourceHash: String(files.reduce((total, file) => total + file.sizeBytes, 0)),
      createdAt: now(),
    };
  }
}

export class CodeGenerationService {
  constructor(private readonly fileSystemService = new FileSystemService()) {}

  applyAgentOutputs(context: RequestContext, project: Project, initialFiles: ProjectFile[], outputs: AgentOutput[]): ProjectFile[] {
    return outputs.filter(isPatchOutput).reduce((files, patch) => this.fileSystemService.applyPatch(files, patch, context, project), initialFiles);
  }
}

export class SandboxService {
  async runCommand(request: CommandRequest): Promise<BuildResult> {
    const command = resolveAllowedCommand(request);
    return {
      type: 'build_result',
      status: 'success',
      logsRef: `sandbox://${command.join(' ')}`,
      errors: [],
    };
  }
}

export class BuildService {
  constructor(private readonly sandboxService = new SandboxService()) {}

  async createBuildJob(project: Project, version: ProjectVersion): Promise<BuildJob> {
    return {
      id: id('build'),
      projectId: project.id,
      organizationId: project.organizationId,
      versionId: version.id,
      status: 'queued',
      command: 'npm run build',
      createdAt: now(),
    };
  }

  async build(project: Project, version: ProjectVersion): Promise<BuildResult> {
    const request: CommandRequest = { type: 'command_request', command: 'npm_build', args: [], cwd: `/workspace/${project.id}/${version.id}`, reason: 'Validate generated app build.' };
    return this.sandboxService.runCommand(request);
  }
}

export class SecretManagerService {
  async describeSecret(input: { context: RequestContext; project: Project; key: string; environment: EnvironmentType }): Promise<SecretDescriptor> {
    requireRole(input.context, ['owner', 'admin']);
    return {
      id: id('secret'),
      organizationId: input.project.organizationId,
      projectId: input.project.id,
      key: input.key,
      environment: input.environment,
      createdAt: now(),
      updatedAt: now(),
    };
  }

  redact(value: string): string {
    return redactSecrets(value);
  }
}

export class VercelService {
  constructor(private readonly tokenProvider: () => string | undefined = () => undefined) {}

  private token(): string {
    const token = this.tokenProvider();
    if (!token) {
      throw new PlatformError('vercel_token_missing', 'Vercel API token is not configured on the backend.', 500);
    }
    return token;
  }

  async createVercelProject(name: string): Promise<{ id: string; name: string }> {
    this.token();
    return { id: `vercel_project_${slugify(name)}`, name };
  }

  async updateVercelProject(projectId: string, input: Record<string, unknown>): Promise<{ id: string; updated: boolean; input: Record<string, unknown> }> {
    this.token();
    return { id: projectId, updated: true, input };
  }

  async createDeployment(input: { projectName: string; files: ProjectFile[]; target: EnvironmentType }): Promise<{ id: string; url: string; status: 'queued' }> {
    this.token();
    return { id: id('vercel_deployment'), url: `https://${slugify(input.projectName)}-${Date.now()}.vercel.app`, status: 'queued' };
  }

  async getDeploymentStatus(deploymentId: string): Promise<{ id: string; status: 'ready' }> {
    this.token();
    return { id: deploymentId, status: 'ready' };
  }

  async addProjectDomain(projectId: string, domain: string): Promise<{ projectId: string; domain: string }> {
    this.token();
    return { projectId, domain };
  }

  async verifyProjectDomain(projectId: string, domain: string): Promise<{ projectId: string; domain: string; verified: boolean }> {
    this.token();
    return { projectId, domain, verified: true };
  }

  async removeProjectDomain(projectId: string, domain: string): Promise<{ projectId: string; domain: string; removed: boolean }> {
    this.token();
    return { projectId, domain, removed: true };
  }

  async assignAlias(deploymentId: string, alias: string): Promise<{ deploymentId: string; alias: string }> {
    this.token();
    return { deploymentId, alias };
  }

  async rollbackDeployment(projectId: string, deploymentId: string): Promise<{ projectId: string; deploymentId: string; rolledBack: boolean }> {
    this.token();
    return { projectId, deploymentId, rolledBack: true };
  }

  async setEnvironmentVariables(projectId: string, variables: { key: string; value: string; target: EnvironmentType }[]): Promise<{ projectId: string; count: number }> {
    this.token();
    return { projectId, count: variables.length };
  }
}

export class DeploymentService {
  constructor(private readonly vercelService: VercelService) {}

  async deploy(context: RequestContext, project: Project, version: ProjectVersion, files: ProjectFile[], plan: DeployPlan): Promise<Deployment> {
    if (plan.target === 'production' && !canAdmin(context.role)) {
      throw new PlatformError('forbidden', 'Admin role or higher is required for production deploys.', 403);
    }
    const scan = createSecurityReport(files);
    if (!scan.publishAllowed) {
      throw new PlatformError('security_blocked', 'Security scan blocked deployment.', 422, { findings: scan.findings });
    }
    const vercelProjectId = project.vercelProjectId ?? (await this.vercelService.createVercelProject(plan.vercelProjectName)).id;
    const deployment = await this.vercelService.createDeployment({ projectName: plan.vercelProjectName, files, target: plan.target });
    return {
      id: id('deployment'),
      projectId: project.id,
      organizationId: project.organizationId,
      versionId: version.id,
      environment: plan.target,
      status: deployment.status === 'queued' ? 'queued' : 'ready',
      vercelProjectId,
      vercelDeploymentId: deployment.id,
      url: deployment.url,
      createdBy: context.userId,
      createdAt: now(),
    };
  }
}

export class DomainService {
  async addDomain(context: RequestContext, project: Project, hostname: string): Promise<DomainRecord> {
    requireRole(context, ['owner', 'admin']);
    return {
      id: id('domain'),
      organizationId: project.organizationId,
      projectId: project.id,
      hostname: hostname.toLowerCase(),
      status: 'pending',
      addedBy: context.userId,
      createdAt: now(),
      updatedAt: now(),
    };
  }
}

export class SupabaseProjectIntegrationService {
  createClientEnv(projectUrl: string, anonKey: string): Record<string, string> {
    return {
      VITE_SUPABASE_URL: projectUrl,
      VITE_SUPABASE_ANON_KEY: anonKey,
    };
  }
}

export class BillingService {
  async assertPlanAllowsDeploy(): Promise<void> {}
}

export class CreditService {
  async reserveCredits(context: RequestContext, amount: number, reason: string): Promise<CreditLedgerEntry> {
    return { id: id('credit'), organizationId: context.organizationId, userId: context.userId, projectId: context.projectId, amount: -Math.abs(amount), reason, createdAt: now() };
  }
}

export class UsageMeteringService {
  async record(context: RequestContext, eventType: string, quantity = 1, metadata: Record<string, unknown> = {}): Promise<UsageEvent> {
    return { id: id('usage'), organizationId: context.organizationId, projectId: context.projectId, userId: context.userId, eventType, quantity, unit: 'event', metadata, createdAt: now() };
  }
}

export class AuditLogService {
  async write(context: RequestContext, action: string, metadata: Record<string, unknown> = {}): Promise<void> {
    void { context, action, metadata, createdAt: now() };
  }
}

export class NotificationService {
  async notifyUser(userId: UUID, title: string, body?: string): Promise<void> {
    void { userId, title, body };
  }
}

export class AbuseDetectionService {
  async scan(files: ProjectFile[]): Promise<SecurityReport> {
    return createSecurityReport(files);
  }
}

export class SecurityReviewService {
  async review(files: ProjectFile[]): Promise<SecurityReport> {
    return createSecurityReport(files);
  }
}

export class TemplateService {
  listTemplates(): string[] {
    return ['landing-page', 'saas-dashboard', 'crm', 'booking', 'ecommerce-simple', 'marketplace', 'blog-cms', 'internal-tool', 'ai-chatbot', 'admin-panel'];
  }
}

export class RealtimeEventService {
  private readonly events: RealtimeEvent[] = [];

  publish(channel: string, event: string, payload: Record<string, unknown>): RealtimeEvent {
    const realtimeEvent = { channel, event, payload, createdAt: now() };
    this.events.push(realtimeEvent);
    return realtimeEvent;
  }

  list(): RealtimeEvent[] {
    return [...this.events];
  }
}

export class QueueWorkerService {
  private readonly jobs: QueueJob[] = [];

  enqueue<TPayload extends Record<string, unknown>>(type: QueueJob<TPayload>['type'], payload: TPayload): QueueJob<TPayload> {
    const job: QueueJob<TPayload> = { id: id('job'), type, payload, status: 'queued', attempts: 0, createdAt: now() };
    this.jobs.push(job as QueueJob);
    return job;
  }

  list(): QueueJob[] {
    return [...this.jobs];
  }
}

export class AgentOrchestrator {
  constructor(
    private readonly agents: Agent[] = createDefaultAgents(),
    private readonly memoryService = new AgentMemoryService(),
    private readonly codeGenerationService = new CodeGenerationService(),
    private readonly snapshotService = new SnapshotService(),
    private readonly realtime = new RealtimeEventService(),
  ) {}

  async run(context: RequestContext, project: Project, prompt: string, files: ProjectFile[] = []): Promise<{ outputs: AgentOutput[]; files: ProjectFile[]; version: ProjectVersion }> {
    requireRole(context, ['owner', 'admin', 'editor']);
    const outputs: AgentOutput[] = [];
    const memory = await this.memoryService.loadProjectMemory(project);
    let workingFiles = files;
    for (const agent of this.agents) {
      this.realtime.publish(`project:${project.id}`, 'agent_step_started', { agent: agent.name });
      const agentContext: AgentContext = { request: context, prompt, project, files: workingFiles, memory, previousOutputs: outputs };
      const output = await agent.run(agentContext);
      outputs.push(output);
      if (isPatchOutput(output)) {
        workingFiles = this.codeGenerationService.applyAgentOutputs(context, project, workingFiles, [output]);
      }
      this.realtime.publish(`project:${project.id}`, 'agent_step_finished', { agent: agent.name, outputType: output.type });
    }
    const version = await this.snapshotService.createVersion(context, project, workingFiles, 'Agent generated version');
    return { outputs, files: workingFiles, version };
  }
}
