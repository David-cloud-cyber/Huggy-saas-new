// Tool Call Card — expandable card showing agent tool execution.
//
// New AI-element for the Huggy Stream UI v2. Self-contained, dependency-free,
// styled by src/styles/agent-activity-stream-v2.css (haas-tool-* classes).

import * as React from 'react';
import { useState, useEffect, type ReactNode } from 'react';

type ToolCallProps = {
  name: string;
  detail?: string;
  status: 'active' | 'done' | 'failed';
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
};

function ZapIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}
function CheckIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function XCircleIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
    </svg>
  );
}
function ChevronDown(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function Spinner(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="haas-spin" {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function ToolCall({ name, detail, status, icon, children, className = '' }: ToolCallProps) {
  const [open, setOpen] = useState(status === 'active');

  useEffect(() => {
    if (status === 'active') setOpen(true);
  }, [status]);

  return (
    <div className={`haas-tool ${className}`}>
      <button type="button" className="haas-tool-head" onClick={() => setOpen(!open)}>
        <span className={`haas-tool-icon haas-tool-icon--${status}`}>
          {icon || <ZapIcon />}
        </span>
        <span className="haas-tool-name">{name}</span>
        {detail && <span className="haas-tool-detail">{detail}</span>}
        <span style={{ flex: 1 }} />
        {status === 'active' && <Spinner style={{ color: 'var(--haas-accent)' }} />}
        {status === 'done' && (
          <span className="haas-tool-icon haas-tool-icon--done"><CheckIcon /></span>
        )}
        {status === 'failed' && (
          <span className="haas-tool-icon haas-tool-icon--failed"><XCircleIcon /></span>
        )}
        {children && (
          <ChevronDown
            className="haas-tool-chevron"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
          />
        )}
      </button>
      {open && children && <div className="haas-tool-body">{children}</div>}
      {status === 'active' && (
        <div className="haas-tool-progress">
          <div className="haas-tool-progress-bar" />
        </div>
      )}
    </div>
  );
}

export default ToolCall;
