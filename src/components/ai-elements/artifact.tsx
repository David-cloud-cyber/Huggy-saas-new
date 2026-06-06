import * as React from "react";

export function Artifact({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={`huggy-artifact ${className}`} {...props}>
      {children}
    </section>
  );
}

export function ArtifactHeader({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-artifact-header ${className}`} {...props}>
      {children}
    </div>
  );
}

export function ArtifactTitle({ className = "", children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`huggy-artifact-title ${className}`} {...props}>
      {children}
    </h3>
  );
}

export function ArtifactContent({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-artifact-content ${className}`} {...props}>
      {children}
    </div>
  );
}

export function ArtifactActions({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-artifact-actions ${className}`} {...props}>
      {children}
    </div>
  );
}

export function ArtifactAction({ className = "", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`huggy-artifact-action ${className}`} type="button" {...props}>
      {children}
    </button>
  );
}
