import * as React from "react";
import { Agent, AgentDescription, AgentHeader, AgentItem, AgentList, AgentTitle } from "../ai-elements/agent";
import { Artifact, ArtifactAction, ArtifactActions, ArtifactContent, ArtifactHeader, ArtifactTitle } from "../ai-elements/artifact";
import { CodeBlock } from "../ai-elements/code-block";
import { FileTree, FileTreeItem } from "../ai-elements/file-tree";
import { Queue, QueueItem, QueueItemContent, QueueItemIndicator, QueueList, QueueSection, QueueSectionContent, QueueSectionLabel, QueueSectionTrigger } from "../ai-elements/queue";
import { StackTrace } from "../ai-elements/stack-trace";
import { Terminal, TerminalLine } from "../ai-elements/terminal";
import { TestResultItem, TestResults } from "../ai-elements/test-results";
import { WebPreview, WebPreviewActions, WebPreviewSkeleton } from "../ai-elements/web-preview";
import type { AgentStreamUiState } from "../../streaming/agent-stream-reducer";

const PHASE_LABELS: Record<string, string> = {
  understanding: "Comprendre",
  context: "Contexte",
  planning: "Plan",
  research: "Recherche",
  files: "Fichiers",
  preview: "Preview",
  checks: "Tests",
  visual_check: "Critique",
  recovery: "Correction",
  quality: "Qualite",
  memory: "Memoire",
};

function statusLabel(status?: string) {
  if (status === "done" || status === "passed" || status === "succeeded") return "ok";
  if (status === "failed") return "issue";
  if (status === "active" || status === "running" || status === "building") return "now";
  if (status === "cancelled") return "stop";
  return "wait";
}

function agentItemStatus(status?: string): "pending" | "active" | "done" | "warning" | "failed" | "skipped" {
  if (status === "cancelled") return "skipped";
  if (status === "warning") return "warning";
  if (status === "failed") return "failed";
  if (status === "done") return "done";
  if (status === "active") return "active";
  return "pending";
}

function firstUseful<T>(items: T[], count: number) {
  return items.slice(0, count);
}

export function MissionStream({ state }: { state: AgentStreamUiState }) {
  const header = state.runHeader;
  const visiblePhases = firstUseful(state.phases, 6);
  const files = state.files || [];
  const checks = state.checkItems || [];
  const agents = state.agents || [];
  const hasFiles = files.length > 0;
  const hasChecks = state.checks.hasCheckEvent || checks.length > 0;
  const hasRecovery = state.recovery.hasRecoveryEvent;
  const hasPreview = state.preview.hasPreviewEvent;
  const hasSummary = Boolean(state.finalSummary);
  const hasError = state.status === "failed";

  return (
    <article className="huggy-stream huggy-mission-stream" data-status={state.status}>
      <Agent>
        <AgentHeader>
          <span className="huggy-mission-orb" aria-hidden="true" />
          <div>
            <AgentTitle>Huggy Mission</AgentTitle>
            <AgentDescription>{state.headline || "Je comprends la mission."}</AgentDescription>
          </div>
          {state.elapsed ? <span className="huggy-mission-elapsed">{state.elapsed}</span> : null}
        </AgentHeader>

        <div className="huggy-mission-meta">
          {header?.workflow ? <span>{header.workflow}</span> : null}
          {header?.objective ? <span title={header.objective}>{header.objective}</span> : null}
          {header?.rollbackAvailable ? <span>Rollback pret</span> : null}
          <span>{statusLabel(state.status)}</span>
        </div>

        <Queue>
          <QueueSection>
            <QueueSectionTrigger>
              <QueueSectionLabel count={visiblePhases.length} label="Progression" />
            </QueueSectionTrigger>
            <QueueSectionContent>
              <QueueList>
                {visiblePhases.map(phase => (
                  <QueueItem key={phase.id}>
                    <QueueItemIndicator completed={phase.status === "done"} />
                    <QueueItemContent>
                      <strong>{PHASE_LABELS[phase.id] || phase.label}</strong>
                      <small>{phase.detail || phase.label}</small>
                    </QueueItemContent>
                  </QueueItem>
                ))}
              </QueueList>
            </QueueSectionContent>
          </QueueSection>
        </Queue>

        {agents.length ? (
          <AgentList>
            {firstUseful(agents, 4).map(agent => (
              <AgentItem key={agent.id} status={agentItemStatus(agent.status)}>
                <strong>{agent.label}</strong>
                <span>{agent.observation || agent.role}</span>
              </AgentItem>
            ))}
          </AgentList>
        ) : null}
      </Agent>

      {hasFiles ? (
        <Artifact>
          <ArtifactHeader>
            <ArtifactTitle>Fichiers modifies</ArtifactTitle>
            <ArtifactActions>
              <ArtifactAction>Voir diff</ArtifactAction>
            </ArtifactActions>
          </ArtifactHeader>
          <ArtifactContent>
            <FileTree>
              {firstUseful(files, 6).map(file => (
                <FileTreeItem key={file.path} path={file.path} status={file.status}>
                  {file.path}
                </FileTreeItem>
              ))}
            </FileTree>
            {files.find(file => file.snippet)?.snippet ? (
              <CodeBlock code={files.find(file => file.snippet)?.snippet || ""} language={files.find(file => file.snippet)?.language} />
            ) : null}
          </ArtifactContent>
        </Artifact>
      ) : null}

      {hasPreview ? (
        <WebPreview status={state.preview.status}>
          <strong>{state.preview.status === "ready" ? "Preview prete" : state.preview.status === "failed" ? "Preview a corriger" : "Preview en construction"}</strong>
          <p>{state.preview.message || "Synchronisation avec la zone preview."}</p>
          {state.preview.status === "building" ? <WebPreviewSkeleton /> : null}
          {state.preview.status === "ready" ? (
            <WebPreviewActions>
              <button type="button">Ouvrir preview</button>
              <button type="button">Tester mobile</button>
            </WebPreviewActions>
          ) : null}
        </WebPreview>
      ) : null}

      {hasChecks ? (
        <TestResults>
          {(checks.length ? checks : [{ id: "checks", label: state.checks.message || "Checks", status: state.checks.status === "passed" ? "done" : state.checks.status === "failed" ? "failed" : "active", message: "" }]).map(check => (
            <TestResultItem key={check.id} status={check.status === "done" ? "passed" : check.status === "failed" ? "failed" : check.status === "skipped" ? "skipped" : "running"}>
              {check.label}{check.message ? ` - ${check.message}` : ""}
            </TestResultItem>
          ))}
        </TestResults>
      ) : null}

      {hasRecovery ? (
        <Terminal>
          <TerminalLine status={state.recovery.status === "failed" ? "error" : state.recovery.status === "succeeded" ? "success" : "warning"}>
            Auto-fix {state.recovery.attempts ? `${state.recovery.attempts}/3` : ""}: {state.recovery.message || "Correction controlee en cours."}
          </TerminalLine>
        </Terminal>
      ) : null}

      {hasError ? <StackTrace>{state.detail || "Une erreur bloque la mission."}</StackTrace> : null}

      {hasSummary ? (
        <Artifact className="huggy-delivery-artifact">
          <ArtifactHeader>
            <ArtifactTitle>{state.finalSummary?.title || "Livraison"}</ArtifactTitle>
          </ArtifactHeader>
          <ArtifactContent>
            <ul>
              {state.finalSummary?.bullets.map((bullet, index) => <li key={`${bullet}-${index}`}>{bullet}</li>)}
            </ul>
            {state.finalSummary?.nextAction ? <p>{state.finalSummary.nextAction}</p> : null}
          </ArtifactContent>
        </Artifact>
      ) : null}
    </article>
  );
}
