export type ArchitectureDecisionRecord = {
  id: string;
  topic: string; // e.g., 'styling', 'state_management', 'database'
  decision: string; // e.g., 'TailwindCSS', 'Zustand', 'Supabase'
  context: string;
  timestamp: string;
};

export type ProjectMemory = {
  adrs: ArchitectureDecisionRecord[];
  knownPreferences: string[];
};

/**
 * Extracts architectural decisions from the assistant's generated text or user prompt.
 */
export function extractArchitectureDecisions(prompt: string, assistantOutput: string): ArchitectureDecisionRecord[] {
  const adrs: ArchitectureDecisionRecord[] = [];
  const combinedText = `${prompt} ${assistantOutput}`.toLowerCase();
  const timestamp = new Date().toISOString();

  // Basic extraction heuristics
  if (/\b(tailwind|tailwindcss)\b/.test(combinedText)) {
    adrs.push({ id: `adr-style-${Date.now()}`, topic: 'styling', decision: 'TailwindCSS', context: 'Inferred from recent prompt or output.', timestamp });
  } else if (/\b(css modules|vanilla css)\b/.test(combinedText)) {
    adrs.push({ id: `adr-style-${Date.now()}`, topic: 'styling', decision: 'Vanilla CSS', context: 'Inferred from recent prompt or output.', timestamp });
  }

  if (/\b(supabase)\b/.test(combinedText)) {
    adrs.push({ id: `adr-db-${Date.now()}`, topic: 'database', decision: 'Supabase', context: 'Requested or implemented database provider.', timestamp });
  } else if (/\b(firebase)\b/.test(combinedText)) {
    adrs.push({ id: `adr-db-${Date.now()}`, topic: 'database', decision: 'Firebase', context: 'Requested or implemented database provider.', timestamp });
  }

  if (/\b(zustand|redux|context api)\b/.test(combinedText)) {
    const match = combinedText.match(/\b(zustand|redux|context api)\b/);
    if (match) {
      adrs.push({ id: `adr-state-${Date.now()}`, topic: 'state_management', decision: match[1], context: 'State management library chosen.', timestamp });
    }
  }

  return adrs;
}

/**
 * Merges new decisions into the existing project memory, deduplicating by topic.
 */
export function updateProjectMemory(existingMemory: ProjectMemory | null, newAdrs: ArchitectureDecisionRecord[]): ProjectMemory {
  const memory = existingMemory || { adrs: [], knownPreferences: [] };
  
  for (const newAdr of newAdrs) {
    const existingIndex = memory.adrs.findIndex(a => a.topic === newAdr.topic);
    if (existingIndex >= 0) {
      memory.adrs[existingIndex] = newAdr;
    } else {
      memory.adrs.push(newAdr);
    }
  }

  return memory;
}

/**
 * Builds a RAG context string to inject into the LLM prompt.
 */
export function buildMemoryRagContext(memory: ProjectMemory | null): string {
  if (!memory || memory.adrs.length === 0) return '';
  
  const rules = memory.adrs.map(adr => `- ${adr.topic}: USE ${adr.decision}`).join('\n');
  return `\n[PROJECT MEMORY & ARCHITECTURE DECISIONS]\nYou must strictly adhere to these established technical choices for this project:\n${rules}\n`;
}
