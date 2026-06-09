export function buildMetaPrompt(rawPrompt: string, appType: string, knownIssues: string[]): string {
  const normalized = String(rawPrompt || '').trim();
  
  const rules = [
    '- Transform the user request into a clear technical specification.',
    '- Identify edge cases (e.g., empty states, error handling).',
    '- For UI requests, assume mobile-first responsive design.',
    '- Ensure proper state management and data fetching patterns.'
  ];

  if (/ecommerce|marketplace|saas|crm/i.test(appType)) {
    rules.push('- Ensure the database schema includes proper relations and Row Level Security (RLS).');
    rules.push('- Add pessimistic or optimistic UI updates for mutations.');
  }

  if (knownIssues.length > 0) {
    rules.push(`- CRITICAL: Pay special attention to avoid these known past failures: ${knownIssues.join(', ')}`);
  }

  return `
[META-PROMPT ENRICHMENT]
Original Request: "${normalized}"
App Type Context: ${appType}

As an expert Technical Product Manager, rephrase this request into a perfect, actionable specification for a Senior Software Engineer.
Include required components, state management, security checks, and responsive behaviors.

Guidelines:
${rules.join('\n')}

Output ONLY the enriched specification.
`.trim();
}

export function parseEnrichedPrompt(enrichedOutput: string, originalPrompt: string): string {
  if (!enrichedOutput || enrichedOutput.length < 10) return originalPrompt;
  return `[ENRICHED SPECIFICATION]\n${enrichedOutput}\n\n[ORIGINAL INTENT]\n${originalPrompt}`;
}
