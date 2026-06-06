import * as React from "react";
import { RotateCcwIcon, WrenchIcon } from "lucide-react";

import type { StreamRecoveryState } from "../../streaming/agent-stream-reducer";

type RecoveryCardProps = {
  recovery: StreamRecoveryState;
};

export function RecoveryCard({ recovery }: RecoveryCardProps) {
  if (!recovery.hasRecoveryEvent) return null;

  const title = recovery.status === "failed"
    ? "Correction bloquee"
    : recovery.status === "succeeded"
      ? "Correction validee"
      : "Correction automatique";

  return (
    <section className={`agent-mini-card recovery-card${recovery.status === "active" ? " agent-recovery-pulse" : ""}`} data-status={recovery.status} aria-label="Recovery status">
      <div className="agent-mini-card-head">
        <WrenchIcon size={14} aria-hidden="true" />
        <span>{title}</span>
        {recovery.attempts ? <span className="agent-mini-pill">Tentative {recovery.attempts}/3</span> : null}
      </div>
      <p>{recovery.message || "Je corrige automatiquement le blocage detecte."}</p>
      {recovery.status === "active" ? (
        <div className="recovery-rail" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {recovery.status === "failed" ? (
        <button className="agent-command-button" type="button" onClick={() => window.dispatchEvent(new CustomEvent("huggy:stream-command", { detail: { action: "focus-input" } }))}>
          <RotateCcwIcon size={13} aria-hidden="true" />
          Relancer avec precision
        </button>
      ) : null}
    </section>
  );
}
