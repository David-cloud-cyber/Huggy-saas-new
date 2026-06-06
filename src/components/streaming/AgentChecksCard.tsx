import * as React from "react";

import type { StreamCheckItem, StreamCheckState } from "../../streaming/agent-stream-reducer";
import { ChecksMatrixCard } from "./ChecksMatrixCard";

type AgentChecksCardProps = {
  checks: StreamCheckState;
  checkItems?: StreamCheckItem[];
};

export function AgentChecksCard({ checks, checkItems }: AgentChecksCardProps) {
  return <ChecksMatrixCard checks={checks} checkItems={checkItems} />;
}
