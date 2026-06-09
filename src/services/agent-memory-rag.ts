export type ArchitectureDecisionRecord = {
  id: string;
  topic: string; // e.g., 'styling', 'state_management', 'database', 'routing', 'auth'
  decision: string; // e.g., 'TailwindCSS', 'Zustand', 'Supabase'
  context: string;
  confidence: 'high' | 'medium' | 'inferred';
  timestamp: string;
};

export type ProjectMemory = {
  adrs: ArchitectureDecisionRecord[];
  knownPreferences: string[];
  recentBlockers?: string[];
  userLanguage?: 'fr' | 'en' | 'auto';
};

/**
 * Persisted memory row shape — mirrors the Supabase project_memory table.
 */
export type ProjectMemoryRow = {
  project_id: string;
  memory_type: 'adr' | 'preference' | 'blocker' | 'pattern';
  content: string;
  created_at?: string;
};

/**
 * Topic patterns — ordered from most specific to most generic.
 */
const TOPIC_PATTERNS: Array<{ topic: string; pattern: RegExp; decision: (m: RegExpMatchArray) => string; confidence: 'high' | 'medium' | 'inferred' }> = [
  // Styling
  { topic: 'styling', pattern: /\b(tailwindcss|tailwind css)\b/i, decision: () => 'TailwindCSS', confidence: 'high' },
  { topic: 'styling', pattern: /\b(css modules)\b/i, decision: () => 'CSS Modules', confidence: 'high' },
  { topic: 'styling', pattern: /\b(styled[-\s]?components)\b/i, decision: () => 'styled-components', confidence: 'high' },
  { topic: 'styling', pattern: /\b(vanilla css|plain css)\b/i, decision: () => 'Vanilla CSS', confidence: 'medium' },
  { topic: 'styling', pattern: /\b(chakra ui)\b/i, decision: () => 'Chakra UI', confidence: 'high' },
  { topic: 'styling', pattern: /\b(shadcn|shadcn\/ui)\b/i, decision: () => 'shadcn/ui', confidence: 'high' },
  { topic: 'styling', pattern: /\b(material ui|mui)\b/i, decision: () => 'Material UI', confidence: 'high' },
  // Database / Backend
  { topic: 'database', pattern: /\b(supabase)\b/i, decision: () => 'Supabase', confidence: 'high' },
  { topic: 'database', pattern: /\b(firebase|firestore)\b/i, decision: () => 'Firebase', confidence: 'high' },
  { topic: 'database', pattern: /\b(prisma)\b/i, decision: () => 'Prisma ORM', confidence: 'high' },
  { topic: 'database', pattern: /\b(drizzle)\b/i, decision: () => 'Drizzle ORM', confidence: 'high' },
  { topic: 'database', pattern: /\b(mongodb|mongoose)\b/i, decision: () => 'MongoDB', confidence: 'high' },
  { topic: 'database', pattern: /\b(postgres|postgresql)\b/i, decision: () => 'PostgreSQL', confidence: 'medium' },
  // State management
  { topic: 'state_management', pattern: /\b(zustand)\b/i, decision: () => 'Zustand', confidence: 'high' },
  { topic: 'state_management', pattern: /\b(redux toolkit|redux)\b/i, decision: (m) => m[0].toLowerCase().includes('toolkit') ? 'Redux Toolkit' : 'Redux', confidence: 'high' },
  { topic: 'state_management', pattern: /\b(jotai)\b/i, decision: () => 'Jotai', confidence: 'high' },
  { topic: 'state_management', pattern: /\b(recoil)\b/i, decision: () => 'Recoil', confidence: 'high' },
  { topic: 'state_management', pattern: /\b(context api|useContext)\b/i, decision: () => 'React Context API', confidence: 'medium' },
  { topic: 'state_management', pattern: /\b(valtio)\b/i, decision: () => 'Valtio', confidence: 'high' },
  // Routing
  { topic: 'routing', pattern: /\b(react router|react-router)\b/i, decision: () => 'React Router', confidence: 'high' },
  { topic: 'routing', pattern: /\b(tanstack router|@tanstack\/router)\b/i, decision: () => 'TanStack Router', confidence: 'high' },
  { topic: 'routing', pattern: /\b(wouter)\b/i, decision: () => 'Wouter', confidence: 'high' },
  // Auth
  { topic: 'auth', pattern: /\b(supabase auth|supabase\.auth)\b/i, decision: () => 'Supabase Auth', confidence: 'high' },
  { topic: 'auth', pattern: /\b(next-?auth)\b/i, decision: () => 'NextAuth.js', confidence: 'high' },
  { topic: 'auth', pattern: /\b(clerk)\b/i, decision: () => 'Clerk', confidence: 'high' },
  { topic: 'auth', pattern: /\b(firebase auth)\b/i, decision: () => 'Firebase Auth', confidence: 'high' },
  // Framework / Stack
  { topic: 'framework', pattern: /\b(next\.?js|nextjs)\b/i, decision: () => 'Next.js', confidence: 'high' },
  { topic: 'framework', pattern: /\b(remix)\b/i, decision: () => 'Remix', confidence: 'high' },
  { topic: 'framework', pattern: /\b(astro)\b/i, decision: () => 'Astro', confidence: 'high' },
  { topic: 'framework', pattern: /\b(svelte|sveltekit)\b/i, decision: () => 'SvelteKit', confidence: 'high' },
  // Data fetching
  { topic: 'data_fetching', pattern: /\b(react query|tanstack query|@tanstack\/react-query)\b/i, decision: () => 'TanStack Query', confidence: 'high' },
  { topic: 'data_fetching', pattern: /\b(swr)\b/i, decision: () => 'SWR', confidence: 'high' },
  { topic: 'data_fetching', pattern: /\b(apollo client)\b/i, decision: () => 'Apollo Client', confidence: 'high' },
  // Payments
  { topic: 'payments', pattern: /\b(stripe)\b/i, decision: () => 'Stripe', confidence: 'high' },
  { topic: 'payments', pattern: /\b(lemonsqueezy)\b/i, decision: () => 'LemonSqueezy', confidence: 'high' },
  // Testing
  { topic: 'testing', pattern: /\b(vitest)\b/i, decision: () => 'Vitest', confidence: 'high' },
  { topic: 'testing', pattern: /\b(jest)\b/i, decision: () => 'Jest', confidence: 'high' },
  { topic: 'testing', pattern: /\b(playwright)\b/i, decision: () => 'Playwright', confidence: 'high' },
  { topic: 'testing', pattern: /\b(cypress)\b/i, decision: () => 'Cypress', confidence: 'high' },
];

/**
 * Extracts architectural decisions from prompt + assistant output with confidence scoring.
 * Returns deduplicated ADRs, preferring high-confidence entries.
 */
export function extractArchitectureDecisions(prompt: string, assistantOutput: string): ArchitectureDecisionRecord[] {
  const combinedText = `${prompt} ${assistantOutput}`;
  const timestamp = new Date().toISOString();
  const seen = new Map<string, ArchitectureDecisionRecord>();

  for (const { topic, pattern, decision, confidence } of TOPIC_PATTERNS) {
    const match = combinedText.match(pattern);
    if (!match) continue;
    const existing = seen.get(topic);
    // Only override if new entry has higher confidence
    if (existing && confidenceRank(existing.confidence) >= confidenceRank(confidence)) continue;
    seen.set(topic, {
      id: `adr-${topic}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      topic,
      decision: decision(match),
      context: `Detected in ${prompt.length > 0 && pattern.test(prompt) ? 'user prompt' : 'generated output'}.`,
      confidence,
      timestamp,
    });
  }

  return Array.from(seen.values());
}

function confidenceRank(c: 'high' | 'medium' | 'inferred') {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}

/**
 * Merges new decisions into the existing project memory, deduplicating by topic.
 * Newer high-confidence decisions override older low-confidence ones.
 */
export function updateProjectMemory(existingMemory: ProjectMemory | null, newAdrs: ArchitectureDecisionRecord[]): ProjectMemory {
  const memory: ProjectMemory = existingMemory
    ? { ...existingMemory, adrs: [...(existingMemory.adrs || [])] }
    : { adrs: [], knownPreferences: [] };

  for (const newAdr of newAdrs) {
    const existingIndex = memory.adrs.findIndex(a => a.topic === newAdr.topic);
    if (existingIndex >= 0) {
      const existing = memory.adrs[existingIndex];
      // Only replace if new ADR has equal or better confidence
      if (confidenceRank(newAdr.confidence) >= confidenceRank(existing.confidence)) {
        memory.adrs[existingIndex] = newAdr;
      }
    } else {
      memory.adrs.push(newAdr);
    }
  }

  return memory;
}

/**
 * Builds a compact RAG context string to inject into the LLM prompt.
 * Groups ADRs by topic for clarity and adds preference/blocker context.
 */
export function buildMemoryRagContext(memory: ProjectMemory | null): string {
  if (!memory) return '';

  const sections: string[] = [];

  if (memory.adrs.length > 0) {
    const rules = memory.adrs
      .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence))
      .slice(0, 12)
      .map(adr => `  • ${adr.topic}: USE ${adr.decision} [${adr.confidence} confidence]`)
      .join('\n');
    sections.push(`[ESTABLISHED TECH STACK — STRICTLY FOLLOW]\n${rules}`);
  }

  if (memory.knownPreferences && memory.knownPreferences.length > 0) {
    const prefs = memory.knownPreferences.slice(0, 6).map(p => `  • ${p}`).join('\n');
    sections.push(`[USER PREFERENCES]\n${prefs}`);
  }

  if (memory.recentBlockers && memory.recentBlockers.length > 0) {
    const blockers = memory.recentBlockers.slice(0, 4).map(b => `  • ${b}`).join('\n');
    sections.push(`[AVOID — RECENT FAILURE MODES]\n${blockers}`);
  }

  if (sections.length === 0) return '';

  return `\n[PROJECT MEMORY & ARCHITECTURE DECISIONS]\nYou must strictly adhere to these established technical choices:\n${sections.join('\n\n')}\n`;
}

/**
 * Converts Supabase project_memory rows into a ProjectMemory object.
 * Use this when loading persisted memory from the database.
 */
export function rowsToProjectMemory(rows: ProjectMemoryRow[]): ProjectMemory {
  const memory: ProjectMemory = { adrs: [], knownPreferences: [], recentBlockers: [] };

  for (const row of rows) {
    if (row.memory_type === 'adr') {
      try {
        const parsed: ArchitectureDecisionRecord = JSON.parse(row.content);
        memory.adrs.push(parsed);
      } catch {
        // Fallback: treat as raw decision string
        const parts = row.content.split(':');
        if (parts.length >= 2) {
          memory.adrs.push({
            id: `adr-legacy-${Date.now()}`,
            topic: parts[0].trim(),
            decision: parts.slice(1).join(':').trim(),
            context: 'Loaded from persisted memory.',
            confidence: 'medium',
            timestamp: row.created_at || new Date().toISOString(),
          });
        }
      }
    } else if (row.memory_type === 'preference') {
      memory.knownPreferences?.push(row.content);
    } else if (row.memory_type === 'blocker') {
      memory.recentBlockers?.push(row.content);
    }
  }

  return memory;
}

/**
 * Converts a ProjectMemory object to Supabase rows for persistence.
 */
export function projectMemoryToRows(memory: ProjectMemory, projectId: string): ProjectMemoryRow[] {
  const rows: ProjectMemoryRow[] = [];

  for (const adr of memory.adrs) {
    rows.push({
      project_id: projectId,
      memory_type: 'adr',
      content: JSON.stringify(adr),
    });
  }

  for (const pref of (memory.knownPreferences || [])) {
    rows.push({
      project_id: projectId,
      memory_type: 'preference',
      content: pref,
    });
  }

  for (const blocker of (memory.recentBlockers || [])) {
    rows.push({
      project_id: projectId,
      memory_type: 'blocker',
      content: blocker,
    });
  }

  return rows;
}
