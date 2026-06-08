import assert from 'node:assert/strict';
import { buildPreviewFallbackHtml } from './src/services/preview-fallback.ts';

const todoFallback = buildPreviewFallbackHtml({
  projectName: 'Mini todo',
  prompt: 'cree une vraie todo app web avec ajout de tache, suppression, filtres active completed, compteur, etat vide',
  files: [
    {
      path: 'src/App.tsx',
      content: 'export default function App(){ return <main>todo active completed filters delete add counter</main> }',
    },
  ],
});

assert.match(todoFallback, /data-huggy-preview-fallback="true"/);
assert.match(todoFallback, /Mini todo/);
assert.match(todoFallback, /Add a task/);
assert.match(todoFallback, /Completed/);
assert.doesNotMatch(todoFallback, /<script/i);

const genericFallback = buildPreviewFallbackHtml({
  projectName: 'Client portal',
  prompt: 'build a responsive client portal',
  files: [{ path: 'src/App.tsx', content: 'export default function App(){ return <main>portal</main> }' }],
});

assert.match(genericFallback, /Client portal/);
assert.match(genericFallback, /Responsive UI/);
assert.doesNotMatch(genericFallback, /<script/i);

const timerFallback = buildPreviewFallbackHtml({
  projectName: 'Mini Pomodoro',
  prompt: 'genere une mini app de pomodero avec start pause reset',
  files: [{ path: 'src/App.tsx', content: 'export default function App(){ return <main>Pomodoro focus timer work short break long break</main> }' }],
});

assert.match(timerFallback, /Pomodoro timer|Mini Pomodoro/);
assert.match(timerFallback, /25:00/);
assert.match(timerFallback, /Short break/);
assert.doesNotMatch(timerFallback, /Add a task/);
assert.doesNotMatch(timerFallback, /View products/);

console.log('test-preview-fallback passed');
