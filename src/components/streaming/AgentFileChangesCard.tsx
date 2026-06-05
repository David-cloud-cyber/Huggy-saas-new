import * as React from "react";
import { CopyIcon, FileCode2Icon, GitCompareArrowsIcon } from "lucide-react";

import type { StreamFileCard } from "../../streaming/agent-stream-reducer";

type AgentFileChangesCardProps = {
  files: StreamFileCard[];
};

const reasonLabel: Record<StreamFileCard["reason"], string> = {
  created: "Created",
  modified: "Updated",
  deleted: "Deleted",
  unknown: "Touched",
};

export function AgentFileChangesCard({ files }: AgentFileChangesCardProps) {
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
    <section className="agent-mini-card agent-files-card" aria-label="Changed files">
      <div className="agent-mini-card-head">
        <FileCode2Icon size={14} aria-hidden="true" />
        <span>Files</span>
      </div>
      <div className="agent-file-list">
        {visibleFiles.map(file => (
          <div className="agent-file-row" data-status={file.status} key={file.path}>
            <button className="agent-file-main" type="button" onClick={() => emitFileAction("open", file.path)}>
              <span className="agent-file-path">{file.path}</span>
              <span className="agent-file-meta">{reasonLabel[file.reason]} · {file.status} · {file.language || "File"}</span>
            </button>
            <span className="agent-file-actions">
              {file.snippet ? (
                <button type="button" onClick={() => setOpenPath(openPath === file.path ? "" : file.path)}>
                  <GitCompareArrowsIcon size={12} aria-hidden="true" />
                  Diff
                </button>
              ) : null}
              <button type="button" onClick={() => void copyPath(file.path)}>
                <CopyIcon size={12} aria-hidden="true" />
                Copy
              </button>
              {file.rollbackAvailable ? (
                <button type="button" onClick={() => emitFileAction("rollback", file.path)}>
                  Rollback
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
