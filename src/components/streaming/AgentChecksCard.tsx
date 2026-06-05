import * as React from "react";
import { ShieldCheckIcon } from "lucide-react";

import type { StreamCheckState } from "../../streaming/agent-stream-reducer";

type AgentChecksCardProps = {
  checks: StreamCheckState;
};

export function AgentChecksCard({ checks }: AgentChecksCardProps) {
  if (!checks.hasCheckEvent) return null;

  return (
    <section className="agent-mini-card" data-status={checks.status} aria-label="Checks status">
      <div className="agent-mini-card-head">
        <ShieldCheckIcon size={14} aria-hidden="true" />
        <span>Checks</span>
      </div>
      <p>{checks.message || (checks.status === "passed" ? "Critical checks passed." : "Checks are running.")}</p>
    </section>
  );
}
