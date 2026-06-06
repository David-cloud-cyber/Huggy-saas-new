import {
  createInitialAgentStreamState,
  reduceAgentStreamEvent,
  type AgentStreamEventInput,
  type AgentStreamUiState,
} from "./agent-stream-reducer";

export type MissionStreamState = AgentStreamUiState;
export type MissionStreamEventInput = AgentStreamEventInput;

export function createInitialMissionStreamState(seed: Partial<MissionStreamState> = {}): MissionStreamState {
  return createInitialAgentStreamState(seed);
}

export function reduceMissionStreamEvent(state: MissionStreamState, input: MissionStreamEventInput): MissionStreamState {
  return reduceAgentStreamEvent(state, input);
}
