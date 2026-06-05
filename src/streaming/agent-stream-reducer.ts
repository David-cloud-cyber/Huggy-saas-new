import { mapAgentStreamEvent, type StreamPhaseId } from './agent-stream-event-map.ts';

export type AgentStreamStatus = 'idle' | 'active' | 'done' | 'failed' | 'cancelled';
export type AgentPhaseStatus = 'pending' | 'active' | 'done' | 'failed' | 'cancelled';
export type StreamFileStatus = 'writing' | 'done' | 'failed';
export type StreamFileReason = 'created' | 'modified' | 'deleted' | 'unknown';

export type StreamPhase = {
  id: StreamPhaseId;
  label: string;
  detail: string;
  status: AgentPhaseStatus;
  updatedAt: number;
};

export type StreamFileCard = {
  path: string;
  language?: string;
  status: StreamFileStatus;
  reason: StreamFileReason;
  snippet?: string;
  rollbackAvailable?: boolean;
};

export type StreamPreviewState = {
  status: 'idle' | 'building' | 'ready' | 'failed';
  message?: string;
  hasPreviewEvent: boolean;
};

export type StreamCheckState = {
  status: 'idle' | 'running' | 'passed' | 'failed';
  message?: string;
  hasCheckEvent: boolean;
};

export type StreamRecoveryState = {
  status: 'idle' | 'active' | 'succeeded' | 'failed';
  message?: string;
  attempts: number;
  hasRecoveryEvent: boolean;
};

export type StreamFinalSummary = {
  title: string;
  bullets: string[];
  nextAction?: string;
};

export type StreamRunHeader = {
  workflow: 'Auto' | 'Answer' | 'Plan' | 'Build' | 'Edit' | 'Fix' | 'Verify' | 'Publish';
  objective: string;
  scope: string;
  rollbackAvailable: boolean;
  status: string;
};

export type StreamEventPriority = 'high' | 'medium' | 'low';

export type StreamDetailEvent = {
  id: string;
  type: string;
  label: string;
  detail: string;
  priority: StreamEventPriority;
  status: AgentPhaseStatus;
  updatedAt: number;
};

export type AgentStreamUiState = {
  runId?: string;
  status: AgentStreamStatus;
  headline: string;
  detail: string;
  elapsed?: string;
  phases: StreamPhase[];
  files: StreamFileCard[];
  preview: StreamPreviewState;
  checks: StreamCheckState;
  recovery: StreamRecoveryState;
  finalSummary?: StreamFinalSummary;
  runHeader?: StreamRunHeader;
  details: StreamDetailEvent[];
};

export type AgentStreamEventInput = {
  type: string;
  message?: string;
  payload?: Record<string, any>;
  elapsed?: string;
};

const PHASE_ORDER: StreamPhaseId[] = [
  'understanding',
  'context',
  'planning',
  'research',
  'building',
  'files',
  'preview',
  'checks',
  'visual_check',
  'recovery',
  'quality',
  'memory',
  'done',
  'failed',
];

export function createInitialAgentStreamState(seed: Partial<AgentStreamUiState> = {}): AgentStreamUiState {
  return {
    status: 'active',
    headline: 'Huggy prepares the work',
    detail: 'Huggy understands the request before changing the project.',
    phases: [],
    files: [],
    preview: { status: 'idle', hasPreviewEvent: false },
    checks: { status: 'idle', hasCheckEvent: false },
    recovery: { status: 'idle', attempts: 0, hasRecoveryEvent: false },
    details: [],
    ...seed,
  };
}

export function reduceAgentStreamEvent(state: AgentStreamUiState, input: AgentStreamEventInput): AgentStreamUiState {
  const eventType = String(input.type || '');
  const payload = input.payload || {};
  const mapping = mapAgentStreamEvent(eventType);
  if (!mapping) {
    return input.elapsed ? { ...state, elapsed: input.elapsed } : state;
  }

  const nextStatus = mapping.terminal === 'done'
    ? 'done'
    : mapping.terminal === 'failed'
      ? 'failed'
      : mapping.terminal === 'cancelled'
        ? 'cancelled'
        : state.status === 'idle'
          ? 'active'
          : state.status;

  const phaseStatus: AgentPhaseStatus = mapping.terminal === 'failed'
    ? 'failed'
    : mapping.terminal === 'cancelled'
      ? 'cancelled'
      : mapping.terminal === 'done'
        ? 'done'
        : eventType.endsWith('_failed')
          ? 'failed'
          : eventType.endsWith('_passed') || eventType.endsWith('_succeeded') || eventType === 'preview_ready' || eventType === 'files_changed' || eventType === 'quality_checked'
            ? 'done'
            : 'active';

  let phases = upsertPhase(state.phases, mapping.phase, {
    label: publicMessage(payload, input.message, mapping.label),
    detail: publicDetail(payload, mapping.detail),
    status: phaseStatus,
    updatedAt: Date.now(),
  });

  if (phaseStatus === 'active') {
    phases = markPriorActiveDone(phases, mapping.phase);
  }

  const files = reduceFiles(state.files, eventType, payload);
  const preview = reducePreview(state.preview, eventType, input.message, payload);
  const checks = reduceChecks(state.checks, eventType, input.message, payload);
  const recovery = reduceRecovery(state.recovery, eventType, input.message, payload);
  const runId = String(payload.run_id || payload.runId || state.runId || '') || undefined;
  const runHeader = reduceRunHeader(state.runHeader, eventType, input.message, payload, state, nextStatus);
  const details = reduceDetails(state.details, eventType, {
    label: publicMessage(payload, input.message, mapping.label),
    detail: publicDetail(payload, mapping.detail),
    status: phaseStatus,
    priority: eventPriority(eventType),
  });
  const finalSummary = nextStatus === 'done'
    ? buildFinalSummary({ ...state, files, preview, checks, recovery, runHeader, details })
    : state.finalSummary;

  return {
    ...state,
    runId,
    status: nextStatus,
    headline: headlineFor(mapping.phase, nextStatus),
    detail: publicDetail(payload, mapping.detail),
    elapsed: input.elapsed || state.elapsed,
    phases,
    files,
    preview,
    checks,
    recovery,
    finalSummary,
    runHeader,
    details,
  };
}

function upsertPhase(phases: StreamPhase[], id: StreamPhaseId, patch: Omit<StreamPhase, 'id'>): StreamPhase[] {
  const existing = phases.find(phase => phase.id === id);
  const next = existing
    ? phases.map(phase => phase.id === id ? { ...phase, ...patch } : phase)
    : [...phases, { id, ...patch }];
  return next.sort((a, b) => PHASE_ORDER.indexOf(a.id) - PHASE_ORDER.indexOf(b.id));
}

function markPriorActiveDone(phases: StreamPhase[], activeId: StreamPhaseId): StreamPhase[] {
  const activeIndex = PHASE_ORDER.indexOf(activeId);
  return phases.map(phase => {
    const index = PHASE_ORDER.indexOf(phase.id);
    if (index >= 0 && index < activeIndex && phase.status === 'active') {
      return { ...phase, status: 'done' };
    }
    return phase;
  });
}

function reduceFiles(files: StreamFileCard[], eventType: string, payload: Record<string, any>): StreamFileCard[] {
  const diff = payload.diff || {};
  const paths = new Set<string>();
  for (const key of ['path', 'file', 'target_file']) {
    if (typeof payload[key] === 'string' && payload[key].trim()) paths.add(payload[key].trim());
  }
  if (payload.file && typeof payload.file.path === 'string') paths.add(payload.file.path);
  if (payload.patch && typeof payload.patch.target_file === 'string') paths.add(payload.patch.target_file);
  for (const key of ['created', 'modified', 'deleted']) {
    if (Array.isArray(diff[key])) diff[key].forEach((path: unknown) => typeof path === 'string' && paths.add(path));
  }

  if (!paths.size && !['diff_ready', 'files_changed', 'patch_applied'].includes(eventType)) return files;

  const byPath = new Map(files.map(file => [file.path, file]));
  const inferredPaths = paths.size ? Array.from(paths) : ['Project files'];
  inferredPaths.slice(0, 12).forEach(path => {
    const previous = byPath.get(path);
    const reason = reasonFor(path, diff, eventType);
    byPath.set(path, {
      path,
      language: previous?.language || inferLanguage(path),
      reason,
      status: eventType === 'file_stream_started' || eventType === 'file_stream_preview' || eventType === 'file_token' ? 'writing' : 'done',
      snippet: publicSnippet(payload) || previous?.snippet,
      rollbackAvailable: Boolean(payload.rollback_file_id || payload.file_rollback_id || previous?.rollbackAvailable),
    });
  });
  return Array.from(byPath.values()).slice(-12);
}

function reduceRunHeader(
  current: StreamRunHeader | undefined,
  eventType: string,
  message: unknown,
  payload: Record<string, any>,
  state: AgentStreamUiState,
  nextStatus: AgentStreamStatus,
): StreamRunHeader {
  const objective = current?.objective || cleanObjective(String(payload.objective || payload.prompt || message || 'Current request'));
  const workflow = publicWorkflow(payload, current?.workflow || 'Auto');
  const scope = typeof payload.scope === 'string' && payload.scope.trim()
    ? cleanPublicText(payload.scope)
    : current?.scope || (state.preview.hasPreviewEvent || state.files.length ? 'Current project' : 'Project workspace');
  return {
    workflow,
    objective,
    scope,
    rollbackAvailable: Boolean(payload.rollback_available ?? current?.rollbackAvailable ?? false),
    status: headlineFor(mapAgentStreamEvent(eventType)?.phase || 'understanding', nextStatus),
  };
}

function reduceDetails(
  current: StreamDetailEvent[],
  eventType: string,
  patch: Omit<StreamDetailEvent, 'id' | 'type' | 'updatedAt'>,
): StreamDetailEvent[] {
  const priority = patch.priority;
  if (eventType === 'working_tick') return current;
  const id = priority === 'low' ? eventType : `${eventType}_${current.length}`;
  const existing = current.find(detail => detail.id === id);
  const nextItem: StreamDetailEvent = {
    id,
    type: eventType,
    updatedAt: Date.now(),
    ...patch,
  };
  const next = existing
    ? current.map(detail => detail.id === id ? { ...detail, ...nextItem } : detail)
    : [...current, nextItem];
  return next
    .filter(detail => detail.priority !== 'low' || detail.status === 'active' || detail.type === eventType)
    .slice(-18);
}

function reducePreview(current: StreamPreviewState, eventType: string, message?: string, payload: Record<string, any> = {}): StreamPreviewState {
  if (eventType === 'preview_skeleton_started' || eventType === 'preview_building') {
    return { status: 'building', message: publicMessage(payload, message, 'Huggy is rebuilding the preview.'), hasPreviewEvent: true };
  }
  if (eventType === 'preview_ready') {
    return { status: 'ready', message: publicMessage(payload, message, 'Preview ready.'), hasPreviewEvent: true };
  }
  if (eventType === 'error' && current.hasPreviewEvent) {
    return { status: 'failed', message: publicMessage(payload, message, 'The preview could not be completed.'), hasPreviewEvent: true };
  }
  return current;
}

function reduceChecks(current: StreamCheckState, eventType: string, message?: string, payload: Record<string, any> = {}): StreamCheckState {
  if (eventType === 'runner_started' || eventType === 'quality_gate_started' || eventType === 'verification_started' || eventType === 'visual_inspection_started') {
    return { status: 'running', message: publicMessage(payload, message, 'Huggy is checking the result.'), hasCheckEvent: true };
  }
  if (eventType === 'runner_passed' || eventType === 'quality_checked' || eventType === 'visual_inspection_passed') {
    return { status: 'passed', message: publicMessage(payload, message, 'Useful checks passed.'), hasCheckEvent: true };
  }
  if (eventType === 'runner_failed' || eventType === 'verification_failed' || eventType === 'visual_inspection_failed') {
    return { status: 'failed', message: publicMessage(payload, message, 'A check needs a fix.'), hasCheckEvent: true };
  }
  return current;
}

function reduceRecovery(current: StreamRecoveryState, eventType: string, message?: string, payload: Record<string, any> = {}): StreamRecoveryState {
  if (eventType === 'error_detected' || eventType === 'auto_fix_started' || eventType === 'patch_applied' || eventType === 'retest_started') {
    return {
      status: 'active',
      message: publicMessage(payload, message, 'Huggy is fixing the detected issue.'),
      attempts: eventType === 'auto_fix_started' ? Math.max(current.attempts + 1, Number(payload.attempt || 0) || current.attempts + 1) : current.attempts,
      hasRecoveryEvent: true,
    };
  }
  if (eventType === 'auto_fix_succeeded') {
    return { ...current, status: 'succeeded', message: publicMessage(payload, message, 'The fix was validated.'), hasRecoveryEvent: true };
  }
  if (eventType === 'auto_fix_failed') {
    return { ...current, status: 'failed', message: publicMessage(payload, message, 'The automatic fix did not resolve everything.'), hasRecoveryEvent: true };
  }
  return current;
}

function buildFinalSummary(state: AgentStreamUiState): StreamFinalSummary {
  const bullets: string[] = [];
  if (state.runHeader?.objective) {
    bullets.push(`Objective understood: ${state.runHeader.objective}.`);
  }
  if (state.files.length) {
    const changed = state.files.filter(file => file.path !== 'Project files').length || state.files.length;
    bullets.push(`${changed} file${changed > 1 ? 's' : ''} handled.`);
  }
  if (state.preview.hasPreviewEvent) {
    bullets.push(state.preview.status === 'ready' ? 'Preview ready.' : 'Preview updated.');
  }
  if (state.checks.hasCheckEvent) {
    bullets.push(state.checks.status === 'passed' ? 'Critical checks passed.' : 'Checks kept in the run history.');
  }
  if (state.recovery.hasRecoveryEvent) {
    bullets.push(state.recovery.status === 'succeeded' ? 'Automatic fix validated.' : 'Automatic fix documented.');
  }
  if (state.runHeader?.rollbackAvailable) {
    bullets.push('Rollback remains available.');
  }
  if (!bullets.length) bullets.push('Answer completed without unnecessary project changes.');
  return {
    title: 'Run summary',
    bullets,
    nextAction: state.preview.status === 'ready' ? 'You can test the preview, request a change, or publish.' : 'You can ask a follow-up or retry with Auto.',
  };
}

function eventPriority(eventType: string): StreamEventPriority {
  if ([
    'error',
    'credits_insufficient',
    'external_api_keys_required',
    'clarification_required',
    'auto_fix_failed',
    'preview_ready',
    'done',
    'cancelled',
  ].includes(eventType)) return 'high';
  if ([
    'files_changed',
    'diff_ready',
    'runner_passed',
    'quality_checked',
    'research_result',
    'runner_failed',
    'patch_applied',
  ].includes(eventType)) return 'medium';
  return 'low';
}

function publicWorkflow(payload: Record<string, any>, fallback: StreamRunHeader['workflow']): StreamRunHeader['workflow'] {
  const raw = String(payload.intent?.intent || payload.intent || payload.workflow || '').toLowerCase();
  if (raw.includes('conversation')) return 'Answer';
  if (raw.includes('plan')) return 'Plan';
  if (raw.includes('debug') || raw.includes('fix')) return 'Fix';
  if (raw.includes('edit')) return 'Edit';
  if (raw.includes('verify')) return 'Verify';
  if (raw.includes('deploy') || raw.includes('publish')) return 'Publish';
  if (raw.includes('build')) return 'Build';
  return fallback;
}

function cleanObjective(value: string): string {
  const clean = cleanPublicText(value).replace(/\s+/g, ' ').trim();
  if (!clean) return 'Current request';
  return clean.length > 96 ? `${clean.slice(0, 93)}...` : clean;
}

function headlineFor(phase: StreamPhaseId, status: AgentStreamStatus): string {
  if (status === 'done') return 'Huggy finished';
  if (status === 'failed') return 'Huggy found a blocker';
  if (status === 'cancelled') return 'Generation stopped';
  const headlines: Partial<Record<StreamPhaseId, string>> = {
    understanding: 'Huggy understands the request',
    context: 'Huggy reads the project',
    planning: 'Huggy organizes the work',
    research: 'Huggy checks useful context',
    building: 'Huggy generates files',
    files: 'Huggy applies changes',
    preview: 'Huggy prepares the preview',
    checks: 'Huggy checks the result',
    visual_check: 'Huggy inspects the interface',
    recovery: 'Huggy fixes a blocker',
    quality: 'Huggy checks quality',
    memory: 'Huggy stores useful decisions',
  };
  return headlines[phase] || 'Huggy works on your project';
}

function publicMessage(payload: Record<string, any>, message: unknown, fallback: string): string {
  const text = typeof payload.public_message === 'string'
    ? payload.public_message
    : typeof payload.text === 'string'
      ? payload.text
      : typeof message === 'string'
        ? message
        : '';
  return cleanPublicText(text || fallback) || fallback;
}

function publicDetail(payload: Record<string, any>, fallback: string): string {
  const text = typeof payload.step_detail === 'string'
    ? payload.step_detail
    : typeof payload.detail === 'string'
      ? payload.detail
      : fallback;
  return cleanPublicText(text || fallback) || fallback;
}

function publicSnippet(payload: Record<string, any>): string | undefined {
  const value = payload.preview || payload.snippet || payload.content || payload.delta;
  if (typeof value !== 'string') return undefined;
  return cleanPublicText(value).split('\n').slice(0, 8).join('\n').slice(0, 700);
}

function cleanPublicText(value: string): string {
  return String(value)
    .replace(/\b(model|provider|tokens?|routing|policy|internal)\b\s*[:=][^\n]+/gi, '')
    .replace(/\b(openrouter|service_role|supabase_service_role|api[_-]?key)\b[^\n]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function reasonFor(path: string, diff: Record<string, any>, eventType: string): StreamFileReason {
  if (Array.isArray(diff.created) && diff.created.includes(path)) return 'created';
  if (Array.isArray(diff.modified) && diff.modified.includes(path)) return 'modified';
  if (Array.isArray(diff.deleted) && diff.deleted.includes(path)) return 'deleted';
  if (eventType === 'patch_applied') return 'modified';
  return 'unknown';
}

function inferLanguage(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) return 'React';
  if (lower.endsWith('.ts') || lower.endsWith('.js')) return 'TypeScript';
  if (lower.endsWith('.css')) return 'CSS';
  if (lower.endsWith('.html')) return 'HTML';
  if (lower.endsWith('.json')) return 'JSON';
  if (lower.endsWith('.sql')) return 'SQL';
  return 'File';
}
