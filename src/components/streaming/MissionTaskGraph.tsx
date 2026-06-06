import * as React from "react";
import { CheckIcon, CircleIcon, Loader2Icon, RouteIcon, XIcon } from "lucide-react";

import type { StreamMissionTask } from "../../streaming/agent-stream-reducer";

type MissionTaskGraphProps = {
  tasks: StreamMissionTask[];
};

function taskIcon(status: StreamMissionTask["status"]) {
  if (status === "done") return <CheckIcon size={11} aria-hidden="true" />;
  if (status === "failed" || status === "cancelled") return <XIcon size={11} aria-hidden="true" />;
  if (status === "active") return <Loader2Icon size={11} aria-hidden="true" />;
  if (status === "warning") return <CircleIcon size={10} aria-hidden="true" />;
  return <CircleIcon size={9} aria-hidden="true" />;
}

export function MissionTaskGraph({ tasks }: MissionTaskGraphProps) {
  const visibleTasks = tasks.slice(0, 8);
  if (!visibleTasks.length) return null;

  return (
    <section className="agent-mini-card agent-task-graph" aria-label="Mission task graph">
      <div className="agent-mini-card-head">
        <RouteIcon size={14} aria-hidden="true" />
        <span>Mission Control</span>
      </div>
      <ol className="agent-task-list">
        {visibleTasks.map(task => (
          <li className="agent-task-row" data-status={task.status} key={task.id}>
            <span className="agent-task-status">{taskIcon(task.status)}</span>
            <span className="agent-task-copy">
              <strong>{task.label}</strong>
              <small>{task.detail}</small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
