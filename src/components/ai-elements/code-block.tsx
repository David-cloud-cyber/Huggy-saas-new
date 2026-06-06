import * as React from "react";

export function CodeBlock({
  code,
  language,
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLPreElement> & { code?: string; language?: string }) {
  return (
    <pre className={`huggy-code-block ${className}`} data-language={language} {...props}>
      <code>{children || code}</code>
    </pre>
  );
}

export function CodeBlockHeader({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-code-block-header ${className}`} {...props}>
      {children}
    </div>
  );
}
