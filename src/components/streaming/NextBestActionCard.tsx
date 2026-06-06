import * as React from "react";
import { ArrowRightIcon, BrushIcon, FileCode2Icon, GlobeIcon, HistoryIcon, RocketIcon, SmartphoneIcon, SparklesIcon } from "lucide-react";

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
  const canRollback = Boolean(state.runHeader?.rollbackAvailable);

  if (!previewReady && !hasFiles && !failed && !cancelled && !state.finalSummary?.nextAction) return null;

  const title = failed
    ? "Prochaine action utile"
    : cancelled
      ? "Mission en pause"
      : previewReady
        ? "Prochaine etape recommandee"
        : "Verifier le resultat";
  const copy = failed
    ? "Lis le blocage visible, puis relance avec une demande plus precise ou demande a Huggy de corriger."
    : cancelled
      ? "Rien n a ete publie. Tu peux ajuster le prompt ou repartir de l etat actuel."
      : previewReady
        ? "Teste la preview en mobile avant de publier la version live."
        : state.finalSummary?.nextAction || "Ouvre les fichiers touches et confirme le diff avant de continuer.";

  return (
    <section className="agent-next-card" aria-label="Prochaine action recommandee">
      <div className="agent-next-copy">
        <span className="agent-next-kicker">Suite</span>
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
      <div className="agent-next-actions">
        {previewReady ? (
          <>
            <button type="button" onClick={() => dispatchPreview("mobile")}>
              <SmartphoneIcon size={13} aria-hidden="true" />
              Tester mobile
            </button>
            <button type="button" className="primary" onClick={() => dispatchPreview("publish")}>
              <RocketIcon size={13} aria-hidden="true" />
              Publier
            </button>
            <button type="button" onClick={() => dispatchCommand("media")}>
              <SparklesIcon size={13} aria-hidden="true" />
              Kit media
            </button>
            <button type="button" onClick={() => dispatchCommand("improve-design")}>
              <BrushIcon size={13} aria-hidden="true" />
              Ameliorer design
            </button>
            <button type="button" onClick={() => dispatchCommand("connect-domain")}>
              <GlobeIcon size={13} aria-hidden="true" />
              Connecter domaine
            </button>
          </>
        ) : null}
        {hasFiles ? (
          <button type="button" onClick={() => dispatchCommand("files")}>
            <FileCode2Icon size={13} aria-hidden="true" />
            Voir fichiers
          </button>
        ) : null}
        {canRollback ? (
          <button type="button" onClick={() => dispatchCommand("rollback")}>
            <HistoryIcon size={13} aria-hidden="true" />
            Rollback
          </button>
        ) : null}
        {(failed || cancelled) ? (
          <button type="button" onClick={() => dispatchCommand("focus-input")}>
            <ArrowRightIcon size={13} aria-hidden="true" />
            Continuer
          </button>
        ) : null}
      </div>
    </section>
  );
}
