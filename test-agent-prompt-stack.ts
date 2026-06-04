import assert from 'node:assert/strict';
import {
  HUGGY_AGENT_PROMPT_VERSION,
  buildAgentTextSystemPrompt,
  buildGenerationSystemPrompt,
  buildIntentRouterSystemPrompt,
} from './src/services/agent-prompt-stack.ts';

const routerPrompt = buildIntentRouterSystemPrompt();
const textPrompt = buildAgentTextSystemPrompt({
  intent: 'conversation',
  modeInstruction: 'Mode test.',
  languageInstruction: 'Respond in French.',
});
const generationPrompt = buildGenerationSystemPrompt({
  uiPolicySystemPrompt: 'UI policy test.',
  hasExistingFiles: false,
});

assert.equal(HUGGY_AGENT_PROMPT_VERSION, 'huggy-agent-prompt-stack-v8');

for (const prompt of [routerPrompt, textPrompt, generationPrompt]) {
  assert.ok(prompt.includes('Never promise unlimited usage'), 'prompt must block unlimited usage claims');
  assert.ok(prompt.includes('gross margin'), 'prompt must keep margin-sensitive language in safety/business context');
  assert.ok(prompt.includes('Do not expose internal model policy'), 'prompt must hide internal stream/model details');
}

assert.ok(textPrompt.includes('Sound like a calm senior engineer and product designer'), 'text prompt must include senior voice policy');
assert.ok(textPrompt.includes('answer naturally and directly'), 'conversation prompt must stay direct');
assert.ok(generationPrompt.includes('Senior agent voice'), 'generation prompt must include senior voice policy');
assert.ok(generationPrompt.toLowerCase().includes('return a complete modern react project structure'), 'generation prompt must prefer modern React app output');
assert.ok(routerPrompt.includes('Words like create, add, generate, improve, fix, modify, arrange, or correct are not enough'), 'router must resist keyword-only coding decisions');

console.log('agent prompt stack ok');
