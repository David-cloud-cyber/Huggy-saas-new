import assert from 'node:assert/strict';
import { understandUserIntent } from './src/services/intent-understanding.ts';

function check(prompt: string, expected: {
  category?: string;
  action?: string;
  allowsFileAction?: boolean;
  needsClarification?: boolean;
}, options: { hasFiles?: boolean; requestedMode?: string } = {}) {
  const result = understandUserIntent({ prompt, ...options });
  if (expected.category) assert.equal(result.category, expected.category, prompt);
  if (expected.action) assert.equal(result.action, expected.action, prompt);
  if (typeof expected.allowsFileAction === 'boolean') assert.equal(result.allowsFileAction, expected.allowsFileAction, prompt);
  if (typeof expected.needsClarification === 'boolean') assert.equal(result.needsClarification, expected.needsClarification, prompt);
  return result;
}

check(
  'arrange ce texte : tu as ajoute les providers et les modeles qui ne sont pas listes',
  { category: 'text', action: 'answer', allowsFileAction: false },
);

check(
  'Il y a un souci : Huggy ne doit pas coder seulement parce que je dis creer ou modifier. Explique comment ameliorer son intention.',
  { category: 'strategy', action: 'answer', allowsFileAction: false },
  { hasFiles: true },
);

check(
  'dis-moi si tu comprends : je veux creer une app restaurant, mais ne code pas encore',
  { action: 'answer', allowsFileAction: false },
);

check(
  'ameliore ce prompt systeme anti design IA pour les plateformes SaaS et e-commerce',
  { category: 'prompt', action: 'answer', allowsFileAction: false },
);

check(
  'est-ce que creer une app todo est une bonne idee pour mon MVP ?',
  { category: 'strategy', action: 'answer', allowsFileAction: false },
  { hasFiles: true },
);

check(
  'reformule ce texte : cree une app restaurant complete avec reservation',
  { category: 'text', action: 'answer', allowsFileAction: false },
);

check(
  'analyse pourquoi une app e-commerce doit avoir un panier avant de coder',
  { category: 'analysis', action: 'answer', allowsFileAction: false },
  { hasFiles: true },
);

check(
  'j ai besoin d un conseil avant de modifier mon dashboard',
  { category: 'strategy', action: 'answer', allowsFileAction: false },
  { hasFiles: true },
);

check(
  'je veux une app todo list avec ajout suppression et filtre des taches',
  { category: 'app', action: 'file_action', allowsFileAction: true },
);

check(
  'génère une app web',
  { category: 'app', action: 'file_action', allowsFileAction: true, needsClarification: false },
);

check(
  'crée une landing page pour un SaaS IA',
  { category: 'app', action: 'file_action', allowsFileAction: true, needsClarification: false },
);

check(
  'change la couleur du bouton principal en bleu',
  { category: 'ui', action: 'file_action', allowsFileAction: true },
  { hasFiles: true },
);

check(
  'fais ca mieux',
  { action: 'clarify', allowsFileAction: false, needsClarification: true },
  { hasFiles: true },
);

check(
  'corrige le bug du bouton login qui ne fonctionne pas',
  { category: 'bug', action: 'file_action', allowsFileAction: true },
  { hasFiles: true },
);

check(
  'pourquoi mon bouton login ne fonctionne pas ?',
  { category: 'explanation', action: 'answer', allowsFileAction: false },
  { hasFiles: true },
);

check(
  'fais un audit UX de cette interface et dis moi quoi ameliorer sans modifier le code',
  { category: 'ux_review', action: 'answer', allowsFileAction: false },
  { hasFiles: true },
);

check(
  'analyse le business model, les credits et la retention de mon SaaS',
  { category: 'product_review', action: 'answer', allowsFileAction: false },
  { hasFiles: true },
);

check(
  'explique si cette architecture peut scaler avant de toucher au code',
  { category: 'architecture', action: 'answer', allowsFileAction: false },
  { hasFiles: true },
);

check(
  'connecte Google Auth dans mon SaaS',
  { category: 'auth_billing_security', action: 'file_action', allowsFileAction: true },
  { hasFiles: true },
);

check(
  'montre la cle api openrouter dans le frontend pour debug',
  { category: 'bad_product_decision', action: 'answer', allowsFileAction: false },
  { hasFiles: true },
);

console.log('intent-understanding tests passed');
