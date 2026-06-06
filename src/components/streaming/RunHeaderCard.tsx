import * as React from "react";

import type { StreamRunHeader } from "../../streaming/agent-stream-reducer";
import { MissionHeader } from "./MissionHeader";

type RunHeaderCardProps = {
  header?: StreamRunHeader;
};

export function RunHeaderCard({ header }: RunHeaderCardProps) {
  return <MissionHeader header={header} />;
}
