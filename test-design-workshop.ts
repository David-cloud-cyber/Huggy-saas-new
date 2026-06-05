import assert from 'node:assert/strict';
import {
  designWorkshopInstructionLines,
  designWorkshopOptionLabel,
  designWorkshopSummary,
  normalizeDesignWorkshopSettings,
} from './src/services/design-workshop.ts';

const defaults = normalizeDesignWorkshopSettings({});
assert.equal(defaults.action, 'autopilot');
assert.equal(defaults.scope, 'focused');
assert.equal(defaults.target, 'auto');
assert.equal(defaults.direction, 'auto');
assert.equal(designWorkshopOptionLabel('action', defaults.action), 'Autopilot');
assert.ok(designWorkshopSummary(defaults).includes('Autopilot'));

const antiAiMobile = normalizeDesignWorkshopSettings({
  action: 'anti_ai',
  scope: 'section',
  target: 'mobile',
  direction: 'soft_saas',
});
const antiAiLines = designWorkshopInstructionLines(antiAiMobile).join('\n');
assert.ok(antiAiLines.includes('generic AI patterns'));
assert.ok(antiAiLines.includes('mobile usability'));
assert.ok(antiAiLines.includes('Soft SaaS'));

const audit = normalizeDesignWorkshopSettings({ action: 'audit', scope: 'app' });
const auditLines = designWorkshopInstructionLines(audit).join('\n');
assert.ok(auditLines.includes('do not modify files'));
assert.ok(auditLines.includes('harmonizing visual tokens'));

const invalid = normalizeDesignWorkshopSettings({
  action: 'delete_database',
  scope: 'billing',
  target: 'server',
  direction: 'cyber_noise',
});
assert.deepEqual(invalid, defaults);

console.log('test-design-workshop passed');
