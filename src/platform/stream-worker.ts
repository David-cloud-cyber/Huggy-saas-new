import type { EventBus } from './event-bus';
import { PlatformEventBus } from './event-bus';
import { createDefaultAgents, isPatchOutput } from './agents';
import type { Agent, AgentContext, AgentName, AgentOutput, FilePatch, Project, ProjectFile, QueueJob, RequestContext, UUID } from './types';
import { AgentMemoryService, CodeGenerationService, SnapshotService } from './services';
import { PlatformError, redactSecrets } from './security';
import type { AgentPhase, StreamSeverity, ToolName } from './stream-events';

export interface StreamingAgentRunPayload {
  context: RequestContext;
  project: Project;
  prompt: string;
  conversationId: UUID;
  agentRunId: UUID;
  assistantMessageId: UUID;
  files?: ProjectFile[];
  signal?: AbortSignal;
}

function id(prefix: string): UUID {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${value}`;
}

function phaseForAgent(agentName: AgentName): AgentPhase {
  if (agentName === 'ProductAgent') return 'requirement_analysis';
  if (agentName === 'PlannerAgent' || agentName === 'ArchitectAgent') return 'planning';
  if (agentName === 'UIAgent' || agentName === 'BackendAgent' || agentName === 'DatabaseAgent' || agentName === 'IntegrationAgent') return 'file_generation';
  if (agentName === 'QAAgent') return 'build';
  if (agentName === 'DebugAgent') return 'error_fixing';
  if (agentName === 'DeployAgent') return 'deployment';
  return 'preview';
}

function titleForAgent(agentName: AgentName): string {
  const titles: Record<AgentName, string> = {
    ProductAgent: 'Analyse du besoin',
    PlannerAgent: 'Planification',
    ArchitectAgent: 'Architecture technique',
    UIAgent: 'Création de l’interface',
    BackendAgent: 'Préparation backend',
    DatabaseAgent: 'Préparation base de données',
    IntegrationAgent: 'Intégrations',
    SecurityAgent: 'Analyse sécurité',
    QAAgent: 'Build et validation',
    DebugAgent: 'Correction automatique',
    DeployAgent: 'Préparation déploiement',
    ReviewerAgent: 'Revue finale',
  };
  return titles[agentName];
}

function summarizeOutput(output: AgentOutput): string {
  if (output.type === 'file_patch') return `${output.operations.length} modification(s) fichier préparée(s).`;
  if (output.type === 'build_result') return output.status === 'success' ? 'Build validé.' : 'Erreur de build détectée.';
  if (output.type === 'security_report') return output.publishAllowed ? 'Aucun blocage sécurité détecté.' : 'Blocage sécurité détecté.';
  if (output.type === 'deploy_plan') return `Déploiement ${output.target} préparé.`;
  if (output.type === 'task_list') return `${output.tasks.length} tâche(s) planifiée(s).`;
  if (output.type === 'spec') return output.summary;
  if (output.type === 'debug_report') return output.retryRecommended ? 'Correction recommandée.' : 'Aucune correction automatique nécessaire.';
  return 'Étape terminée.';
}

function patchPreview(operation: FilePatch['operations'][number]): string | undefined {
  const raw = operation.diff ?? operation.content;
  if (!raw) return undefined;
  return raw.length > 1600 ? `${raw.slice(0, 1600)}\n…` : raw;
}

function countLines(value?: string): number {
  if (!value) return 0;
  return value.split('\n').length;
}

function toolForOperation(operation: FilePatch['operations'][number]): ToolName {
  if (operation.op === 'create') return 'write_file';
  if (operation.op === 'update') return 'patch_file';
  return 'patch_file';
}

export class StreamingAgentWorker {
  constructor(
    private readonly eventBus: EventBus = new PlatformEventBus(),
    private readonly agents: Agent[] = createDefaultAgents(),
    private readonly memoryService = new AgentMemoryService(),
    private readonly codeGenerationService = new CodeGenerationService(),
    private readonly snapshotService = new SnapshotService(),
  ) {}

  async process(job: QueueJob<StreamingAgentRunPayload>) {
    if (job.type !== 'agent_run') {
      throw new PlatformError('invalid_job_type', 'StreamingAgentWorker only accepts agent_run jobs.');
    }
    return this.run(job.payload);
  }

  async run(input: StreamingAgentRunPayload) {
    this.assertNotCancelled(input.signal);
    await this.streamAssistantIntro(input);
    const outputs: AgentOutput[] = [];
    const memory = await this.memoryService.loadProjectMemory(input.project);
    let workingFiles = input.files ?? [];

    for (const [index, agent] of this.agents.entries()) {
      this.assertNotCancelled(input.signal);
      const stepId = id('step');
      await this.eventBus.emitEvent({
        organization_id: input.project.organizationId,
        project_id: input.project.id,
        conversation_id: input.conversationId,
        agent_run_id: input.agentRunId,
        step_id: stepId,
        type: 'agent.step.started',
        payload: {
          step_id: stepId,
          title: titleForAgent(agent.name),
          phase: phaseForAgent(agent.name),
          description: `Agent ${agent.name}`,
        },
        visibility: 'public',
        severity: 'info',
      });

      await this.eventBus.emitEvent({
        organization_id: input.project.organizationId,
        project_id: input.project.id,
        conversation_id: input.conversationId,
        agent_run_id: input.agentRunId,
        step_id: stepId,
        type: 'agent.step.progress',
        payload: {
          step_id: stepId,
          progress: Math.round((index / this.agents.length) * 100),
          message: `${titleForAgent(agent.name)} en cours…`,
        },
        visibility: 'public',
        severity: 'info',
      });

      try {
        const agentContext: AgentContext = { request: input.context, prompt: input.prompt, project: input.project, files: workingFiles, memory, previousOutputs: outputs };
        const output = await agent.run(agentContext);
        outputs.push(output);
        await this.emitOutputEvents(input, stepId, output);
        if (isPatchOutput(output)) {
          workingFiles = this.codeGenerationService.applyAgentOutputs(input.context, input.project, workingFiles, [output]);
        }
        await this.eventBus.emitEvent({
          organization_id: input.project.organizationId,
          project_id: input.project.id,
          conversation_id: input.conversationId,
          agent_run_id: input.agentRunId,
          step_id: stepId,
          type: 'agent.step.completed',
          payload: {
            step_id: stepId,
            summary: summarizeOutput(output),
            output: { type: output.type },
          },
          visibility: 'public',
          severity: this.severityForOutput(output),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown agent error.';
        await this.eventBus.emitEvent({
          organization_id: input.project.organizationId,
          project_id: input.project.id,
          conversation_id: input.conversationId,
          agent_run_id: input.agentRunId,
          step_id: stepId,
          type: 'agent.step.failed',
          payload: {
            step_id: stepId,
            error_code: error instanceof PlatformError ? error.code : 'agent_step_failed',
            message: redactSecrets(message),
            recoverable: true,
          },
          visibility: 'public',
          severity: 'error',
        });
        throw error;
      }
    }

    const version = await this.snapshotService.createVersion(input.context, input.project, workingFiles, 'Agent generated version');
    await this.eventBus.emitEvent({
      organization_id: input.project.organizationId,
      project_id: input.project.id,
      conversation_id: input.conversationId,
      agent_run_id: input.agentRunId,
      type: 'preview.created',
      payload: {
        preview_id: id('preview'),
        status: 'building',
      },
      visibility: 'public',
      severity: 'info',
    });
    await this.eventBus.emitEvent({
      organization_id: input.project.organizationId,
      project_id: input.project.id,
      conversation_id: input.conversationId,
      agent_run_id: input.agentRunId,
      type: 'ai.message.completed',
      payload: {
        message_id: input.assistantMessageId,
        content: `J’ai préparé l’application et généré une version prête pour la preview (${version.id}).`,
        finish_reason: 'stop',
      },
      visibility: 'public',
      severity: 'success',
    });
    return { outputs, files: workingFiles, version };
  }

  private async streamAssistantIntro(input: StreamingAgentRunPayload): Promise<void> {
    const intro = 'Je vais analyser votre demande, planifier les étapes, modifier les fichiers, lancer les validations et préparer une preview.';
    const tokens = intro.match(/\S+\s*/g) ?? [intro];
    for (const [index, token] of tokens.entries()) {
      this.assertNotCancelled(input.signal);
      await this.eventBus.emitEvent({
        organization_id: input.project.organizationId,
        project_id: input.project.id,
        conversation_id: input.conversationId,
        agent_run_id: input.agentRunId,
        type: 'ai.token',
        payload: {
          message_id: input.assistantMessageId,
          token,
          index,
        },
        visibility: 'public',
        severity: 'info',
      });
    }
  }

  private async emitOutputEvents(input: StreamingAgentRunPayload, stepId: UUID, output: AgentOutput): Promise<void> {
    if (output.type === 'file_patch') {
      for (const operation of output.operations) {
        const toolCallId = id('tool');
        const startedAt = new Date().toISOString();
        await this.eventBus.emitEvent({
          organization_id: input.project.organizationId,
          project_id: input.project.id,
          conversation_id: input.conversationId,
          agent_run_id: input.agentRunId,
          step_id: stepId,
          type: 'tool.call.started',
          payload: {
            tool_call_id: toolCallId,
            name: toolForOperation(operation),
            status: 'running',
            input_summary: `${operation.op} ${operation.path}`,
            started_at: startedAt,
          },
          visibility: 'public',
          severity: 'info',
        });

        const eventType = operation.op === 'create' ? 'file.created' : operation.op === 'delete' ? 'file.deleted' : 'file.updated';
        await this.eventBus.emitEvent({
          organization_id: input.project.organizationId,
          project_id: input.project.id,
          conversation_id: input.conversationId,
          agent_run_id: input.agentRunId,
          step_id: stepId,
          type: eventType,
          payload: {
            file_change_id: id('file_change'),
            path: operation.path,
            change_type: operation.op === 'create' ? 'created' : operation.op === 'delete' ? 'deleted' : 'updated',
            summary: operation.reason,
            additions: operation.op === 'delete' ? 0 : countLines(operation.content ?? operation.diff),
            deletions: operation.op === 'delete' ? 1 : 0,
            patch_preview: patchPreview(operation),
          },
          visibility: 'public',
          severity: 'success',
        });

        await this.eventBus.emitEvent({
          organization_id: input.project.organizationId,
          project_id: input.project.id,
          conversation_id: input.conversationId,
          agent_run_id: input.agentRunId,
          step_id: stepId,
          type: 'tool.call.completed',
          payload: {
            tool_call_id: toolCallId,
            name: toolForOperation(operation),
            status: 'completed',
            output_summary: `${operation.path} ${operation.op === 'delete' ? 'supprimé' : 'mis à jour'}.`,
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            duration_ms: Math.max(1, Date.now() - Date.parse(startedAt)),
          },
          visibility: 'public',
          severity: 'success',
        });
      }
    }

    if (output.type === 'build_result') {
      const buildId = id('build');
      await this.eventBus.emitEvent({
        organization_id: input.project.organizationId,
        project_id: input.project.id,
        conversation_id: input.conversationId,
        agent_run_id: input.agentRunId,
        step_id: stepId,
        type: 'build.started',
        payload: {
          build_id: buildId,
          command: 'npm run build',
          runtime: 'npm',
        },
        visibility: 'public',
        severity: 'info',
      });
      if (output.status === 'success') {
        await this.eventBus.emitEvent({
          organization_id: input.project.organizationId,
          project_id: input.project.id,
          conversation_id: input.conversationId,
          agent_run_id: input.agentRunId,
          step_id: stepId,
          type: 'build.completed',
          payload: {
            build_id: buildId,
            duration_ms: 1,
            artifact_url: output.artifactRef,
          },
          visibility: 'public',
          severity: 'success',
        });
      } else {
        await this.eventBus.emitEvent({
          organization_id: input.project.organizationId,
          project_id: input.project.id,
          conversation_id: input.conversationId,
          agent_run_id: input.agentRunId,
          step_id: stepId,
          type: 'build.failed',
          payload: {
            build_id: buildId,
            main_error: redactSecrets(output.errors[0]?.message ?? 'Build failed.'),
            diagnostics: output.errors.map((error) => ({
              tool: 'unknown',
              message: redactSecrets(error.message),
              file_path: error.file,
              line: error.line,
            })),
            fix_available: true,
          },
          visibility: 'public',
          severity: 'error',
        });
      }
    }

    if (output.type === 'security_report') {
      const scanId = id('scan');
      await this.eventBus.emitEvent({
        organization_id: input.project.organizationId,
        project_id: input.project.id,
        conversation_id: input.conversationId,
        agent_run_id: input.agentRunId,
        step_id: stepId,
        type: 'security.scan.completed',
        payload: {
          scan_id: scanId,
          issues: output.findings.map((finding) => ({
            severity: finding.severity,
            message: redactSecrets(finding.message),
            file_path: finding.file,
          })),
        },
        visibility: 'public',
        severity: output.publishAllowed ? 'success' : 'error',
      });
    }

    if (output.type === 'deploy_plan') {
      const deploymentId = id('deployment');
      await this.eventBus.emitEvent({
        organization_id: input.project.organizationId,
        project_id: input.project.id,
        conversation_id: input.conversationId,
        agent_run_id: input.agentRunId,
        step_id: stepId,
        type: 'deploy.started',
        payload: {
          deployment_id: deploymentId,
          provider: 'vercel',
          target: output.target,
        },
        visibility: 'public',
        severity: 'info',
      });
    }
  }

  private severityForOutput(output: AgentOutput): StreamSeverity {
    if (output.type === 'build_result') return output.status === 'success' ? 'success' : 'error';
    if (output.type === 'security_report') return output.publishAllowed ? 'success' : 'error';
    return 'success';
  }

  private assertNotCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new PlatformError('generation_cancelled', 'Generation was cancelled.', 499);
    }
  }
}
