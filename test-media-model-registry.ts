import assert from 'node:assert/strict';
import {
  estimateMediaCredits,
  isMarketingMediaKind,
  mediaOutputForKind,
  mediaSettingsSummary,
  normalizeMediaSettings,
  selectMediaModel,
} from './src/services/media-model-registry.ts';

const defaults = normalizeMediaSettings({});
assert.equal(defaults.kind, 'launch_kit');
assert.equal(mediaOutputForKind(defaults.kind), 'marketing_kit');
assert.equal(isMarketingMediaKind(defaults.kind), true);

const kitModel = selectMediaModel(defaults, 'free');
assert.equal(kitModel.id, 'huggy/media-kit');
assert.equal(kitModel.output, 'marketing_kit');
assert.equal(kitModel.minPlan, 'free');
assert.equal(estimateMediaCredits(defaults, kitModel), 6);

const onePager = normalizeMediaSettings({ kind: 'pitch_one_pager', modelPreference: 'best_quality' });
const onePagerModel = selectMediaModel(onePager, 'free');
assert.equal(onePagerModel.id, 'huggy/media-kit');
assert.equal(estimateMediaCredits(onePager, onePagerModel), 10);
assert.ok(mediaSettingsSummary(onePager).includes('Pitch / one-pager'));

const video = normalizeMediaSettings({ kind: 'ugc', duration: '8s', modelPreference: 'fast' });
const videoModel = selectMediaModel(video, 'free');
assert.notEqual(videoModel.output, 'marketing_kit');
assert.equal(videoModel.output, 'video');
assert.ok(estimateMediaCredits(video, videoModel) > 6);

console.log('test-media-model-registry passed');
