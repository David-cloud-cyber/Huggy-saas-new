import type { Project, RequestContext } from './types';
import {
  AgentOrchestrator,
  BuildService,
  CreditService,
  DeploymentService,
  DomainService,
  ProjectService,
  PromptService,
  QueueWorkerService,
  UsageMeteringService,
  VercelService,
} from './services';

export interface PlatformApiHandlers {
  createProject(context: RequestContext, input: { name: string; description?: string }): Promise<Project>;
  submitPrompt(context: RequestContext, input: { project: Project; prompt: string }): Promise<unknown>;
  buildProject(context: RequestContext, input: { project: Project; versionId: string }): Promise<unknown>;
  deployProject(context: RequestContext, input: { project: Project; prompt: string; target?: 'preview' | 'production' }): Promise<unknown>;
  addDomain(context: RequestContext, input: { project: Project; hostname: string }): Promise<unknown>;
}

export function createPlatformApiHandlers(vercelTokenProvider: () => string | undefined): PlatformApiHandlers {
  const projects = new ProjectService();
  const prompts = new PromptService();
  const orchestrator = new AgentOrchestrator();
  const builds = new BuildService();
  const credits = new CreditService();
  const usage = new UsageMeteringService();
  const domains = new DomainService();
  const queue = new QueueWorkerService();
  const deployments = new DeploymentService(new VercelService(vercelTokenProvider));

  return {
    async createProject(context, input) {
      await credits.reserveCredits(context, 1, 'project_create');
      await usage.record(context, 'project_create');
      return projects.createProject(context, input);
    },

    async submitPrompt(context, input) {
      await prompts.createPrompt(context, input.project, input.prompt);
      await credits.reserveCredits({ ...context, projectId: input.project.id }, 20, 'prompt_generation');
      await usage.record({ ...context, projectId: input.project.id }, 'prompt_generation');
      queue.enqueue('agent_run', { projectId: input.project.id, prompt: input.prompt });
      return orchestrator.run({ ...context, projectId: input.project.id }, input.project, input.prompt);
    },

    async buildProject(context, input) {
      await credits.reserveCredits({ ...context, projectId: input.project.id }, 50, 'build_job');
      await usage.record({ ...context, projectId: input.project.id }, 'build_job');
      queue.enqueue('build', { projectId: input.project.id, versionId: input.versionId });
      return { queued: true };
    },

    async deployProject(context, input) {
      const result = await orchestrator.run({ ...context, projectId: input.project.id }, input.project, input.prompt);
      const buildResult = await builds.build(input.project, result.version);
      if (buildResult.status !== 'success') {
        return buildResult;
      }
      const deployPlan = result.outputs.find((output) => output.type === 'deploy_plan');
      if (!deployPlan || deployPlan.type !== 'deploy_plan') {
        return { error: 'missing_deploy_plan' };
      }
      const plan = { ...deployPlan, target: input.target ?? deployPlan.target };
      await credits.reserveCredits({ ...context, projectId: input.project.id }, plan.target === 'production' ? 100 : 25, 'deployment');
      await usage.record({ ...context, projectId: input.project.id }, `deploy_${plan.target}`);
      return deployments.deploy({ ...context, projectId: input.project.id }, input.project, result.version, result.files, plan);
    },

    async addDomain(context, input) {
      await credits.reserveCredits({ ...context, projectId: input.project.id }, 10, 'domain_add');
      await usage.record({ ...context, projectId: input.project.id }, 'domain_add');
      return domains.addDomain({ ...context, projectId: input.project.id }, input.project, input.hostname);
    },
  };
}
