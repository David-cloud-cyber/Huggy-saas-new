import * as React from "react";
import { CheckCircle2Icon } from "lucide-react";

import type { StreamFinalSummary } from "../../streaming/agent-stream-reducer";

type AgentFinalSummaryCardProps = {
  summary?: StreamFinalSummary;
};

export function AgentFinalSummaryCard({ summary }: AgentFinalSummaryCardProps) {
  if (!summary) return null;

  return (
    <section className="agent-final-card" aria-label="Run summary">
      <div className="agent-final-title">
        <CheckCircle2Icon size={14} aria-hidden="true" />
        <span>{summary.title}</span>
      </div>
      <ul>
        {summary.bullets.map((bullet, index) => (
          <li key={`${bullet}-${index}`}>{bullet}</li>
        ))}
      </ul>
      {summary.nextAction ? <p>{summary.nextAction}</p> : null}
    </section>
  );
}
