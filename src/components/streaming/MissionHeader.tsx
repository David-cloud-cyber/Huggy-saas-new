import * as React from "react";
import { GaugeIcon, RotateCcwIcon, ShieldCheckIcon, TimerIcon } from "lucide-react";

import type { AgentStreamStatus, StreamRunHeader } from "../../streaming/agent-stream-reducer";

type MissionHeaderProps = {
  header?: StreamRunHeader;
  elapsed?: string;
  status?: AgentStreamStatus;
};

export function MissionHeader({ header, elapsed, status }: MissionHeaderProps) {
  if (!header) return null;

  return (
    <section className="mission-header" data-status={status || "active"} aria-label="Mission overview">
      <div className="mission-header-main">
        <span className="mission-mode">{header.workflow}</span>
        <strong title={header.objective}>{header.objective}</strong>
        <span className="mission-status-dot" aria-hidden="true" />
      </div>
      <div className="mission-header-grid">
        <span title={header.scope}>Scope: {header.scope}</span>
        <span>
          <GaugeIcon size={12} aria-hidden="true" />
          {header.autonomy}
        </span>
        <span>Risque: {header.risk}</span>
        <span>
          {header.rollbackAvailable ? <RotateCcwIcon size={12} aria-hidden="true" /> : <ShieldCheckIcon size={12} aria-hidden="true" />}
          {header.rollbackAvailable ? "Rollback pret" : "Checkpoint sur"}
        </span>
        {elapsed ? (
          <span>
            <TimerIcon size={12} aria-hidden="true" />
            {elapsed}
          </span>
        ) : null}
      </div>
    </section>
  );
}
