import * as React from "react";

export function Terminal({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={`huggy-terminal ${className}`} {...props}>
      {children}
    </section>
  );
}

export function TerminalLine({ status = "info", className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement> & { status?: "info" | "success" | "warning" | "error" }) {
  return (
    <div className={`huggy-terminal-line huggy-terminal-line-${status} ${className}`} data-status={status} {...props}>
      {children}
    </div>
  );
}
