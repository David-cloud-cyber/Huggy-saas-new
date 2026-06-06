import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync('server.ts', 'utf8');
const builderLive = readFileSync('src/builder-live.ts', 'utf8');
const conversation = readFileSync('src/builder-conversation-island.tsx', 'utf8');
const styles = readFileSync('src/styles/huggy-ai-elements.css', 'utf8');

[
  'narration',
  'thinking',
  'file_edit',
  'tool_group',
  'command_started',
  'command_completed',
  'check_started',
  'check_completed',
  'check_running',
  'check_done',
  'final_summary',
].forEach(eventType => {
  assert.ok(server.includes(`'${eventType}'`), `server should emit ${eventType}`);
  assert.ok(builderLive.includes(`eventType === '${eventType}'`) || builderLive.includes(`step.event_type === '${eventType}'`), `builder should consume ${eventType}`);
});

assert.ok(server.includes('countLineDiffStats'), 'server should calculate line diff stats');
assert.ok(server.includes('sendFileEditEvents(diff, \'final_diff\')'), 'server should emit final file edit stats after auto-fix');
assert.ok(builderLive.includes('buildCodexJournalFromSteps'), 'builder should reconstruct persisted work journals');
assert.ok(builderLive.includes('/agent/runs?limit=1'), 'builder should restore the latest persisted run');
assert.ok(conversation.includes('"file_edit"'), 'conversation types should support exact file edits');
assert.ok(conversation.includes('huggy-codex-file-edit'), 'conversation renderer should render exact file edits');
assert.ok(styles.includes('.huggy-codex-file-edit'), 'journal CSS should style file edits');
assert.ok(!conversation.includes('Huggy Mission Control'), 'builder conversation should not render Mission Control');

console.log('codex journal protocol ok');
