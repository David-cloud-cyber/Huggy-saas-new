import * as React from "react";
import { CheckCircle2Icon } from "lucide-react";

import type { StreamFinalSummary } from "../../streaming/agent-stream-reducer";

type DeliverySummaryCardProps = {
  summary?: StreamFinalSummary;
};

export function DeliverySummaryCard({ summary }: DeliverySummaryCardProps) {
  if (!summary) return null;

  return (
    <section className="agent-final-card delivery-summary-card" aria-label="Mission delivery summary">
      <div className="agent-final-title">
        <CheckCircle2Icon size={14} aria-hidden="true" />
        <span>{summary.title}</span>
      </div>
      <ul>
        {summary.bullets.map((bullet, index) => (
          <li key={`${bullet}-${index}`}>{bullet}</li>
        ))}
      </ul>
      {summary.nextAction ? (
        <p>
          <strong>Prochaine action: </strong>
          {summary.nextAction}
        </p>
      ) : null}
    </section>
  );
}
