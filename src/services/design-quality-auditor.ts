import type {
  AgentGeneratedFile,
  AgentVerificationCheck,
  AgentVerificationSeverity,
} from './agent-v2.ts';
import type { DesignDirection, GeneratedAppType } from './design-generation-policy.ts';
import { getPlatformIntelligence } from './design-generation-policy.ts';

export type GeneratedQualityAuditInput = {
  files: AgentGeneratedFile[];
  previewHtml?: string;
  platformType?: GeneratedAppType;
  designDirection?: DesignDirection;
  hasExistingFiles?: boolean;
};

type SourceBundle = {
  files: AgentGeneratedFile[];
  all: string;
  css: string;
  tsx: string;
  html: string;
  filePaths: string[];
};

const AI_GRADIENT_RE = /#667eea|#764ba2|#8b5cf6|#3b82f6|linear-gradient\(\s*135deg\s*,\s*#667eea/i;
const GENERIC_COPY_RE = /\b(feature\s*1|feature\s*2|feature\s*3|lorem ipsum|card title|untitled app|welcome to your app|welcome to your dashboard|powerful features|modern teams|seamless experience|all[- ]in[- ]one platform|transform your workflow|get started today|learn more)\b/i;
const INTERACTION_RE = /\b(onClick|onSubmit|onChange|addEventListener|useState|useReducer|href=|button[^>]+type=["']submit|form|aria-expanded)\b/i;
const FORM_VALIDATION_RE = /\b(required|minLength|maxLength|pattern|aria-invalid|setError|error|invalid|validation|validate)\b/i;
const STATE_RE = /\b(loading|empty|error|success|failed|disabled|skeleton|placeholder|toast|alert|pending|saving|saved)\b/i;
const RESPONSIVE_RE = /@media|clamp\(|minmax\(|grid-template-columns|container-type|auto-fit|auto-fill|max-width|min-width/i;
const MOTION_RE = /transition|animation|@keyframes|transform|opacity/i;
const REDUCED_MOTION_RE = /prefers-reduced-motion/i;
const FOCUS_RE = /:focus-visible|outline|focus:ring|aria-label/i;
const CSS_TOKEN_RE = /:root[\s\S]*--[a-z0-9-]+|--(?:color|bg|text|space|radius|shadow|motion|ease|font)/i;
const SEMANTIC_TOKEN_RE = /--(?:success|warning|error|info|color-success|color-warning|color-error|color-info)\b/i;
const SPACING_TOKEN_RE = /--(?:space|spacing)-|--space-\d|gap:\s*(?:var\(--space|[.0-9]+rem)|padding:\s*(?:var\(--space|[.0-9]+rem)/i;
const TOUCH_TARGET_RE = /(?:min-)?height:\s*(?:44px|2\.75rem|var\(--touch|var\(--control|var\(--button)|(?:min-)?width:\s*(?:44px|2\.75rem|var\(--touch|var\(--control|var\(--button)/i;
const LABEL_RE = /<label|aria-label|aria-labelledby|htmlFor=/i;
const PREVENT_DEFAULT_RE = /preventDefault\(|type=["']submit|formAction|action=/i;
const SEARCH_FILTER_RE = /\b(search|filter|filtre|recherche|sort|tri)\b/i;
const DELETE_RE = /\b(delete|remove|supprimer|effacer|archive|danger|destructive)\b/i;
const CONFIRM_RE = /\b(confirm\(|dialog|modal|undo|annuler|confirmation|are you sure|etes vous sur|êtes vous sûr)\b/i;

const appRequiredComponentKeywords: Partial<Record<GeneratedAppType, string[]>> = {
  landing_page: ['hero', 'cta', 'proof', 'pricing', 'testimonial', 'faq', 'prompt'],
  saas_dashboard: ['dashboard', 'workspace', 'project', 'usage', 'settings', 'sidebar', 'search'],
  analytics_dashboard: ['metric', 'chart', 'filter', 'kpi', 'table', 'insight'],
  admin_panel: ['admin', 'table', 'user', 'role', 'filter', 'action', 'confirm'],
  marketplace: ['search', 'filter', 'listing', 'seller', 'save', 'favorite', 'rating'],
  ecommerce: ['product', 'cart', 'checkout', 'price', 'variant', 'stock', 'quantity'],
  restaurant: ['menu', 'reservation', 'hours', 'location', 'reviews', 'contact'],
  portfolio: ['project', 'case', 'work', 'about', 'contact', 'service'],
  crm_erp: ['lead', 'pipeline', 'record', 'invoice', 'inventory', 'activity', 'status'],
  mobile_first_app: ['bottom', 'tab', 'screen', 'mobile', 'touch', 'sticky'],
  auth_flow: ['login', 'signup', 'password', 'forgot', 'validation', 'privacy'],
  ai_tool: ['prompt', 'message', 'stream', 'model', 'preview', 'output', 'status'],
  fintech_billing: ['balance', 'invoice', 'payment', 'wallet', 'transaction', 'plan', 'receipt'],
  healthcare_education: ['progress', 'resource', 'patient', 'course', 'lesson', 'help', 'consent'],
  gaming_creative: ['canvas', 'play', 'score', 'control', 'reset', 'stage', 'creative'],
};

export function auditGeneratedDesign(input: GeneratedQualityAuditInput): AgentVerificationCheck[] {
  const bundle = buildBundle(input);
  const checks: AgentVerificationCheck[] = [];
  const platform = input.platformType || 'generic_web_app';
  const intelligence = getPlatformIntelligence(platform);

  checks.push(result(
    'design_tokens',
    CSS_TOKEN_RE.test(bundle.css),
    'medium',
    'Design system tokens are present.',
    'Generated CSS should define reusable design tokens instead of one-off styling.',
  ));

  checks.push(result(
    'design_semantic_tokens',
    SEMANTIC_TOKEN_RE.test(bundle.css),
    'medium',
    'Semantic state tokens are present.',
    'Generated CSS should define semantic success, warning, error, and info tokens.',
  ));

  checks.push(result(
    'design_spacing_system',
    SPACING_TOKEN_RE.test(bundle.css),
    'low',
    'Spacing system is visible in CSS.',
    'Generated UI should use a clear spacing scale instead of scattered one-off values.',
  ));

  checks.push(result(
    'design_touch_targets',
    TOUCH_TARGET_RE.test(bundle.css),
    'low',
    'Primary controls include accessible touch target sizing.',
    'Buttons and primary controls should target roughly 44px touch areas.',
  ));

  checks.push(result(
    'design_responsive',
    RESPONSIVE_RE.test(bundle.css),
    'high',
    'Responsive layout rules are present.',
    'Generated UI needs real responsive rules for mobile and desktop.',
  ));

  checks.push(result(
    'design_motion',
    MOTION_RE.test(bundle.css),
    'low',
    'Purposeful motion styles are present.',
    'Generated UI should include useful hover/focus/entry motion, not feel static.',
  ));

  checks.push(result(
    'design_reduced_motion',
    REDUCED_MOTION_RE.test(bundle.css),
    'medium',
    'Reduced-motion fallback is present.',
    'Animations must respect prefers-reduced-motion.',
  ));

  checks.push(result(
    'design_focus_states',
    FOCUS_RE.test(bundle.css) || FOCUS_RE.test(bundle.tsx),
    'medium',
    'Focus and accessible labels are present.',
    'Interactive controls need visible focus and accessible naming.',
  ));

  const stateHits = ['loading', 'empty', 'error', 'success', 'disabled', 'skeleton', 'toast', 'pending']
    .filter(token => bundle.all.includes(token)).length;
  checks.push(result(
    'design_component_states',
    STATE_RE.test(bundle.all) && stateHits >= 3,
    'medium',
    'Loading, empty, error, or success states are represented.',
    'Generated app should include multiple real UI states, not only the happy path.',
  ));

  checks.push(result(
    'design_no_ai_gradient',
    !AI_GRADIENT_RE.test(bundle.all),
    'high',
    'No overused AI/Tailwind gradient signature detected.',
    'Generated design uses overused AI-looking colors or gradients.',
  ));

  checks.push(result(
    'design_no_generic_copy',
    !GENERIC_COPY_RE.test(bundle.all),
    'medium',
    'Generic placeholder copy was avoided.',
    'Generated UI still contains generic placeholder copy.',
  ));

  const platformKeywordHits = countKeywordHits(bundle.all, appRequiredComponentKeywords[platform] || []);
  checks.push(result(
    'design_platform_fit',
    platformKeywordHits >= Math.min(3, (appRequiredComponentKeywords[platform] || []).length || 3),
    'high',
    `${platform} platform components are represented.`,
    `${platform} generation is missing expected product-specific components: ${intelligence.requiredComponents.join(', ')}.`,
  ));

  checks.push(scoreCheck('design_score', scoreChecks(checks), 'Design quality score'));
  return checks;
}

export function auditGeneratedFunctionality(input: GeneratedQualityAuditInput): AgentVerificationCheck[] {
  const bundle = buildBundle(input);
  const checks: AgentVerificationCheck[] = [];
  const isNewApp = !input.hasExistingFiles;
  const hasPackage = bundle.filePaths.includes('package.json');
  const hasApp = bundle.filePaths.some(path => /^src\/app\.(tsx|jsx)$/i.test(path));
  const hasMain = bundle.filePaths.some(path => /^src\/main\.(tsx|jsx|ts|js)$/i.test(path));
  const hasViteRoot = /<div\s+id=["']root["']\s*><\/div>|<div\s+id=["']root["']/i.test(bundle.html);
  const hasModuleScript = /<script[^>]+type=["']module["'][^>]+src=["']\/src\/main\.(tsx|jsx|ts|js)["']/i.test(bundle.html);
  const hasControls = /<button|<input|<select|<textarea|role=["']button|type=["']button/i.test(bundle.all);
  const hasForms = /<form|<input|<select|<textarea/i.test(bundle.all);
  const hasSearchOrFilter = SEARCH_FILTER_RE.test(bundle.all);
  const hasDeleteAction = DELETE_RE.test(bundle.all);

  if (isNewApp) {
    checks.push(result(
      'functionality_modern_project',
      hasPackage && hasApp && hasMain,
      'high',
      'New app uses a real modern project structure.',
      'New app must be a complete React/Vite project, not a single HTML preview.',
    ));
    checks.push(result(
      'functionality_vite_shell',
      hasViteRoot && hasModuleScript,
      'high',
      'index.html is a Vite shell.',
      'index.html should mount React through /src/main.tsx instead of containing the whole app.',
    ));
  }

  checks.push(result(
    'functionality_primary_controls',
    !hasControls || INTERACTION_RE.test(bundle.tsx) || INTERACTION_RE.test(bundle.html),
    'high',
    'Primary controls have interaction wiring.',
    'Buttons or controls are present but no interaction wiring was detected.',
  ));

  checks.push(result(
    'functionality_form_feedback',
    !hasForms || (FORM_VALIDATION_RE.test(bundle.all) && LABEL_RE.test(bundle.all)),
    'medium',
    'Forms include labels, validation, or feedback.',
    'Forms need labels plus validation, error text, required fields, or visible feedback.',
  ));

  checks.push(result(
    'functionality_form_submit_handling',
    !hasForms || PREVENT_DEFAULT_RE.test(bundle.all),
    'medium',
    'Form submission is handled intentionally.',
    'Forms should prevent accidental reloads or define a clear submit action.',
  ));

  checks.push(result(
    'functionality_stateful_behavior',
    /useState|useReducer|localStorage|sessionStorage|new URLSearchParams|set[A-Z]/.test(bundle.tsx) || !hasControls,
    'medium',
    'Stateful behavior is present where controls exist.',
    'Interactive apps should update visible state instead of rendering static controls.',
  ));

  checks.push(result(
    'functionality_search_filter_behavior',
    !hasSearchOrFilter || (/useState|useMemo|filter\(|sort\(|debounce|setTimeout|onChange/.test(bundle.tsx) || /addEventListener/.test(bundle.html)),
    'medium',
    'Search, filter, or sort controls appear wired to visible behavior.',
    'Search, filter, or sort UI is present but no filtering/sorting behavior was detected.',
  ));

  checks.push(result(
    'functionality_destructive_feedback',
    !hasDeleteAction || CONFIRM_RE.test(bundle.all),
    'medium',
    'Destructive actions include confirmation or undo-safe feedback.',
    'Delete/remove/destructive actions should ask for confirmation or provide undo-safe feedback.',
  ));

  checks.push(result(
    'functionality_honest_placeholders',
    !/\b(real-time|live payment|charged|sent email|connected to stripe|connected to supabase)\b/i.test(bundle.all)
      || /\b(demo|mock|placeholder|local preview|sample)\b/i.test(bundle.all),
    'medium',
    'Mocked capabilities are labeled honestly.',
    'UI appears to claim real external capabilities without backend support or demo labeling.',
  ));

  checks.push(scoreCheck('functionality_score', scoreChecks(checks), 'Functionality quality score'));
  return checks;
}

export function summarizeQualityScores(checks: AgentVerificationCheck[]) {
  const scoreChecksOnly = checks.filter(check => /_score$/.test(check.key));
  return scoreChecksOnly.map(check => check.message).join(' ');
}

function buildBundle(input: GeneratedQualityAuditInput): SourceBundle {
  const files = input.files || [];
  const sourceFor = (predicate: (path: string) => boolean) => files
    .filter(file => predicate(normalizePath(file.path)))
    .map(file => String(file.content || ''))
    .join('\n\n');

  const html = [
    sourceFor(path => path.endsWith('.html')),
    input.previewHtml || '',
  ].filter(Boolean).join('\n\n');
  const css = sourceFor(path => path.endsWith('.css') || path.endsWith('.scss'));
  const tsx = sourceFor(path => /\.(tsx|jsx|ts|js)$/i.test(path));
  const all = [html, css, tsx, sourceFor(path => path.endsWith('.json') || path.endsWith('.md'))]
    .filter(Boolean)
    .join('\n\n')
    .toLowerCase();

  return {
    files,
    all,
    css,
    tsx,
    html,
    filePaths: files.map(file => normalizePath(file.path).toLowerCase()),
  };
}

function normalizePath(value: string) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function countKeywordHits(source: string, keywords: string[]) {
  const lower = source.toLowerCase();
  return keywords.reduce((count, keyword) => count + (lower.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function scoreChecks(checks: AgentVerificationCheck[]) {
  const penalty = checks.reduce((total, check) => {
    if (check.status === 'pass') return total;
    const severityPenalty = check.severity === 'high' ? 24 : check.severity === 'medium' ? 14 : 6;
    return total + (check.status === 'fail' ? severityPenalty : Math.ceil(severityPenalty / 2));
  }, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function scoreCheck(key: string, score: number, label: string): AgentVerificationCheck {
  const status = score >= 78 ? 'pass' : score >= 62 ? 'warn' : 'fail';
  const severity: AgentVerificationSeverity = score >= 62 ? 'low' : 'high';
  return {
    key,
    status,
    severity,
    message: `${label}: ${score}/100.`,
  };
}

function result(
  key: string,
  passed: boolean,
  severity: AgentVerificationSeverity,
  passMessage: string,
  failMessage: string,
): AgentVerificationCheck {
  return {
    key,
    status: passed ? 'pass' : severity === 'low' ? 'warn' : 'fail',
    severity: passed ? 'info' : severity,
    message: passed ? passMessage : failMessage,
  };
}
