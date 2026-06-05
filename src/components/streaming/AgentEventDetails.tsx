import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import type { StreamDetailEvent } from "../../streaming/agent-stream-reducer";

type AgentEventDetailsProps = {
  details: StreamDetailEvent[];
  open: boolean;
  onToggle: () => void;
};

export function AgentEventDetails({ details, open, onToggle }: AgentEventDetailsProps) {
  const visibleDetails = details.filter(detail => detail.priority !== "low" || detail.status === "active").slice(-12);
  if (!visibleDetails.length) return null;

  return (
    <section className="agent-event-details" data-open={open ? "true" : "false"}>
      <button className="agent-event-details-toggle" type="button" aria-expanded={open} onClick={onToggle}>
        <span>{open ? "Hide details" : "View details"}</span>
        <ChevronDownIcon size={13} aria-hidden="true" />
      </button>
      {open ? (
        <div className="agent-event-detail-list">
          {visibleDetails.map(detail => (
            <div className="agent-event-detail-row" data-priority={detail.priority} data-status={detail.status} key={detail.id}>
              <span className="agent-event-detail-label">{detail.label}</span>
              <span className="agent-event-detail-copy">{detail.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
