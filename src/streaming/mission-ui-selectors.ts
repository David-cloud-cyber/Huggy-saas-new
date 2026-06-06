import type { AgentStreamUiState } from "./agent-stream-reducer";
import type { MissionArtifact, MissionUiSnapshot } from "./mission-event-protocol";

export function selectMissionSnapshot(state: AgentStreamUiState): MissionUiSnapshot {
  const activePhase = state.phases.find(phase => phase.status === "active") || state.phases[state.phases.length - 1];
  return {
    status: state.status,
    headline: state.headline,
    phase: activePhase?.id || "idle",
    artifacts: selectMissionArtifacts(state),
  };
}

export function selectMissionArtifacts(state: AgentStreamUiState): MissionArtifact[] {
  const artifacts: MissionArtifact[] = [];
  for (const file of state.files.slice(-8)) {
    artifacts.push({
      id: `file:${file.path}`,
      kind: "file",
      label: file.path,
      status: file.status === "done" ? "ready" : file.status === "failed" ? "failed" : "writing",
      detail: file.language,
    });
  }
  if (state.preview.hasPreviewEvent) {
    artifacts.push({
      id: "preview",
      kind: "preview",
      label: "Preview",
      status: state.preview.status === "ready" ? "ready" : state.preview.status === "failed" ? "failed" : "writing",
      detail: state.preview.message,
    });
  }
  if (state.checks.hasCheckEvent) {
    artifacts.push({
      id: "checks",
      kind: "check",
      label: "Tests",
      status: state.checks.status === "passed" ? "ready" : state.checks.status === "failed" ? "failed" : "writing",
      detail: state.checks.message,
    });
  }
  if (state.recovery.hasRecoveryEvent) {
    artifacts.push({
      id: "recovery",
      kind: "recovery",
      label: "Correction",
      status: state.recovery.status === "succeeded" ? "ready" : state.recovery.status === "failed" ? "failed" : "writing",
      detail: state.recovery.message,
    });
  }
  if (state.finalSummary) {
    artifacts.push({
      id: "summary",
      kind: "summary",
      label: state.finalSummary.title,
      status: "ready",
      detail: state.finalSummary.nextAction,
    });
  }
  return artifacts;
}
