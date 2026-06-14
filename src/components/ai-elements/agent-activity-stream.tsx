// Agent Activity Stream (MIX) — the new in-chat streaming presentation.
//
// Renders the pure AgentActivityState (see src/lib/agent-activity-stream.ts)
// instead of mutating the DOM from SSE callbacks. While streaming it shows a
// transparent "agent reasoning" pipeline (phase timeline + understanding +
// clarification + live reasoning + plan checklist + per-file rows); on
// completion it collapses to a calm, Lovable-style one-line recap.
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
  type ActivityReasoningPhase,
  type ActivityPlanStep,
} from '../../lib/agent-activity-stream.ts';

export type AgentActivityStreamProps = {
  state: AgentActivityState;
  onOpenFile?: (path: string) => void;
  onRetry?: () => void;
  onClarificationReply?: (answer: string) => void;
};

function StatusDot({ status }: { status: 'active' | 'done' | 'failed' | 'pending' }) {
  return <span className={`haas-dot haas-dot--${status}`} aria-hidden="true" />;
}

const PLAN_KIND_ICON: Record<ActivityPlanStep['kind'], string> = {
  create: '＋',
  edit: '✎',
  delete: '－',
  task: '◇',
};

const PLAN_KIND_LABEL: Record<ActivityPlanStep['kind'], string> = {
  create: 'Créer',
  edit: 'Modifier',
  delete: 'Supprimer',
  task: 'Tâche',
};

function PhaseRow({ phase }: { phase: ActivityReasoningPhase }) {
  return (
    <li className="haas-phase" data-state={phase.state}>
      <StatusDot status={phase.state} />
      <span className="haas-phase-label">{phase.label}</span>
    </li>
  );
}

function MilestoneRow({ milestone }: { milestone: ActivityMilestone }) {
  return (
    <li className="haas-step" data-state={milestone.state}>
      <StatusDot status={milestone.state === 'cancelled' ? 'pending' : milestone.state} />
      <span className="haas-step-label">{milestone.label}</span>
    </li>
  );
}

function PlanStepRow({ step }: { step: ActivityPlanStep }) {
  return (
    <li className="haas-plan-step" data-state={step.state} data-kind={step.kind}>
      <StatusDot status={step.state} />
      <span className="haas-plan-icon" aria-hidden="true">
        {PLAN_KIND_ICON[step.kind]}
      </span>
      <span className="haas-plan-title">{step.title}</span>
      {step.path ? <span className="haas-plan-path">{step.path}</span> : null}
      <span className="haas-plan-kind">{PLAN_KIND_LABEL[step.kind]}</span>
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

export function AgentActivityStream({ state, onOpenFile, onRetry, onClarificationReply }: AgentActivityStreamProps) {
  const [expanded, setExpanded] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);

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

  const understanding = state.understanding;
  const clarification = state.clarification;

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
          {/* 1 — Phase timeline (primary progress). Falls back to milestones. */}
          {state.phases.length > 0 ? (
            <ol className="haas-phases">
              {state.phases.map(phase => (
                <PhaseRow key={phase.key} phase={phase} />
              ))}
            </ol>
          ) : state.milestones.length > 0 ? (
            <ul className="haas-steps">
              {state.milestones.map(milestone => (
                <MilestoneRow key={milestone.key} milestone={milestone} />
              ))}
            </ul>
          ) : null}

          {/* 2 — Understanding card. */}
          {understanding ? (
            <div className="haas-understanding">
              <div className="haas-understanding-head">
                <span className="haas-understanding-label">Compréhension</span>
                {understanding.projectType ? (
                  <span className="haas-chip">{understanding.projectType}</span>
                ) : null}
                {typeof understanding.confidence === 'number' ? (
                  <span className="haas-understanding-confidence">
                    confiance {Math.round(understanding.confidence * (understanding.confidence <= 1 ? 100 : 1))}%
                  </span>
                ) : null}
              </div>
              <p className="haas-understanding-summary">{understanding.summary}</p>
              {understanding.requirements.length > 0 ? (
                <ul className="haas-understanding-reqs">
                  {understanding.requirements.map((req, index) => (
                    <li key={index} className="haas-understanding-req">
                      {req}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* 3 — Clarification prompt ("no more guessing"). */}
          {clarification ? (
            <div className="haas-clarify">
              <div className="haas-clarify-label">Question</div>
              <p className="haas-clarify-question">{clarification.question}</p>
              {clarification.options && clarification.options.length > 0 ? (
                <div className="haas-clarify-options">
                  {clarification.options.map((option, index) => (
                    <button
                      key={index}
                      type="button"
                      className="haas-clarify-chip"
                      disabled={!onClarificationReply}
                      onClick={() => onClarificationReply?.(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 4 — Collapsible reasoning panel. */}
          {state.reasoningText ? (
            <div className="haas-reasoning" data-open={reasoningOpen}>
              <button
                type="button"
                className="haas-reasoning-summary"
                aria-expanded={reasoningOpen}
                onClick={() => setReasoningOpen(open => !open)}
              >
                <span className="haas-reasoning-chevron" aria-hidden="true">
                  ▸
                </span>
                <span className="haas-reasoning-title">Réflexion</span>
              </button>
              {reasoningOpen ? <pre className="haas-reasoning-text">{state.reasoningText}</pre> : null}
            </div>
          ) : null}

          {/* 5 — Assumptions. */}
          {state.assumptions.length > 0 ? (
            <div className="haas-assumptions">
              <div className="haas-assumptions-label">
                <span className="haas-assumptions-icon" aria-hidden="true">
                  ≈
                </span>
                Hypothèses
              </div>
              <ul className="haas-assumptions-list">
                {state.assumptions.map((text, index) => (
                  <li key={index} className="haas-assumption">
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 6 — Plan checklist. */}
          {state.planSteps.length > 0 ? (
            <ul className="haas-plan">
              {state.planSteps.map(step => (
                <PlanStepRow key={step.id} step={step} />
              ))}
            </ul>
          ) : null}

          {/* 7 — Files, warnings, checks (unchanged). */}
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
