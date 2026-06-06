import type { IntentUnderstanding, UserIntentCategory } from './intent-understanding.ts';

export type TypedPrimaryIntent =
  | 'CHAT'
  | 'DISCUSS_FIRST'
  | 'PLAN_ONLY'
  | 'BUILD'
  | 'EDIT'
  | 'DEBUG'
  | 'VERIFY'
  | 'CRITICAL_ACTION'
  | 'BLOCKED';

export type TypedExecutionStrategy =
  | 'ANSWER_ONLY'
  | 'WAIT_FOR_USER_CONFIRMATION'
  | 'PLAN_ONLY'
  | 'RUN_AGENT'
  | 'RUN_DEBUG_LOOP'
  | 'RUN_VERIFICATION'
  | 'SHOW_PLATFORM_TOOL'
  | 'VENT_TO_USER';

export type TypedInfrastructureNeed =
  | 'NONE'
  | 'SUPABASE'
  | 'AUTH'
  | 'DATABASE'
  | 'STORAGE'
  | 'STRIPE'
  | 'EDGE_FUNCTIONS'
  | 'VERCEL'
  | 'GITHUB'
  | 'DOMAIN'
  | 'MEDIA';

export type TypedIntentDecision = {
  primary_intent: TypedPrimaryIntent;
  intent_category: UserIntentCategory;
  requires_code_changes: boolean;
  requires_preview: boolean;
  requires_runner: boolean;
  target_files: string[];
  infrastructure_needed: TypedInfrastructureNeed[];
  execution_strategy: TypedExecutionStrategy;
  confidence: number;
  reason: string;
  user_visible_reason: string;
  clarification?: {
    question: string;
    choices: string[];
    recommendation: string;
  };
};

type BaseIntent = {
  intent: string;
  confidence: number;
  requiresFileChanges: boolean;
  requiresPreviewRebuild: boolean;
  userVisibleReason?: string;
  intentUnderstanding?: Pick<IntentUnderstanding, 'category' | 'action' | 'confidence' | 'allowsFileAction' | 'needsClarification' | 'reason' | 'signals'>;
};

type BuildInput = {
  prompt: string;
  hasFiles?: boolean;
  requestedMode?: string;
  decision: BaseIntent;
};

function normalize(value: string) {
  return repairCommonEncodingBreaks(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function repairCommonEncodingBreaks(value: string) {
  return String(value || '')
    .replace(/cr\uFFFDer/gi, match => match[0] === 'C' ? 'Creer' : 'creer')
    .replace(/cr\uFFFDe/gi, match => match[0] === 'C' ? 'Cree' : 'cree')
    .replace(/g\uFFFDn\uFFFDrer/gi, match => match[0] === 'G' ? 'Generer' : 'generer')
    .replace(/g\uFFFDn\uFFFDr?e/gi, match => match[0] === 'G' ? 'Genere' : 'genere')
    .replace(/t\uFFFDches/gi, match => match[0] === 'T' ? 'Taches' : 'taches')
    .replace(/t\uFFFDche/gi, match => match[0] === 'T' ? 'Tache' : 'tache')
    .replace(/\uFFFDtats/gi, 'etats')
    .replace(/\uFFFDtat/gi, 'etat')
    .replace(/r\uFFFDponses/gi, 'reponses')
    .replace(/r\uFFFDponse/gi, 'reponse')
    .replace(/\uFFFD/g, 'e');
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function clampConfidence(value: unknown, fallback = 0.8) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0.5, Math.min(0.99, numeric));
}

function includesAny(text: string, hints: string[]) {
  return hints.some(hint => text.includes(hint));
}

function isFrench(text: string) {
  return /\b(le|la|les|un|une|des|je|tu|vous|mon|ma|mes|dans|avec|pour|corrige|cree|genere|publie)\b/i.test(text);
}

function isDiscussFirst(text: string) {
  return includesAny(text, [
    'dis moi d abord',
    'dis-moi d abord',
    'explique d abord',
    'avant de coder',
    'avant de modifier',
    'avant de generer',
    'mais dis moi d abord',
    'mais dis-moi d abord',
    'demande moi avant',
    'confirme avant',
    'dois je',
    'devrais je',
    'is it a good idea',
    'should i',
  ]);
}

function isCriticalPlatformAction(text: string) {
  return /\b(publie|publier|publish|deploie|deployer|deploy|rollback|restaure|restore|delete project|supprime le projet|reset database|supprime la base|apply migration|applique la migration|custom domain|domaine|billing|stripe live|production)\b/i.test(text);
}

function infrastructureFor(text: string): TypedInfrastructureNeed[] {
  const needs: TypedInfrastructureNeed[] = [];
  if (/\b(supabase|postgres|sql|rls|policy|policies|database|base de donnees|crud|table)\b/i.test(text)) needs.push('SUPABASE', 'DATABASE');
  if (/\b(auth|login|signup|oauth|google auth|session|role|permission)\b/i.test(text)) needs.push('AUTH');
  if (/\b(storage|upload|fichier|image|video|media|bucket)\b/i.test(text)) needs.push('STORAGE');
  if (/\b(stripe|checkout|subscription|abonnement|payment|paiement|invoice|billing)\b/i.test(text)) needs.push('STRIPE');
  if (/\b(api|endpoint|edge function|webhook|server action)\b/i.test(text)) needs.push('EDGE_FUNCTIONS');
  if (/\b(publish|publie|deploy|deploie|vercel|production)\b/i.test(text)) needs.push('VERCEL');
  if (/\b(github|repo|repository|pull request|commit)\b/i.test(text)) needs.push('GITHUB');
  if (/\b(domain|domaine|dns|custom domain)\b/i.test(text)) needs.push('DOMAIN');
  if (/\b(media|image|video|ugc|ad creative|publicite|pub)\b/i.test(text)) needs.push('MEDIA');
  return unique(needs.length ? needs : ['NONE']);
}

function targetFilesFor(text: string, category: UserIntentCategory): string[] {
  const files: string[] = [];
  if (/\b(app|application|todo|dashboard|landing|page|component|composant|ui|design|button|bouton|formulaire|form)\b/i.test(text)) {
    files.push('src/App.tsx', 'src/index.css');
  }
  if (/\b(vite|entrypoint|main tsx|index html|preview blanche|blank preview)\b/i.test(text)) {
    files.push('index.html', 'src/main.tsx', 'src/App.tsx');
  }
  if (/\b(auth|login|signup|supabase|database|rls|schema|migration)\b/i.test(text)) {
    files.push('supabase/schema.sql', 'src/lib/supabase.ts', 'src/lib/validation.ts');
  }
  if (/\b(stripe|billing|checkout|subscription|webhook)\b/i.test(text)) {
    files.push('src/lib/validation.ts', 'supabase/schema.sql');
  }
  if (category === 'prompt' || category === 'strategy' || category === 'explanation') return [];
  return unique(files).slice(0, 8);
}

function primaryIntentFor(decision: BaseIntent, promptText: string): TypedPrimaryIntent {
  if (isCriticalPlatformAction(promptText)) return 'CRITICAL_ACTION';
  if (isDiscussFirst(promptText)) return 'DISCUSS_FIRST';
  if (decision.intent === 'conversation') return 'CHAT';
  if (decision.intent === 'clarification_required') return 'DISCUSS_FIRST';
  if (decision.intent === 'plan') return 'PLAN_ONLY';
  if (decision.intent === 'debug_fix') return 'DEBUG';
  if (decision.intent === 'verify') return 'VERIFY';
  if (decision.intent === 'build') return 'BUILD';
  if (decision.intent === 'edit') return 'EDIT';
  if (decision.intent === 'deploy_assist') return 'CRITICAL_ACTION';
  if (decision.intent === 'external_keys_required' || decision.intent === 'credits_required') return 'BLOCKED';
  return decision.requiresFileChanges ? 'EDIT' : 'CHAT';
}

function strategyFor(primary: TypedPrimaryIntent): TypedExecutionStrategy {
  if (primary === 'CHAT') return 'ANSWER_ONLY';
  if (primary === 'DISCUSS_FIRST') return 'WAIT_FOR_USER_CONFIRMATION';
  if (primary === 'PLAN_ONLY') return 'PLAN_ONLY';
  if (primary === 'DEBUG') return 'RUN_DEBUG_LOOP';
  if (primary === 'VERIFY') return 'RUN_VERIFICATION';
  if (primary === 'CRITICAL_ACTION') return 'WAIT_FOR_USER_CONFIRMATION';
  if (primary === 'BLOCKED') return 'VENT_TO_USER';
  return 'RUN_AGENT';
}

function requiresCode(primary: TypedPrimaryIntent, decision: BaseIntent) {
  if (primary === 'BUILD' || primary === 'EDIT' || primary === 'DEBUG') return true;
  if (primary === 'DISCUSS_FIRST' || primary === 'CRITICAL_ACTION' || primary === 'CHAT' || primary === 'PLAN_ONLY' || primary === 'VERIFY' || primary === 'BLOCKED') return false;
  return Boolean(decision.requiresFileChanges);
}

function clarificationFor(primary: TypedPrimaryIntent, prompt: string): TypedIntentDecision['clarification'] | undefined {
  const fr = isFrench(prompt);
  if (primary === 'CRITICAL_ACTION') {
    return {
      question: fr ? 'Confirme-tu cette action sensible avant que Huggy continue ?' : 'Do you confirm this sensitive action before Huggy continues?',
      choices: fr ? ['Confirmer', 'Annuler', 'Expliquer avant'] : ['Confirm', 'Cancel', 'Explain first'],
      recommendation: fr ? 'Confirme seulement si tu veux vraiment publier, restaurer, supprimer, modifier le domaine ou toucher au billing.' : 'Confirm only if you really want to publish, restore, delete, change domain, or touch billing.',
    };
  }
  if (primary === 'DISCUSS_FIRST') {
    return undefined;
  }
  if (primary === 'BLOCKED') {
    return {
      question: fr ? 'Il manque une condition pour continuer. Veux-tu corriger ce blocage ?' : 'A required condition is missing. Do you want to fix it?',
      choices: fr ? ['Configurer', 'Changer de demande', 'Annuler'] : ['Configure', 'Change request', 'Cancel'],
      recommendation: fr ? 'Je bloque proprement au lieu de livrer une fausse réussite.' : 'I should block cleanly instead of pretending success.',
    };
  }
  return undefined;
}

export function buildTypedIntentDecision(input: BuildInput): TypedIntentDecision {
  const prompt = String(input.prompt || '');
  const text = normalize(prompt);
  const category = input.decision.intentUnderstanding?.category || 'other';
  const primary = primaryIntentFor(input.decision, text);
  const code = requiresCode(primary, input.decision);
  const infrastructure: TypedInfrastructureNeed[] = code ? infrastructureFor(text) : ['NONE'];
  const targets = code ? targetFilesFor(text, category) : [];
  const confidence = clampConfidence(
    primary === 'DISCUSS_FIRST' || primary === 'CRITICAL_ACTION'
      ? Math.min(input.decision.confidence, 0.9)
      : input.decision.confidence,
    0.8,
  );
  const reason = input.decision.intentUnderstanding?.reason || input.decision.userVisibleReason || 'typed_intent_decision';
  return {
    primary_intent: primary,
    intent_category: category,
    requires_code_changes: code,
    requires_preview: code,
    requires_runner: primary === 'BUILD' || primary === 'EDIT' || primary === 'DEBUG' || primary === 'VERIFY',
    target_files: targets,
    infrastructure_needed: infrastructure,
    execution_strategy: strategyFor(primary),
    confidence,
    reason,
    user_visible_reason: userVisibleReasonFor(primary, prompt, input.decision.userVisibleReason || reason),
    clarification: clarificationFor(primary, prompt),
  };
}

function userVisibleReasonFor(primary: TypedPrimaryIntent, prompt: string, fallback: string) {
  const fr = isFrench(prompt);
  if (primary === 'CHAT') return fr ? 'Huggy répond sans modifier le projet.' : 'Huggy will answer without changing the project.';
  if (primary === 'DISCUSS_FIRST') return fr ? 'Huggy discute d’abord et attend confirmation avant de coder.' : 'Huggy will discuss first and wait for confirmation before coding.';
  if (primary === 'PLAN_ONLY') return fr ? 'Huggy prépare un plan sans toucher aux fichiers.' : 'Huggy will prepare a plan without touching files.';
  if (primary === 'BUILD') return fr ? 'Huggy va créer une vraie application et vérifier la preview.' : 'Huggy will create a real app and verify the preview.';
  if (primary === 'EDIT') return fr ? 'Huggy va modifier les fichiers ciblés et vérifier la preview.' : 'Huggy will edit targeted files and verify the preview.';
  if (primary === 'DEBUG') return fr ? 'Huggy va diagnostiquer, corriger, retester et sauvegarder.' : 'Huggy will diagnose, fix, retest, and save.';
  if (primary === 'VERIFY') return fr ? 'Huggy vérifie sans modifier tant qu’un blocage n’est pas confirmé.' : 'Huggy will verify without changing files unless a blocking fix is confirmed.';
  if (primary === 'CRITICAL_ACTION') return fr ? 'Huggy demande confirmation avant cette action sensible.' : 'Huggy will ask confirmation before this sensitive action.';
  if (primary === 'BLOCKED') return fr ? 'Huggy s’arrête et explique le blocage utilement.' : 'Huggy will stop and explain the blocker clearly.';
  return fallback;
}

export function applyTypedIntentGate<TDecision extends BaseIntent & {
  intent: string;
  requiresFileChanges: boolean;
  requiresPreviewRebuild: boolean;
  requiresCredits: boolean;
  nextAction?: string;
  autoPlanRequired?: boolean;
  selectedModelPolicy?: string;
  routingSource?: string;
  clarification?: { question: string; choices: string[]; recommendation: string };
}>(decision: TDecision, typed: TypedIntentDecision): TDecision {
  if (typed.execution_strategy === 'ANSWER_ONLY') {
    return {
      ...decision,
      intent: 'conversation',
      requiresFileChanges: false,
      requiresPreviewRebuild: false,
      requiresCredits: decision.requiresCredits && typed.intent_category !== 'other',
      nextAction: 'answer',
      autoPlanRequired: false,
      selectedModelPolicy: decision.selectedModelPolicy || 'economy',
      routingSource: decision.routingSource || 'heuristic',
      userVisibleReason: typed.user_visible_reason,
    };
  }
  if (typed.execution_strategy === 'WAIT_FOR_USER_CONFIRMATION') {
    if (typed.primary_intent === 'DISCUSS_FIRST') {
      return {
        ...decision,
        intent: 'conversation',
        requiresFileChanges: false,
        requiresPreviewRebuild: false,
        requiresCredits: decision.requiresCredits && typed.intent_category !== 'other',
        nextAction: 'answer',
        autoPlanRequired: false,
        selectedModelPolicy: decision.selectedModelPolicy || 'economy',
        routingSource: decision.routingSource || 'heuristic',
        userVisibleReason: typed.user_visible_reason,
      };
    }
    return {
      ...decision,
      intent: 'clarification_required',
      requiresFileChanges: false,
      requiresPreviewRebuild: false,
      requiresCredits: false,
      nextAction: 'ask_clarification',
      autoPlanRequired: false,
      routingSource: decision.routingSource || 'heuristic',
      userVisibleReason: typed.user_visible_reason,
      clarification: typed.clarification || decision.clarification,
    };
  }
  if (typed.execution_strategy === 'PLAN_ONLY') {
    return {
      ...decision,
      intent: 'plan',
      requiresFileChanges: false,
      requiresPreviewRebuild: false,
      requiresCredits: true,
      nextAction: 'plan_only',
      autoPlanRequired: false,
      userVisibleReason: typed.user_visible_reason,
    };
  }
  if (typed.execution_strategy === 'RUN_VERIFICATION') {
    return {
      ...decision,
      intent: 'verify',
      requiresFileChanges: false,
      requiresPreviewRebuild: false,
      requiresCredits: false,
      nextAction: 'verify',
      userVisibleReason: typed.user_visible_reason,
    };
  }
  if (typed.execution_strategy === 'VENT_TO_USER') {
    return {
      ...decision,
      intent: 'clarification_required',
      requiresFileChanges: false,
      requiresPreviewRebuild: false,
      requiresCredits: false,
      nextAction: 'ask_clarification',
      autoPlanRequired: false,
      userVisibleReason: typed.user_visible_reason,
      clarification: typed.clarification || decision.clarification,
    };
  }
  return {
    ...decision,
    requiresFileChanges: typed.requires_code_changes,
    requiresPreviewRebuild: typed.requires_preview,
    userVisibleReason: typed.user_visible_reason,
  };
}
