import * as React from "react";

import type { StreamRecoveryState } from "../../streaming/agent-stream-reducer";
import { RecoveryCard } from "./RecoveryCard";

type AgentRecoveryCardProps = {
  recovery: StreamRecoveryState;
};

export function AgentRecoveryCard({ recovery }: AgentRecoveryCardProps) {
  return <RecoveryCard recovery={recovery} />;
}
