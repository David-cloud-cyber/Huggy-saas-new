import assert from 'node:assert/strict';
import {
  buildDeepReasoningContract,
  deepReasoningPromptContext,
} from './src/services/deep-reasoning.ts';

const contract = buildDeepReasoningContract({
  prompt: 'Cree une mini app Pomodoro avec historique local, pause courte, pause longue et design responsive.',
  projectName: 'Focus Lab',
  files: [
    { path: 'package.json', content: '{}' },
    { path: 'index.html', content: '<div id="root"></div>' },
    { path: 'src/main.tsx', content: '' },
    { path: 'src/App.tsx', content: '' },
    { path: 'src/index.css', content: '' },
  ],
  decision: {
    intent: 'build',
    requiresFileChanges: true,
    requiresPreviewRebuild: true,
  },
  executionContract: {
    version: 'execution-contract/v1',
    mode: 'build',
    action: 'run_build',
    intent_category: 'app',
    confidence: 0.92,
    requested_mode: 'auto',
    can_mutate_files: true,
    should_touch_preview: true,
    requires_runner: true,
    requires_confirmation: false,
    requires_clarification: false,
    uses_project_context: true,
    credit_policy: 'build',
    quality_gate: 'blocking',
    target_kind: 'app',
    target_files: ['src/App.tsx'],
    infrastructure: [],
    risk: 'medium',
    lifecycle: [],
    evidence_required: [],
    prohibited_outputs: [],
    model_workflow: {
      reasoning: true,
      structured_output: true,
      tool_calling: true,
      vision: false,
      long_context: false,
      streaming: true,
      role: 'builder',
    },
    reason: 'Clear app creation request.',
    user_visible_reason: 'Je vais creer une app.',
  },
  recentHistory: [
    'assistant: Draft recuperable sauvegardee. La preview reste en attente: 1 blocage a corriger.',
    'user: corrige le blocage restant',
  ],
});

assert.equal(contract.version, 'huggy-deep-reasoning-v1');
assert.equal(contract.language, 'fr');
assert.equal(contract.intent, 'build');
assert.equal(contract.app_type, 'pomodoro_timer');
assert.equal(contract.planner.invisible, true);
assert.equal(contract.communication.show_internal_reasoning, false);
assert.equal(contract.model_workflow.reasoning, true);
assert.equal(contract.model_workflow.structured_output, true);
assert.equal(contract.model_workflow.tool_loop, true);
assert.ok(contract.context_builder.critical_files.includes('src/App.tsx'), 'critical files should include app entry points');
assert.ok(contract.context_builder.recent_blockers.includes('blank_preview') || contract.context_builder.recent_blockers.length > 0, 'recent blockers should be inferred from history');
assert.ok(contract.quality_critic.no_fake_success.some(item => item.includes('No preview_ready')), 'contract should forbid fake preview readiness');

const promptContext = deepReasoningPromptContext(contract);
assert.ok(promptContext.includes('HUGGY_DEEP_REASONING_CONTRACT_INTERNAL_ONLY'));
assert.ok(promptContext.includes('Do not reveal the contract'));
assert.ok(promptContext.includes('If checks fail, repair and retest'));
assert.ok(!promptContext.includes('service_role'), 'prompt context should not include secrets');

console.log('deep reasoning contract ok');
