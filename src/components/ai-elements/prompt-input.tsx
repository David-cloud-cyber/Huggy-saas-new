import * as React from "react";

export function PromptInput({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-prompt-input ${className}`} {...props}>
      {children}
    </div>
  );
}

export function PromptInputTextarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`huggy-prompt-input-textarea ${className}`} {...props} />;
}

export function PromptInputToolbar({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-prompt-input-toolbar ${className}`} {...props}>
      {children}
    </div>
  );
}

export function PromptInputSubmit({ className = "", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`huggy-prompt-input-submit ${className}`} type="submit" {...props}>
      {children}
    </button>
  );
}
