import * as React from "react";
import { ArrowRightIcon, FileCode2Icon, RocketIcon, SmartphoneIcon, SparklesIcon } from "lucide-react";

import type { AgentStreamUiState } from "../../streaming/agent-stream-reducer";

type NextBestActionCardProps = {
  state: AgentStreamUiState;
};

function dispatchPreview(action: string) {
  window.dispatchEvent(new CustomEvent("huggy:stream-preview-action", { detail: { action } }));
}

function dispatchCommand(action: string) {
  window.dispatchEvent(new CustomEvent("huggy:stream-command", { detail: { action } }));
}

export function NextBestActionCard({ state }: NextBestActionCardProps) {
  if (state.status === "active") return null;

  const previewReady = state.preview.status === "ready" && state.preview.hasPreviewEvent;
  const hasFiles = state.files.length > 0;
  const failed = state.status === "failed";
  const cancelled = state.status === "cancelled";

  if (!previewReady && !hasFiles && !failed && !cancelled && !state.finalSummary?.nextAction) return null;

  const title = failed
    ? "Next best move"
    : cancelled
      ? "Generation paused"
      : previewReady
        ? "Recommended next step"
        : "Review the result";
  const copy = failed
    ? "Review the visible details, then retry with a narrower request or ask Huggy to fix the blocker."
    : cancelled
      ? "Nothing was published. You can adjust the prompt or restart from the current project state."
      : previewReady
        ? "Test the preview on mobile before publishing the live version."
        : state.finalSummary?.nextAction || "Open the changed files and confirm the diff before continuing.";

  return (
    <section className="agent-next-card" aria-label="Recommended next action">
      <div className="agent-next-copy">
        <span className="agent-next-kicker">Next</span>
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
      <div className="agent-next-actions">
        {previewReady ? (
          <>
            <button type="button" onClick={() => dispatchPreview("mobile")}>
              <SmartphoneIcon size={13} aria-hidden="true" />
              Test mobile
            </button>
            <button type="button" className="primary" onClick={() => dispatchPreview("publish")}>
              <RocketIcon size={13} aria-hidden="true" />
              Publish
            </button>
            <button type="button" onClick={() => dispatchCommand("media")}>
              <SparklesIcon size={13} aria-hidden="true" />
              Media kit
            </button>
          </>
        ) : null}
        {hasFiles ? (
          <button type="button" onClick={() => dispatchCommand("files")}>
            <FileCode2Icon size={13} aria-hidden="true" />
            View files
          </button>
        ) : null}
        {(failed || cancelled) ? (
          <button type="button" onClick={() => dispatchCommand("focus-input")}>
            <ArrowRightIcon size={13} aria-hidden="true" />
            Continue
          </button>
        ) : null}
      </div>
    </section>
  );
}
