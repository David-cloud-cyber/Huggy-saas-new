// Enhanced Reasoning / Thinking Block — collapsible with shimmer.
//
// Drop-in upgrade for src/components/ai-elements/reasoning.tsx
// Import CSS: import '../../styles/agent-activity-stream-v2.css';

import { useState, useEffect } from 'react';

type ReasoningProps = React.HTMLAttributes<HTMLDivElement> & {
  isStreaming?: boolean;
  elapsed?: string;
};

function BrainIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
    </svg>
  );
}
function ChevronDown(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Reasoning({ isStreaming = false, elapsed, className = '', children, ...props }: ReasoningProps) {
  const [open, setOpen] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) setOpen(true);
  }, [isStreaming]);

  return (
    <div className={`haas-thinking ${className}`} {...props}>
      <button type="button" className="haas-thinking-trigger" onClick={() => setOpen(!open)}>
        <span className={`haas-dot haas-dot--${isStreaming ? 'active' : 'done'}`} aria-hidden="true" />
        <BrainIcon style={{ color: isStreaming ? 'var(--haas-accent)' : 'var(--haas-muted)' }} />
        <span className="haas-thinking-label">
          Raisonnement
        </span>
        {elapsed && <span className="haas-thinking-elapsed">{elapsed}</span>}
        <ChevronDown className={`haas-thinking-chevron ${open ? 'haas-thinking-chevron--open' : ''}`} />
      </button>
      {open && (
        <div className="haas-thinking-content">
          {children}
          {isStreaming && <span className="haas-typing-cursor">▋</span>}
        </div>
      )}
    </div>
  );
}

// Keep backward-compatible exports
export function ReasoningTrigger({ className = '', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`haas-thinking-trigger ${className}`} {...props}>{children}</button>;
}

export function ReasoningContent({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`haas-thinking-content ${className}`} {...props}>{children}</div>;
}

export default Reasoning;
