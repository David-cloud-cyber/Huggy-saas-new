import * as React from "react";
import { SparklesIcon } from "lucide-react";

import type { AgentStreamUiState } from "../../streaming/agent-stream-reducer";
import { ShiningText } from "../ai-elements/shining-text";
import { AgentCommandBar } from "./AgentCommandBar";
import { AgentCouncilCard } from "./AgentCouncilCard";
import { AgentEventDetails } from "./AgentEventDetails";
import { AgentPhaseTimeline } from "./AgentPhaseTimeline";
import { ChecksMatrixCard } from "./ChecksMatrixCard";
import { CriticCouncilCard } from "./CriticCouncilCard";
import { DeliverySummaryCard } from "./DeliverySummaryCard";
import { LiveFilesCard } from "./LiveFilesCard";
import { MissionHeader } from "./MissionHeader";
import { MissionTaskGraph } from "./MissionTaskGraph";
import { MobileMissionCompact } from "./MobileMissionCompact";
import { NextBestActionCard } from "./NextBestActionCard";
import { PreviewStatusCard } from "./PreviewStatusCard";
import { RecoveryCard } from "./RecoveryCard";

type MissionControlCardProps = {
  state: AgentStreamUiState;
};

export function MissionControlCard({ state }: MissionControlCardProps) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const tasks = state.tasks || [];
  const agents = state.agents || [];
  const files = state.files || [];
  const critics = state.critics || [];
  const checkItems = state.checkItems || [];
  const hasPrimaryCards = Boolean(
    files.length ||
    state.preview.hasPreviewEvent ||
    state.checks.hasCheckEvent ||
    checkItems.length ||
    state.recovery.hasRecoveryEvent ||
    state.finalSummary,
  );
  const hasDetailCards = detailsOpen && Boolean(tasks.length || agents.length || critics.length);

  return (
    <article className="agent-card mission-control-card" data-status={state.status} aria-live={state.status === "active" ? "polite" : "off"}>
      <MobileMissionCompact state={state} />
      <header className="agent-card-head mission-control-head">
        <span className="agent-card-icon mission-control-icon" aria-hidden="true">
          <SparklesIcon size={15} />
        </span>
        <div className="agent-card-title-block">
          <h3>Journal Huggy</h3>
          <div className="agent-mission-line">
            {state.status === "active" ? <ShiningText text={state.headline} /> : <span>{state.headline}</span>}
          </div>
          <p>{state.detail}</p>
        </div>
        {state.elapsed ? <span className="agent-card-elapsed">{state.elapsed}</span> : null}
      </header>

      <MissionHeader header={state.runHeader} elapsed={state.elapsed} status={state.status} />
      <AgentCommandBar
        state={state}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen(value => !value)}
      />
      <AgentPhaseTimeline phases={state.phases} />

      {hasPrimaryCards || hasDetailCards ? (
        <div className="agent-card-grid mission-control-grid">
          <LiveFilesCard files={files} />
          <PreviewStatusCard preview={state.preview} />
          <ChecksMatrixCard checks={state.checks} checkItems={checkItems} />
          <RecoveryCard recovery={state.recovery} />
          <DeliverySummaryCard summary={state.finalSummary} />
          {detailsOpen ? (
            <>
              <MissionTaskGraph tasks={tasks} />
              <AgentCouncilCard agents={agents} />
              <CriticCouncilCard critics={critics} />
            </>
          ) : null}
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
