import assert from 'node:assert/strict';

import { buildAgentImprovementSignal } from './src/services/agent-self-improvement.ts';

const conversationSignal = buildAgentImprovementSignal({
  prompt: 'bonjour',
  decision: {
    intent: 'conversation',
    requestedMode: 'auto',
    requiresFileChanges: false,
    requiresPreviewRebuild: false,
    understandingCategory: 'conversation',
    userVisibleReason: 'Greeting answered locally.',
    routingSource: 'heuristic',
  },
  outcome: 'answered',
  previewChanged: false,
  qualityStatus: 'not_applicable',
});

assert.equal(conversationSignal.memoryType, 'agent_improvement');
assert.match(conversationSignal.summary, /conversation/);
assert.equal(conversationSignal.payload.recent_decisions[0].preview_changed, false);
assert.equal(conversationSignal.payload.architecture.autonomous_learning.behavior, 'answer_without_preview_change');
assert.equal(
  conversationSignal.payload.ui_preferences.stream_policy,
  'stream_answer_in_chat_only_without_preview_or_build_loader',
);

const generatedSignal = buildAgentImprovementSignal({
  prompt: 'Create a todo app',
  decision: {
    intent: 'build',
    requestedMode: 'auto',
    requiresFileChanges: true,
    requiresPreviewRebuild: true,
    understandingCategory: 'app',
    userVisibleReason: 'Build a focused app.',
    routingSource: 'ai',
  },
  outcome: 'generated',
  previewChanged: true,
  qualityStatus: 'passed',
  issueCount: 0,
});

assert.equal(generatedSignal.payload.recent_decisions[0].preview_changed, true);
assert.equal(generatedSignal.payload.architecture.autonomous_learning.behavior, 'file_action_after_intent_confirmation');
assert.equal(generatedSignal.payload.architecture.autonomous_learning.quality_status, 'passed');
assert.equal(
  generatedSignal.payload.ui_preferences.stream_policy,
  'show_real_agent_steps_and_keep_trace_after_completion',
);

console.log('agent-self-improvement tests passed');
