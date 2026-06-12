// Agent Activity Stream (MIX) — the new in-chat streaming presentation.
//
// Renders the pure AgentActivityState (see src/lib/agent-activity-stream.ts)
// instead of mutating the DOM from SSE callbacks. While streaming it shows a
// transparent, Bolt-style breakdown (decision + live steps + per-file rows);
// on completion it collapses to a calm, Lovable-style one-line recap.
//
// Visual language lives entirely in src/styles/agent-activity-stream.css —
// one tokenized stylesheet replacing the overlapping agent-streaming.css /
// mission-streaming.css buildstream/flowline rules.

import { useState } from 'react';
import {
  activeMilestone,
  recapLine,
  summarizeActivity,
  type AgentActivityState,
  type ActivityFile,
  type ActivityMilestone,
} from '../../lib/agent-activity-stream.ts';

export type AgentActivityStreamProps = {
  state: AgentActivityState;
  onOpenFile?: (path: string) => void;
  onRetry?: () => void;
};

function StatusDot({ status }: { status: 'active' | 'done' | 'failed' | 'pending' }) {
  return <span className={`haas-dot haas-dot--${status}`} aria-hidden="true" />;
}

function MilestoneRow({ milestone }: { milestone: ActivityMilestone }) {
  return (
    <li className="haas-step" data-state={milestone.state}>
      <StatusDot status={milestone.state} />
      <span className="haas-step-label">{milestone.label}</span>
    </li>
  );
}

function FileRow({ file, onOpenFile }: { file: ActivityFile; onOpenFile?: (path: string) => void }) {
  const interactive = Boolean(onOpenFile);
  return (
    <li
      className="haas-file"
      data-state={file.status}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onOpenFile?.(file.path) : undefined}
      onKeyDown={
        interactive
          ? event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenFile?.(file.path);
              }
            }
          : undefined
      }
    >
      <StatusDot status={file.status === 'done' ? 'done' : 'active'} />
      <span className="haas-file-path">{file.path}</span>
      {file.status === 'writing' && file.chars > 0 ? (
        <span className="haas-file-meta">{file.chars} car.</span>
      ) : null}
    </li>
  );
}

export function AgentActivityStream({ state, onOpenFile, onRetry }: AgentActivityStreamProps) {
  const [expanded, setExpanded] = useState(false);

  if (state.phase === 'idle') return null;

  const finished = state.phase === 'done';
  const errored = state.phase === 'error';
  const summary = summarizeActivity(state);
  const current = activeMilestone(state);
  const showDetail = !state.collapsed || expanded;

  // Collapsed recap (calm completion). Click to expand the full trace.
  if (finished && !expanded) {
    return (
      <div className="haas haas--recap" data-phase="done">
        <button type="button" className="haas-recap-btn" onClick={() => setExpanded(true)}>
          <StatusDot status={summary.checksFailed > 0 ? 'failed' : 'done'} />
          <span className="haas-recap-text">{recapLine(state)}</span>
          <span className="haas-recap-chevron" aria-hidden="true">▾</span>
        </button>
      </div>
    );
  }

  return (
    <div className="haas" data-phase={state.phase}>
      <div className="haas-head">
        <span className="haas-spark" aria-hidden="true" />
        <span className="haas-head-text">
          {state.decisionLine || state.statusLine || (current ? current.label : 'Génération en cours…')}
        </span>
        {finished || errored ? (
          <button type="button" className="haas-collapse" onClick={() => setExpanded(false)}>
            Réduire
          </button>
        ) : null}
      </div>

      {state.decisionLine && (state.statusLine || current) ? (
        <div className="haas-substatus">{state.statusLine || current?.label}</div>
      ) : null}

      {showDetail ? (
        <div className="haas-body">
          {state.milestones.length > 0 ? (
            <ul className="haas-steps">
              {state.milestones.map(milestone => (
                <MilestoneRow key={milestone.key} milestone={milestone} />
              ))}
            </ul>
          ) : null}

          {state.files.length > 0 ? (
            <ul className="haas-files">
              {state.files.map(file => (
                <FileRow key={file.path} file={file} onOpenFile={onOpenFile} />
              ))}
            </ul>
          ) : null}

          {state.warnings.length > 0 ? (
            <ul className="haas-warnings">
              {state.warnings.map((message, index) => (
                <li key={index} className="haas-warning">
                  {message}
                </li>
              ))}
            </ul>
          ) : null}

          {state.checks.length > 0 ? (
            <ul className="haas-checks">
              {state.checks.map((check, index) => (
                <li key={index} className="haas-check" data-status={check.status}>
                  <StatusDot status={check.status === 'fail' ? 'failed' : check.status === 'pass' ? 'done' : 'pending'} />
                  <span className="haas-check-name">{check.name}</span>
                  {check.detail ? <span className="haas-check-detail">{check.detail}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {errored ? (
        <div className="haas-error">
          <div className="haas-error-msg">{state.error?.message || 'Une erreur est survenue.'}</div>
          {state.error?.recoverable && onRetry ? (
            <button type="button" className="haas-error-retry" onClick={onRetry}>
              Réessayer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default AgentActivityStream;
