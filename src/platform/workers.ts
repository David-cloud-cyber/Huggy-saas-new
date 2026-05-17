import type { Project, ProjectVersion, QueueJob, RequestContext } from './types';
import { AgentOrchestrator, BuildService, DeploymentService, QueueWorkerService, SecurityReviewService, VercelService } from './services';
import { PlatformError } from './security';

export class AgentWorker {
  constructor(private readonly orchestrator = new AgentOrchestrator()) {}

  async process(job: QueueJob<{ context: RequestContext; project: Project; prompt: string }>) {
    if (job.type !== 'agent_run') {
      throw new PlatformError('invalid_job_type', 'AgentWorker only accepts agent_run jobs.');
    }
    return this.orchestrator.run(job.payload.context, job.payload.project, job.payload.prompt);
  }
}

export class BuildWorker {
  constructor(private readonly buildService = new BuildService()) {}

  async process(job: QueueJob<{ project: Project; version: ProjectVersion }>) {
    if (job.type !== 'build') {
      throw new PlatformError('invalid_job_type', 'BuildWorker only accepts build jobs.');
    }
    return this.buildService.build(job.payload.project, job.payload.version);
  }
}

export class DeployWorker {
  constructor(private readonly vercelTokenProvider: () => string | undefined) {}

  async process(job: QueueJob<Record<string, unknown>>) {
    if (job.type !== 'deploy') {
      throw new PlatformError('invalid_job_type', 'DeployWorker only accepts deploy jobs.');
    }
    void new DeploymentService(new VercelService(this.vercelTokenProvider));
    return { accepted: true, jobId: job.id };
  }
}

export class SecurityWorker {
  constructor(private readonly securityReview = new SecurityReviewService()) {}

  async process(job: QueueJob<{ files: { path: string; content?: string; id: string; projectId: string; organizationId: string; sizeBytes: number; isBinary: boolean; createdAt: string; updatedAt: string }[] }>) {
    if (job.type !== 'security_scan') {
      throw new PlatformError('invalid_job_type', 'SecurityWorker only accepts security_scan jobs.');
    }
    return this.securityReview.review(job.payload.files);
  }
}

export function createWorkerQueue(): QueueWorkerService {
  return new QueueWorkerService();
}
