import * as React from "react";

import type { AgentStreamUiState } from "../../streaming/agent-stream-reducer";

type AgentActivityCardProps = {
  state: AgentStreamUiState;
};

export function AgentActivityCard({ state }: AgentActivityCardProps) {
  const hasFiles = state.files.length > 0;
  const hasChecks = state.checks.hasCheckEvent || state.checkItems.length > 0;
  const hasPreview = state.preview.hasPreviewEvent;
  const fileLabel = hasFiles
    ? `${state.files.length} fichier${state.files.length > 1 ? "s" : ""} suivi${state.files.length > 1 ? "s" : ""}`
    : "";
  const checkLabel = hasChecks
    ? state.checks.status === "passed"
      ? "checks termines"
      : state.checks.status === "failed"
        ? "check a corriger"
        : "checks en cours"
    : "";
  const previewLabel = hasPreview
    ? state.preview.status === "ready"
      ? "preview prete"
      : state.preview.status === "failed"
        ? "preview a corriger"
        : "preview en cours"
    : "";
  const meta = [fileLabel, checkLabel, previewLabel].filter(Boolean).join(" · ");

  return (
    <div className="huggy-workline-fallback" data-status={state.status}>
      <p>{state.headline || "Huggy avance"}</p>
      {state.detail ? <p>{state.detail}</p> : null}
      {meta ? <small>{meta}</small> : null}
    </div>
  );
}
