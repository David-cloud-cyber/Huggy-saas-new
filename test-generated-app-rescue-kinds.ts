import assert from 'node:assert/strict';
import {
  createGeneratedRescueAppTsx,
  inferGeneratedRescueAppKind,
} from './src/services/generated-app-rescue.ts';

// New kinds must be detected and generate REAL functional templates,
// not the generic "Intake / Review / Launch" placeholder.

// Calculator — THE bug from the screenshot.
assert.equal(inferGeneratedRescueAppKind('cree une calculatrice'), 'calculator');
assert.equal(inferGeneratedRescueAppKind('build a calculator'), 'calculator');
const calc = createGeneratedRescueAppTsx({ projectName: 'cree une calculatrice', prompt: 'cree une calculatrice' });
// Must not be the generic Intake/Review/Launch placeholder.
assert.ok(!/Intake/.test(calc), 'calculator output must not contain Intake placeholder');
assert.ok(!/This section is interactive/.test(calc), 'calculator must not contain the placeholder copy');
// Must look like a real calculator — has digit buttons and operations.
assert.match(calc, /inputDigit/);
assert.match(calc, /applyOp/);
assert.match(calc, /equals/);
assert.match(calc, /clearAll/);

// Notes
assert.equal(inferGeneratedRescueAppKind('cree une app de notes'), 'notes');
assert.equal(inferGeneratedRescueAppKind('a note taking app'), 'notes');
const notes = createGeneratedRescueAppTsx({ prompt: 'cree une app de notes' });
assert.ok(!/Intake/.test(notes));
assert.match(notes, /localStorage/);
assert.match(notes, /addNote/);

// Quiz
assert.equal(inferGeneratedRescueAppKind('un quiz QCM'), 'quiz');
const quiz = createGeneratedRescueAppTsx({ prompt: 'un quiz' });
assert.ok(!/Intake/.test(quiz));
assert.match(quiz, /QUESTIONS/);
assert.match(quiz, /score/);

// Weather
assert.equal(inferGeneratedRescueAppKind('application meteo'), 'weather');
const weather = createGeneratedRescueAppTsx({ prompt: 'app meteo' });
assert.ok(!/Intake/.test(weather));
assert.match(weather, /open-meteo/);

// Chat
assert.equal(inferGeneratedRescueAppKind('a chat room'), 'chat');
const chat = createGeneratedRescueAppTsx({ prompt: 'chat room' });
assert.ok(!/Intake/.test(chat));
assert.match(chat, /messages/);
assert.match(chat, /send/);

// Backward-compat: known kinds still detected.
assert.equal(inferGeneratedRescueAppKind('todo list'), 'todo');
assert.equal(inferGeneratedRescueAppKind('pomodoro timer'), 'timer');
assert.equal(inferGeneratedRescueAppKind('an ecommerce shop'), 'commerce');

// Truly unknown prompt still falls back to generic (kept for safety).
assert.equal(inferGeneratedRescueAppKind('fhqwhgads xyzzy unknown thing'), 'generic');

console.log('test-generated-app-rescue-kinds passed');
