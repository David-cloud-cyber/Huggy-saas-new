import * as React from "react";
import { SparklesIcon } from "lucide-react";

import type { AgentStreamUiState } from "../../streaming/agent-stream-reducer";
import { AgentCommandBar } from "./AgentCommandBar";
import { ShiningText } from "../ai-elements/shining-text";
import { AgentChecksCard } from "./AgentChecksCard";
import { AgentEventDetails } from "./AgentEventDetails";
import { AgentFileChangesCard } from "./AgentFileChangesCard";
import { AgentFinalSummaryCard } from "./AgentFinalSummaryCard";
import { AgentPhaseTimeline } from "./AgentPhaseTimeline";
import { AgentPreviewStatusCard } from "./AgentPreviewStatusCard";
import { AgentRecoveryCard } from "./AgentRecoveryCard";
import { MobileCompactStream } from "./MobileCompactStream";
import { NextBestActionCard } from "./NextBestActionCard";
import { RunHeaderCard } from "./RunHeaderCard";

type AgentActivityCardProps = {
  state: AgentStreamUiState;
};

export function AgentActivityCard({ state }: AgentActivityCardProps) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const hasCards = Boolean(
    state.files.length ||
    state.preview.hasPreviewEvent ||
    state.checks.hasCheckEvent ||
    state.recovery.hasRecoveryEvent ||
    state.finalSummary,
  );

  return (
    <article className="agent-card" data-status={state.status} aria-live={state.status === "active" ? "polite" : "off"}>
      <MobileCompactStream state={state} />
      <header className="agent-card-head">
        <span className="agent-card-icon" aria-hidden="true">
          <SparklesIcon size={15} />
        </span>
        <div className="agent-card-title-block">
          <h3>{state.status === "active" ? <ShiningText text={state.headline} /> : state.headline}</h3>
          <p>{state.detail}</p>
        </div>
        {state.elapsed ? <span className="agent-card-elapsed">{state.elapsed}</span> : null}
      </header>

      <RunHeaderCard header={state.runHeader} />
      <AgentCommandBar
        state={state}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen(value => !value)}
      />
      <AgentPhaseTimeline phases={state.phases} />

      {hasCards ? (
        <div className="agent-card-grid">
          <AgentFileChangesCard files={state.files} />
          <AgentPreviewStatusCard preview={state.preview} />
          <AgentChecksCard checks={state.checks} />
          <AgentRecoveryCard recovery={state.recovery} />
          <AgentFinalSummaryCard summary={state.finalSummary} />
        </div>
      ) : null}
      <NextBestActionCard state={state} />
      <AgentEventDetails
        details={state.details || []}
        open={detailsOpen}
        onToggle={() => setDetailsOpen(value => !value)}
      />
    </article>
  );
}
