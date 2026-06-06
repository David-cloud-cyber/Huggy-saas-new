import * as React from "react";

import type { StreamFileCard } from "../../streaming/agent-stream-reducer";
import { LiveFilesCard } from "./LiveFilesCard";

type AgentFileChangesCardProps = {
  files: StreamFileCard[];
};

export function AgentFileChangesCard({ files }: AgentFileChangesCardProps) {
  return <LiveFilesCard files={files} />;
}
