import * as React from "react";
import { MonitorIcon } from "lucide-react";

import type { StreamPreviewState } from "../../streaming/agent-stream-reducer";

type AgentPreviewStatusCardProps = {
  preview: StreamPreviewState;
};

export function AgentPreviewStatusCard({ preview }: AgentPreviewStatusCardProps) {
  if (!preview.hasPreviewEvent) return null;

  const emitPreviewAction = (action: "open" | "mobile" | "publish") => {
    window.dispatchEvent(new CustomEvent("huggy:stream-preview-action", { detail: { action } }));
  };

  return (
    <section className="agent-mini-card" data-status={preview.status} aria-label="Preview status">
      <div className="agent-mini-card-head">
        <MonitorIcon size={14} aria-hidden="true" />
        <span>Preview</span>
      </div>
      <p>{preview.message || (preview.status === "ready" ? "Preview ready." : "Preview is being prepared.")}</p>
      {preview.status === "ready" ? (
        <div className="agent-card-actions">
          <button type="button" onClick={() => emitPreviewAction("open")}>Open preview</button>
          <button type="button" onClick={() => emitPreviewAction("mobile")}>Mobile</button>
          <button type="button" onClick={() => emitPreviewAction("publish")}>Publish</button>
        </div>
      ) : null}
    </section>
  );
}
