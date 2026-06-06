import * as React from "react";
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
  type ConfirmationState,
} from "../ai-elements/confirmation";

export function CriticalActionStream({
  id,
  state,
  children,
  actions,
}: {
  id: string;
  state: ConfirmationState;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="huggy-stream huggy-critical-stream">
      <Confirmation approval={{ id }} state={state}>
        <ConfirmationTitle>
          <ConfirmationRequest>{children}</ConfirmationRequest>
          <ConfirmationAccepted>Action approuvee.</ConfirmationAccepted>
          <ConfirmationRejected>Action annulee.</ConfirmationRejected>
        </ConfirmationTitle>
        <ConfirmationActions>
          {actions || (
            <>
              <ConfirmationAction>Cancel</ConfirmationAction>
              <ConfirmationAction>Continue</ConfirmationAction>
            </>
          )}
        </ConfirmationActions>
      </Confirmation>
    </div>
  );
}
