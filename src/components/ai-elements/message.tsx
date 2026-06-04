import * as React from "react";

type MessageProps = React.HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant" | "system";
};

export function Message({ from, className = "", children, ...props }: MessageProps) {
  return (
    <article className={`huggy-message huggy-message-${from} ${className}`} data-role={from} {...props}>
      {children}
    </article>
  );
}

export function MessageContent({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-message-content ${className}`} {...props}>
      {children}
    </div>
  );
}
