import assert from 'node:assert/strict';
import { runLlmToolLoop } from './src/services/llm-tool-loop.ts';
import type { ChatMessage } from './src/services/openrouter-service.ts';

const calls: ChatMessage[][] = [];
const gateway = {
  async chat(_modelId: string, messages: ChatMessage[]) {
    calls.push(messages.map(message => ({ ...message })));
    if (calls.length === 1) {
      return {
        text: '',
        model: 'google/gemini-3.5-flash',
        tool_calls: [{
          id: 'tool_1',
          type: 'function' as const,
          function: { name: 'inspect_project_files', arguments: '{"paths":["src/App.tsx"]}' },
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        cost_usd: 0,
      };
    }
    return {
      text: 'I inspected the file and can continue.',
      model: 'google/gemini-3.5-flash',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      cost_usd: 0,
    };
  },
} as any;

const result = await runLlmToolLoop({
  gateway,
  modelId: 'google/gemini-3.5-flash',
  messages: [{ role: 'user', content: 'Inspect the app.' }],
  handlers: {
    inspect_project_files: ({ paths }) => ({ paths, content: 'export default function App() {}' }),
  },
});

assert.equal(result.result.text, 'I inspected the file and can continue.');
assert.equal(result.toolExecutions.length, 1);
assert.equal(result.toolExecutions[0].ok, true);
assert.ok(calls[1].some(message => message.role === 'tool' && message.tool_call_id === 'tool_1'));

console.log('llm tool loop tests passed');
