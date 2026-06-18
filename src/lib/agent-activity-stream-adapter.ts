import type { HuggyMessagePart } from './chat-message-parts.ts';
import type { AgentActivityState, ActivityCheck, ActivityFile, ActivityMilestone } from './agent-activity-stream.ts';

export type RichMessagePartsActivityInput = {
  parts: HuggyMessagePart[];
  status?: 'active' | 'done' | 'failed' | 'cancelled';
  activeText?: string;
  finalText?: string;
};

function phaseFor(status: RichMessagePartsActivityInput['status']): AgentActivityState['phase'] {
  if (status === 'failed') return 'error';
  if (status === 'done' || status === 'cancelled') return 'done';
  return 'streaming';
}

function milestoneState(status: unknown): ActivityMilestone['state'] {
  if (status === 'done') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'active';
}

function partStatus(part: HuggyMessagePart) {
  return String(part.status || '').trim();
}

export function messagePartsToActivityState(input: RichMessagePartsActivityInput): AgentActivityState {
  const phase = phaseFor(input.status || 'active');
  const milestones: ActivityMilestone[] = [];
  const files: ActivityFile[] = [];
  const checks: ActivityCheck[] = [];
  let assistantText = '';

  for (const part of input.parts || []) {
    if (part.type === 'text' && typeof part.text === 'string') {
      assistantText += part.text;
      continue;
    }

    if (part.type === 'file_edit' && typeof part.path === 'string') {
      files.push({
        path: part.path,
        status: partStatus(part) === 'active' ? 'writing' : 'done',
        chars: 0,
        action: typeof part.action === 'string' ? part.action as ActivityFile['action'] : undefined,
        additions: typeof part.additions === 'number' ? part.additions : undefined,
        deletions: typeof part.deletions === 'number' ? part.deletions : undefined,
        order: files.length,
      });
      continue;
    }

    if (part.type === 'tool_call' && /check|verification|vérification/i.test(`${part.name || ''} ${part.text || ''}`)) {
      const items = Array.isArray(part.items) ? part.items : [];
      for (const item of items) {
        checks.push({
          name: String(item || ''),
          status: partStatus(part) === 'failed' ? 'fail' : partStatus(part) === 'cancelled' ? 'skip' : 'pass',
        });
      }
      continue;
    }

    const label = String(part.command || part.name || part.text || part.detail || part.type || '').trim();
    if (!label) continue;
    milestones.push({
      key: String(part.id || `part-${milestones.length}`),
      label,
      state: milestoneState(part.status),
      order: milestones.length,
    });
  }

  const finished = phase === 'done' || phase === 'error';

  return {
    phase,
    statusLine: input.status === 'done' ? input.finalText : input.activeText,
    assistantText,
    milestones,
    files,
    checks,
    warnings: [],
    error: input.status === 'failed' ? { message: input.finalText || input.activeText || 'Correction nécessaire', recoverable: true } : undefined,
    collapsed: phase === 'done',
    lastEventId: 0,
    startedAt: finished ? 0 : undefined,
    endedAt: undefined,
  };
}
