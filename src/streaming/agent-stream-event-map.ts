export type StreamPhaseId =
  | 'understanding'
  | 'context'
  | 'planning'
  | 'research'
  | 'building'
  | 'files'
  | 'preview'
  | 'checks'
  | 'visual_check'
  | 'recovery'
  | 'quality'
  | 'memory'
  | 'done'
  | 'failed';

export type StreamEventMapping = {
  phase: StreamPhaseId;
  label: string;
  detail: string;
  terminal?: 'done' | 'failed' | 'cancelled';
};

const EVENT_PHASES: Record<string, StreamEventMapping> = {
  queued: {
    phase: 'understanding',
    label: 'Mission recue',
    detail: 'Je prepare l espace avant toute action.',
  },
  routing: {
    phase: 'understanding',
    label: 'Mission comprise',
    detail: 'Je choisis si je dois repondre, planifier, corriger ou construire.',
  },
  run_started: {
    phase: 'understanding',
    label: 'Mission recue',
    detail: 'Je comprends le resultat attendu avant de toucher au projet.',
  },
  agent_thinking: {
    phase: 'understanding',
    label: 'Mission analysee',
    detail: 'Je choisis l action la plus sure pour ce message.',
  },
  intent_detected: {
    phase: 'understanding',
    label: 'Intention confirmee',
    detail: 'Je relie la demande au bon workflow.',
  },
  context_loaded: {
    phase: 'context',
    label: 'Contexte lu',
    detail: 'Je lis les fichiers utiles et je garde ce qui fonctionne deja.',
  },
  codebase_indexed: {
    phase: 'context',
    label: 'Projet inspecte',
    detail: 'Je repere routes, composants, donnees et zones sensibles.',
  },
  import_started: {
    phase: 'context',
    label: 'Import prepare',
    detail: 'Je transforme la source importee en contexte produit.',
  },
  import_analyzed: {
    phase: 'context',
    label: 'Import analyse',
    detail: 'Je detecte les etats, interactions et adaptations responsives manquantes.',
  },
  task_decomposed: {
    phase: 'planning',
    label: 'Agents organises',
    detail: 'J organise la mission en etapes courtes et verifiables.',
  },
  policy_checked: {
    phase: 'planning',
    label: 'Garde-fous poses',
    detail: 'Je fixe le scope, le rollback et les limites de securite.',
  },
  planning: {
    phase: 'planning',
    label: 'Plan de mission',
    detail: 'J organise les agents necessaires avant execution.',
  },
  plan_ready: {
    phase: 'planning',
    label: 'Plan verrouille',
    detail: 'Le plan sert de garde-fou pour la suite.',
  },
  clarification_required: {
    phase: 'planning',
    label: 'Clarification utile',
    detail: 'Je pose une question avant de modifier inutilement le projet.',
  },
  credits_insufficient: {
    phase: 'failed',
    label: 'Credits required',
    detail: 'The run is paused until the workspace has enough credits.',
    terminal: 'failed',
  },
  external_api_keys_required: {
    phase: 'failed',
    label: 'External keys needed',
    detail: 'Huggy needs approval or safe placeholders before continuing.',
    terminal: 'failed',
  },
  tool_loop_started: {
    phase: 'planning',
    label: 'Equipe preparee',
    detail: 'Je borne le travail des outils pour garder la mission controlee.',
  },
  research_started: {
    phase: 'research',
    label: 'Recherche ciblee',
    detail: 'Je verifie seulement le contexte recent ou externe utile.',
  },
  research_result: {
    phase: 'research',
    label: 'Source integree',
    detail: 'Je garde uniquement ce qui aide la mission.',
  },
  research_skipped: {
    phase: 'research',
    label: 'Recherche inutile',
    detail: 'Le contexte projet suffit pour continuer.',
  },
  model_started: {
    phase: 'building',
    label: 'Execution lancee',
    detail: 'Je prepare les fichiers sans exposer les details internes.',
  },
  model_streaming: {
    phase: 'building',
    label: 'Execution en cours',
    detail: 'Je recois les changements serveur utiles.',
  },
  build_started: {
    phase: 'building',
    label: 'Build de travail',
    detail: 'Je construis la preview sans changer l app publiee.',
  },
  building: {
    phase: 'building',
    label: 'Execution',
    detail: 'Je transforme la demande en fichiers utilisables.',
  },
  file_stream_started: {
    phase: 'files',
    label: 'Fichier cible',
    detail: 'Je prepare un fichier concerne par la mission.',
  },
  file_token: {
    phase: 'files',
    label: 'Fichier en cours',
    detail: 'Je modifie un vrai fichier du projet.',
  },
  file_stream_preview: {
    phase: 'files',
    label: 'Extrait fichier',
    detail: 'Je mets a jour un extrait public du fichier.',
  },
  file_stream_completed: {
    phase: 'files',
    label: 'Fichier pret',
    detail: 'Le fichier est recu et integre dans la mission.',
  },
  diff_ready: {
    phase: 'files',
    label: 'Diff pret',
    detail: 'Je resume les fichiers crees, modifies ou supprimes.',
  },
  files_changed: {
    phase: 'files',
    label: 'Fichiers integres',
    detail: 'Les changements sont appliques a la preview de travail.',
  },
  preview_skeleton_started: {
    phase: 'preview',
    label: 'Preview preparee',
    detail: 'La zone preview suit le vrai travail en cours.',
  },
  preview_building: {
    phase: 'preview',
    label: 'Preview reconstruite',
    detail: 'Je reconstruis le rendu sans toucher au live.',
  },
  preview_ready: {
    phase: 'preview',
    label: 'Preview prete',
    detail: 'La preview montre maintenant le dernier resultat.',
  },
  runner_started: {
    phase: 'checks',
    label: 'Tests lances',
    detail: 'Je teste le build, la preview et les erreurs bloquantes.',
  },
  runner_passed: {
    phase: 'checks',
    label: 'Tests passes',
    detail: 'Les controles critiques sont passes.',
  },
  runner_failed: {
    phase: 'checks',
    label: 'Test a corriger',
    detail: 'Je garde le probleme visible et prepare une correction ciblee.',
  },
  visual_inspection_started: {
    phase: 'visual_check',
    label: 'Critique visuelle',
    detail: 'Je critique les actions visibles et les etats essentiels.',
  },
  visual_inspection_passed: {
    phase: 'visual_check',
    label: 'UX validee',
    detail: 'Les controles principaux sont utilisables ou clairement limites.',
  },
  visual_inspection_failed: {
    phase: 'visual_check',
    label: 'UX a corriger',
    detail: 'Je ne valide pas une interface avec des controles casses.',
  },
  error_detected: {
    phase: 'recovery',
    label: 'Blocage detecte',
    detail: 'Je prepare une correction ciblee avant livraison.',
  },
  auto_fix_started: {
    phase: 'recovery',
    label: 'Correction ciblee',
    detail: 'Je change seulement les fichiers utiles pour limiter le risque.',
  },
  patch_applied: {
    phase: 'recovery',
    label: 'Patch applique',
    detail: 'La correction est appliquee puis verifiee.',
  },
  retest_started: {
    phase: 'recovery',
    label: 'Retest',
    detail: 'Je relance les controles pour confirmer la correction.',
  },
  auto_fix_succeeded: {
    phase: 'recovery',
    label: 'Correction validee',
    detail: 'Le blocage detecte est resolu.',
  },
  auto_fix_failed: {
    phase: 'recovery',
    label: 'Correction incomplete',
    detail: 'Je garde le blocage visible au lieu de simuler un succes.',
  },
  quality_gate_started: {
    phase: 'quality',
    label: 'Gate qualite',
    detail: 'Je verifie que le resultat reste utilisable.',
  },
  verification_started: {
    phase: 'quality',
    label: 'Verification finale',
    detail: 'Je verifie les essentiels avant de resumer.',
  },
  verification_failed: {
    phase: 'quality',
    label: 'Verification bloquee',
    detail: 'Un point critique demande encore une action.',
  },
  quality_checked: {
    phase: 'quality',
    label: 'Qualite controlee',
    detail: 'Les avertissements restent visibles, les erreurs graves bloquent.',
  },
  memory_updated: {
    phase: 'memory',
    label: 'Memoire mise a jour',
    detail: 'Je garde les decisions utiles pour les prochaines iterations.',
  },
  cancelled: {
    phase: 'failed',
    label: 'Mission arretee',
    detail: 'La generation a ete interrompue proprement.',
    terminal: 'cancelled',
  },
  error: {
    phase: 'failed',
    label: 'Mission bloquee',
    detail: 'Je garde le projet intact et montre l erreur utile.',
    terminal: 'failed',
  },
  done: {
    phase: 'done',
    label: 'Mission livree',
    detail: 'La version visible est livree.',
    terminal: 'done',
  },
};

export function mapAgentStreamEvent(eventType: string): StreamEventMapping | null {
  return EVENT_PHASES[eventType] || null;
}

export function isSeniorStreamEvent(eventType: string): boolean {
  return Boolean(mapAgentStreamEvent(eventType));
}
