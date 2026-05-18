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
  PlatformPlanKey,
  PreviewRecord,
  Project,
  ProjectBackend,
  ProjectBackendResource,
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
  constructor(
    private readonly tokenProvider: () => string | undefined = () => process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN,
    private readonly options: {
      teamId?: string;
      projectPrefix?: string;
      appPublicDomain?: string;
      fetcher?: typeof fetch;
      mock?: boolean;
    } = {},
  ) {}

  private token(): string {
    const token = this.tokenProvider();
    if (!token) {
      throw new PlatformError('vercel_token_missing', 'Vercel API token is not configured on the backend.', 500);
    }
    return token;
  }

  private teamId(): string | undefined {
    return this.options.teamId ?? process.env.VERCEL_TEAM_ID;
  }

  private prefixedName(name: string): string {
    const prefix = this.options.projectPrefix ?? process.env.VERCEL_PROJECT_PREFIX ?? 'huggy';
    return slugify(`${prefix}-${name}`);
  }

  private query(): string {
    const teamId = this.teamId();
    return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
  }

  private shouldMock(): boolean {
    return this.options.mock === true || this.tokenProvider() === 'mock';
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.token();
    if (this.shouldMock()) {
      return {} as T;
    }
    const fetcher = this.options.fetcher ?? fetch;
    const query = this.query();
    const response = await fetcher(`https://api.vercel.com${path}${query ? (path.includes('?') ? `&${query.slice(1)}` : query) : ''}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const codeByStatus: Record<number, string> = {
        401: 'vercel_unauthorized',
        403: 'vercel_forbidden',
        404: 'vercel_not_found',
        429: 'vercel_rate_limited',
      };
      let details: unknown;
      try {
        details = await response.json();
      } catch {
        details = await response.text();
      }
      throw new PlatformError(codeByStatus[response.status] ?? 'vercel_api_error', `Vercel API request failed with ${response.status}.`, response.status, { details: redactSecrets(JSON.stringify(details)) });
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  createProjectFiles(files: ProjectFile[]): { file: string; data: string; encoding: 'utf-8' }[] {
    const withDefaults = this.ensureDeployableFiles(files);
    return withDefaults.filter((file) => !file.path.endsWith('.env')).map((file) => ({ file: file.path, data: file.content ?? '', encoding: 'utf-8' }));
  }

  ensureDeployableFiles(files: ProjectFile[]): ProjectFile[] {
    const byPath = new Map(files.map((file) => [file.path, file]));
    const createdAt = now();
    if (!byPath.has('package.json')) {
      byPath.set('package.json', {
        id: id('file'),
        projectId: files[0]?.projectId ?? 'project_unknown',
        organizationId: files[0]?.organizationId ?? 'org_unknown',
        path: 'package.json',
        content: JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { '@vitejs/plugin-react': 'latest', vite: 'latest', react: 'latest', 'react-dom': 'latest' }, devDependencies: {} }, null, 2),
        contentHash: 'generated-package',
        sizeBytes: 0,
        isBinary: false,
        createdAt,
        updatedAt: createdAt,
      });
    }
    if (!byPath.has('vercel.json')) {
      byPath.set('vercel.json', {
        id: id('file'),
        projectId: files[0]?.projectId ?? 'project_unknown',
        organizationId: files[0]?.organizationId ?? 'org_unknown',
        path: 'vercel.json',
        content: JSON.stringify({ buildCommand: 'npm run build', outputDirectory: 'dist', framework: 'vite' }, null, 2),
        contentHash: 'generated-vercel',
        sizeBytes: 0,
        isBinary: false,
        createdAt,
        updatedAt: createdAt,
      });
    }
    if (!byPath.has('.env.example')) {
      byPath.set('.env.example', {
        id: id('file'),
        projectId: files[0]?.projectId ?? 'project_unknown',
        organizationId: files[0]?.organizationId ?? 'org_unknown',
        path: '.env.example',
        content: 'VITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=\n',
        contentHash: 'generated-env-example',
        sizeBytes: 0,
        isBinary: false,
        createdAt,
        updatedAt: createdAt,
      });
    }
    return [...byPath.values()].filter((file) => file.path !== '.env' && !file.path.endsWith('/.env'));
  }

  async createProject(project: Project | string): Promise<{ id: string; name: string }> {
    this.token();
    const name = this.prefixedName(typeof project === 'string' ? project : project.slug || project.name);
    if (this.shouldMock()) return { id: `vercel_project_${name}`, name };
    const response = await this.request<{ id: string; name: string }>('/v10/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return { id: response.id, name: response.name };
  }

  async createVercelProject(name: string): Promise<{ id: string; name: string }> {
    return this.createProject(name);
  }

  async getProject(project: Project | string): Promise<{ id: string; name?: string }> {
    this.token();
    const projectId = typeof project === 'string' ? project : project.vercelProjectId ?? this.prefixedName(project.slug || project.name);
    if (this.shouldMock()) return { id: projectId, name: projectId };
    return this.request<{ id: string; name?: string }>(`/v9/projects/${encodeURIComponent(projectId)}`);
  }

  async updateVercelProject(projectId: string, input: Record<string, unknown>): Promise<{ id: string; updated: boolean; input: Record<string, unknown> }> {
    this.token();
    if (this.shouldMock()) return { id: projectId, updated: true, input };
    await this.request(`/v9/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: JSON.stringify(input) });
    return { id: projectId, updated: true, input };
  }

  async setEnvironmentVariables(projectId: string, variables: { key: string; value: string; target: EnvironmentType }[]): Promise<{ projectId: string; count: number }> {
    this.token();
    const safeVariables = variables.filter((variable) => !['VERCEL_TOKEN', 'VERCEL_API_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY'].includes(variable.key));
    if (this.shouldMock()) return { projectId, count: safeVariables.length };
    for (const variable of safeVariables) {
      await this.request(`/v10/projects/${encodeURIComponent(projectId)}/env`, {
        method: 'POST',
        body: JSON.stringify({ key: variable.key, value: variable.value, type: 'encrypted', target: [variable.target] }),
      });
    }
    return { projectId, count: safeVariables.length };
  }

  async createDeployment(project: Project | { projectName: string; files: ProjectFile[]; target: EnvironmentType }, files?: ProjectFile[], options: { target: EnvironmentType; projectId?: string } = { target: 'preview' }): Promise<{ id: string; url: string; status: 'queued' | 'ready' | 'error' }> {
    this.token();
    const legacy = 'projectName' in project;
    const projectName = legacy ? project.projectName : project.slug || project.name;
    const inputFiles = legacy ? project.files : files ?? [];
    const target = legacy ? project.target : options.target;
    const name = this.prefixedName(projectName);
    if (this.shouldMock()) return { id: id('vercel_deployment'), url: `https://${name}-${Date.now()}.vercel.app`, status: 'queued' };
    const response = await this.request<{ id: string; url: string; readyState?: string }>('/v13/deployments', {
      method: 'POST',
      body: JSON.stringify({
        name,
        project: options.projectId,
        target,
        files: this.createProjectFiles(inputFiles),
        projectSettings: { framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'dist' },
      }),
    });
    return { id: response.id, url: response.url.startsWith('http') ? response.url : `https://${response.url}`, status: response.readyState === 'READY' ? 'ready' : 'queued' };
  }

  async getDeploymentStatus(deploymentId: string): Promise<{ id: string; status: 'queued' | 'building' | 'ready' | 'error'; url?: string; errorMessage?: string }> {
    this.token();
    if (this.shouldMock()) return { id: deploymentId, status: 'ready' };
    const response = await this.request<{ id: string; readyState?: string; url?: string; errorMessage?: string }>(`/v13/deployments/${encodeURIComponent(deploymentId)}`);
    const status = response.readyState === 'READY' ? 'ready' : response.readyState === 'ERROR' ? 'error' : response.readyState === 'BUILDING' ? 'building' : 'queued';
    return { id: response.id, status, url: response.url, errorMessage: response.errorMessage };
  }

  async addDomain(project: Project | string, domain: string): Promise<{ projectId: string; domain: string; verified?: boolean }> {
    const projectId = typeof project === 'string' ? project : project.vercelProjectId ?? this.prefixedName(project.slug || project.name);
    this.token();
    if (this.shouldMock()) return { projectId, domain, verified: false };
    await this.request(`/v10/projects/${encodeURIComponent(projectId)}/domains`, { method: 'POST', body: JSON.stringify({ name: domain }) });
    return { projectId, domain };
  }

  async addProjectDomain(projectId: string, domain: string): Promise<{ projectId: string; domain: string }> {
    return this.addDomain(projectId, domain);
  }

  async verifyDomain(project: Project | string, domain: string): Promise<{ projectId: string; domain: string; verified: boolean; instructions?: unknown }> {
    const projectId = typeof project === 'string' ? project : project.vercelProjectId ?? this.prefixedName(project.slug || project.name);
    this.token();
    if (this.shouldMock()) return { projectId, domain, verified: true };
    const response = await this.request<{ verified?: boolean; verification?: unknown }>(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}/verify`, { method: 'POST' });
    return { projectId, domain, verified: response.verified === true, instructions: response.verification };
  }

  async verifyProjectDomain(projectId: string, domain: string): Promise<{ projectId: string; domain: string; verified: boolean }> {
    return this.verifyDomain(projectId, domain);
  }

  async removeDomain(project: Project | string, domain: string): Promise<{ projectId: string; domain: string; removed: boolean }> {
    const projectId = typeof project === 'string' ? project : project.vercelProjectId ?? this.prefixedName(project.slug || project.name);
    this.token();
    if (this.shouldMock()) return { projectId, domain, removed: true };
    await this.request(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' });
    return { projectId, domain, removed: true };
  }

  async removeProjectDomain(projectId: string, domain: string): Promise<{ projectId: string; domain: string; removed: boolean }> {
    return this.removeDomain(projectId, domain);
  }

  async assignAlias(deployment: Deployment | string, domain: string): Promise<{ deploymentId: string; alias: string }> {
    const deploymentId = typeof deployment === 'string' ? deployment : deployment.vercelDeploymentId ?? deployment.providerDeploymentId ?? deployment.id;
    this.token();
    if (this.shouldMock()) return { deploymentId, alias: domain };
    await this.request(`/v2/deployments/${encodeURIComponent(deploymentId)}/aliases`, { method: 'POST', body: JSON.stringify({ alias: domain }) });
    return { deploymentId, alias: domain };
  }

  async rollbackDeployment(projectId: string, deploymentId: string): Promise<{ projectId: string; deploymentId: string; rolledBack: boolean }> {
    this.token();
    if (this.shouldMock()) return { projectId, deploymentId, rolledBack: true };
    await this.request(`/v13/deployments/${encodeURIComponent(deploymentId)}/promote`, { method: 'POST', body: JSON.stringify({ projectId }) });
    return { projectId, deploymentId, rolledBack: true };
  }
}

export class DeploymentService {
  private readonly deployments = new Map<UUID, Deployment>();

  constructor(private readonly vercelService: VercelService, private readonly audit = new AuditLogService()) {}

  private async ensureVercelProject(project: Project, plan: DeployPlan): Promise<string> {
    return project.vercelProjectId ?? (await this.vercelService.createProject({ ...project, slug: plan.vercelProjectName })).id;
  }

  async deploy(context: RequestContext, project: Project, version: ProjectVersion, files: ProjectFile[], plan: DeployPlan): Promise<Deployment> {
    if (plan.target === 'production' && !canAdmin(context.role)) {
      throw new PlatformError('forbidden', 'Admin role or higher is required for production deploys.', 403);
    }
    const scan = createSecurityReport(files);
    if (!scan.publishAllowed) {
      throw new PlatformError('security_blocked', 'Security scan blocked deployment.', 422, { findings: scan.findings });
    }
    const vercelProjectId = await this.ensureVercelProject(project, plan);
    await this.vercelService.setEnvironmentVariables(vercelProjectId, plan.envVars.map((envVar) => ({ key: envVar.key, value: '', target: plan.target })));
    const deployment = await this.vercelService.createDeployment(project, files, { target: plan.target, projectId: vercelProjectId });
    const createdAt = now();
    const record: Deployment = {
      id: id('deployment'),
      projectId: project.id,
      organizationId: project.organizationId,
      versionId: version.id,
      environment: plan.target,
      status: deployment.status === 'queued' ? 'queued' : deployment.status === 'ready' ? 'ready' : 'error',
      provider: 'vercel',
      providerProjectId: vercelProjectId,
      providerDeploymentId: deployment.id,
      vercelProjectId,
      vercelDeploymentId: deployment.id,
      previewUrl: plan.target === 'preview' ? deployment.url : undefined,
      productionUrl: plan.target === 'production' ? deployment.url : undefined,
      url: deployment.url,
      createdBy: context.userId,
      createdAt,
      updatedAt: createdAt,
      readyAt: deployment.status === 'ready' ? createdAt : undefined,
    };
    this.deployments.set(record.id, record);
    await this.audit.write(context, `deploy_${plan.target}`, { projectId: project.id, versionId: version.id, deploymentId: record.id, provider: 'vercel' });
    return record;
  }

  async deployProject(context: RequestContext, project: Project, version: ProjectVersion, files: ProjectFile[]): Promise<Deployment> {
    return this.createPreviewDeployment(context, project, version, files);
  }

  async createPreviewDeployment(context: RequestContext, project: Project, version: ProjectVersion, files: ProjectFile[]): Promise<Deployment> {
    return this.deploy(context, project, version, files, { type: 'deploy_plan', target: 'preview', vercelProjectName: project.slug || project.name, domains: [], envVars: [] });
  }

  async publishProduction(context: RequestContext, project: Project, version: ProjectVersion, files: ProjectFile[], domains: string[] = []): Promise<Deployment> {
    return this.deploy(context, project, version, files, { type: 'deploy_plan', target: 'production', vercelProjectName: project.slug || project.name, domains, envVars: [] });
  }

  async getDeployment(projectId: UUID, deploymentId: UUID): Promise<Deployment> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment || deployment.projectId !== projectId) {
      throw new PlatformError('deployment_not_found', 'Deployment was not found.', 404);
    }
    if (deployment.vercelDeploymentId) {
      const status = await this.vercelService.getDeploymentStatus(deployment.vercelDeploymentId);
      deployment.status = status.status === 'ready' ? 'ready' : status.status === 'error' ? 'error' : 'building';
      deployment.errorMessage = status.errorMessage;
      deployment.updatedAt = now();
    }
    return deployment;
  }

  async rollback(context: RequestContext, project: Project, deploymentId: UUID): Promise<Deployment> {
    requireRole(context, ['owner', 'admin']);
    const deployment = await this.getDeployment(project.id, deploymentId);
    await this.vercelService.rollbackDeployment(deployment.vercelProjectId ?? project.vercelProjectId ?? project.id, deployment.vercelDeploymentId ?? deployment.id);
    await this.audit.write(context, 'deployment_rollback', { projectId: project.id, deploymentId });
    return {
      ...deployment,
      status: 'ready',
      updatedAt: now(),
    };
  }
}

export class DomainService {
  private readonly reservedSlugs = new Set(['www', 'api', 'admin', 'app', 'dashboard', 'login', 'signup', 'billing', 'support', 'docs', 'status']);
  private readonly customDomainLimits: Record<PlatformPlanKey, number> = {
    free: 0,
    starter: 1,
    pro: 5,
    studio: 15,
    business: 50,
    enterprise: Number.MAX_SAFE_INTEGER,
  };

  constructor(private readonly vercelService = new VercelService(() => 'mock', { mock: true }), private readonly audit = new AuditLogService(), private readonly publicDomain = process.env.APP_PUBLIC_DOMAIN ?? 'monsaas.com') {}

  createSaasSubdomain(project: Project): DomainRecord {
    const slug = slugify(project.slug || project.name);
    if (this.reservedSlugs.has(slug)) {
      throw new PlatformError('reserved_slug', 'This project slug is reserved.', 409, { slug });
    }
    const createdAt = now();
    return {
      id: id('domain'),
      organizationId: project.organizationId,
      projectId: project.id,
      hostname: `${slug}.${this.publicDomain}`,
      domain: `${slug}.${this.publicDomain}`,
      type: 'saas_subdomain',
      status: 'active',
      isPrimary: true,
      createdBy: project.createdBy,
      addedBy: project.createdBy,
      createdAt,
      updatedAt: createdAt,
    };
  }

  async addCustomDomain(context: RequestContext, project: Project, domain: string, existingDomains: DomainRecord[] = []): Promise<DomainRecord> {
    requireRole(context, ['owner', 'admin']);
    const hostname = domain.toLowerCase().trim();
    const planKey = context.planKey ?? 'starter';
    const customDomains = existingDomains.filter((record) => record.type === 'custom_domain' && record.status !== 'removed');
    if (customDomains.length >= this.customDomainLimits[planKey]) {
      throw new PlatformError('domain_limit_reached', 'Your plan does not allow adding another custom domain.', 402, { planKey, limit: this.customDomainLimits[planKey] });
    }
    if (hostname.split('.')[0] && this.reservedSlugs.has(hostname.split('.')[0])) {
      throw new PlatformError('reserved_domain_slug', 'This domain prefix is reserved.', 409, { hostname });
    }
    const vercelProjectId = project.vercelProjectId ?? `vercel_project_${slugify(project.slug || project.name)}`;
    const vercelDomain = await this.vercelService.addDomain(vercelProjectId, hostname);
    const createdAt = now();
    const record: DomainRecord = {
      id: id('domain'),
      organizationId: project.organizationId,
      projectId: project.id,
      hostname,
      domain: hostname,
      type: 'custom_domain',
      status: vercelDomain.verified ? 'verified' : 'pending',
      isPrimary: false,
      verificationToken: id('verify'),
      providerDomainId: vercelDomain.domain,
      vercelDomainId: vercelDomain.domain,
      addedBy: context.userId,
      createdBy: context.userId,
      createdAt,
      updatedAt: createdAt,
    };
    await this.audit.write(context, 'domain_add', { projectId: project.id, domain: hostname });
    return record;
  }

  async addDomain(context: RequestContext, project: Project, hostname: string): Promise<DomainRecord> {
    return this.addCustomDomain(context, project, hostname);
  }

  async verifyCustomDomain(context: RequestContext, project: Project, domain: DomainRecord): Promise<DomainRecord> {
    requireRole(context, ['owner', 'admin']);
    const result = await this.vercelService.verifyDomain(project.vercelProjectId ?? project.id, domain.hostname);
    const updated = { ...domain, status: result.verified ? 'verified' as const : 'pending' as const, updatedAt: now() };
    await this.audit.write(context, 'domain_verify', { projectId: project.id, domainId: domain.id, verified: result.verified });
    return updated;
  }

  async setPrimaryDomain(context: RequestContext, domain: DomainRecord): Promise<DomainRecord> {
    requireRole(context, ['owner', 'admin']);
    await this.audit.write(context, 'domain_set_primary', { projectId: domain.projectId, domainId: domain.id });
    return { ...domain, isPrimary: true, status: domain.status === 'verified' ? 'active' : domain.status, updatedAt: now() };
  }

  async removeDomain(context: RequestContext, project: Project, domain: DomainRecord): Promise<DomainRecord> {
    requireRole(context, ['owner', 'admin']);
    await this.vercelService.removeDomain(project.vercelProjectId ?? project.id, domain.hostname);
    await this.audit.write(context, 'domain_remove', { projectId: project.id, domainId: domain.id });
    return { ...domain, status: 'removed', deletedAt: now(), updatedAt: now() };
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

export class PreviewService {
  constructor(private readonly deploymentService: DeploymentService) {}

  async buildPreview(context: RequestContext, project: Project, version: ProjectVersion, files: ProjectFile[]): Promise<PreviewRecord> {
    const deployment = await this.deploymentService.createPreviewDeployment(context, project, version, files);
    return this.createPreviewUrl(project, version, deployment);
  }

  createPreviewUrl(project: Project, version: ProjectVersion, deployment?: Deployment): PreviewRecord {
    const createdAt = now();
    return {
      id: id('preview'),
      organizationId: project.organizationId,
      projectId: project.id,
      versionId: version.id,
      deploymentId: deployment?.id,
      status: deployment?.status === 'error' ? 'failed' : deployment?.url ? 'ready' : 'building',
      url: deployment?.previewUrl ?? deployment?.url,
      errorMessage: deployment?.errorMessage,
      createdAt,
      updatedAt: createdAt,
    };
  }

  refreshPreview(preview: PreviewRecord): PreviewRecord {
    return { ...preview, status: 'building', updatedAt: now() };
  }

  markPreviewReady(preview: PreviewRecord, url: string): PreviewRecord {
    return { ...preview, status: 'ready', url, updatedAt: now() };
  }

  markPreviewFailed(preview: PreviewRecord, errorMessage: string): PreviewRecord {
    return { ...preview, status: 'failed', errorMessage: redactSecrets(errorMessage), updatedAt: now() };
  }
}

export class ProjectVersionService {
  constructor(private readonly snapshotService = new SnapshotService()) {}

  async createVersion(projectId: UUID, files: ProjectFile[], source: string, context?: RequestContext): Promise<ProjectVersion> {
    const project: Project = { id: projectId, organizationId: files[0]?.organizationId ?? context?.organizationId ?? 'org_unknown', createdBy: context?.userId ?? 'system', name: projectId, slug: slugify(projectId), status: 'ready', createdAt: now(), updatedAt: now() };
    return this.snapshotService.createVersion(context ?? { correlationId: id('correlation'), userId: project.createdBy, organizationId: project.organizationId, role: 'owner' }, project, files, source);
  }

  getActiveVersion(project: Project, versions: ProjectVersion[]): ProjectVersion | undefined {
    return versions.find((version) => version.id === project.currentVersionId) ?? versions.sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }

  restoreVersion(project: Project, version: ProjectVersion, files: ProjectFile[]): { project: Project; files: ProjectFile[] } {
    if (version.projectId !== project.id) {
      throw new PlatformError('version_project_mismatch', 'Version does not belong to this project.', 400);
    }
    const restoredAt = now();
    return {
      project: { ...project, currentVersionId: version.id, updatedAt: restoredAt },
      files: files.filter((file) => file.versionId === version.id || !file.versionId).map((file) => ({ ...file, updatedAt: restoredAt })),
    };
  }

  snapshotFiles(projectId: UUID, files: ProjectFile[]): Record<string, unknown> {
    return {
      projectId,
      files: files.map((file) => ({ path: file.path, hash: file.contentHash ?? String(file.content?.length ?? 0), sizeBytes: file.sizeBytes })),
      sourceHash: String(files.reduce((total, file) => total + file.sizeBytes, 0)),
    };
  }
}

export class BackendProvisioningService {
  async provisionProjectBackend(project: Project, mode: ProjectBackend['mode'] = 'shared_tables'): Promise<ProjectBackend> {
    const createdAt = now();
    return {
      id: id('backend'),
      organizationId: project.organizationId,
      projectId: project.id,
      mode,
      status: 'ready',
      schemaName: mode === 'dedicated_schema' ? `project_${slugify(project.id).replaceAll('-', '_')}` : undefined,
      createdAt,
      updatedAt: createdAt,
    };
  }

  generateBackendResources(project: Project, backendSpec: { tables?: { name: string; rlsEnabled: boolean; columns?: Record<string, string> }[]; buckets?: string[] }): ProjectBackendResource[] {
    const backendId = id('backend');
    const createdAt = now();
    const tables = backendSpec.tables ?? [];
    for (const table of tables) {
      if (!table.rlsEnabled) {
        throw new PlatformError('rls_required', 'Generated Supabase tables must enable RLS.', 422, { table: table.name });
      }
    }
    return [
      ...tables.flatMap((table) => [
        { id: id('backend_resource'), organizationId: project.organizationId, projectId: project.id, backendId, resourceType: 'table' as const, name: table.name, definition: { columns: table.columns ?? {}, organization_id: 'uuid', project_id: 'uuid' }, rlsEnabled: true, createdAt },
        { id: id('backend_resource'), organizationId: project.organizationId, projectId: project.id, backendId, resourceType: 'rls_policy' as const, name: `${table.name}_tenant_isolation`, definition: { using: 'organization_id + project_id tenant isolation' }, rlsEnabled: true, createdAt },
      ]),
      ...(backendSpec.buckets ?? []).map((bucket) => ({ id: id('backend_resource'), organizationId: project.organizationId, projectId: project.id, backendId, resourceType: 'storage_bucket' as const, name: bucket, definition: { private: true }, rlsEnabled: true, createdAt })),
    ];
  }

  createProjectTables(project: Project, spec: { tables: { name: string; rlsEnabled: boolean; columns?: Record<string, string> }[] }): ProjectBackendResource[] {
    return this.generateBackendResources(project, { tables: spec.tables }).filter((resource) => resource.resourceType === 'table');
  }

  createRlsPolicies(project: Project, spec: { tables: { name: string; rlsEnabled: boolean }[] }): ProjectBackendResource[] {
    return this.generateBackendResources(project, { tables: spec.tables }).filter((resource) => resource.resourceType === 'rls_policy');
  }

  createStorageBuckets(project: Project, spec: { buckets: string[] }): ProjectBackendResource[] {
    return this.generateBackendResources(project, spec).filter((resource) => resource.resourceType === 'storage_bucket');
  }

  registerBackendResources(project: Project, resources: ProjectBackendResource[]): ProjectBackendResource[] {
    return resources.map((resource) => ({ ...resource, organizationId: project.organizationId, projectId: project.id }));
  }
}

export class SupabaseProvisioningService extends BackendProvisioningService {}

export class BuildJobService extends BuildService {}

export class AgentGenerationService extends AgentOrchestrator {}

export class RollbackService {
  constructor(private readonly versionService = new ProjectVersionService(), private readonly deploymentService?: DeploymentService) {}

  restoreVersion(project: Project, version: ProjectVersion, files: ProjectFile[]): { project: Project; files: ProjectFile[] } {
    return this.versionService.restoreVersion(project, version, files);
  }

  async rollbackDeployment(context: RequestContext, project: Project, deploymentId: UUID): Promise<Deployment> {
    if (!this.deploymentService) {
      throw new PlatformError('deployment_service_missing', 'Deployment service is required to rollback a deployment.', 500);
    }
    return this.deploymentService.rollback(context, project, deploymentId);
  }
}
