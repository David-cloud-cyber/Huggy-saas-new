import * as React from "react";

import type { AgentStreamUiState } from "../../streaming/agent-stream-reducer";
import { MissionStream } from "../huggy-streaming/MissionStream";

type AgentActivityCardProps = {
  state: AgentStreamUiState;
};

export function AgentActivityCard({ state }: AgentActivityCardProps) {
  return <MissionStream state={state} />;
}
