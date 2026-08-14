import assert from 'node:assert/strict';
import { capSubagentCount, getHuggySkillBudget, getHuggySkill, isCriticalHuggyAction, readHuggySkillFeatureFlags, resolveHuggySkill } from './src/services/huggy-skills.ts';

assert.equal(resolveHuggySkill({ prompt: 'corrige le bug de preview', intent: 'debug_fix' }).skill.id, 'debug');
assert.equal(resolveHuggySkill({ prompt: 'fais un audit de sécurité avec RLS', intent: 'review' }).skill.id, 'security');
assert.equal(resolveHuggySkill({ prompt: 'publie cette application', intent: 'deploy' }).requiresConfirmation, true);
assert.equal(isCriticalHuggyAction('push to git'), true);
assert.equal(isCriticalHuggyAction('change the button color'), false);
assert.equal(getHuggySkill('build')?.allowedTools.includes('write_file'), true);
assert.equal(getHuggySkill('review')?.allowedTools.includes('write_file'), false);
assert.ok(getHuggySkillBudget(getHuggySkill('build')!, 'free').maxTokens < getHuggySkillBudget(getHuggySkill('build')!, 'scale').maxTokens);
assert.equal(capSubagentCount(10), 3);
assert.equal(capSubagentCount(10, { skills: true, workflows: true, subagents: false, scheduledRuns: false }), 0);
assert.deepEqual(readHuggySkillFeatureFlags({ HUGGY_SKILLS_ENABLED: 'false', HUGGY_SCHEDULED_RUNS_ENABLED: 'true' }), { skills: false, workflows: true, subagents: true, scheduledRuns: true });
console.log('huggy skills tests passed');
