import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('src/lib/api.ts', 'utf8');
const builderLive = readFileSync('src/builder-live.ts', 'utf8');
const conversation = readFileSync('src/builder-conversation-island.tsx', 'utf8');
const server = readFileSync('server.ts', 'utf8');

assert.ok(server.includes("app.post('/api/projects/:id/generate'"), 'server should keep the non-streaming generation endpoint');
assert.ok(builderLive.includes('/generate`'), 'builder should call the final non-streaming generate endpoint');
assert.ok(builderLive.includes('apiFetch<any>'), 'builder should use apiFetch for project generation');
assert.ok(builderLive.includes('setMessageShimmer'), 'builder should show a simple waiting state while generation runs');
assert.ok(builderLive.includes('commitAssistantText'), 'builder should render only the final assistant response after generation');
assert.ok(builderLive.includes("'clarification_only'"), 'builder should still clarify vague bare actions');
assert.ok(builderLive.includes('startBuildStream'), 'builder should start the compact build stream for real project work');
assert.ok(builderLive.includes('setWorkJournalBlock(status, journal)'), 'builder should attach the build stream journal to the assistant message');

assert.ok(!api.includes('apiStream'), 'frontend API layer should not expose SSE streaming helpers');
assert.ok(!api.includes('createJsonSseParser'), 'frontend API layer should not parse SSE for Huggy responses');
assert.ok(!builderLive.includes('apiStream('), 'builder should never call apiStream');
assert.ok(!builderLive.includes('/generate/stream'), 'builder should never call the streaming generation endpoint');
assert.ok(!builderLive.includes('/assistant/chat/stream'), 'builder should never call the streaming chat endpoint');

assert.ok(!conversation.includes('components/huggy-streaming/ChatStream'), 'conversation should not import the old ChatStream UI');
assert.ok(!conversation.includes('<ChatStream'), 'conversation should not render the old ChatStream UI');
assert.ok(conversation.includes('huggy-message-waiting'), 'conversation should render a compact non-streaming wait state');
assert.ok(conversation.includes('huggy-buildstream'), 'conversation should render the new compact build stream panel');
assert.ok(conversation.includes('return renderBuildStreamBlock(block);'), 'work journals should render through the new build stream panel');
assert.ok(!conversation.includes('Huggy Mission Control'), 'conversation should not render Mission Control');
assert.ok(!conversation.includes('Traitement en cours'), 'conversation should not render old processing headers');
assert.ok(!conversation.includes('Traitement terminÃ©'), 'conversation should not render old processing headers');
assert.ok(!builderLive.includes('I am understanding the request and preparing the work.'), 'builder should not inject fake English startup narration');
assert.ok(!server.includes('Possible directions'), 'clarification text should not expose noisy option labels');
assert.ok(!server.includes('My recommendation'), 'clarification text should not append generic recommendations');
assert.ok(!server.includes('Should Huggy only answer'), 'clarification must not ask a generic answer-or-build question');
assert.ok(!server.includes('Do you want a simple answer'), 'clarification must ask for the concrete product target instead of mode choice');

console.log('huggy non-streaming ui protocol ok');
