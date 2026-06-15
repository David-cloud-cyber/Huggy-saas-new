import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('src/lib/api.ts', 'utf8');
const builderLive = readFileSync('src/builder-live.ts', 'utf8');
const conversation = readFileSync('src/builder-conversation-island.tsx', 'utf8');
const server = readFileSync('server.ts', 'utf8');

assert.ok(server.includes("app.post('/api/projects/:id/generate'"), 'server should keep the non-streaming generation endpoint');
assert.ok(builderLive.includes('/generate?stream=true'), 'builder should use the synchronized generation event stream');
assert.ok(builderLive.includes('commitAssistantText'), 'builder should render only the final assistant response after generation');
assert.ok(builderLive.includes("'clarification_only'"), 'builder should still clarify vague bare actions');
assert.ok(builderLive.includes('startBuildStream'), 'builder should start the compact build stream for real project work');
assert.ok(builderLive.includes('setWorkJournalBlock(status, journal)'), 'builder should attach the build stream journal to the assistant message');
assert.ok(builderLive.includes('/api/assistant/chat/stream'), 'simple conversation should use the synchronized chat stream endpoint');
assert.ok(builderLive.includes('chatAbort.signal.addEventListener'), 'simple conversation stop should cancel the chat stream');

assert.ok(!builderLive.includes('apiStream('), 'builder should never call apiStream');
assert.ok(!builderLive.includes('/generate/stream'), 'builder should never call the streaming generation endpoint');
assert.ok(!builderLive.includes('appendToMessageShimmer(status, liveTokenBuffer)'), 'raw generation tokens must never be rendered in the conversation');

assert.ok(!conversation.includes('components/huggy-streaming/ChatStream'), 'conversation should not import the old ChatStream UI');
assert.ok(!conversation.includes('<ChatStream'), 'conversation should not render the old ChatStream UI');
assert.ok(conversation.includes('huggy-message-waiting'), 'conversation should render a compact waiting state before streamed text arrives');
assert.ok(conversation.includes('AgentActivityStream'), 'project work should render through the replacement activity stream');
assert.ok(conversation.includes('workJournalToActivityState'), 'project work should preserve existing events through the activity adapter');
assert.ok(!conversation.includes('huggy-conversation-stream huggy-workline'), 'the previous workline renderer should be removed');
assert.ok(!conversation.includes('<div className="huggy-workline-rail"'), 'inline project work should not render a visual rail');
assert.ok(!conversation.includes('Huggy Mission Control'), 'conversation should not render Mission Control');
assert.ok(!conversation.includes('Traitement en cours'), 'conversation should not render old processing headers');
assert.ok(!conversation.includes('Traitement terminÃ©'), 'conversation should not render old processing headers');
assert.ok(!builderLive.includes('I am understanding the request and preparing the work.'), 'builder should not inject fake English startup narration');
assert.ok(!server.includes('Possible directions'), 'clarification text should not expose noisy option labels');
assert.ok(!server.includes('My recommendation'), 'clarification text should not append generic recommendations');
assert.ok(!server.includes('Should Huggy only answer'), 'clarification must not ask a generic answer-or-build question');
assert.ok(!server.includes('Do you want a simple answer'), 'clarification must ask for the concrete product target instead of mode choice');

console.log('huggy replacement streaming ui protocol ok');
