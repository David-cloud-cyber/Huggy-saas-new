import * as React from "react";
import { GaugeIcon, RotateCcwIcon, TimerIcon } from "lucide-react";

import type { AgentStreamStatus, StreamRunHeader } from "../../streaming/agent-stream-reducer";

type MissionHeaderProps = {
  header?: StreamRunHeader;
  elapsed?: string;
  status?: AgentStreamStatus;
};

export function MissionHeader({ header, elapsed, status }: MissionHeaderProps) {
  if (!header) return null;
  const objective = String(header.objective || "").trim();
  const scope = String(header.scope || "").trim();
  const showScope = Boolean(
    scope &&
    !/^current project$/i.test(scope) &&
    !/^untitled app$/i.test(scope) &&
    scope.toLowerCase() !== objective.toLowerCase()
  );
  const showRollback = Boolean(header.rollbackAvailable);
  const showRisk = Boolean(header.risk && !/^faible|low$/i.test(String(header.risk)));

  return (
    <section className="mission-header" data-status={status || "active"} aria-label="Mission overview">
      <div className="mission-header-main">
        <span className="mission-mode">{header.workflow}</span>
        <strong title={objective}>{objective}</strong>
        <span className="mission-status-dot" aria-hidden="true" />
      </div>
      <div className="mission-header-grid">
        {showScope ? <span title={scope}>{scope}</span> : null}
        <span>
          <GaugeIcon size={12} aria-hidden="true" />
          {header.autonomy}
        </span>
        {showRisk ? <span>Risque: {header.risk}</span> : null}
        {showRollback ? (
          <span>
            <RotateCcwIcon size={12} aria-hidden="true" />
            Rollback pret
          </span>
        ) : null}
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
