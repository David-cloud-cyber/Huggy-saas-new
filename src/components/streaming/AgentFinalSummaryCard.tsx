import * as React from "react";

import type { StreamFinalSummary } from "../../streaming/agent-stream-reducer";
import { DeliverySummaryCard } from "./DeliverySummaryCard";

type AgentFinalSummaryCardProps = {
  summary?: StreamFinalSummary;
};

export function AgentFinalSummaryCard({ summary }: AgentFinalSummaryCardProps) {
  return <DeliverySummaryCard summary={summary} />;
}
