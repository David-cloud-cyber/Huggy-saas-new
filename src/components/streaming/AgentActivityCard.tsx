import * as React from "react";

import type { AgentStreamUiState } from "../../streaming/agent-stream-reducer";
import { MissionControlCard } from "./MissionControlCard";

type AgentActivityCardProps = {
  state: AgentStreamUiState;
};

export function AgentActivityCard({ state }: AgentActivityCardProps) {
  return <MissionControlCard state={state} />;
}
