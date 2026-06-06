import * as React from "react";
import { CheckIcon, CircleIcon, Loader2Icon, ShieldCheckIcon, XIcon } from "lucide-react";

import type { StreamCheckItem, StreamCheckState } from "../../streaming/agent-stream-reducer";

type ChecksMatrixCardProps = {
  checks: StreamCheckState;
  checkItems?: StreamCheckItem[];
};

function statusIcon(status: StreamCheckItem["status"]) {
  if (status === "done") return <CheckIcon size={11} aria-hidden="true" />;
  if (status === "failed" || status === "cancelled") return <XIcon size={11} aria-hidden="true" />;
  if (status === "active") return <Loader2Icon size={11} aria-hidden="true" />;
  return <CircleIcon size={9} aria-hidden="true" />;
}

export function ChecksMatrixCard({ checks, checkItems = [] }: ChecksMatrixCardProps) {
  if (!checks.hasCheckEvent && !checkItems.length) return null;
  const visibleItems = checkItems.slice(0, 8);

  return (
    <section className="agent-mini-card checks-matrix-card" data-status={checks.status} aria-label="Checks matrix">
      <div className="agent-mini-card-head">
        <ShieldCheckIcon size={14} aria-hidden="true" />
        <span>Checks reels</span>
      </div>
      {visibleItems.length ? (
        <div className="checks-matrix-grid">
          {visibleItems.map(item => (
            <div className="checks-matrix-item" data-status={item.status} key={item.id}>
              <span>{statusIcon(item.status)}</span>
              <strong>{item.label}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <p>{checks.message || (checks.status === "passed" ? "Les controles critiques sont passes." : "Je verifie les erreurs bloquantes.")}</p>
    </section>
  );
}
