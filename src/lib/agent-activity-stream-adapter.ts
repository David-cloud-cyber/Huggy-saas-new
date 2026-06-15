// Adapter: builder work_journal block → AgentActivityState.
//
// The builder conversation island streams agent activity as a `work_journal`
// block (HuggyWorklineEntry[]). This pure adapter maps that existing model onto
// the AgentActivityState the new MIX <AgentActivityStream> renders, so swapping
// the old DOM-driven buildstream markup is a one-line render change instead of a
// cross-file refactor of the 80–280 KB island/builder-live files.

import type { AgentActivityState, ActivityCheck, ActivityFile, ActivityMilestone } from './agent-activity-stream.ts';

// Mirrors HuggyWorklineEntry / work_journal block in builder-conversation-island.
export type WorklineEntryLike = {
  id: string;
  kind: 'update' | 'group' | 'divider' | 'summary' | 'narration' | 'thinking' | 'file_edit' | 'command';
  text: string;
  detail?: string;
  status?: 'active' | 'done' | 'failed' | 'cancelled' | 'muted';
  items?: string[];
  path?: string;
  action?: 'created' | 'modified' | 'deleted';
  additions?: number;
  deletions?: number;
  command?: string;
};

export type WorkJournalBlockLike = {
  type: 'work_journal';
  status: 'active' | 'done' | 'failed' | 'cancelled';
  startedAt?: string;
  elapsed?: string;
  entries: WorklineEntryLike[];
  activeText?: string;
  finalText?: string;
  restored?: boolean;
};

function phaseFor(status: WorkJournalBlockLike['status']): AgentActivityState['phase'] {
  if (status === 'failed') return 'error';
  if (status === 'done' || status === 'cancelled') return 'done';
  return 'streaming';
}

function milestoneState(status?: WorklineEntryLike['status']): ActivityMilestone['state'] {
  if (status === 'done') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'active';
}

export function workJournalToActivityState(block: WorkJournalBlockLike): AgentActivityState {
  const phase = phaseFor(block.status);
  const milestones: ActivityMilestone[] = [];
  const files: ActivityFile[] = [];
  const checks: ActivityCheck[] = [];

  for (const entry of block.entries || []) {
    if (entry.kind === 'divider') continue;
    if (entry.kind === 'file_edit' && entry.path) {
      files.push({
        path: entry.path,
        status: entry.status === 'done' ? 'done' : 'writing',
        chars: 0,
        action: entry.action,
        additions: entry.additions,
        deletions: entry.deletions,
        order: files.length,
      });
      continue;
    }
    if (entry.kind === 'group' && /check|verification|vérification/i.test(`${entry.id} ${entry.text}`)) {
      for (const item of entry.items || []) {
        checks.push({
          name: item,
          status: entry.status === 'failed' ? 'fail' : entry.status === 'cancelled' ? 'skip' : 'pass',
        });
      }
      continue;
    }
    // command / update / group / narration / thinking / summary → step rows.
    const label = entry.kind === 'command' && entry.command ? entry.command : entry.text;
    if (!label) continue;
    milestones.push({
      key: entry.id || `step-${milestones.length}`,
      label,
      state: milestoneState(entry.status),
      order: milestones.length,
    });
  }

  const finished = phase === 'done' || phase === 'error';

  return {
    phase,
    statusLine: block.status === 'done' ? block.finalText : block.activeText,
    assistantText: '',
    milestones,
    files,
    checks,
    warnings: [],
    error: block.status === 'failed' ? { message: block.finalText || block.activeText || 'Correction nécessaire', recoverable: true } : undefined,
    collapsed: phase === 'done',
    lastEventId: 0,
    startedAt: finished ? 0 : undefined,
    endedAt: undefined,
  };
}
