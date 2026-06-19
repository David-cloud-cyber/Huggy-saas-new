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

assert.equal(HUGGY_AGENT_PROMPT_VERSION, 'huggy-agent-prompt-stack-v26');

// ── LAYER 0 — constitution guardrails present in every assembled prompt ───────
for (const prompt of [routerPrompt, textPrompt, generationPrompt]) {
  assert.ok(prompt.includes('LAYER 0 — CONSTITUTION'), 'every prompt must carry the constitution layer');
  assert.ok(prompt.includes('Never promise unlimited usage'), 'prompt must block unlimited usage claims');
  assert.ok(prompt.includes('gross margin'), 'prompt must keep margin-sensitive language in the constitution');
  assert.ok(prompt.includes('No fake success'), 'prompt must enforce no-fake-success');
  assert.ok(prompt.includes('service_role'), 'prompt must protect service_role keys');
  assert.ok(prompt.includes('Do not expose internal model policy'), 'prompt must hide internal model/routing details');
}

// ── LAYER 1 — single routing taxonomy ────────────────────────────────────────
for (const prompt of [routerPrompt, textPrompt, generationPrompt]) {
  assert.ok(prompt.includes('LAYER 1 — ROUTING'), 'prompt must include the single routing layer');
  assert.ok(prompt.includes('Words like create, add, generate, improve, fix, modify, arrange, or correct are not enough'), 'routing must resist keyword-only coding decisions');
  assert.ok(prompt.includes('"Build or Plan?"'), 'routing must forbid generic Build-or-Plan questions');
}

// Router-only: lean composition (no execution/communication layers, has footer).
assert.ok(routerPrompt.includes('JSON OUTPUT FOOTER'), 'router prompt must include the JSON footer');
assert.ok(routerPrompt.includes('clarification_required'), 'router footer must list the intent taxonomy');
assert.ok(!routerPrompt.includes('LAYER 2 — EXECUTION'), 'router prompt must stay lean (no execution layer)');

// ── Chat prompt — LAYER 0–5, no generation/backend policy ────────────────────
assert.ok(textPrompt.includes('LAYER 2 — EXECUTION'), 'chat prompt must include execution layer');
assert.ok(textPrompt.includes('LAYER 3 — COMMUNICATION'), 'chat prompt must include communication layer');
assert.ok(textPrompt.includes('LAYER 4 — REASONING'), 'chat prompt must include reasoning layer');
assert.ok(textPrompt.includes('SELF-REVIEW (one gate'), 'chat prompt must include the single self-review gate');
assert.ok(textPrompt.includes('answer naturally and directly'), 'conversation prompt must stay direct');
assert.ok(!textPrompt.includes('Built-in AI Connector policy'), 'chat prompt must not carry generation/backend policy');
assert.ok(!textPrompt.includes('Output contract:'), 'chat prompt must not carry the generation output contract');

// ── Generation prompt — LAYER 0–5 + modules ──────────────────────────────────
assert.ok(generationPrompt.includes('SELF-REVIEW (one gate'), 'generation prompt must include the single self-review gate');
assert.ok(generationPrompt.includes('Generation-only context'), 'generation prompt must declare generation-only context');

// File contract (one canonical spec).
assert.ok(generationPrompt.includes('MODULE: GENERATION CONTRACT'), 'generation prompt must include the file contract module');
assert.ok(generationPrompt.includes('Generation stack v2 is mandatory'), 'generation prompt must include the strict stack policy');
assert.ok(generationPrompt.includes('React 18'), 'generation prompt must require React 18');
assert.ok(generationPrompt.includes('lucide-react'), 'generation prompt must require lucide-react icons');
assert.ok(generationPrompt.includes('tailwind.config.ts'), 'generation prompt must require Tailwind config');
assert.ok(generationPrompt.includes('postcss.config.cjs'), 'generation prompt must require PostCSS config');
assert.ok(generationPrompt.includes('src/main.tsx must import React'), 'generation prompt must require a real Vite entrypoint');
assert.ok(generationPrompt.includes('process.exit(isValid ? 0 : 1)'), 'generation prompt must require a non-throwing smoke test');
assert.ok(generationPrompt.includes('Never generate throw new Error() inside src/App.tsx'), 'generation prompt must forbid runtime throw markers');
assert.ok(generationPrompt.includes('Never output __HUGGY_FORCE_ERROR__'), 'generation prompt must forbid forced runtime failure markers');
assert.ok(generationPrompt.includes('Huggy is a general web-app builder'), 'generation prompt must stay general-purpose');
assert.ok(generationPrompt.toLowerCase().includes('return a complete modern react project structure'), 'generation prompt must prefer modern React output');

// Backend & Cloud module (guardrails + AI connector contract).
assert.ok(generationPrompt.includes('Never assume a global supabase variable'), 'generation prompt must forbid global Supabase clients');
assert.ok(generationPrompt.includes('never call supabase.auth unless supabase is imported or created'), 'generation prompt must require an explicit auth client');
assert.ok(generationPrompt.includes('show a safe demo/auth-unavailable state instead of crashing'), 'generation prompt must keep auth previews safe');
assert.ok(generationPrompt.includes('src/lib/supabaseClient.ts'), 'generation prompt must reference a browser-safe Supabase client');
assert.ok(generationPrompt.includes('Built-in AI Connector policy'), 'generation prompt must include the AI connector policy');
assert.ok(generationPrompt.includes('text/event-stream'), 'generation prompt must require SSE streaming');
assert.ok(generationPrompt.includes('must never contain provider API keys'), 'generation prompt must forbid frontend provider keys');
assert.ok(generationPrompt.includes('HLS/DASH'), 'generation prompt must include media streaming guidance');
assert.ok(generationPrompt.includes('Production-readiness policy'), 'generation prompt must include production-readiness policy');
assert.ok(generationPrompt.includes('Every private table needs RLS'), 'generation prompt must enforce private table RLS');

// Import module.
assert.ok(generationPrompt.includes('MODULE: IMPORT'), 'generation prompt must include the import module');
assert.ok(generationPrompt.includes('convert static frames into a real responsive app'), 'generation prompt must upgrade Figma frames');
assert.ok(generationPrompt.includes('preserve the imported codebase'), 'generation prompt must preserve imported GitHub apps');
assert.ok(generationPrompt.includes('recreate it as an editable responsive app'), 'generation prompt must handle screenshot imports');
assert.ok(generationPrompt.includes('Never copy competitor logos'), 'generation prompt must keep URL imports original');

// Product contract + blueprint context (kept).
assert.ok(generationPrompt.includes('Universal product contract (binding)'), 'generation prompt must be driven by the universal product contract');
assert.ok(generationPrompt.includes('Optional production architecture reference'), 'generation prompt may keep blueprints as optional references');
assert.ok(generationPrompt.includes('must never constrain the product shape'), 'blueprints must never constrain the requested product');

// Output contract.
assert.ok(generationPrompt.includes('Output contract:'), 'generation prompt must include the JSON output contract');

console.log('agent prompt stack ok');
