import { normalizeExecutionText } from './execution-contract.ts';

export type EvalJudgeResult = {
  passed: boolean;
  score: number;
  failures: string[];
  suggestedFixes: string[];
};

/**
 * The LLM-as-a-judge loop. Evaluates generated code before it's sent to the user.
 */
export function evaluateAgentOutput(
  prompt: string,
  output: string,
  appType: string,
  architectRequirements: string[]
): EvalJudgeResult {
  const result: EvalJudgeResult = {
    passed: true,
    score: 100,
    failures: [],
    suggestedFixes: [],
  };

  const text = normalizeExecutionText(output);
  
  // 1. Basic sanity checks (No fake success)
  if (text.length < 50 && /done|ready|finished/i.test(text)) {
    result.failures.push('Output claims success but is too short to be a real implementation.');
    result.suggestedFixes.push('Generate the actual code implementation instead of just confirming.');
    result.score -= 40;
  }

  // 2. Syntax/Dependency checks
  if (/undefined is not a function|cannot read properties of undefined/i.test(text)) {
    result.failures.push('Code contains runtime exception patterns.');
    result.suggestedFixes.push('Check variable scoping and add undefined guards (e.g. obj?.property).');
    result.score -= 50;
  }

  // 3. Architecture specific checks based on appType
  if (/(ecommerce|saas|crm)/i.test(appType) && !/supabase|database|sql|fetch/i.test(text)) {
    result.failures.push(`App type ${appType} requires a database connection or state persistence, but none was found in the output.`);
    result.suggestedFixes.push('Implement a mock database or connect to Supabase.');
    result.score -= 30;
  }

  // 4. Architect Requirements
  for (const req of architectRequirements) {
    if (!text.includes(req.toLowerCase()) && !output.includes(req)) {
      result.failures.push(`Failed to meet architectural requirement: ${req}`);
      result.suggestedFixes.push(`Ensure the code implements: ${req}`);
      result.score -= 20;
    }
  }

  if (result.score < 80 || result.failures.length > 0) {
    result.passed = false;
  }

  return result;
}

/**
 * Helper to build the retry prompt if the judge fails.
 */
export function buildRetryPrompt(originalPrompt: string, evalResult: EvalJudgeResult): string {
  return `
[AUTOMATED CODE REVIEW FAILED]
Your previous attempt to fulfill the request failed the internal quality gates.
Failures:
${evalResult.failures.map(f => `- ${f}`).join('\n')}

Suggested Fixes:
${evalResult.suggestedFixes.map(f => `- ${f}`).join('\n')}

Please re-generate the code to fix these issues. 
Original request: "${originalPrompt}"
  `.trim();
}
