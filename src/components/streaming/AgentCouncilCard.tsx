import * as React from "react";
import { BotIcon, CheckIcon, CircleIcon, Loader2Icon, XIcon } from "lucide-react";

import type { StreamMissionAgent } from "../../streaming/agent-stream-reducer";

type AgentCouncilCardProps = {
  agents: StreamMissionAgent[];
};

function statusIcon(status: StreamMissionAgent["status"]) {
  if (status === "done") return <CheckIcon size={11} aria-hidden="true" />;
  if (status === "failed" || status === "cancelled") return <XIcon size={11} aria-hidden="true" />;
  if (status === "active") return <Loader2Icon size={11} aria-hidden="true" />;
  if (status === "warning") return <CircleIcon size={10} aria-hidden="true" />;
  return <CircleIcon size={9} aria-hidden="true" />;
}

export function AgentCouncilCard({ agents }: AgentCouncilCardProps) {
  const visibleAgents = agents.slice(-4);
  if (!visibleAgents.length) return null;

  return (
    <section className="agent-mini-card agent-council-card" aria-label="Agents mobilises">
      <div className="agent-mini-card-head">
        <BotIcon size={14} aria-hidden="true" />
        <span>Agents mobilises</span>
      </div>
      <div className="agent-council-list">
        {visibleAgents.map(agent => (
          <div className="agent-council-row" data-status={agent.status} key={agent.id}>
            <span className="agent-council-status">{statusIcon(agent.status)}</span>
            <span className="agent-council-copy">
              <strong>{agent.label}</strong>
              <small>{agent.role}</small>
              {agent.result ? <small>{agent.result}</small> : null}
            </span>
            <span className="agent-council-observation">{agent.observation}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
