import type { AgentPhaseStatus, AgentStreamStatus } from "./agent-stream-reducer";
import type { StreamPhaseId } from "./agent-stream-event-map";

export type MissionEventPriority = "high" | "medium" | "low";

export type MissionPublicEvent = {
  id: string;
  backendType: string;
  phase: StreamPhaseId;
  label: string;
  detail: string;
  status: AgentPhaseStatus;
  priority: MissionEventPriority;
  publicPayload?: Record<string, unknown>;
};

export type MissionArtifactStatus = "writing" | "ready" | "failed";

export type MissionArtifact = {
  id: string;
  kind: "file" | "preview" | "check" | "recovery" | "summary";
  label: string;
  status: MissionArtifactStatus;
  detail?: string;
};

export type MissionUiSnapshot = {
  status: AgentStreamStatus;
  headline: string;
  phase: StreamPhaseId | "idle";
  artifacts: MissionArtifact[];
};
