import { mapAgentStreamEvent, type StreamPhaseId } from './agent-stream-event-map.ts';

export type AgentStreamStatus = 'idle' | 'active' | 'done' | 'failed' | 'cancelled';
export type AgentPhaseStatus = 'pending' | 'active' | 'done' | 'warning' | 'failed' | 'cancelled' | 'skipped';
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

export type StreamCheckItem = {
  id: string;
  label: string;
  status: AgentPhaseStatus;
  message?: string;
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

export type StreamMissionAgent = {
  id: string;
  label: string;
  role: string;
  status: AgentPhaseStatus;
  observation: string;
  result?: string;
};

export type StreamMissionTask = {
  id: string;
  label: string;
  detail: string;
  status: AgentPhaseStatus;
};

export type StreamCritic = {
  id: string;
  label: string;
  status: AgentPhaseStatus;
  verdict: string;
  risk?: string;
  recommendation?: string;
  blocker?: string;
};

export type StreamRunHeader = {
  workflow: 'Auto' | 'Answer' | 'Plan' | 'Build' | 'Edit' | 'Fix' | 'Verify' | 'Publish';
  objective: string;
  scope: string;
  autonomy: string;
  risk: string;
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
  checkItems: StreamCheckItem[];
  recovery: StreamRecoveryState;
  agents: StreamMissionAgent[];
  tasks: StreamMissionTask[];
  critics: StreamCritic[];
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
    headline: 'Je comprends la mission.',
    detail: 'Huggy Mission Control organise le travail avant toute action.',
    phases: [],
    files: [],
    preview: { status: 'idle', hasPreviewEvent: false },
    checks: { status: 'idle', hasCheckEvent: false },
    checkItems: [],
    recovery: { status: 'idle', attempts: 0, hasRecoveryEvent: false },
    agents: [],
    tasks: [],
    critics: [],
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
  const checkItems = reduceCheckItems(state.checkItems, eventType, input.message, payload);
  const recovery = reduceRecovery(state.recovery, eventType, input.message, payload);
  const agents = reduceMissionAgents(state.agents, eventType, mapping.phase, phaseStatus, payload);
  const critics = reduceCritics(state.critics, eventType, phaseStatus, input.message, payload);
  const runId = String(payload.run_id || payload.runId || state.runId || '') || undefined;
  const runHeader = reduceRunHeader(state.runHeader, eventType, input.message, payload, state, nextStatus);
  const tasks = buildMissionTasks({ phases, files, preview, checks, recovery, status: nextStatus });
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
    checkItems,
    recovery,
    agents,
    tasks,
    critics,
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
  const objective = current?.objective || cleanObjective(String(payload.objective || payload.prompt || message || 'Mission en cours'));
  const workflow = publicWorkflow(payload, current?.workflow || 'Auto');
  const scope = typeof payload.scope === 'string' && payload.scope.trim()
    ? cleanPublicText(payload.scope)
    : current?.scope || (state.preview.hasPreviewEvent || state.files.length ? 'Projet courant' : 'Workspace projet');
  return {
    workflow,
    objective,
    scope,
    autonomy: inferAutonomy(payload, current?.autonomy, workflow),
    risk: inferRisk(payload, current?.risk, state, nextStatus),
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
    return { status: 'building', message: publicMessage(payload, message, 'Je reconstruis la preview.'), hasPreviewEvent: true };
  }
  if (eventType === 'preview_ready') {
    return { status: 'ready', message: publicMessage(payload, message, 'La preview est prete.'), hasPreviewEvent: true };
  }
  if (eventType === 'error' && current.hasPreviewEvent) {
    return { status: 'failed', message: publicMessage(payload, message, 'La preview demande une correction.'), hasPreviewEvent: true };
  }
  return current;
}

function reduceChecks(current: StreamCheckState, eventType: string, message?: string, payload: Record<string, any> = {}): StreamCheckState {
  if (eventType === 'runner_started' || eventType === 'quality_gate_started' || eventType === 'verification_started' || eventType === 'visual_inspection_started') {
    return { status: 'running', message: publicMessage(payload, message, 'Je teste les points bloquants.'), hasCheckEvent: true };
  }
  if (eventType === 'runner_passed' || eventType === 'quality_checked' || eventType === 'visual_inspection_passed') {
    return { status: 'passed', message: publicMessage(payload, message, 'Les controles utiles sont passes.'), hasCheckEvent: true };
  }
  if (eventType === 'runner_failed' || eventType === 'verification_failed' || eventType === 'visual_inspection_failed') {
    return { status: 'failed', message: publicMessage(payload, message, 'Un controle demande une correction.'), hasCheckEvent: true };
  }
  return current;
}

function reduceCheckItems(
  current: StreamCheckItem[],
  eventType: string,
  message?: string,
  payload: Record<string, any> = {},
): StreamCheckItem[] {
  const checkNames = extractCheckNames(eventType, payload);
  if (!checkNames.length) return current;
  const status = checkStatusForEvent(eventType);
  const byId = new Map(current.map(item => [item.id, item]));
  checkNames.forEach(name => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'check';
    byId.set(id, {
      ...byId.get(id),
      id,
      label: name,
      status,
      message: publicMessage(payload, message, status === 'done' ? 'Controle valide.' : status === 'failed' ? 'Controle a revoir.' : 'Controle en cours.'),
    });
  });
  return Array.from(byId.values()).slice(-12);
}

function extractCheckNames(eventType: string, payload: Record<string, any>): string[] {
  const names = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const clean = cleanPublicText(value);
    if (clean) names.add(normalizeCheckName(clean));
  };
  if (Array.isArray(payload.checks)) payload.checks.forEach(add);
  if (Array.isArray(payload.results)) {
    payload.results.forEach((item: unknown) => {
      if (typeof item === 'string') add(item);
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        add(record.name || record.check || record.command || record.label);
      }
    });
  }
  add(payload.check);
  add(payload.command);
  add(payload.name);
  if (!names.size) {
    if (eventType.startsWith('runner_')) names.add('Runner');
    if (eventType.startsWith('visual_inspection_')) names.add('Preview');
    if (eventType === 'verification_started' || eventType === 'verification_failed') names.add('Verification');
    if (eventType === 'quality_gate_started' || eventType === 'quality_checked') names.add('Quality');
  }
  return Array.from(names).slice(0, 8);
}

function normalizeCheckName(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('typescript') || lower.includes('tsc')) return 'TypeScript';
  if (lower.includes('build') || lower.includes('vite')) return 'Build';
  if (lower.includes('lint')) return 'Lint';
  if (lower.includes('preview')) return 'Preview';
  if (lower.includes('mobile') || lower.includes('responsive')) return 'Mobile';
  if (lower.includes('auth')) return 'Auth';
  if (lower.includes('database') || lower.includes('supabase') || lower.includes('sql')) return 'Database';
  if (lower.includes('security') || lower.includes('secret')) return 'Security';
  if (lower.includes('accessibility') || lower.includes('a11y')) return 'Accessibility';
  if (lower.includes('quality')) return 'Quality';
  if (lower.includes('verification')) return 'Verification';
  if (lower.includes('runner')) return 'Runner';
  return value.length > 34 ? `${value.slice(0, 31)}...` : value;
}

function checkStatusForEvent(eventType: string): AgentPhaseStatus {
  if (eventType.endsWith('_failed') || eventType === 'verification_failed') return 'failed';
  if (eventType.endsWith('_passed') || eventType.endsWith('_succeeded') || eventType === 'quality_checked') return 'done';
  return 'active';
}

function reduceRecovery(current: StreamRecoveryState, eventType: string, message?: string, payload: Record<string, any> = {}): StreamRecoveryState {
  if (eventType === 'error_detected' || eventType === 'auto_fix_started' || eventType === 'patch_applied' || eventType === 'retest_started') {
    return {
      status: 'active',
      message: publicMessage(payload, message, 'Je corrige le blocage detecte.'),
      attempts: eventType === 'auto_fix_started' ? Math.max(current.attempts + 1, Number(payload.attempt || 0) || current.attempts + 1) : current.attempts,
      hasRecoveryEvent: true,
    };
  }
  if (eventType === 'auto_fix_succeeded') {
    return { ...current, status: 'succeeded', message: publicMessage(payload, message, 'La correction est validee.'), hasRecoveryEvent: true };
  }
  if (eventType === 'auto_fix_failed') {
    return { ...current, status: 'failed', message: publicMessage(payload, message, 'La correction automatique reste visible.'), hasRecoveryEvent: true };
  }
  return current;
}

function buildFinalSummary(state: AgentStreamUiState): StreamFinalSummary {
  const bullets: string[] = [];
  if (state.runHeader?.objective) {
    bullets.push(`Mission comprise : ${state.runHeader.objective}.`);
  }
  if (state.files.length) {
    const changed = state.files.filter(file => file.path !== 'Project files').length || state.files.length;
    bullets.push(`${changed} fichier${changed > 1 ? 's' : ''} cible${changed > 1 ? 's' : ''}.`);
  }
  if (state.preview.hasPreviewEvent) {
    bullets.push(state.preview.status === 'ready' ? 'Preview prete.' : 'Preview reconstruite.');
  }
  if (state.checks.hasCheckEvent) {
    bullets.push(state.checks.status === 'passed' ? 'Tests critiques passes.' : 'Tests gardes dans l historique.');
  }
  if (state.recovery.hasRecoveryEvent) {
    bullets.push(state.recovery.status === 'succeeded' ? 'Correction automatique validee.' : 'Correction documentee.');
  }
  if (state.runHeader?.rollbackAvailable) {
    bullets.push('Rollback disponible.');
  }
  if (!bullets.length) bullets.push('Reponse livree sans modifier inutilement le projet.');
  return {
    title: 'Version verifiee',
    bullets,
    nextAction: state.preview.status === 'ready' ? 'Teste la preview, demande une iteration, ou publie.' : 'Tu peux demander une suite precise.',
  };
}

function reduceMissionAgents(
  current: StreamMissionAgent[],
  eventType: string,
  phase: StreamPhaseId,
  status: AgentPhaseStatus,
  payload: Record<string, any>,
): StreamMissionAgent[] {
  const agent = agentForEvent(eventType, phase, payload);
  if (!agent) return current;
  const nextAgent: StreamMissionAgent = {
    ...agent,
    status,
    observation: agent.observation,
  };
  const byId = new Map(current.map(item => [item.id, item]));
  byId.set(nextAgent.id, { ...byId.get(nextAgent.id), ...nextAgent });
  return Array.from(byId.values()).slice(-8);
}

function agentForEvent(eventType: string, phase: StreamPhaseId, payload: Record<string, any>): Omit<StreamMissionAgent, 'status'> | null {
  if (eventType === 'working_tick' || eventType === 'model_streaming') return null;
  const payloadText = JSON.stringify(payload || {}).toLowerCase();
  const hasSecuritySignal = /security|secret|service_role|rls|policy|permission|rate_limit|webhook_signature|production_secret|production_database_security/i.test(payloadText);
  const hasSupabaseSignal = /supabase|schema\.sql|database|row level security|rls|policy|huggy cloud|fullstack|app_organization|app_records/i.test(payloadText);
  const hasDevopsSignal = /deploy|publish|vercel|domain|production_deploy|live_url/i.test(payloadText) || eventType.includes('deploy') || eventType.includes('publish');
  if (hasDevopsSignal) {
    return { id: 'devops_agent', label: 'DevOps Agent', role: 'Publish and domain', observation: 'Je verifie la livraison live sans confondre preview et production.', result: 'Livraison controlee.' };
  }
  if (hasSecuritySignal) {
    return { id: 'security_agent', label: 'Security Agent', role: 'Secrets, RLS and permissions', observation: 'Je verifie les risques sensibles et les garde-fous.', result: 'Securite surveillee.' };
  }
  if (hasSupabaseSignal) {
    return { id: 'supabase_agent', label: 'Supabase Agent', role: 'Auth, database and RLS', observation: 'Je verifie le schema, les policies et le client backend-safe.', result: 'Backend Supabase suivi.' };
  }
  if (eventType === 'intent_detected' || eventType === 'clarification_required') {
    return { id: 'product_agent', label: 'Product Agent', role: 'Intent and product outcome', observation: 'Je transforme la demande en objectif produit.', result: 'Objectif clarifie.' };
  }
  if (phase === 'understanding') return { id: 'orchestrator', label: 'Orchestrator', role: 'Mission intake', observation: 'Je comprends la mission.', result: 'Mission cadre.' };
  if (phase === 'context' || phase === 'planning' || phase === 'research') return { id: 'architect_agent', label: 'Architect Agent', role: 'Scope and plan', observation: 'J organise les agents necessaires.', result: 'Plan borne.' };
  if (phase === 'building' || phase === 'files') {
    const backend = /supabase|schema|database|auth|storage|backend/i.test(payloadText);
    const security = /security|secret|rls|policy|permission/i.test(payloadText);
    if (security) return { id: 'security_agent', label: 'Security Agent', role: 'Secrets and access rules', observation: 'Je verifie les risques sensibles.', result: 'Risque surveille.' };
    return backend
      ? { id: 'backend_agent', label: 'Backend Agent', role: 'Data and auth contract', observation: 'Je prepare le backend sans exposer de secrets.', result: 'Contrat backend suivi.' }
      : { id: 'frontend_agent', label: 'Frontend Agent', role: 'Targeted file changes', observation: 'Je modifie les fichiers cibles.', result: 'Patch cible.' };
  }
  if (phase === 'preview') return { id: 'frontend_agent', label: 'Frontend Agent', role: 'Preview rebuild', observation: 'Je reconstruis la preview.', result: 'Preview synchronisee.' };
  if (phase === 'checks' || phase === 'quality') return { id: 'qa_agent', label: 'QA Agent', role: 'Verification', observation: 'Je teste les erreurs bloquantes.', result: 'Checks suivis.' };
  if (phase === 'visual_check') return { id: 'design_critic', label: 'Design Critic', role: 'Product critique', observation: 'Je critique le resultat visible.', result: 'Critique UX.' };
  if (phase === 'recovery') return { id: 'qa_agent', label: 'QA Agent', role: 'Recovery', observation: 'Je corrige si besoin.', result: 'Correction en cours.' };
  if (phase === 'done' || phase === 'memory') return { id: 'orchestrator', label: 'Orchestrator', role: 'Delivery', observation: 'Je livre une version verifiee.', result: 'Mission livree.' };
  if (eventType.includes('deploy') || eventType.includes('publish')) return { id: 'devops_agent', label: 'DevOps Agent', role: 'Publish and domain', observation: 'Je prepare la livraison live.', result: 'Publication controlee.' };
  return null;
}

function reduceCritics(
  current: StreamCritic[],
  eventType: string,
  status: AgentPhaseStatus,
  message: unknown,
  payload: Record<string, any>,
): StreamCritic[] {
  const critic = criticForEvent(eventType, status, publicMessage(payload, message, 'Critique effectuee.'));
  if (!critic) return current;
  const byId = new Map(current.map(item => [item.id, item]));
  byId.set(critic.id, { ...byId.get(critic.id), ...critic });
  return Array.from(byId.values()).slice(-6);
}

function criticForEvent(eventType: string, status: AgentPhaseStatus, verdict: string): StreamCritic | null {
  if (eventType === 'visual_inspection_started' || eventType === 'visual_inspection_passed' || eventType === 'visual_inspection_failed') {
    return { id: 'ux_critic', label: 'UX Critic', status, verdict, risk: status === 'failed' ? 'Moyen' : 'Faible', recommendation: status === 'failed' ? 'Corriger les controles visibles.' : 'Continuer.' };
  }
  if (eventType === 'quality_gate_started' || eventType === 'quality_checked' || eventType === 'verification_failed') {
    return { id: 'quality_critic', label: 'Code Critic', status, verdict, risk: status === 'failed' ? 'Eleve' : 'Faible', recommendation: status === 'failed' ? 'Bloquer la livraison tant que le point critique existe.' : 'Livraison possible.', blocker: status === 'failed' ? verdict : undefined };
  }
  return null;
}

function buildMissionTasks(input: {
  phases: StreamPhase[];
  files: StreamFileCard[];
  preview: StreamPreviewState;
  checks: StreamCheckState;
  recovery: StreamRecoveryState;
  status: AgentStreamStatus;
}): StreamMissionTask[] {
  const phaseStatus = (ids: StreamPhaseId[]): AgentPhaseStatus => {
    const members = input.phases.filter(phase => ids.includes(phase.id));
    if (!members.length) return 'pending';
    if (members.some(phase => phase.status === 'failed' || phase.status === 'cancelled')) return members.find(phase => phase.status === 'failed' || phase.status === 'cancelled')?.status || 'failed';
    if (members.some(phase => phase.status === 'active')) return 'active';
    if (members.some(phase => phase.status === 'done')) return 'done';
    return 'pending';
  };
  return [
    { id: 'understand', label: 'Je comprends la mission.', detail: 'Intentions, contraintes et risque.', status: phaseStatus(['understanding', 'context']) },
    { id: 'organize', label: 'J organise les agents necessaires.', detail: 'Scope, plan et garde-fous.', status: phaseStatus(['planning', 'research']) },
    { id: 'files', label: 'Je modifie les fichiers cibles.', detail: input.files.length ? `${input.files.length} fichier(s) suivi(s).` : 'En attente de vrais changements.', status: phaseStatus(['building', 'files']) },
    { id: 'preview', label: 'Je reconstruis la preview.', detail: input.preview.hasPreviewEvent ? input.preview.message || 'Preview synchronisee.' : 'Seulement si la preview est touchee.', status: input.preview.hasPreviewEvent ? statusFromPreview(input.preview.status) : 'pending' },
    { id: 'tests', label: 'Je teste.', detail: input.checks.hasCheckEvent ? input.checks.message || 'Checks synchronises.' : 'Seulement si des checks tournent.', status: input.checks.hasCheckEvent ? statusFromChecks(input.checks.status) : 'pending' },
    { id: 'critic', label: 'Je critique le resultat.', detail: 'UX, qualite et blocages visibles.', status: phaseStatus(['visual_check', 'quality']) },
    { id: 'recovery', label: 'Je corrige si besoin.', detail: input.recovery.hasRecoveryEvent ? input.recovery.message || 'Recovery synchronisee.' : 'Aucune correction inventee.', status: input.recovery.hasRecoveryEvent ? statusFromRecovery(input.recovery.status) : 'pending' },
    { id: 'delivery', label: 'Je livre une version verifiee.', detail: 'Resume et prochaine action.', status: input.status === 'done' ? 'done' : input.status === 'failed' || input.status === 'cancelled' ? input.status : 'pending' },
  ];
}

function statusFromPreview(status: StreamPreviewState['status']): AgentPhaseStatus {
  if (status === 'ready') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'building') return 'active';
  return 'pending';
}

function statusFromChecks(status: StreamCheckState['status']): AgentPhaseStatus {
  if (status === 'passed') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'running') return 'active';
  return 'pending';
}

function statusFromRecovery(status: StreamRecoveryState['status']): AgentPhaseStatus {
  if (status === 'succeeded') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'active') return 'active';
  return 'pending';
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

function inferAutonomy(payload: Record<string, any>, fallback: string | undefined, workflow: StreamRunHeader['workflow']): string {
  const raw = cleanPublicText(String(payload.autonomy || payload.autonomy_level || payload.control_level || ''));
  if (raw) return raw.length > 28 ? `${raw.slice(0, 25)}...` : raw;
  if (fallback) return fallback;
  if (workflow === 'Answer') return 'L1 - reponse';
  if (workflow === 'Plan') return 'L2 - plan seulement';
  if (workflow === 'Publish') return 'L3 - livraison controlee';
  if (workflow === 'Build' || workflow === 'Edit' || workflow === 'Fix') return 'L4 - modification avec rollback';
  return 'Auto - decision controlee';
}

function inferRisk(
  payload: Record<string, any>,
  fallback: string | undefined,
  state: AgentStreamUiState,
  nextStatus: AgentStreamStatus,
): string {
  const raw = cleanPublicText(String(payload.risk || payload.risk_level || ''));
  if (raw) return raw.length > 24 ? `${raw.slice(0, 21)}...` : raw;
  if (nextStatus === 'failed') return 'Eleve';
  if (state.recovery.hasRecoveryEvent || state.checks.status === 'failed') return 'Moyen';
  if (state.files.some(file => /auth|schema|database|supabase|billing|publish|domain/i.test(file.path))) return 'Moyen';
  return fallback || 'Faible';
}

function cleanObjective(value: string): string {
  const clean = cleanPublicText(value).replace(/\s+/g, ' ').trim();
  if (!clean) return 'Mission en cours';
  return clean.length > 96 ? `${clean.slice(0, 93)}...` : clean;
}

function headlineFor(phase: StreamPhaseId, status: AgentStreamStatus): string {
  if (status === 'done') return 'Je livre une version verifiee.';
  if (status === 'failed') return 'Je garde le blocage visible.';
  if (status === 'cancelled') return 'Mission arretee proprement.';
  const headlines: Partial<Record<StreamPhaseId, string>> = {
    understanding: 'Je comprends la mission.',
    context: 'Je garde ce qui fonctionne deja.',
    planning: 'J organise les agents necessaires.',
    research: 'Je verifie le contexte externe utile.',
    building: 'Je prepare l execution.',
    files: 'Je modifie les fichiers cibles.',
    preview: 'Je reconstruis la preview.',
    checks: 'Je teste les points bloquants.',
    visual_check: 'Je critique le resultat.',
    recovery: 'Je corrige si besoin.',
    quality: 'Je critique le resultat.',
    memory: 'Je retiens les decisions utiles.',
  };
  return headlines[phase] || 'Huggy Mission Control';
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
