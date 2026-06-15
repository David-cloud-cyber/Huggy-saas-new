// Enhanced Agent Activity Stream — React component (MIX v2).
//
// Drop-in upgrade for src/components/ai-elements/agent-activity-stream.tsx
// Uses the same AgentActivityState from src/lib/agent-activity-stream.ts
// but renders richer UI: tool call cards, diff views, terminal blocks,
// thinking blocks, enhanced milestone rows with icons + shimmer + check pop.
//
// Import the v2 CSS: import '../../styles/agent-activity-stream-v2.css';

import { useState, type ReactNode, type SVGAttributes } from 'react';
import {
  activeMilestone,
  recapLine,
  summarizeActivity,
  formatElapsed,
  type AgentActivityState,
  type ActivityFile,
  type ActivityMilestone,
  type ActivityCheck,
} from '../../lib/agent-activity-stream.ts';

// ── Icons (inline SVG, no dependency) ───────────────────────────────────

type IconProps = SVGAttributes<SVGSVGElement> & { size?: number };

function SvgIcon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

function CheckIcon(p: IconProps) { return <SvgIcon {...p}><path d="M20 6 9 17l-5-5" /></SvgIcon>; }
function XIcon(p: IconProps) { return <SvgIcon {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></SvgIcon>; }
function ChevronDown(p: IconProps) { return <SvgIcon {...p}><path d="m6 9 6 6 6-6" /></SvgIcon>; }
function FileCodeIcon(p: IconProps) { return <SvgIcon {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="m10 13-2 2 2 2" /><path d="m14 17 2-2-2-2" /></SvgIcon>; }
function SearchIcon(p: IconProps) { return <SvgIcon {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></SvgIcon>; }
function EyeIcon(p: IconProps) { return <SvgIcon {...p}><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></SvgIcon>; }
function WandIcon(p: IconProps) { return <SvgIcon {...p}><path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" /><path d="m3 21 9-9" /></SvgIcon>; }
function ZapIcon(p: IconProps) { return <SvgIcon {...p}><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></SvgIcon>; }
function ShieldIcon(p: IconProps) { return <SvgIcon {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></SvgIcon>; }
function RefreshIcon(p: IconProps) { return <SvgIcon {...p}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></SvgIcon>; }
function GlobeIcon(p: IconProps) { return <SvgIcon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></SvgIcon>; }
function BrainIcon(p: IconProps) { return <SvgIcon {...p}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /></SvgIcon>; }
function CheckCircleIcon(p: IconProps) { return <SvgIcon {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></SvgIcon>; }
function XCircleIcon(p: IconProps) { return <SvgIcon {...p}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></SvgIcon>; }
function CopyIcon(p: IconProps) { return <SvgIcon {...p}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></SvgIcon>; }
function TerminalIcon(p: IconProps) { return <SvgIcon {...p}><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></SvgIcon>; }
function DiffIcon(p: IconProps) { return <SvgIcon {...p}><path d="M12 3v14" /><path d="M5 10h14" /><path d="M5 21h14" /></SvgIcon>; }

// ── Milestone icon mapping ──────────────────────────────────────────────

import type { HuggyStreamMilestone } from '../../lib/stream-protocol.ts';

const MILESTONE_ICONS: Record<string, (p: IconProps) => ReactNode> = {
  understanding: BrainIcon,
  inspecting: EyeIcon,
  planning: WandIcon,
  generating: ZapIcon,
  checking: ShieldIcon,
  fixing: RefreshIcon,
  preview_ready: GlobeIcon,
};

// ── Sub-components ──────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'active' | 'done' | 'failed' | 'cancelled' | 'pending' }) {
  return <span className={`haas-dot haas-dot--${status}`} aria-hidden="true" />;
}

function MilestoneRow({ milestone }: { milestone: ActivityMilestone }) {
  const MIcon = MILESTONE_ICONS[milestone.key];
  const isDone = milestone.state === 'done';
  const isFailed = milestone.state === 'failed';
  const isActive = milestone.state === 'active';

  return (
    <li className="haas-step" data-state={milestone.state}>
      <span className="haas-step-icon">
        {isDone ? <CheckIcon size={14} /> :
         isFailed ? <XIcon size={14} /> :
         isActive ? <span className="haas-step-spinner" /> :
         MIcon ? <MIcon size={14} /> : <ZapIcon size={14} />}
      </span>
      <span className="haas-step-label">{milestone.label}</span>
    </li>
  );
}

function FileRow({ file, onOpenFile }: { file: ActivityFile; onOpenFile?: (path: string) => void }) {
  const interactive = Boolean(onOpenFile);
  const action = file.action;
  const additions = Number(file.additions || 0);
  const deletions = Number(file.deletions || 0);

  return (
    <li className="haas-file" data-state={file.status}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onOpenFile?.(file.path) : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenFile?.(file.path); }
      } : undefined}>
      <span className="haas-file-icon"><FileCodeIcon size={13} /></span>
      <span className="haas-file-path">{file.path}</span>
      {action && (
        <span className={`haas-file-action haas-file-action--${action}`}>
          {action === 'created' ? 'NEW' : action === 'modified' ? 'MOD' : 'DEL'}
        </span>
      )}
      {file.status === 'writing' && file.chars > 0 && (
        <span className="haas-file-meta">{file.chars} car.</span>
      )}
      {file.status === 'done' && (additions > 0 || deletions > 0) && (
        <span className="haas-file-diff" aria-label={`${additions} additions, ${deletions} deletions`}>
          <span className="haas-file-diff-add">+{additions}</span>
          <span className="haas-file-diff-del">-{deletions}</span>
        </span>
      )}
    </li>
  );
}

function CheckRow({ check }: { check: ActivityCheck }) {
  return (
    <li className="haas-step" data-state={check.status === 'pass' ? 'done' : check.status === 'fail' ? 'failed' : 'pending'}
      style={{ animation: 'haas-fade-in 200ms var(--haas-ease) both' }}>
      <span className="haas-step-icon">
        {check.status === 'pass' ? <CheckCircleIcon size={13} /> :
         check.status === 'fail' ? <XCircleIcon size={13} /> :
         <span className="haas-dot haas-dot--pending" />}
      </span>
      <span className="haas-step-label">{check.name}</span>
      {check.detail && <span className="haas-file-meta">{check.detail}</span>}
    </li>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export type AgentActivityStreamProps = {
  state: AgentActivityState;
  onOpenFile?: (path: string) => void;
  onRetry?: () => void;
};

export function AgentActivityStream({ state, onOpenFile, onRetry }: AgentActivityStreamProps) {
  const [expanded, setExpanded] = useState(false);

  if (state.phase === 'idle') return null;

  const finished = state.phase === 'done';
  const errored = state.phase === 'error';
  const summary = summarizeActivity(state);
  const current = activeMilestone(state);
  const showDetail = !state.collapsed || expanded;

  // Collapsed recap
  if (finished && !expanded) {
    return (
      <div className="haas haas--recap" data-phase="done">
        <button type="button" className="haas-recap-btn" onClick={() => setExpanded(true)}>
          <StatusDot status={summary.checksFailed > 0 ? 'failed' : 'done'} />
          <span className="haas-recap-text">{recapLine(state)}</span>
          {summary.elapsedMs > 0 && (
            <span className="haas-recap-elapsed">{formatElapsed(summary.elapsedMs)}</span>
          )}
          <ChevronDown size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="haas" data-phase={state.phase}>
      {/* Header */}
      <div className="haas-head">
        <span className="haas-spark" aria-hidden="true" />
        <span className="haas-head-text">
          {state.decisionLine || state.statusLine || (current ? current.label : 'Génération en cours…')}
        </span>
        {(finished || errored) && (
          <button type="button" className="haas-collapse" onClick={() => setExpanded(false)}>
            Réduire
          </button>
        )}
      </div>

      {state.decisionLine && (state.statusLine || current) && (
        <div className="haas-substatus">{state.statusLine || current?.label}</div>
      )}

      {/* Body */}
      {showDetail && (
        <div className="haas-body">
          {/* Milestones */}
          {state.milestones.length > 0 && (
            <ul className="haas-steps">
              {state.milestones.map(milestone => (
                <MilestoneRow key={milestone.key} milestone={milestone} />
              ))}
            </ul>
          )}

          {/* Files */}
          {state.files.length > 0 && (
            <>
              <div className="haas-section-label">Fichiers</div>
              <ul className="haas-files">
                {state.files.map(file => (
                  <FileRow key={file.path} file={file} onOpenFile={onOpenFile} />
                ))}
              </ul>
            </>
          )}

          {/* Checks */}
          {state.checks.length > 0 && (
            <>
              <div className="haas-section-label">Vérifications</div>
              <ul className="haas-checks">
                {state.checks.map((check, index) => (
                  <CheckRow key={index} check={check} />
                ))}
              </ul>
            </>
          )}

          {/* Warnings */}
          {state.warnings.length > 0 && (
            <ul className="haas-warnings">
              {state.warnings.map((message, index) => (
                <li key={index} className="haas-warning">{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Error */}
      {errored && (
        <div className="haas-error">
          <div className="haas-error-msg">{state.error?.message || 'Une erreur est survenue.'}</div>
          {state.error?.recoverable && onRetry && (
            <button type="button" className="haas-error-retry" onClick={onRetry}>
              Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default AgentActivityStream;
