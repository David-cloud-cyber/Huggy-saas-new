import type { AgentGeneratedFile, AgentVerificationCheck } from './agent-v2.ts';
import type { GeneratedAppType } from './design-generation-policy.ts';

export type VisualPreviewInspectionInput = {
  files: AgentGeneratedFile[];
  previewHtml?: string;
  platformType?: GeneratedAppType;
};

type VisualSignal = {
  html: string;
  source: string;
  text: string;
  elementCount: number;
  buttonCount: number;
  inputCount: number;
  linkCount: number;
};

const INTERACTIVE_RE = /\b(onClick|onSubmit|onChange|addEventListener|useState|useReducer|aria-expanded|dialog|modal|set[A-Z][A-Za-z0-9_]*\()/;
const EMPTY_VISUAL_RE = /\b(empty|no results|nothing yet|aucun|vide|start by|create your first|no items)\b/i;
const ERROR_VISUAL_RE = /\b(error|failed|invalid|required|try again|erreur|echec|échoué|obligatoire|reessayer|réessayer)\b/i;
const SUCCESS_VISUAL_RE = /\b(success|saved|done|complete|created|updated|succes|succès|enregistre|enregistré|termine|terminé)\b/i;
const FILTER_RE = /\b(search|filter|sort|status|category|query|recherche|filtre|tri|statut|categorie)\b/i;
const MODAL_RE = /\b(modal|dialog|popover|sheet|drawer|confirm|confirmation|aria-modal)\b/i;
const TAB_RE = /\b(tab|tabs|aria-selected|role=["']tab|segmented)\b/i;
const RESPONSIVE_RE = /@media|clamp\(|minmax\(|auto-fit|auto-fill|container-type|max-width|min-width/;
const ACCESSIBLE_NAME_RE = /aria-label|aria-labelledby|<label|htmlFor=|alt=/i;

function stripTags(html: string) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSignal(input: VisualPreviewInspectionInput): VisualSignal {
  const html = String(input.previewHtml || input.files.find(file => /(?:^|\/)index\.html$/i.test(file.path))?.content || '');
  const source = input.files.map(file => `${file.path}\n${file.content || ''}`).join('\n\n');
  const visibleText = stripTags(`${html}\n${source}`);
  return {
    html,
    source,
    text: visibleText,
    elementCount: (html.match(/<[a-z][\w:-]*(?:\s|>)/gi) || []).length,
    buttonCount: (source.match(/<button\b|role=["']button|type=["']button/gi) || []).length,
    inputCount: (source.match(/<input\b|<select\b|<textarea\b|contenteditable=/gi) || []).length,
    linkCount: (source.match(/<a\b|href=/gi) || []).length,
  };
}

function check(key: string, passed: boolean, severity: AgentVerificationCheck['severity'], passMessage: string, failMessage: string): AgentVerificationCheck {
  return {
    key,
    status: passed ? 'pass' : severity === 'high' ? 'fail' : 'warn',
    severity,
    message: passed ? passMessage : failMessage,
  };
}

export function inspectVisualPreview(input: VisualPreviewInspectionInput): AgentVerificationCheck[] {
  const signal = buildSignal(input);
  const checks: AgentVerificationCheck[] = [];
  const platform = input.platformType || 'generic_web_app';
  const source = signal.source;
  const textLength = signal.text.length;
  const hasControls = signal.buttonCount + signal.inputCount + signal.linkCount > 0;
  const isAppLike = !['landing_page', 'portfolio'].includes(platform);

  checks.push(check(
    'visual_preview_has_content',
    textLength >= 80 || signal.elementCount >= 18,
    'high',
    'Preview has enough visible structure to inspect.',
    'Preview looks visually empty or too sparse.',
  ));

  checks.push(check(
    'visual_primary_controls',
    hasControls,
    isAppLike ? 'high' : 'medium',
    'Primary controls are visible in the generated UI.',
    'No primary controls were detected in the generated UI.',
  ));

  if (hasControls) {
    checks.push(check(
      'visual_controls_have_behavior',
      INTERACTIVE_RE.test(source),
      'high',
      'Visible controls appear connected to behavior or state.',
      'Visible controls do not appear connected to behavior.',
    ));
  }

  checks.push(check(
    'visual_state_coverage',
    EMPTY_VISUAL_RE.test(source) && ERROR_VISUAL_RE.test(source) && SUCCESS_VISUAL_RE.test(source),
    'medium',
    'Empty, error, and success states are represented.',
    'Generated UI should include empty, error, and success states for the core flow.',
  ));

  if (/(todo|task|crm|dashboard|marketplace|ecommerce|admin|analytics|table|list)/i.test(source)) {
    checks.push(check(
      'visual_list_tools',
      FILTER_RE.test(source),
      'medium',
      'List/table UI includes search, filtering, sorting, or status controls.',
      'List/table UI needs visible search, filtering, sorting, or status controls.',
    ));
  }

  if (/(delete|remove|supprimer|effacer|danger|destructive)/i.test(source)) {
    checks.push(check(
      'visual_destructive_confirmation',
      MODAL_RE.test(source) || /\b(confirm\(|undo|annuler|cancel)\b/i.test(source),
      'high',
      'Destructive actions have confirmation or undo-safe feedback.',
      'Destructive actions need confirmation or undo-safe feedback.',
    ));
  }

  checks.push(check(
    'visual_accessible_names',
    ACCESSIBLE_NAME_RE.test(source),
    'medium',
    'Interactive or media elements include accessible names.',
    'Add labels, aria-labels, or alt text for key controls and media.',
  ));

  checks.push(check(
    'visual_responsive_contract',
    RESPONSIVE_RE.test(source),
    'medium',
    'Responsive behavior is represented in CSS or layout code.',
    'Generated UI needs explicit responsive behavior.',
  ));

  if (/dashboard|settings|admin|crm|analytics|billing/i.test(source)) {
    checks.push(check(
      'visual_navigation_depth',
      TAB_RE.test(source) || /sidebar|nav|menu|breadcrumb/i.test(source),
      'medium',
      'Operational UI includes navigation depth.',
      'Operational UI should expose tabs, sidebar, menu, or navigation depth.',
    ));
  }

  return checks;
}
