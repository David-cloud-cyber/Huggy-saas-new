import * as React from "react";
import { CheckIcon, CircleIcon, Loader2Icon, SearchCheckIcon, XIcon } from "lucide-react";

import type { StreamCritic } from "../../streaming/agent-stream-reducer";

type CriticCouncilCardProps = {
  critics: StreamCritic[];
};

function criticIcon(status: StreamCritic["status"]) {
  if (status === "done") return <CheckIcon size={11} aria-hidden="true" />;
  if (status === "failed" || status === "cancelled") return <XIcon size={11} aria-hidden="true" />;
  if (status === "active") return <Loader2Icon size={11} aria-hidden="true" />;
  if (status === "warning") return <CircleIcon size={10} aria-hidden="true" />;
  return <CircleIcon size={9} aria-hidden="true" />;
}

export function CriticCouncilCard({ critics }: CriticCouncilCardProps) {
  const visibleCritics = critics.slice(-4);
  if (!visibleCritics.length) return null;

  return (
    <section className="agent-mini-card agent-critic-card" aria-label="Critique qualite">
      <div className="agent-mini-card-head">
        <SearchCheckIcon size={14} aria-hidden="true" />
        <span>Critique qualite</span>
      </div>
      <div className="agent-critic-list">
        {visibleCritics.map(critic => (
          <div className="agent-critic-row" data-status={critic.status} key={critic.id}>
            <span className="agent-critic-status">{criticIcon(critic.status)}</span>
            <span className="agent-critic-copy">
              <strong>{critic.label}</strong>
              <small>{critic.verdict}</small>
              {critic.risk ? <small>Risque: {critic.risk}</small> : null}
              {critic.recommendation ? <small>Reco: {critic.recommendation}</small> : null}
              {critic.blocker ? <small>Blocage: {critic.blocker}</small> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
