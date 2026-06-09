const fs = require('fs');

let serverCode = fs.readFileSync('server.ts', 'utf8');

// 1. Add Imports
const imports = `
import { buildMetaPrompt } from './src/services/agent-meta-prompter.ts';
import { buildDependencyGraph, findDependents } from './src/services/agent-ast-parser.ts';
import { extractArchitectureDecisions, updateProjectMemory, buildMemoryRagContext } from './src/services/agent-memory-rag.ts';
import { evaluateAgentOutput, buildRetryPrompt } from './src/services/agent-eval-judge.ts';
`;
if (!serverCode.includes('agent-meta-prompter.ts')) {
  serverCode = serverCode.replace("import { normalizeExecutionText", imports + "\nimport { normalizeExecutionText");
}

// 2. Modify generateFilesWithAi
const originalChatCall = `  const result = await providerGateway.chat(selectedModel, [
    {
      role: 'system',
      content: buildGenerationSystemPrompt({
        prompt: input.prompt,
        uiPolicySystemPrompt: uiPolicy.systemPrompt,
        hasExistingFiles: input.existingFiles.length > 0,
      }),
    },
    {
      role: 'user',
      content: JSON.stringify({
        projectName: input.projectName,
        prompt: input.prompt,
        existingFiles: fileManifest || 'No existing files yet.',
        existingFilesContent,
        uiGenerationPolicy: uiPolicy.userContext,
        seniorAgentOS: input.seniorAgentContext || undefined,
        deepReasoning: input.deepReasoningContract ? deepReasoningPromptContext(input.deepReasoningContract) : undefined,
      }),
    },
  ], {
    maxAttempts: 2,
    timeoutMs: runtimeOptions?.runtime.timeoutMs || 90_000,
    runtimeConfig: runtimeOptions?.providerConfig,
  });`;

const newChatCall = `
  // PHASE 1: AST Dependencies & Meta-Prompting
  const depGraph = buildDependencyGraph(input.existingFiles);
  // (In a real system we'd track specific modified files to expand target list, here we just pass them if needed)
  
  const appType = input.deepReasoningContract?.app_type || 'custom_web_app';
  
  // RAG Memory Injection
  // Normally memory is fetched from DB, for this demo we extract on the fly if needed
  // In a full implementation, memory would be passed from loadProject()
  const ragContext = buildMemoryRagContext({ adrs: [], knownPreferences: ['TailwindCSS'] });
  
  const enrichedPrompt = buildMetaPrompt(input.prompt, appType, input.deepReasoningContract?.recovery_diagnostics?.known_failure_modes || []);

  let attempt = 0;
  let result = null;
  let parsed = null;
  let currentPrompt = enrichedPrompt;
  
  // PHASE 4: LLM-as-a-judge retry loop
  while (attempt < 2) {
    result = await providerGateway.chat(selectedModel, [
      {
        role: 'system',
        content: buildGenerationSystemPrompt({
          prompt: input.prompt,
          uiPolicySystemPrompt: uiPolicy.systemPrompt,
          hasExistingFiles: input.existingFiles.length > 0,
        }),
      },
      {
        role: 'user',
        content: JSON.stringify({
          projectName: input.projectName,
          prompt: currentPrompt,
          ragContext,
          existingFiles: fileManifest || 'No existing files yet.',
          existingFilesContent,
          uiGenerationPolicy: uiPolicy.userContext,
          seniorAgentOS: input.seniorAgentContext || undefined,
          deepReasoning: input.deepReasoningContract ? deepReasoningPromptContext(input.deepReasoningContract) : undefined,
        }),
      },
    ], {
      maxAttempts: 2,
      timeoutMs: runtimeOptions?.runtime.timeoutMs || 90_000,
      runtimeConfig: runtimeOptions?.providerConfig,
    });

    const architectReqs = input.seniorAgentContext?.architect_blueprint?.quality_gates || [];
    const judgeEval = evaluateAgentOutput(input.prompt, result.text, appType, architectReqs);
    
    if (judgeEval.passed || attempt >= 1) {
      break;
    }
    
    console.log('[AGENT_JUDGE] Generation failed quality gate. Retrying...', judgeEval.failures);
    currentPrompt = buildRetryPrompt(input.prompt, judgeEval);
    attempt++;
  }
`;

if (serverCode.includes(originalChatCall)) {
  serverCode = serverCode.replace(originalChatCall, newChatCall);
  fs.writeFileSync('server.ts', serverCode);
  console.log('Successfully patched server.ts');
} else {
  console.log('Failed to find original chat call block. Manual patch required.');
}
