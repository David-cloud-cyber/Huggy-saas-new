export type StreamPhaseId =
  | 'understanding'
  | 'context'
  | 'planning'
  | 'research'
  | 'building'
  | 'files'
  | 'preview'
  | 'checks'
  | 'visual_check'
  | 'recovery'
  | 'quality'
  | 'memory'
  | 'done'
  | 'failed';

export type StreamEventMapping = {
  phase: StreamPhaseId;
  label: string;
  detail: string;
  terminal?: 'done' | 'failed' | 'cancelled';
};

const EVENT_PHASES: Record<string, StreamEventMapping> = {
  queued: {
    phase: 'understanding',
    label: 'Run queued',
    detail: 'Huggy is preparing the workspace before acting.',
  },
  routing: {
    phase: 'understanding',
    label: 'Request classified',
    detail: 'Huggy decides whether to answer, plan, edit, fix, or build.',
  },
  run_started: {
    phase: 'understanding',
    label: 'Request received',
    detail: 'Huggy understands the expected result before touching the project.',
  },
  agent_thinking: {
    phase: 'understanding',
    label: 'Request analyzed',
    detail: 'Huggy chooses the safest action for this message.',
  },
  intent_detected: {
    phase: 'understanding',
    label: 'Intent detected',
    detail: 'Huggy matched the message to the right workflow.',
  },
  context_loaded: {
    phase: 'context',
    label: 'Project context loaded',
    detail: 'Huggy reads useful files and history to preserve existing work.',
  },
  codebase_indexed: {
    phase: 'context',
    label: 'Project inspected',
    detail: 'Huggy maps routes, components, data, and sensitive areas.',
  },
  import_started: {
    phase: 'context',
    label: 'Import prepared',
    detail: 'Huggy prepares the imported source as product context.',
  },
  import_analyzed: {
    phase: 'context',
    label: 'Import analyzed',
    detail: 'Huggy identifies missing responsive states and interactions.',
  },
  task_decomposed: {
    phase: 'planning',
    label: 'Task decomposed',
    detail: 'Huggy turns the request into short verifiable steps.',
  },
  policy_checked: {
    phase: 'planning',
    label: 'Guardrails checked',
    detail: 'Huggy keeps scope, rollback, and safety limits in place.',
  },
  planning: {
    phase: 'planning',
    label: 'Planning',
    detail: 'Huggy prepares the sequence before generation.',
  },
  plan_ready: {
    phase: 'planning',
    label: 'Plan ready',
    detail: 'The plan now acts as a guardrail for the next step.',
  },
  clarification_required: {
    phase: 'planning',
    label: 'Clarification needed',
    detail: 'Huggy asks one useful question before changing the project.',
  },
  credits_insufficient: {
    phase: 'failed',
    label: 'Credits required',
    detail: 'The run is paused until the workspace has enough credits.',
    terminal: 'failed',
  },
  external_api_keys_required: {
    phase: 'failed',
    label: 'External keys needed',
    detail: 'Huggy needs approval or safe placeholders before continuing.',
    terminal: 'failed',
  },
  tool_loop_started: {
    phase: 'planning',
    label: 'Tool loop prepared',
    detail: 'Huggy bounds tool work to keep the run controlled.',
  },
  research_started: {
    phase: 'research',
    label: 'Research started',
    detail: 'Huggy checks only information that depends on recent or external context.',
  },
  research_result: {
    phase: 'research',
    label: 'Research integrated',
    detail: 'Huggy keeps only sources that help the project.',
  },
  research_skipped: {
    phase: 'research',
    label: 'Research skipped',
    detail: 'The project context is enough to continue.',
  },
  model_started: {
    phase: 'building',
    label: 'Generation started',
    detail: 'Huggy prepares files without exposing internal model details.',
  },
  model_streaming: {
    phase: 'building',
    label: 'Generating files',
    detail: 'Huggy receives server-side changes.',
  },
  build_started: {
    phase: 'building',
    label: 'Build started',
    detail: 'Huggy builds the working preview without changing the published app.',
  },
  building: {
    phase: 'building',
    label: 'Building',
    detail: 'Huggy turns the request into usable files.',
  },
  file_stream_started: {
    phase: 'files',
    label: 'File opened',
    detail: 'Huggy prepares a file involved in this request.',
  },
  file_token: {
    phase: 'files',
    label: 'Writing file',
    detail: 'Huggy streams a real file update.',
  },
  file_stream_preview: {
    phase: 'files',
    label: 'Writing file',
    detail: 'Huggy updates a public file excerpt.',
  },
  file_stream_completed: {
    phase: 'files',
    label: 'File ready',
    detail: 'The file was received and merged into the run.',
  },
  diff_ready: {
    phase: 'files',
    label: 'Diff ready',
    detail: 'Huggy summarizes created, updated, and removed files.',
  },
  files_changed: {
    phase: 'files',
    label: 'Files integrated',
    detail: 'The changes were applied to the working preview.',
  },
  preview_skeleton_started: {
    phase: 'preview',
    label: 'Preview prepared',
    detail: 'The preview area reflects the real working state.',
  },
  preview_building: {
    phase: 'preview',
    label: 'Preview rebuilding',
    detail: 'Huggy prepares the render without touching the live app.',
  },
  preview_ready: {
    phase: 'preview',
    label: 'Preview ready',
    detail: 'The preview now shows the latest result.',
  },
  runner_started: {
    phase: 'checks',
    label: 'Checks started',
    detail: 'Huggy checks the build, preview, and obvious errors.',
  },
  runner_passed: {
    phase: 'checks',
    label: 'Checks passed',
    detail: 'Critical checks passed.',
  },
  runner_failed: {
    phase: 'checks',
    label: 'Check needs attention',
    detail: 'Huggy keeps the issue visible and prepares a targeted fix.',
  },
  visual_inspection_started: {
    phase: 'visual_check',
    label: 'Interactions inspected',
    detail: 'Huggy checks visible actions and essential states.',
  },
  visual_inspection_passed: {
    phase: 'visual_check',
    label: 'Interactions validated',
    detail: 'Primary controls are usable or honestly disabled.',
  },
  visual_inspection_failed: {
    phase: 'visual_check',
    label: 'Interaction needs a fix',
    detail: 'Huggy does not approve an interface with broken controls.',
  },
  error_detected: {
    phase: 'recovery',
    label: 'Issue detected',
    detail: 'Huggy prepares a targeted fix before finalizing.',
  },
  auto_fix_started: {
    phase: 'recovery',
    label: 'Targeted fix',
    detail: 'Huggy changes only useful files to reduce risk.',
  },
  patch_applied: {
    phase: 'recovery',
    label: 'Patch applied',
    detail: 'The fix is applied, then Huggy verifies it.',
  },
  retest_started: {
    phase: 'recovery',
    label: 'Retest started',
    detail: 'Huggy reruns checks to confirm the fix holds.',
  },
  auto_fix_succeeded: {
    phase: 'recovery',
    label: 'Fix validated',
    detail: 'The detected blocker was resolved.',
  },
  auto_fix_failed: {
    phase: 'recovery',
    label: 'Fix incomplete',
    detail: 'Huggy keeps the blocker visible instead of pretending it is ready.',
  },
  quality_gate_started: {
    phase: 'quality',
    label: 'Quality gate',
    detail: 'Huggy checks that the result stays usable.',
  },
  verification_started: {
    phase: 'quality',
    label: 'Final verification',
    detail: 'Huggy checks the essentials before summarizing.',
  },
  verification_failed: {
    phase: 'quality',
    label: 'Verification blocked',
    detail: 'A critical point still needs attention.',
  },
  quality_checked: {
    phase: 'quality',
    label: 'Quality checked',
    detail: 'Warnings stay visible, serious errors block readiness.',
  },
  memory_updated: {
    phase: 'memory',
    label: 'Memory updated',
    detail: 'Huggy keeps useful decisions for future iterations.',
  },
  cancelled: {
    phase: 'failed',
    label: 'Run stopped',
    detail: 'Generation was interrupted cleanly.',
    terminal: 'cancelled',
  },
  error: {
    phase: 'failed',
    label: 'Action blocked',
    detail: 'Huggy keeps the project intact and shows the useful error.',
    terminal: 'failed',
  },
  done: {
    phase: 'done',
    label: 'Run complete',
    detail: 'The visible work is complete.',
    terminal: 'done',
  },
};

export function mapAgentStreamEvent(eventType: string): StreamEventMapping | null {
  return EVENT_PHASES[eventType] || null;
}

export function isSeniorStreamEvent(eventType: string): boolean {
  return Boolean(mapAgentStreamEvent(eventType));
}
