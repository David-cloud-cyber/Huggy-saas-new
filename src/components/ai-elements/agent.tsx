import * as React from "react";

export function Agent({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={`huggy-ai-agent ${className}`} {...props}>
      {children}
    </section>
  );
}

export function AgentHeader({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-ai-agent-header ${className}`} {...props}>
      {children}
    </div>
  );
}

export function AgentTitle({ className = "", children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`huggy-ai-agent-title ${className}`} {...props}>
      {children}
    </h3>
  );
}

export function AgentDescription({ className = "", children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`huggy-ai-agent-description ${className}`} {...props}>
      {children}
    </p>
  );
}

export function AgentList({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-ai-agent-list ${className}`} {...props}>
      {children}
    </div>
  );
}

export function AgentItem({
  status = "pending",
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { status?: "pending" | "active" | "done" | "warning" | "failed" | "skipped" }) {
  return (
    <div className={`huggy-ai-agent-item huggy-ai-agent-item-${status} ${className}`} data-status={status} {...props}>
      {children}
    </div>
  );
}
