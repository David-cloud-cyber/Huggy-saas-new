import * as React from "react";
import { WrenchIcon } from "lucide-react";

import type { StreamRecoveryState } from "../../streaming/agent-stream-reducer";

type AgentRecoveryCardProps = {
  recovery: StreamRecoveryState;
};

export function AgentRecoveryCard({ recovery }: AgentRecoveryCardProps) {
  if (!recovery.hasRecoveryEvent) return null;

  return (
    <section className={`agent-mini-card${recovery.status === "active" ? " agent-recovery-pulse" : ""}`} data-status={recovery.status} aria-label="Recovery status">
      <div className="agent-mini-card-head">
        <WrenchIcon size={14} aria-hidden="true" />
        <span>{recovery.status === "failed" ? "Fix needs review" : recovery.status === "succeeded" ? "Fix validated" : "Auto-fix"}</span>
        {recovery.attempts ? <span className="agent-mini-pill">{recovery.attempts}/3</span> : null}
      </div>
      <p>{recovery.message || "A targeted fix is being applied."}</p>
    </section>
  );
}
