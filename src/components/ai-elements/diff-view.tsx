// Diff View — inline diff display with accept/reject actions.
//
// New AI-element for the Huggy Stream UI v2. Self-contained, dependency-free,
// styled by src/styles/agent-activity-stream-v2.css (haas-diff-* classes).

import * as React from 'react';
import { useState } from 'react';

type DiffViewProps = {
  filename: string;
  hunks: string[];
  onAccept?: () => void;
  onReject?: () => void;
  className?: string;
};

function DiffIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v14" /><path d="M5 10h14" /><path d="M5 21h14" />
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
function XIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}
function CheckCircleIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />
    </svg>
  );
}
function XCircleIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
    </svg>
  );
}

export function DiffView({ filename, hunks, onAccept, onReject, className = '' }: DiffViewProps) {
  const [accepted, setAccepted] = useState<boolean | null>(null);

  return (
    <div className={`haas-diff ${className}`}>
      <div className="haas-diff-head">
        <DiffIcon />
        <span className="haas-diff-filename">{filename}</span>
        {accepted === null ? (
          <div className="haas-diff-actions">
            <button type="button" className="haas-diff-btn haas-diff-btn--accept"
              onClick={() => { setAccepted(true); onAccept?.(); }}>
              <CheckIcon /> Accepter
            </button>
            <button type="button" className="haas-diff-btn haas-diff-btn--reject"
              onClick={() => { setAccepted(false); onReject?.(); }}>
              <XIcon /> Rejeter
            </button>
          </div>
        ) : (
          <span className={`haas-diff-status haas-diff-status--${accepted ? 'accepted' : 'rejected'}`}>
            {accepted ? <><CheckCircleIcon /> Accepté</> : <><XCircleIcon /> Rejeté</>}
          </span>
        )}
      </div>
      <pre className="haas-diff-body">
        {hunks.map((line, i) => {
          const isAdd = line.startsWith('+');
          const isDel = line.startsWith('-');
          const cls = isAdd ? 'haas-diff-line--add' : isDel ? 'haas-diff-line--del' : 'haas-diff-line--ctx';
          return <div key={i} className={`haas-diff-line ${cls}`}>{line}</div>;
        })}
      </pre>
    </div>
  );
}

export default DiffView;
