import * as React from "react";
import { CopyIcon, ExternalLinkIcon, FileCode2Icon, GitCompareArrowsIcon } from "lucide-react";

import type { StreamFileCard } from "../../streaming/agent-stream-reducer";

type LiveFilesCardProps = {
  files: StreamFileCard[];
};

const reasonLabel: Record<StreamFileCard["reason"], string> = {
  created: "Cree",
  modified: "Modifie",
  deleted: "Supprime",
  unknown: "Touche",
};

function statusLabel(status: StreamFileCard["status"]): string {
  if (status === "writing") return "en cours";
  if (status === "failed") return "a revoir";
  return "pret";
}

export function LiveFilesCard({ files }: LiveFilesCardProps) {
  const [openPath, setOpenPath] = React.useState<string>("");
  const visibleFiles = files.filter(file => file.path.trim()).slice(-6);
  if (!visibleFiles.length) return null;

  const copyPath = async (path: string) => {
    await navigator.clipboard?.writeText(path).catch(() => null);
  };

  const emitFileAction = (action: "open" | "rollback", path: string) => {
    window.dispatchEvent(new CustomEvent("huggy:stream-file-action", { detail: { action, path } }));
  };

  return (
    <section className="agent-mini-card agent-files-card live-files-card" aria-label="Fichiers modifies">
      <div className="agent-mini-card-head">
        <FileCode2Icon size={14} aria-hidden="true" />
        <span>Fichiers cibles</span>
      </div>
      <div className="agent-file-list">
        {visibleFiles.map(file => (
          <div className="agent-file-row" data-status={file.status} key={file.path}>
            <button className="agent-file-main" type="button" onClick={() => emitFileAction("open", file.path)}>
              <span className="agent-file-path">{file.path}</span>
              <span className="agent-file-meta">{reasonLabel[file.reason]} / {statusLabel(file.status)} / {file.language || "Fichier"}</span>
            </button>
            <span className="agent-file-actions">
              <button type="button" onClick={() => emitFileAction("open", file.path)}>
                <ExternalLinkIcon size={12} aria-hidden="true" />
                Ouvrir fichier
              </button>
              {file.snippet ? (
                <button type="button" onClick={() => setOpenPath(openPath === file.path ? "" : file.path)}>
                  <GitCompareArrowsIcon size={12} aria-hidden="true" />
                  Voir diff
                </button>
              ) : null}
              <button type="button" onClick={() => void copyPath(file.path)}>
                <CopyIcon size={12} aria-hidden="true" />
                Copier
              </button>
              {file.rollbackAvailable ? (
                <button type="button" onClick={() => emitFileAction("rollback", file.path)}>
                  Rollback fichier
                </button>
              ) : null}
            </span>
            {openPath === file.path && file.snippet ? <pre className="agent-file-snippet">{file.snippet}</pre> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
