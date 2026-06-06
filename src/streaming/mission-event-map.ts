import { mapAgentStreamEvent } from "./agent-stream-event-map";
import type { AgentPhaseStatus } from "./agent-stream-reducer";
import type { MissionEventPriority, MissionPublicEvent } from "./mission-event-protocol";

const HIGH_PRIORITY_EVENTS = new Set([
  "error",
  "credits_insufficient",
  "external_api_keys_required",
  "auto_fix_failed",
  "preview_ready",
  "done",
  "cancelled",
]);

const MEDIUM_PRIORITY_EVENTS = new Set([
  "files_changed",
  "diff_ready",
  "runner_passed",
  "runner_failed",
  "quality_checked",
  "research_result",
  "patch_applied",
]);

export function mapBackendEventToMissionEvent(eventType: string, status: AgentPhaseStatus = "active"): MissionPublicEvent | null {
  const mapping = mapAgentStreamEvent(eventType);
  if (!mapping) return null;
  return {
    id: `${eventType}:${mapping.phase}`,
    backendType: eventType,
    phase: mapping.phase,
    label: mapping.label,
    detail: mapping.detail,
    status,
    priority: missionEventPriority(eventType),
  };
}

export function missionEventPriority(eventType: string): MissionEventPriority {
  if (HIGH_PRIORITY_EVENTS.has(eventType)) return "high";
  if (MEDIUM_PRIORITY_EVENTS.has(eventType)) return "medium";
  return "low";
}
