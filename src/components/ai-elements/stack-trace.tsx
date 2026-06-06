import * as React from "react";

export function StackTrace({ className = "", children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  return (
    <pre className={`huggy-stack-trace ${className}`} {...props}>
      {children}
    </pre>
  );
}

export function StackTraceFrame({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-stack-trace-frame ${className}`} {...props}>
      {children}
    </div>
  );
}
