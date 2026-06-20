import assert from 'node:assert/strict';
import { runBuildFixLoop, type AutoFixFile } from './src/services/build-error-autofix.ts';

const files: AutoFixFile[] = [{ path: 'src/App.tsx', content: 'export default function App(){return null}' }];
const TSC_ERROR = "src/App.tsx(1,1): error TS2304: Cannot find name 'foo'.";

// 1. Early success on the first build → regenerate never called, ok after 1 iteration.
{
  let regenCalls = 0;
  const res = await runBuildFixLoop({
    files,
    runBuild: () => ({ ok: true, output: '' }),
    regenerate: (f) => { regenCalls++; return f; },
  });
  assert.equal(res.ok, true);
  assert.equal(res.iterations, 1);
  assert.equal(regenCalls, 0, 'must not repatch when the first build already passes');
  assert.equal(res.blocker, undefined);
}

// 2. Fails twice, then passes → ok after 3 iterations, 2 repatches.
{
  let build = 0;
  let regenCalls = 0;
  const res = await runBuildFixLoop({
    files,
    runBuild: () => { build++; return build <= 2 ? { ok: false, output: TSC_ERROR } : { ok: true, output: '' }; },
    regenerate: (f) => { regenCalls++; return f; },
  });
  assert.equal(res.ok, true);
  assert.equal(res.iterations, 3);
  assert.equal(regenCalls, 2);
}

// 3. Always fails → ok:false after the 4 capped iterations, recoverable draft + concise blocker.
{
  let regenCalls = 0;
  const draft: AutoFixFile[] = [{ path: 'src/App.tsx', content: 'patched draft' }];
  const res = await runBuildFixLoop({
    files,
    runBuild: () => ({ ok: false, output: TSC_ERROR }),
    regenerate: () => { regenCalls++; return draft; },
  });
  assert.equal(res.ok, false);
  assert.equal(res.iterations, 4, 'must cap at 4 iterations');
  assert.equal(regenCalls, 3, 'repatches between attempts only (not after the last)');
  assert.deepEqual(res.files, draft, 'returns the last files as a recoverable draft');
  assert.match(res.blocker || '', /after 4 auto-fix attempts/);
  assert.match(res.blocker || '', /TS2304/);
  // No fake success and no secret leakage in the blocker.
  assert.doesNotMatch(res.blocker || '', /service_role|sk-|OPENROUTER/i);
}

// 4. maxIterations is clamped to [1,4].
{
  let build = 0;
  const res = await runBuildFixLoop({
    files,
    runBuild: () => { build++; return { ok: false, output: TSC_ERROR }; },
    regenerate: (f) => f,
    maxIterations: 99,
  });
  assert.equal(res.iterations, 4, 'maxIterations must clamp to 4');
}

console.log('test-autofix-loop passed');
