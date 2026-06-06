import * as React from "react";
import { MonitorIcon } from "lucide-react";

import type { StreamPreviewState } from "../../streaming/agent-stream-reducer";

type PreviewStatusCardProps = {
  preview: StreamPreviewState;
};

export function PreviewStatusCard({ preview }: PreviewStatusCardProps) {
  if (!preview.hasPreviewEvent) return null;

  const emitPreviewAction = (action: "open" | "mobile" | "publish" | "refresh") => {
    window.dispatchEvent(new CustomEvent("huggy:stream-preview-action", { detail: { action } }));
  };

  return (
    <section className="agent-mini-card preview-status-card" data-status={preview.status} aria-label="Preview status">
      <div className="agent-mini-card-head">
        <MonitorIcon size={14} aria-hidden="true" />
        <span>Preview</span>
        <span className="agent-mini-pill">{preview.status}</span>
      </div>
      {preview.status === "building" ? <span className="mission-preview-skeleton" aria-hidden="true" /> : null}
      <p>{preview.message || (preview.status === "ready" ? "La preview est prete." : "Je reconstruis la preview.")}</p>
      <div className="agent-card-actions">
        <button type="button" onClick={() => emitPreviewAction("open")}>Ouvrir preview</button>
        <button type="button" onClick={() => emitPreviewAction("mobile")}>Tester mobile</button>
        {preview.status === "building" ? <button type="button" onClick={() => emitPreviewAction("refresh")}>Rafraichir</button> : null}
        {preview.status === "ready" ? <button type="button" onClick={() => emitPreviewAction("publish")}>Publier</button> : null}
      </div>
    </section>
  );
}
