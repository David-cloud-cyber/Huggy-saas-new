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
  prompt: 'Create a SaaS app with auth, database and billing.',
  uiPolicySystemPrompt: 'UI policy test.',
  hasExistingFiles: false,
});

assert.equal(HUGGY_AGENT_PROMPT_VERSION, 'huggy-agent-prompt-stack-v14');

for (const prompt of [routerPrompt, textPrompt, generationPrompt]) {
  assert.ok(prompt.includes('Never promise unlimited usage'), 'prompt must block unlimited usage claims');
  assert.ok(prompt.includes('gross margin'), 'prompt must keep margin-sensitive language in safety/business context');
  assert.ok(prompt.includes('Do not expose internal model policy'), 'prompt must hide internal stream/model details');
  assert.ok(prompt.includes('Architect policy'), 'prompt must include Architect policy');
}

assert.ok(textPrompt.includes('Sound like a calm senior engineer and product designer'), 'text prompt must include senior voice policy');
assert.ok(textPrompt.includes('answer naturally and directly'), 'conversation prompt must stay direct');
assert.ok(generationPrompt.includes('Senior agent voice'), 'generation prompt must include senior voice policy');
assert.ok(generationPrompt.toLowerCase().includes('return a complete modern react project structure'), 'generation prompt must prefer modern React app output');
assert.ok(generationPrompt.includes('Never assume a global supabase variable'), 'generation prompt must forbid global Supabase auth clients');
assert.ok(generationPrompt.includes('never call supabase.auth unless supabase is imported or created'), 'generation prompt must require an explicit auth client');
assert.ok(generationPrompt.includes('show a safe demo/auth-unavailable state instead of crashing'), 'generation prompt must keep auth previews safe when config is missing');
assert.ok(generationPrompt.includes('Generation stack v2 is mandatory'), 'generation prompt must include the strict generation stack v2 policy');
assert.ok(generationPrompt.includes('React 18'), 'generation prompt must require React 18');
assert.ok(generationPrompt.includes('lucide-react'), 'generation prompt must require lucide-react icons');
assert.ok(generationPrompt.includes('tailwind.config.ts'), 'generation prompt must require Tailwind config');
assert.ok(generationPrompt.includes('postcss.config.cjs'), 'generation prompt must require PostCSS config');
assert.ok(generationPrompt.includes('src/lib/supabaseClient.ts'), 'generation prompt must require a browser-safe Supabase client for backend apps');
assert.ok(routerPrompt.includes('Words like create, add, generate, improve, fix, modify, arrange, or correct are not enough'), 'router must resist keyword-only coding decisions');
assert.ok(routerPrompt.includes('Figma, GitHub, Image, and Website URL'), 'router prompt must understand import sources');
assert.ok(generationPrompt.includes('convert static frames into a real responsive app'), 'generation prompt must upgrade Figma frames into product UI');
assert.ok(generationPrompt.includes('preserve the imported codebase'), 'generation prompt must preserve imported GitHub apps');
assert.ok(generationPrompt.includes('recreate it as an editable responsive app'), 'generation prompt must handle screenshot imports');
assert.ok(generationPrompt.includes('Never copy competitor logos'), 'generation prompt must keep URL imports safe and original');
assert.ok(routerPrompt.includes('Senior Agent OS policy'), 'router prompt must include Senior Agent OS policy');
assert.ok(textPrompt.includes('Senior Agent OS policy'), 'text prompt must include Senior Agent OS policy');
assert.ok(generationPrompt.includes('Senior Agent OS policy'), 'generation prompt must include Senior Agent OS policy');
assert.ok(generationPrompt.includes('The 16 blueprint sections are an internal completeness checklist'), 'generation prompt must use architect completeness checklist');
assert.ok(generationPrompt.includes('No fake success'), 'generation prompt must enforce no-fake-success delivery');
assert.ok(generationPrompt.includes('decompose tasks'), 'generation prompt must require task decomposition before execution');
assert.ok(generationPrompt.includes('Production-readiness policy'), 'generation prompt must include production-readiness policy');
assert.ok(generationPrompt.includes('Production architecture blueprint'), 'generation prompt must include production blueprint context');
assert.ok(generationPrompt.includes('Every private table needs RLS'), 'generation prompt must enforce private table RLS');
assert.ok(generationPrompt.includes('A builder agent should not over-explain before acting'), 'generation prompt must keep builder behavior action-first');
assert.ok(generationPrompt.includes('Never answer a clear build request with a generic plan'), 'generation prompt must reject generic plan detours for build requests');
assert.ok(generationPrompt.includes('ask exactly one concise question'), 'generation prompt must keep clarification short');
assert.ok(routerPrompt.includes('Do not ask "Build or Plan?"'), 'router prompt must forbid generic mode questions');
assert.ok(generationPrompt.includes('Zero-bug generation contract'), 'generation prompt must include zero-bug generation contract');
assert.ok(generationPrompt.includes('src/main.tsx must import React'), 'generation prompt must require a real Vite entrypoint');
assert.ok(generationPrompt.includes('process.exit(isValid ? 0 : 1)'), 'generation prompt must require a non-throwing smoke test');
assert.ok(generationPrompt.includes('Never generate throw new Error() inside src/App.tsx'), 'generation prompt must forbid runtime throw markers');
assert.ok(generationPrompt.includes('Never output __HUGGY_FORCE_ERROR__'), 'generation prompt must forbid forced runtime failure markers');
assert.ok(generationPrompt.includes('Huggy is a general web-app builder'), 'generation prompt must stay general-purpose');

console.log('agent prompt stack ok');
