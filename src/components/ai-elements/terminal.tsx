// Enhanced Terminal Block — live command execution display.
//
// Drop-in upgrade for src/components/ai-elements/terminal.tsx
// Import CSS: import '../../styles/agent-activity-stream-v2.css';

import type { HTMLAttributes } from 'react';

type TerminalBlockProps = HTMLAttributes<HTMLDivElement> & {
  command: string;
  output?: string | null;
  status?: 'pass' | 'fail' | null;
  running?: boolean;
};

function TerminalIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  );
}
function CheckCircleIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />
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

export function TerminalBlock({ command, output, status, running, className = '', ...props }: TerminalBlockProps) {
  return (
    <div className={`haas-terminal ${className}`} {...props}>
      <div className="haas-terminal-head">
        <TerminalIcon />
        <span>Terminal</span>
        {running && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: 'haas-spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        {status === 'pass' && <CheckCircleIcon style={{ color: 'var(--haas-ok)' }} />}
        {status === 'fail' && <XCircleIcon style={{ color: 'var(--haas-fail)' }} />}
      </div>
      <div className="haas-terminal-body">
        <div className="haas-terminal-cmd">
          <span className="haas-terminal-prompt">$</span>
          {command}
          {running && <span className="haas-typing-cursor">▋</span>}
        </div>
        {output && <div className="haas-terminal-output">{output}</div>}
      </div>
    </div>
  );
}

// Keep backward-compatible exports
export function Terminal({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={`haas-terminal ${className}`} {...props}>{children}</section>;
}

export function TerminalLine({ status = 'info', className = '', children, ...props }:
  HTMLAttributes<HTMLDivElement> & { status?: 'info' | 'success' | 'warning' | 'error' }) {
  return (
    <div className={`haas-terminal-body ${className}`} data-status={status} {...props}>
      {children}
    </div>
  );
}

export default TerminalBlock;
