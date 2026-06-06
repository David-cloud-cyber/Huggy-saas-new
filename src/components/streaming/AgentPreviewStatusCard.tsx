import * as React from "react";

import type { StreamPreviewState } from "../../streaming/agent-stream-reducer";
import { PreviewStatusCard } from "./PreviewStatusCard";

type AgentPreviewStatusCardProps = {
  preview: StreamPreviewState;
};

export function AgentPreviewStatusCard({ preview }: AgentPreviewStatusCardProps) {
  return <PreviewStatusCard preview={preview} />;
}
