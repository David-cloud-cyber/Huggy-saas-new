import * as React from "react";
import { CheckIcon, CircleIcon, Loader2Icon, XIcon } from "lucide-react";

import type { StreamPhase } from "../../streaming/agent-stream-reducer";
import type { StreamPhaseId } from "../../streaming/agent-stream-event-map";

type AgentPhaseTimelineProps = {
  phases: StreamPhase[];
};

function phaseIcon(status: StreamPhase["status"]) {
  if (status === "done") return <CheckIcon size={12} aria-hidden="true" />;
  if (status === "failed" || status === "cancelled") return <XIcon size={12} aria-hidden="true" />;
  if (status === "active") return <Loader2Icon size={12} aria-hidden="true" />;
  return <CircleIcon size={10} aria-hidden="true" />;
}

export function AgentPhaseTimeline({ phases }: AgentPhaseTimelineProps) {
  const visiblePhases = compactPhases(phases.filter(phase => phase.label.trim())).slice(-6);
  if (!visiblePhases.length) return null;

  return (
    <ol className="agent-phase-timeline" aria-label="Mission timeline">
      {visiblePhases.map(phase => (
        <li className="agent-phase" data-status={phase.status} key={phase.id}>
          <span className="agent-phase-marker">{phaseIcon(phase.status)}</span>
          <span className="agent-phase-copy">
            <span className="agent-phase-label">{phase.label}</span>
            <span className="agent-phase-detail">{phase.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

type PhaseGroup = {
  id: StreamPhaseId;
  label: string;
  ids: StreamPhaseId[];
};

const PHASE_GROUPS: PhaseGroup[] = [
  { id: "understanding", label: "Mission", ids: ["understanding", "context"] },
  { id: "planning", label: "Agents", ids: ["planning", "research"] },
  { id: "files", label: "Fichiers", ids: ["building", "files"] },
  { id: "preview", label: "Preview", ids: ["preview"] },
  { id: "checks", label: "Tests", ids: ["checks", "visual_check", "recovery", "quality", "memory"] },
  { id: "done", label: "Livraison", ids: ["done", "failed"] },
];

function compactPhases(phases: StreamPhase[]): StreamPhase[] {
  return PHASE_GROUPS
    .map(group => {
      const members = phases.filter(phase => group.ids.includes(phase.id));
      if (!members.length) return null;
      const active = members.find(member => member.status === "active");
      const failed = members.find(member => member.status === "failed" || member.status === "cancelled");
      const latest = members[members.length - 1];
      const status = failed?.status || active?.status || (members.some(member => member.status === "done") ? "done" : latest.status);
      return {
        id: group.id,
        label: group.label,
        detail: active?.detail || failed?.detail || latest.detail,
        status,
        updatedAt: latest.updatedAt,
      } satisfies StreamPhase;
    })
    .filter(Boolean) as StreamPhase[];
}
