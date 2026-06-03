export type UserIntentCategory =
  | 'text'
  | 'explanation'
  | 'strategy'
  | 'analysis'
  | 'design'
  | 'prompt'
  | 'bug'
  | 'code'
  | 'app'
  | 'api'
  | 'database'
  | 'ui'
  | 'other';

export type UserIntentAction = 'answer' | 'clarify' | 'file_action';

export type IntentUnderstanding = {
  category: UserIntentCategory;
  action: UserIntentAction;
  confidence: number;
  allowsFileAction: boolean;
  needsClarification: boolean;
  reason: string;
  signals: string[];
};

type IntentInput = {
  prompt: string;
  hasFiles?: boolean;
  requestedMode?: string;
  hasLastPlan?: boolean;
};

function normalizeIntentText(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[!?.,;:()[\]{}"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text: string, hints: string[]) {
  return hints.some(hint => text.includes(hint));
}

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(text));
}

function words(text: string) {
  return text.split(/\s+/).filter(Boolean);
}

function result(patch: Partial<IntentUnderstanding> & Pick<IntentUnderstanding, 'category' | 'action' | 'reason'>): IntentUnderstanding {
  const allowsFileAction = patch.action === 'file_action';
  return {
    confidence: 0.82,
    signals: [],
    ...patch,
    allowsFileAction: patch.allowsFileAction ?? allowsFileAction,
    needsClarification: patch.needsClarification ?? (patch.action === 'clarify'),
  };
}

export function understandUserIntent(input: IntentInput): IntentUnderstanding {
  const original = String(input.prompt || '').trim();
  const text = normalizeIntentText(original);
  const tokenCount = words(text).length;
  const requestedMode = input.requestedMode === 'build' ? 'build' : input.requestedMode === 'plan' ? 'plan' : 'auto';

  if (!text) {
    return result({
      category: 'other',
      action: 'clarify',
      confidence: 0.92,
      reason: 'empty_prompt',
      signals: ['empty'],
    });
  }

  const metaAgentSignals = [
    'huggy', 'agent', 'quand il doit coder', 'quand coder', 'ne doit pas coder',
    'ne pas coder', 'ne rien generer', 'ne genere pas', 'ne doit jamais coder',
    'intention utilisateur', 'comprendre le message', 'comprehension', 'avant toute action',
    'au meme niveau que codex', 'lovable', 'cursor', 'chatgpt',
  ];
  const exampleSignals = [
    'par exemple', 'exemple', 'si je dis', 'supposons', 'imagine que',
    'il a genere', 'il ne fallait pas', 'alors que ce n etait pas necessaire',
  ];
  const textSignals = [
    'arrange ce texte', 'corrige ce texte', 'corrige les fautes', 'reformule',
    'reecris', 'reecrire', 'rewrite this', 'fix this text', 'improve this text',
    'resume ce texte', 'traduis', 'translate', 'mets en forme ce texte',
  ];
  const explanationSignals = [
    'explique', 'explique moi', 'dis moi', 'dis-moi', 'pourquoi', 'comment peut on',
    'comment peux tu', 'comment faire', 'donne moi les etapes', 'donne les etapes',
    'est ce que', 'est-ce que', 'que faut il', 'que faut-il', 'compare',
    'what is', 'how do', 'why', 'can you explain',
  ];
  const strategySignals = [
    'strategie', 'conseil', 'recommendation', 'recommandation', 'comment ameliorer',
    'que manque', 'que faut t il', 'que faut-il', 'au meme niveau', 'plan produit',
    'roadmap', 'analyse', 'audit', 'compare',
  ];
  const promptSignals = [
    'prompt systeme', 'system prompt', 'prompt system', 'ameliore ce prompt',
    'prompt puissant', 'anti design ia', 'direction artistique', 'design brief',
  ];
  const noActionSignals = [
    'ne code pas', 'sans coder', 'sans modifier', 'ne modifie rien', 'ne genere rien',
    'dis moi d abord', 'dis-moi d abord', 'explique d abord',
  ];

  const hasMetaAgent = includesAny(text, metaAgentSignals);
  const hasExample = includesAny(text, exampleSignals);
  const hasTextRequest = includesAny(text, textSignals);
  const hasExplanation = includesAny(text, explanationSignals);
  const hasStrategy = includesAny(text, strategySignals);
  const hasPromptRequest = includesAny(text, promptSignals);
  const hasNoAction = includesAny(text, noActionSignals);

  const directActionPatterns = [
    /\b(implemente|applique|corrige|fix|repare|modifie|change|ajoute|supprime|remplace|connecte|cree|creer|genere|build|update|fais|fait|mets|met|ameliore|ameliorer)\b/,
    /\b(make|create|add|remove|replace|modify|implement|build|generate|repair|improve)\b/,
  ];
  const concreteTechnicalTargets = [
    'fichier', 'code', 'component', 'composant', 'page', 'api', 'endpoint', 'backend',
    'frontend', 'database', 'base de donnees', 'supabase', 'schema', 'migration',
    'auth', 'login', 'bouton', 'button', 'input', 'modal', 'footer', 'header',
    'dashboard', 'builder', 'settings', 'pricing', 'preview', 'publish', 'deploy',
    'css', 'html', 'react', 'vite', 'typescript', 'javascript',
  ];
  const appTargets = [
    'app', 'application', 'site web', 'web app', 'landing page', 'saas', 'dashboard',
    'todo', 'restaurant', 'crm', 'marketplace', 'ecommerce', 'e commerce', 'portfolio',
    'admin panel', 'mobile app',
  ];

  const hasDirectAction = matchesAny(text, directActionPatterns);
  const hasTechnicalTarget = includesAny(text, concreteTechnicalTargets);
  const hasAppTarget = includesAny(text, appTargets);
  const hasBugReport = includesAny(text, [
    'ne fonctionne pas', 'ne marche pas', 'marche pas', 'bug', 'erreur',
    'error', 'request failed', 'crash', 'broken', 'cass',
  ]) && hasTechnicalTarget;
  const asksForGeneratedArtifact = matchesAny(text, [
    /\b(je veux|j aimerais|i want|i need|build me|cree moi|creer moi|genere moi|create a|create an|make me)\b/,
  ]) && hasAppTarget;

  const explicitApplyToProduct = matchesAny(text, [
    /\b(implemente|applique|corrige|fix|repare|modifie|change|ajoute|supprime|remplace|connecte)\b.*\b(huggy|saas|app|application|site|page|component|composant|api|database|supabase|ui|code|projet)\b/,
    /\b(dans|sur)\b.*\b(huggy|mon saas|mon app|mon application|le builder|dashboard|settings|pricing|auth|footer|api|database)\b/,
  ]);

  if (hasNoAction && !explicitApplyToProduct) {
    return result({
      category: hasPromptRequest ? 'prompt' : hasStrategy ? 'strategy' : 'explanation',
      action: 'answer',
      confidence: 0.96,
      reason: 'user_explicitly_asked_no_file_changes',
      signals: ['no_action'],
    });
  }

  if ((hasTextRequest || hasPromptRequest) && !explicitApplyToProduct) {
    return result({
      category: hasTextRequest ? 'text' : 'prompt',
      action: 'answer',
      confidence: 0.95,
      reason: hasTextRequest ? 'text_rewrite_request' : 'prompt_or_design_prompt_request',
      signals: hasTextRequest ? ['text'] : ['prompt'],
    });
  }

  if ((hasMetaAgent || hasExample) && !explicitApplyToProduct && requestedMode !== 'build') {
    return result({
      category: hasMetaAgent ? 'strategy' : 'analysis',
      action: 'answer',
      confidence: 0.92,
      reason: hasMetaAgent ? 'meta_agent_or_product_strategy' : 'example_or_hypothetical_request',
      signals: [...(hasMetaAgent ? ['meta_agent'] : []), ...(hasExample ? ['example'] : [])],
    });
  }

  if ((hasExplanation || hasStrategy) && !explicitApplyToProduct && !asksForGeneratedArtifact) {
    return result({
      category: hasStrategy ? 'strategy' : 'explanation',
      action: 'answer',
      confidence: 0.9,
      reason: hasStrategy ? 'strategy_or_analysis_request' : 'explanation_request',
      signals: hasStrategy ? ['strategy'] : ['explanation'],
    });
  }

  if (hasBugReport && !hasNoAction) {
    return result({
      category: 'bug',
      action: 'file_action',
      confidence: 0.9,
      reason: 'concrete_bug_report_on_product_target',
      signals: ['bug_report', 'technical_target'],
    });
  }

  if (hasDirectAction && (hasTechnicalTarget || explicitApplyToProduct)) {
    const category: UserIntentCategory = text.includes('api') || text.includes('endpoint')
      ? 'api'
      : text.includes('database') || text.includes('base de donnees') || text.includes('supabase') || text.includes('schema')
        ? 'database'
        : text.includes('bug') || text.includes('erreur') || text.includes('error') || text.includes('ne fonctionne pas')
          ? 'bug'
          : text.includes('ui') || text.includes('bouton') || text.includes('button') || text.includes('design') || text.includes('component') || text.includes('composant')
            ? 'ui'
            : 'code';
    return result({
      category,
      action: 'file_action',
      confidence: 0.9,
      reason: 'explicit_action_on_concrete_product_target',
      signals: ['direct_action', 'technical_target'],
    });
  }

  if (asksForGeneratedArtifact) {
    const isTooVague = tokenCount <= 7 && !/(todo|restaurant|crm|marketplace|ecommerce|e commerce|portfolio|admin|landing|dashboard|auth|booking|chat|blog|fintech|education)/i.test(text);
    if (isTooVague) {
      return result({
        category: 'app',
        action: 'clarify',
        confidence: 0.86,
        reason: 'app_request_missing_product_specifics',
        signals: ['app', 'vague'],
      });
    }
    return result({
      category: 'app',
      action: 'file_action',
      confidence: 0.9,
      reason: 'explicit_app_generation_request',
      signals: ['app', 'direct_request'],
    });
  }

  const ambiguousShortEdit = input.hasFiles
    && tokenCount <= 7
    && hasDirectAction
    && !hasTechnicalTarget
    && !hasAppTarget;
  if (ambiguousShortEdit) {
    return result({
      category: 'other',
      action: 'clarify',
      confidence: 0.82,
      reason: 'ambiguous_short_edit_without_target',
      signals: ['ambiguous'],
    });
  }

  if (requestedMode === 'build' && !hasTechnicalTarget && !hasAppTarget && !explicitApplyToProduct) {
    return result({
      category: 'other',
      action: 'clarify',
      confidence: 0.8,
      reason: 'build_mode_without_concrete_target',
      signals: ['build_mode', 'missing_target'],
    });
  }

  if (hasTechnicalTarget && !hasDirectAction) {
    return result({
      category: hasTechnicalTarget ? 'analysis' : 'other',
      action: 'answer',
      confidence: 0.76,
      reason: 'technical_topic_without_action_request',
      signals: ['technical_topic'],
    });
  }

  return result({
    category: 'other',
    action: 'answer',
    confidence: 0.72,
    reason: 'general_message_without_safe_file_action',
    signals: ['general'],
  });
}
