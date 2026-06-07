import assert from 'node:assert/strict';
import { buildExecutionContract } from './src/services/execution-contract.ts';
import {
  GOLDEN_EXECUTION_PROMPTS,
  buildInternalExecutionPlan,
  buildRecoverableDraftMessage,
  sanitizeAssistantOutput,
  validateExecutionOutputContract,
} from './src/services/agent-execution-os.ts';

for (const item of GOLDEN_EXECUTION_PROMPTS) {
  const contract = buildExecutionContract({ prompt: item.prompt, hasFiles: true });
  assert.equal(contract.mode, item.expectedMode, `${item.prompt} should route to ${item.expectedMode}`);
  assert.equal(contract.can_mutate_files, item.shouldMutate, `${item.prompt} mutate flag mismatch`);
}

{
  const prompt = 'cree une vraie todo app web avec ajout de tache, suppression, filtres active completed, compteur, et localStorage';
  const contract = buildExecutionContract({ prompt, hasFiles: false });
  const internalPlan = buildInternalExecutionPlan({ contract, prompt, hasExistingFiles: false });
  assert.equal(internalPlan.user_visible, false);
  assert.equal(internalPlan.action, 'run_build');
  assert.ok(internalPlan.phases.includes('executing'));
  assert.ok(internalPlan.evidence_required.includes('preview_ready'));
}

{
  const prompt = 'cree une mini app todo';
  const contract = buildExecutionContract({ prompt, hasFiles: false });
  const rawJson = JSON.stringify({
    status: 'success',
    plan: {
      title: 'Plan de creation',
      steps: [{ phase: 'UI', details: 'Create layout' }],
      next_action: 'Je vais coder maintenant.',
    },
  });
  const cleaned = sanitizeAssistantOutput({ text: rawJson, prompt, contract, intent: 'build' });
  assert.ok(!cleaned.includes('"status"'));
  assert.ok(!cleaned.includes('"plan"'));
  assert.match(cleaned, /execution|exécution/i);
}

{
  const prompt = 'fais un plan sans coder';
  const contract = buildExecutionContract({ prompt, requestedMode: 'plan', hasFiles: true });
  const rawJson = JSON.stringify({
    status: 'success',
    plan: {
      title: 'Plan propre',
      steps: [{ phase: 'Audit', details: 'Lire les fichiers.' }],
      next_action: 'Attendre confirmation.',
    },
  });
  const cleaned = sanitizeAssistantOutput({ text: rawJson, prompt, contract, intent: 'plan' });
  assert.ok(!cleaned.includes('"status"'));
  assert.match(cleaned, /Plan propre/);
  assert.match(cleaned, /Audit/);
}

{
  const prompt = 'corrige le probleme: preview blanche';
  const contract = buildExecutionContract({ prompt, hasFiles: true });
  const validation = validateExecutionOutputContract({
    contract,
    hasFiles: true,
    previewReady: false,
    runnerChecked: true,
    reliabilityStatus: 'failed',
    draftSaved: true,
    assistantText: buildRecoverableDraftMessage({
      prompt,
      reliabilitySummary: {
        status: 'failed',
        blocking: [{ message: 'index.html should load /src/main.tsx as a module' }],
      },
      blockingCount: 1,
    }),
  });
  assert.notEqual(validation.status, 'failed');
}

{
  const contract = buildExecutionContract({ prompt: 'cree une todo app', hasFiles: false });
  const validation = validateExecutionOutputContract({
    contract,
    hasFiles: false,
    previewReady: true,
    runnerChecked: false,
    reliabilityStatus: 'failed',
    draftSaved: false,
    assistantText: '{"status":"success","plan":{}}',
  });
  assert.equal(validation.status, 'failed');
  assert.ok(validation.findings.some(item => item.key === 'missing_files'));
  assert.ok(validation.findings.some(item => item.key === 'fake_preview_ready'));
  assert.ok(validation.findings.some(item => item.key === 'raw_json_plan'));
}

console.log('agent execution os tests passed');
