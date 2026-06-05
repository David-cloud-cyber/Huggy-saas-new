import * as React from "react";

import type { AgentStreamUiState } from "../../streaming/agent-stream-reducer";
import { ShiningText } from "../ai-elements/shining-text";

type AgentStreamCompactMobileProps = {
  state: AgentStreamUiState;
};

export function AgentStreamCompactMobile({ state }: AgentStreamCompactMobileProps) {
  const current = [...state.phases].reverse().find(phase => phase.status === "active") || state.phases[state.phases.length - 1];

  return (
    <div className="agent-mobile-compact" data-status={state.status}>
      <span className="agent-live-dot" aria-hidden="true" />
      <span className="agent-mobile-title">
        {state.status === "active" ? <ShiningText text={current?.label || state.headline} /> : (current?.label || state.headline)}
      </span>
      {state.elapsed ? <span className="agent-mobile-elapsed">{state.elapsed}</span> : null}
    </div>
  );
}
