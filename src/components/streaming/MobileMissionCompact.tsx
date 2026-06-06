import * as React from "react";
import { FileCode2Icon, MonitorIcon, StopCircleIcon } from "lucide-react";

import type { AgentStreamUiState } from "../../streaming/agent-stream-reducer";
import { ShiningText } from "../ai-elements/shining-text";

type MobileMissionCompactProps = {
  state: AgentStreamUiState;
};

function dispatchCommand(action: string) {
  window.dispatchEvent(new CustomEvent("huggy:stream-command", { detail: { action } }));
}

function dispatchPreview(action: string) {
  window.dispatchEvent(new CustomEvent("huggy:stream-preview-action", { detail: { action } }));
}

export function MobileMissionCompact({ state }: MobileMissionCompactProps) {
  const current = [...state.phases].reverse().find(phase => phase.status === "active") || state.phases[state.phases.length - 1];
  const title = current?.label || state.headline;
  const canOpenPreview = state.preview.hasPreviewEvent;
  const canOpenFiles = state.files.length > 0;

  return (
    <div className="agent-mobile-compact mobile-mission-compact" data-status={state.status}>
      <span className="agent-live-dot" aria-hidden="true" />
      <span className="agent-mobile-title">
        {state.status === "active" ? <ShiningText text={title} /> : title}
      </span>
      {state.elapsed ? <span className="agent-mobile-elapsed">{state.elapsed}</span> : null}
      <span className="mobile-mission-actions">
        {state.status === "active" ? (
          <button type="button" aria-label="Stop mission" onClick={() => dispatchCommand("stop")}>
            <StopCircleIcon size={13} aria-hidden="true" />
          </button>
        ) : null}
        {canOpenPreview ? (
          <button type="button" aria-label="Open preview" onClick={() => dispatchPreview("open")}>
            <MonitorIcon size={13} aria-hidden="true" />
          </button>
        ) : null}
        {canOpenFiles ? (
          <button type="button" aria-label="Open files" onClick={() => dispatchCommand("files")}>
            <FileCode2Icon size={13} aria-hidden="true" />
          </button>
        ) : null}
      </span>
    </div>
  );
}
