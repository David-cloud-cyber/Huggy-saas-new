// Enhanced Code Block with copy button, streaming cursor, and glow border.
//
// Drop-in upgrade for src/components/ai-elements/code-block.tsx
// Import CSS: import '../../styles/agent-activity-stream-v2.css';

import { useState, useCallback } from 'react';

type CodeBlockProps = React.HTMLAttributes<HTMLPreElement> & {
  code?: string;
  language?: string;
  filename?: string;
  streaming?: boolean;
};

function CopyIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
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

function FileCodeIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m10 13-2 2 2 2" />
      <path d="m14 17 2-2-2-2" />
    </svg>
  );
}

export function CodeBlock({ code, language, filename, streaming, className = '', children, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const text = code || (typeof children === 'string' ? children : '');

  const handleCopy = useCallback(() => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <div className={`haas-code ${streaming ? 'haas-code--streaming' : ''}`}>
      <div className="haas-code-head">
        <FileCodeIcon />
        <span className="haas-code-filename">{filename || language || 'code'}</span>
        {streaming && (
          <span className="haas-typing-dots">
            <span /><span /><span />
          </span>
        )}
        <button type="button" onClick={handleCopy}
          className={`haas-code-copy ${copied ? 'haas-code-copy--copied' : ''}`}>
          {copied ? <><CheckIcon /> Copié</> : <><CopyIcon /> Copier</>}
        </button>
      </div>
      <pre className={`haas-code-body ${className}`} data-language={language} {...props}>
        <code>
          {children || code}
          {streaming && <span className="haas-typing-cursor">▋</span>}
        </code>
      </pre>
    </div>
  );
}

export function CodeBlockHeader({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`haas-code-head ${className}`} {...props}>
      {children}
    </div>
  );
}
