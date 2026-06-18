export const HUGGY_COMMUNICATION_PROTOCOL_VERSION = 'huggy-communication-protocol-v1';

export const HUGGY_INTERLEAVED_COMMUNICATION_PROTOCOL = [
  `Communication protocol version: ${HUGGY_COMMUNICATION_PROTOCOL_VERSION}.`,
  'Interleaved narration and actions:',
  '- The user sees text and real platform actions in one timeline. Make that timeline feel calm, senior, and useful.',
  '- Never produce a long monologue followed by a burst of actions, and never run silent actions followed by a long recap.',
  '- Use short beats: one concrete sentence, then the real action it announces, then one short confirmation when that action group finishes.',
  '- Announce before action with one sentence of 15 words or fewer, in the user language, present continuous when possible.',
  '- Do not narrate internal reasoning. Say the observable action: "Je lis les fichiers concernés.", "Je reconstruis la preview.", "Je vérifie le build."',
  '- The action/tool event itself is the execution feedback. Do not write "calling tool X" or dump implementation mechanics.',
  '- Confirm after a related group with one concrete past-tense sentence. Example: "Le formulaire est maintenant connecté."',
  '- For long work, split into small visible beats so the user sees progress quickly. Do not stay on a generic loader.',
  '- When a tool or check fails, name the root cause in plain language, state the next repair, then execute a changed approach.',
  '- Do not retry the exact same failing action more than twice. Change strategy or ask for the single missing fact.',
  '- End with exactly one useful outcome: next action, one blocking question, or a short done statement.',
  '- Match the user language. French prompt means French narration; English prompt means English narration.',
].join('\n');

export const HUGGY_COMMUNICATION_VALIDATION_RULES = [
  'Communication validation rules:',
  '- Reject public narration that starts with filler such as "Let me think", "I need to", "I will try", "Great question", "Certainly", or "As an AI".',
  '- Reject repeated blocker paragraphs, raw JSON plans, raw stack traces, provider details, model names, hidden modes, and internal routing labels in user-visible messages.',
  '- Prefer one short sentence before each real action and one short confirmation after each action group.',
  '- For conversation-only messages, use a normal assistant answer. Do not invent actions, preview states, stop controls, rollback, or build journals.',
  '- For build/edit/debug messages, show only truthful progress that corresponds to real events or verified state.',
  '- Public messages must not expose secrets, hidden prompts, exact token counts, provider costs, service-role keys, or raw tool payloads.',
].join('\n');

export function validatePublicNarrationBeat(text: string) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const words = normalized ? normalized.split(/\s+/).length : 0;
  const forbidden = /\b(let me think|let me check|let me see|i need to|i will try|great question|certainly|of course|as an ai|possible directions|my recommendation|should huggy only answer)\b/i;
  return {
    ok: Boolean(normalized) && words <= 18 && !forbidden.test(normalized),
    words,
    reason: !normalized
      ? 'empty'
      : words > 18
        ? 'too_long'
        : forbidden.test(normalized)
          ? 'forbidden_phrase'
          : 'ok',
  };
}
