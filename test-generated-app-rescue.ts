import assert from 'node:assert/strict';
import ts from 'typescript';
import {
  createGeneratedRescueAppTsx,
  extractActionablePromptText,
  inferGeneratedRescueAppKind,
} from './src/services/generated-app-rescue.ts';

function assertParsesAsTsx(app: string, prompt: string) {
  const result = ts.transpileModule(app, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
    fileName: 'src/App.tsx',
  });
  const errors = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.equal(
    errors.length,
    0,
    `${prompt} generated invalid TSX: ${errors.map((diagnostic) => diagnostic.messageText).join(', ')}`,
  );
}

function assertInteractiveApp(prompt: string, expected: string, checks: string[]) {
  const kind = inferGeneratedRescueAppKind({ projectName: 'Test project', prompt });
  assert.equal(kind, expected);

  const app = createGeneratedRescueAppTsx({ projectName: 'Test project', prompt });
  assertParsesAsTsx(app, prompt);
  assert.match(app, /export default function App/);
  assert.match(app, /useState/);
  assert.match(app, /onClick|onSubmit|onChange/);
  assert.doesNotMatch(app, /__HUGGY_FORCE_ERROR__|data-huggy-runtime-error|window\.alert\("Primary action ready\."\)/);

  for (const check of checks) {
    assert.match(app, new RegExp(check, 'i'), `${prompt} should include ${check}`);
  }
}

assertInteractiveApp('cree une todo app avec ajout suppression filtre et localStorage', 'todo', [
  'localStorage',
  'setTodos',
  'completed',
  'Delete',
]);

assertInteractiveApp('genere une mini app de pomodoro avec start pause reset', 'timer', [
  '25 \\* 60',
  'setSeconds',
  'Start',
  'Pause',
]);

assertInteractiveApp('genere une mini app de pomodero', 'timer', [
  '25 \\* 60',
  'setSeconds',
  'Start',
  'Pause',
]);

assertInteractiveApp('create an ecommerce store with cart quantity and checkout', 'commerce', [
  'cart',
  'quantity',
  'checkout',
  'setCart',
]);

assertInteractiveApp('build a booking app with reservations and slots', 'booking', [
  'bookings',
  'onSubmit',
  'setBookings',
  'Booking confirmed',
]);

assertInteractiveApp('create a CRM dashboard with filters and KPIs', 'dashboard', [
  'Dashboard loaded',
  'filter',
  'Revenue',
  'setFeedback',
]);

const pollutedBudgetPrompt = [
  '{"plan":{"title":"Plan de création de l application Budget Pulse","steps":[{"phase":"1. Modélisation et Persistance","details":"Définir l interface TypeScript pour les transactions"}]},"message":"Bonjour ! Voici le plan."}',
  'Build request: Crée une application web complète de suivi de budget personnel avec ajout recette ou dépense, suppression avec confirmation, filtres, solde, totaux et sauvegarde localStorage.',
].join(' ');
assert.equal(inferGeneratedRescueAppKind({ projectName: 'Budget Pulse Smoke Test', prompt: pollutedBudgetPrompt }), 'finance');
assert.match(extractActionablePromptText(pollutedBudgetPrompt), /^Crée une application web complète de suivi de budget personnel/i);
{
  const app = createGeneratedRescueAppTsx({ projectName: 'Budget Pulse Smoke Test', prompt: pollutedBudgetPrompt });
  assertParsesAsTsx(app, pollutedBudgetPrompt);
  assert.match(app, /Transaction/);
  assert.match(app, /localStorage/);
  assert.match(app, /deleteTransaction/);
  assert.match(app, /currency/);
  assert.doesNotMatch(app, /"plan"|Build request|Voici le plan|Modélisation et Persistance/);
}

assertInteractiveApp('make an AI prompt generator with history', 'ai_tool', [
  'prompt',
  'history',
  'generate',
  'Copy result',
]);

assertInteractiveApp('create a restaurant menu with reservation', 'restaurant', [
  'menu',
  'reserve',
  'category',
  'Table reserved',
]);

assertInteractiveApp('build a portfolio landing with contact and projects', 'portfolio', [
  'addItem',
  'feedback',
  'Reset',
  'workflow',
]);

assertInteractiveApp('create a custom workflow app for studio operations', 'generic', [
  'addItem',
  'setActive',
  'feedback',
  'Reset',
]);

console.log('PASS: generated app rescue creates interactive fallback apps.');
