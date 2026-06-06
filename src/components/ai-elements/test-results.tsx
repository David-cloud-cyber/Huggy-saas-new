import * as React from "react";

export function TestResults({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={`huggy-test-results ${className}`} {...props}>
      {children}
    </section>
  );
}

export function TestResultItem({
  status = "pending",
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { status?: "pending" | "running" | "passed" | "failed" | "skipped" }) {
  return (
    <div className={`huggy-test-result-item huggy-test-result-item-${status} ${className}`} data-status={status} {...props}>
      <span className="huggy-test-result-status" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
