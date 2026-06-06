import * as React from "react";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "../ai-elements/plan";
import { Shimmer } from "../ai-elements/shimmer";
import { Task, TaskContent, TaskItem, TaskTrigger } from "../ai-elements/task";

export function PlanningStream({
  title,
  description,
  content,
  streaming = false,
  actions,
}: {
  title: string;
  description: string;
  content: React.ReactNode;
  streaming?: boolean;
  actions?: React.ReactNode;
}) {
  const lines = String(content || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  return (
    <div className="huggy-stream huggy-planning-stream">
      <Plan defaultOpen={false}>
        <PlanHeader>
          <div>
            <PlanTitle>{streaming ? <Shimmer>{title}</Shimmer> : title}</PlanTitle>
            <PlanDescription>{description}</PlanDescription>
          </div>
          <PlanTrigger />
        </PlanHeader>
        <PlanContent>
          <Task defaultOpen>
            <TaskTrigger title="Plan / analyse" />
            <TaskContent>
              {lines.length ? (
                lines.map((line, index) => (
                  <TaskItem key={`${line}-${index}`} status={index === lines.length - 1 && streaming ? "active" : "done"}>
                    {line.replace(/^\d+\.\s*/, "")}
                  </TaskItem>
                ))
              ) : (
                <TaskItem status={streaming ? "active" : "done"}>{content}</TaskItem>
              )}
            </TaskContent>
          </Task>
        </PlanContent>
        {actions ? (
          <PlanFooter>
            <PlanAction>{actions}</PlanAction>
          </PlanFooter>
        ) : null}
      </Plan>
    </div>
  );
}
