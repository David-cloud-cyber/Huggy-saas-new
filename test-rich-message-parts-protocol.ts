import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const builderLive = readFileSync('src/builder-live.ts', 'utf8');
const dashboardLive = readFileSync('src/dashboard-live.ts', 'utf8');
const conversation = readFileSync('src/builder-conversation-island.tsx', 'utf8');
const streamClient = readFileSync('src/lib/stream-client.ts', 'utf8');
const streamProtocol = readFileSync('src/lib/stream-protocol.ts', 'utf8');
const server = readFileSync('server.ts', 'utf8');

assert.ok(server.includes("app.post('/api/projects/:id/generate'"), 'server should keep non-streaming generation');
assert.ok(server.includes("app.post('/api/projects/:id/generate"), 'server should keep project generation routes');
assert.ok(server.includes("/api/assistant/chat/stream"), 'server should preserve chat SSE transport for the future replacement');
assert.ok(streamClient.includes('export function openHuggyStream'), 'SSE client transport should remain available');
assert.ok(streamProtocol.includes('isHuggyStreamEvent'), 'event validation should remain available');

assert.ok(builderLive.includes("/api/projects/${encodeURIComponent(currentProjectId)}/generate"), 'builder should use non-streaming generation while UI replacement is absent');
assert.ok(builderLive.includes("/api/assistant/chat"), 'simple conversation should use non-streaming chat while UI replacement is absent');
assert.ok(builderLive.includes('[REMPLACEMENT STREAMING UI ICI]'), 'builder should expose a clear streaming UI replacement anchor');
assert.ok(conversation.includes('[REMPLACEMENT STREAMING UI ICI]'), 'conversation renderer should expose a clear streaming UI replacement anchor');

for (const source of [builderLive, dashboardLive, conversation]) {
  assert.ok(!source.includes('openHuggyStream'), 'frontend UI must not call openHuggyStream');
  assert.ok(!source.includes('createSmoothTextRenderer'), 'frontend UI must not use smooth token rendering');
  assert.ok(!source.includes('/generate?stream=true'), 'builder must not request generation SSE visually');
  assert.ok(!source.includes('/api/assistant/chat/stream'), 'chat UI must not request chat SSE visually');
  assert.ok(!source.includes('AgentActivityStream'), 'old agent activity UI must be removed');
  assert.ok(!source.includes('Huggy Mission Control'), 'mission control UI must be removed');
  assert.ok(!source.includes('work_journal'), 'work_journal block must be removed');
  assert.ok(!source.includes('huggy-stream-ui'), 'phase/progress stream UI must be removed');
  assert.ok(!source.includes('message-card-shimmer'), 'shimmer streaming class must be removed');
}

assert.ok(!conversation.includes('<Reasoning'), 'reasoning block UI should be removed');
assert.ok(!conversation.includes('<ToolCall'), 'tool call card UI should be removed');
assert.ok(!conversation.includes('<TerminalBlock'), 'terminal stream UI should be removed');
assert.ok(!conversation.includes('<CodeBlock'), 'streaming code block UI should be removed');
assert.ok(!conversation.includes('<DiffView'), 'streaming diff UI should be removed');

console.log('streaming UI removal contract ok');
