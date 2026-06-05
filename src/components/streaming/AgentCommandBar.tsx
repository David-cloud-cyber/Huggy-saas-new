import * as React from "react";
import {
  ClipboardListIcon,
  FileCode2Icon,
  HistoryIcon,
  RocketIcon,
  SmartphoneIcon,
  SparklesIcon,
  StopCircleIcon,
} from "lucide-react";

import type { AgentStreamUiState } from "../../streaming/agent-stream-reducer";

type AgentCommandBarProps = {
  state: AgentStreamUiState;
  detailsOpen: boolean;
  onToggleDetails: () => void;
};

function dispatchCommand(action: string) {
  window.dispatchEvent(new CustomEvent("huggy:stream-command", { detail: { action } }));
}

function dispatchPreview(action: string) {
  window.dispatchEvent(new CustomEvent("huggy:stream-preview-action", { detail: { action } }));
}

export function AgentCommandBar({ state, detailsOpen, onToggleDetails }: AgentCommandBarProps) {
  const isActive = state.status === "active";
  const hasFiles = state.files.length > 0;
  const previewReady = state.preview.status === "ready" && state.preview.hasPreviewEvent;
  const canRollback = Boolean(state.runHeader?.rollbackAvailable);

  return (
    <div className="agent-command-bar" role="toolbar" aria-label="Agent run actions">
      {isActive ? (
        <button className="agent-command-button danger" type="button" onClick={() => dispatchCommand("stop")}>
          <StopCircleIcon size={13} aria-hidden="true" />
          Stop
        </button>
      ) : null}

      <button
        className="agent-command-button"
        type="button"
        aria-pressed={detailsOpen}
        onClick={onToggleDetails}
      >
        <ClipboardListIcon size={13} aria-hidden="true" />
        {detailsOpen ? "Hide details" : "View details"}
      </button>

      {hasFiles ? (
        <button className="agent-command-button" type="button" onClick={() => dispatchCommand("files")}>
          <FileCode2Icon size={13} aria-hidden="true" />
          {isActive ? "Files" : "View diff"}
        </button>
      ) : null}

      {canRollback && !isActive ? (
        <button className="agent-command-button" type="button" onClick={() => dispatchCommand("rollback")}>
          <HistoryIcon size={13} aria-hidden="true" />
          Rollback
        </button>
      ) : null}

      {previewReady ? (
        <>
          <button className="agent-command-button" type="button" onClick={() => dispatchPreview("mobile")}>
            <SmartphoneIcon size={13} aria-hidden="true" />
            Test mobile
          </button>
          <button className="agent-command-button primary" type="button" onClick={() => dispatchPreview("publish")}>
            <RocketIcon size={13} aria-hidden="true" />
            Publish
          </button>
          {!isActive ? (
            <button className="agent-command-button" type="button" onClick={() => dispatchCommand("media")}>
              <SparklesIcon size={13} aria-hidden="true" />
              Media kit
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
