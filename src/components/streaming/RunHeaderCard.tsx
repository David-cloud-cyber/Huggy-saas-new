import * as React from "react";
import { RotateCcwIcon, ShieldCheckIcon } from "lucide-react";

import type { StreamRunHeader } from "../../streaming/agent-stream-reducer";

type RunHeaderCardProps = {
  header?: StreamRunHeader;
};

export function RunHeaderCard({ header }: RunHeaderCardProps) {
  if (!header) return null;

  return (
    <section className="agent-run-header" aria-label="Run overview">
      <div className="agent-run-status">
        <span>{header.workflow}</span>
        <strong>{header.status}</strong>
      </div>
      <div className="agent-run-meta">
        <span title={header.objective}>Goal: {header.objective}</span>
        <span>Scope: {header.scope}</span>
        <span className="agent-run-safe">
          {header.rollbackAvailable ? <RotateCcwIcon size={12} aria-hidden="true" /> : <ShieldCheckIcon size={12} aria-hidden="true" />}
          {header.rollbackAvailable ? "Rollback available" : "Safe checkpoint"}
        </span>
      </div>
    </section>
  );
}
