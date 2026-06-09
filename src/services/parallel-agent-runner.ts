/**
 * Parallel Agent Runner — executes independent specialized agents concurrently.
 *
 * Solves: "Sous-agents séquentiels → latence 3× trop élevée"
 *
 * Architecture:
 * - Each agent has a focused responsibility (UI, Backend, Security, DB, Tests)
 * - Independent agents run in parallel via Promise.all()
 * - Results are merged into a unified generation context
 * - Dependent agents wait for their prerequisites (simple DAG)
 *
 * Zero extra dependencies — pure async/await in the same Node.js process.
 * Agent communication: shared typed context object passed by reference.
 */

export type AgentRole =
  | 'ui_designer'       // Focused on React components, design system, responsive layout
  | 'backend_engineer'  // Focused on API routes, Supabase schema, RLS policies
  | 'security_auditor'  // Focused on secrets, auth guards, input validation
  | 'test_writer'       // Focused on smoke tests and interaction tests
  | 'ux_validator';     // Focused on accessibility, empty states, mobile usability

export type AgentTask = {
  role: AgentRole;
  prompt: string;             // focused sub-prompt for this agent
  systemContext: string;      // agent-specific system context
  priority: 'critical' | 'high' | 'normal';
  dependsOn?: AgentRole[];    // must wait for these agents to complete first
  tokenBudget: number;        // max tokens this agent can use
};

export type AgentResult = {
  role: AgentRole;
  output: string;
  duration_ms: number;
  success: boolean;
  error?: string;
};

export type ParallelAgentContext = {
  projectName: string;
  userPrompt: string;
  appType: string;
  fileCount: number;
  hasAuth: boolean;
  hasDatabase: boolean;
  hasPayments: boolean;
  language: 'fr' | 'en' | 'auto';
};

// ─── Agent task builders ──────────────────────────────────────────────────────

function buildUIAgentTask(ctx: ParallelAgentContext): AgentTask {
  return {
    role: 'ui_designer',
    prompt: `[UI AGENT] For project "${ctx.projectName}", analyze this request and produce:
1. The complete list of React components needed (with props and state)
2. The design system tokens (colors, spacing, typography)
3. The responsive breakpoints and mobile-first strategy
4. The interaction states required (loading, empty, error, success, disabled)
5. Anti-generic-design recommendations specific to ${ctx.appType}

User request: "${ctx.userPrompt.slice(0, 600)}"`,
    systemContext: `You are a senior UI/UX engineer specialized in ${ctx.appType} applications. 
Focus exclusively on the frontend visual layer — components, states, design tokens, and accessibility.
Output a structured analysis, not code. Keep it under 400 words.`,
    priority: 'high',
    tokenBudget: 2000,
  };
}

function buildBackendAgentTask(ctx: ParallelAgentContext): AgentTask {
  return {
    role: 'backend_engineer',
    prompt: `[BACKEND AGENT] For project "${ctx.projectName}" (${ctx.appType}):
1. Identify the data entities and their relationships
2. Design the Supabase schema (tables, columns, foreign keys, indexes)
3. Specify RLS policies per table (owner/organization isolation)
4. List API endpoints needed (method, path, auth requirement)
5. Flag any backend security risks

User request: "${ctx.userPrompt.slice(0, 600)}"`,
    systemContext: `You are a senior backend engineer specialized in Supabase/PostgreSQL.
Focus exclusively on data architecture, security, and API contracts.
Output a structured schema spec, not code. Keep it under 400 words.`,
    priority: 'high',
    dependsOn: [],
    tokenBudget: 2000,
  };
}

function buildSecurityAgentTask(ctx: ParallelAgentContext): AgentTask {
  return {
    role: 'security_auditor',
    prompt: `[SECURITY AGENT] Pre-generation security audit for "${ctx.projectName}":
1. List all authentication touchpoints that need guards
2. Identify inputs that need validation (forms, API params, file uploads)
3. Check for secrets exposure risks (env vars, keys in frontend)
4. Flag missing RLS policies for sensitive tables
5. List OWASP Top-10 risks relevant to this app type: ${ctx.appType}

User request: "${ctx.userPrompt.slice(0, 400)}"`,
    systemContext: `You are a security engineer. Output a checklist of risks and required mitigations.
Be concise and actionable. Max 300 words.`,
    priority: 'normal',
    dependsOn: [],
    tokenBudget: 1500,
  };
}

function buildTestAgentTask(ctx: ParallelAgentContext): AgentTask {
  return {
    role: 'test_writer',
    prompt: `[TEST AGENT] For "${ctx.projectName}" (${ctx.appType}):
List the minimum test scenarios that must pass:
1. Primary user flow (happy path)
2. Empty state scenarios
3. Error state scenarios
4. Form validation cases
5. Critical business logic checks

User request: "${ctx.userPrompt.slice(0, 400)}"`,
    systemContext: `You are a QA engineer. Output a structured test scenario list.
Max 300 words. Focus on what would break the app if missing.`,
    priority: 'normal',
    dependsOn: [],
    tokenBudget: 1200,
  };
}

function buildUXAgentTask(ctx: ParallelAgentContext): AgentTask {
  return {
    role: 'ux_validator',
    prompt: `[UX AGENT] UX requirements for "${ctx.projectName}" (${ctx.appType}):
1. Mobile usability requirements (touch targets, thumb zones)
2. Accessibility requirements (WCAG 2.1 AA critical items)
3. Empty states with meaningful CTAs
4. Error states with actionable messages
5. Loading states (skeleton vs spinner decision)

User request: "${ctx.userPrompt.slice(0, 400)}"`,
    systemContext: `You are a UX specialist. Output structured UX requirements.
Max 250 words. Be specific to ${ctx.appType}.`,
    priority: 'normal',
    dependsOn: [],
    tokenBudget: 1000,
  };
}

// ─── Parallel execution engine ────────────────────────────────────────────────

export type AgentExecutor = (task: AgentTask) => Promise<string>;

/**
 * Executes independent agents in parallel, respecting dependency order.
 *
 * @param ctx - Project context shared by all agents
 * @param executor - Function that calls the LLM for a given agent task
 * @param enabled - Which agent roles to run (default: ui_designer + backend_engineer)
 * @param timeoutMs - Per-agent timeout (default: 15s — agents are focused, fast)
 */
export async function runParallelAgents(
  ctx: ParallelAgentContext,
  executor: AgentExecutor,
  enabled: AgentRole[] = ['ui_designer', 'backend_engineer'],
  timeoutMs = 15_000,
): Promise<AgentResult[]> {
  // Build task list for enabled agents
  const taskBuilders: Record<AgentRole, (ctx: ParallelAgentContext) => AgentTask> = {
    ui_designer: buildUIAgentTask,
    backend_engineer: buildBackendAgentTask,
    security_auditor: buildSecurityAgentTask,
    test_writer: buildTestAgentTask,
    ux_validator: buildUXAgentTask,
  };

  const tasks = enabled.map(role => taskBuilders[role](ctx));

  // Separate into waves based on dependencies
  const noDeps = tasks.filter(t => !t.dependsOn?.length);
  const withDeps = tasks.filter(t => (t.dependsOn?.length ?? 0) > 0);

  const completedRoles = new Set<AgentRole>();
  const allResults: AgentResult[] = [];

  // Helper: run a single agent task with timeout + error isolation
  const runOne = async (task: AgentTask): Promise<AgentResult> => {
    const startedAt = Date.now();
    try {
      const outputPromise = executor(task);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Agent ${task.role} timed out after ${timeoutMs}ms`)), timeoutMs),
      );
      const output = await Promise.race([outputPromise, timeoutPromise]);
      return { role: task.role, output, duration_ms: Date.now() - startedAt, success: true };
    } catch (err: any) {
      console.warn(`[huggy:parallel_agent_failed] role=${task.role}`, { message: err?.message });
      return { role: task.role, output: '', duration_ms: Date.now() - startedAt, success: false, error: err?.message };
    }
  };

  // Wave 1: run all independent agents in parallel
  if (noDeps.length > 0) {
    const wave1 = await Promise.allSettled(noDeps.map(runOne));
    for (const r of wave1) {
      const result = r.status === 'fulfilled' ? r.value : { role: 'ui_designer' as AgentRole, output: '', duration_ms: 0, success: false };
      allResults.push(result);
      if (result.success) completedRoles.add(result.role);
    }
  }

  // Wave 2: run dependent agents whose prerequisites are satisfied
  const readyDeps = withDeps.filter(t =>
    (t.dependsOn || []).every(dep => completedRoles.has(dep)),
  );
  if (readyDeps.length > 0) {
    const wave2 = await Promise.allSettled(readyDeps.map(runOne));
    for (const r of wave2) {
      if (r.status === 'fulfilled') allResults.push(r.value);
    }
  }

  return allResults;
}

// ─── Context merger ───────────────────────────────────────────────────────────

/**
 * Merges parallel agent outputs into a single prompt injection context.
 * Failed agents are silently skipped — they never block the main generation.
 */
export function mergeAgentOutputs(results: AgentResult[]): string {
  const sections: string[] = [];

  for (const result of results) {
    if (!result.success || !result.output.trim()) continue;

    const label: Record<AgentRole, string> = {
      ui_designer: 'UI AGENT BRIEF',
      backend_engineer: 'BACKEND AGENT BRIEF',
      security_auditor: 'SECURITY AGENT CHECKLIST',
      test_writer: 'TEST AGENT SCENARIOS',
      ux_validator: 'UX AGENT REQUIREMENTS',
    };

    sections.push(`[${label[result.role]}]\n${result.output.trim()}`);
  }

  if (sections.length === 0) return '';

  return [
    '[PARALLEL AGENT PRE-ANALYSIS]',
    'The following specialist agents analyzed the request before code generation.',
    'Use their outputs as binding requirements. Do not contradict them without good reason.',
    '',
    sections.join('\n\n'),
  ].join('\n');
}

/**
 * Selects which agents to run based on project context.
 * Conservative defaults: only runs agents that provide clear value for the request.
 */
export function selectAgentsForContext(ctx: ParallelAgentContext): AgentRole[] {
  const roles: AgentRole[] = [];
  const prompt = ctx.userPrompt.toLowerCase();

  // Always run UI agent for build/edit tasks
  if (ctx.fileCount >= 0) roles.push('ui_designer');

  // Backend agent for data-heavy requests
  if (ctx.hasDatabase || ctx.hasAuth || ctx.hasPayments ||
    /\b(database|supabase|auth|login|crud|stripe|payment|api|backend|schema)\b/i.test(prompt)) {
    roles.push('backend_engineer');
  }

  // Security agent for sensitive features
  if (ctx.hasAuth || ctx.hasPayments ||
    /\b(auth|login|secret|permission|role|rls|stripe|webhook|security|admin)\b/i.test(prompt)) {
    roles.push('security_auditor');
  }

  // UX agent for new builds and major UI changes
  if (/\b(build|create|generate|new app|nouvelle app|creer|cree)\b/i.test(prompt) ||
    /\b(ui|design|layout|responsive|mobile|ux)\b/i.test(prompt)) {
    roles.push('ux_validator');
  }

  return roles;
}
