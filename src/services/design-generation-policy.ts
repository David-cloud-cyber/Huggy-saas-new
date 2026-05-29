export type GeneratedAppType =
  | 'landing_page'
  | 'saas_dashboard'
  | 'analytics_dashboard'
  | 'admin_panel'
  | 'marketplace'
  | 'ecommerce'
  | 'restaurant'
  | 'portfolio'
  | 'crm_erp'
  | 'mobile_first_app'
  | 'auth_flow'
  | 'generic_web_app';

export type DesignDirection =
  | 'cinematic_landing'
  | 'dense_devtool'
  | 'data_operational'
  | 'commerce_trust'
  | 'hospitality_warm'
  | 'editorial_portfolio'
  | 'luxury_minimal'
  | 'playful_consumer'
  | 'warm_saas';

export interface WorldClassUiPolicy {
  appType: GeneratedAppType;
  designDirection: DesignDirection;
  appTypeRules: string[];
  systemPrompt: string;
  userContext: {
    appType: GeneratedAppType;
    designDirection: DesignDirection;
    antiAiDesignRules: string[];
    appTypeRules: string[];
    selfAudit: string[];
  };
}

const keywordGroups: Record<GeneratedAppType, string[]> = {
  landing_page: [
    'landing',
    'homepage',
    'home page',
    'waitlist',
    'coming soon',
    'launch page',
    'sales page',
    'marketing page',
    'hero section',
  ],
  saas_dashboard: [
    'saas',
    'workspace',
    'team dashboard',
    'subscription app',
    'project management',
    'collaboration',
    'multi tenant',
  ],
  analytics_dashboard: [
    'analytics',
    'dashboard',
    'metrics',
    'kpi',
    'reporting',
    'charts',
    'insights',
    'monitoring',
  ],
  admin_panel: [
    'admin',
    'back office',
    'backoffice',
    'control panel',
    'manage users',
    'manage orders',
    'moderation',
    'internal tool',
  ],
  marketplace: [
    'marketplace',
    'vendors',
    'sellers',
    'buyers',
    'listings',
    'book providers',
    'multi vendor',
  ],
  ecommerce: [
    'ecommerce',
    'e-commerce',
    'shop',
    'store',
    'cart',
    'checkout',
    'product catalog',
    'products',
    'orders',
  ],
  restaurant: [
    'restaurant',
    'menu',
    'reservation',
    'book a table',
    'food',
    'chef',
    'cafe',
    'bar',
    'delivery',
  ],
  portfolio: [
    'portfolio',
    'case study',
    'case studies',
    'showcase',
    'creative studio',
    'agency',
    'designer',
    'photographer',
  ],
  crm_erp: [
    'crm',
    'erp',
    'pipeline',
    'leads',
    'invoice',
    'inventory',
    'operations',
    'sales reps',
  ],
  mobile_first_app: [
    'mobile app',
    'ios',
    'android',
    'phone',
    'bottom nav',
    'mobile first',
    'swipe',
  ],
  auth_flow: [
    'login',
    'sign in',
    'signup',
    'sign up',
    'auth',
    'authentication',
    'password reset',
    'onboarding form',
  ],
  generic_web_app: [],
};

const appTypeRules: Record<GeneratedAppType, string[]> = {
  landing_page: [
    'Create a conversion-focused marketing page, not an app shell.',
    'Break the generic hero pattern with a distinctive first viewport, product signal, and visible next section.',
    'Include trust, proof, product mechanics, objections, pricing or CTA logic when relevant.',
    'Use progressive storytelling and scroll-triggered reveals; avoid identical three-card grids.',
  ],
  saas_dashboard: [
    'Create a real workspace interface with navigation, primary action, recent work, usage, and empty states.',
    'Prioritize scannability, density, tables/lists, command-like actions, and repeat workflows over marketing decoration.',
    'Use restrained surfaces and clear status tokens for loading, success, warning, and error.',
  ],
  analytics_dashboard: [
    'Create an information-dense analytics product with charts, filters, time ranges, tables, and drill-down areas.',
    'Use tabular numbers, compact controls, clear hierarchy, and designed empty/loading states.',
    'Never use a marketing hero; the first viewport must be operational.',
  ],
  admin_panel: [
    'Create a practical admin/back-office UI with sidebar, search, filters, tables, row actions, and safe destructive states.',
    'Optimize for repeated work, keyboard focus, clear permissions, and confirmation flows.',
    'Use compact components and avoid decorative marketing cards.',
  ],
  marketplace: [
    'Create discovery, search, filtering, listing cards, seller trust signals, and a clear transaction path.',
    'Use varied listing layouts and strong affordances for compare/save/contact/buy actions.',
    'Add empty states for no results and loading skeletons for lists.',
  ],
  ecommerce: [
    'Create product discovery, filters, product detail, cart/checkout preview, trust, and inventory/order states.',
    'Use commerce-specific hierarchy: product imagery, price, variants, social proof, delivery/return signals.',
    'Never hide purchase intent behind generic CTA copy.',
  ],
  restaurant: [
    'Create a sensory hospitality UI with menu, reservation, opening hours, location, reviews, and contact actions.',
    'Use warm but restrained surfaces, appetite-driving imagery areas, and mobile-first reservation flow.',
    'Avoid generic SaaS cards; the design should feel like a real venue.',
  ],
  portfolio: [
    'Create an editorial portfolio with case studies, project rhythm, biography, contact, and selected work hierarchy.',
    'Use typographic contrast, asymmetry, and intentional whitespace rather than generic grids.',
    'Make the first viewport communicate the person/studio craft immediately.',
  ],
  crm_erp: [
    'Create an operational system with pipelines, records, filters, forms, permissions, and audit-friendly states.',
    'Use clear information architecture and compact controls; avoid playful landing-page composition.',
    'Represent data relationships and next actions directly.',
  ],
  mobile_first_app: [
    'Create a touch-first experience with 44px minimum targets, thumb-zone primary actions, and mobile-first navigation.',
    'Use responsive layouts that become excellent desktop views rather than stretched mobile screens.',
  ],
  auth_flow: [
    'Create trustworthy auth/onboarding screens with validation, helpful errors, privacy reassurance, and recovery paths.',
    'Use precise form states, focus rings, password assistance, and accessible labels.',
  ],
  generic_web_app: [
    'Infer the most likely product type from the prompt and make the first screen immediately useful.',
    'Avoid generic template composition; choose one clear focal point and app-specific controls.',
  ],
};

const antiAiDesignRules = [
  'Never produce UI that looks AI-generated, like a Tailwind starter kit, purple-blue gradient page, generic hero, or identical card grid.',
  'Use a deliberate design system: CSS custom properties for color, type, spacing, radius, shadows, z-index, and motion.',
  'Use at least two distinct font roles: display/body or body/mono, with intentional contrast and safe fallbacks.',
  'Use a mathematical type scale, context-specific line heights, and tabular numbers for metrics or data.',
  'Use distinctive accent colors that match the product mood; avoid Tailwind default blue, indigo, violet, and the common AI gradient.',
  'Use 4px-grid spacing. Every value must feel deliberate and consistent.',
  'Create component states for hover, active, focus-visible, disabled, loading, empty, success, warning, and error.',
  'Use real perceived-performance patterns: skeletons for loading lists/cards and graceful empty states.',
  'Respect WCAG AA contrast, semantic landmarks, visible focus, and reduced motion.',
  'Use purposeful motion with custom cubic-bezier timings; avoid transition-all and decoration-only animation.',
  'Never include secrets, API keys, .env files, lockfiles, node_modules, absolute paths, or path traversal.',
  'Generate production-ready code that is self-contained for preview and would pass a senior product design review.',
];

const selfAudit = [
  'Before returning JSON, silently audit whether the app type, layout, typography, color, spacing, motion, loading, empty, error, and responsive states match the prompt.',
  'If the design feels generic, revise it internally before output.',
  'If the prompt asks for an operational app, do not output a landing page.',
  'If the prompt asks for a landing page, do not output a generic dashboard shell.',
  'Ensure the preview is not blank and index.html contains meaningful visible product UI.',
];

function normalizePrompt(prompt: string) {
  return prompt.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some(keyword => text.includes(keyword));
}

export function classifyGeneratedAppType(prompt: string): GeneratedAppType {
  const text = normalizePrompt(prompt);

  if (!text) return 'generic_web_app';

  const explicitOrder: GeneratedAppType[] = [
    'landing_page',
    'admin_panel',
    'analytics_dashboard',
    'crm_erp',
    'marketplace',
    'ecommerce',
    'portfolio',
    'mobile_first_app',
    'auth_flow',
    'restaurant',
    'saas_dashboard',
  ];

  for (const appType of explicitOrder) {
    if (hasAny(text, keywordGroups[appType])) return appType;
  }

  return 'generic_web_app';
}

export function chooseDesignDirection(appType: GeneratedAppType, prompt: string): DesignDirection {
  const text = normalizePrompt(prompt);

  if (hasAny(text, ['luxury', 'premium', 'high end', 'exclusive'])) return 'luxury_minimal';
  if (hasAny(text, ['playful', 'kids', 'game', 'fun', 'colorful'])) return 'playful_consumer';

  switch (appType) {
    case 'landing_page':
      return 'cinematic_landing';
    case 'analytics_dashboard':
    case 'admin_panel':
    case 'crm_erp':
      return 'data_operational';
    case 'saas_dashboard':
      return 'dense_devtool';
    case 'marketplace':
    case 'ecommerce':
      return 'commerce_trust';
    case 'restaurant':
      return 'hospitality_warm';
    case 'portfolio':
      return 'editorial_portfolio';
    case 'mobile_first_app':
      return 'playful_consumer';
    case 'auth_flow':
      return 'luxury_minimal';
    default:
      return 'warm_saas';
  }
}

export function getAppTypeUxRules(appType: GeneratedAppType) {
  return appTypeRules[appType];
}

export function buildWorldClassUiPolicy(input: {
  prompt: string;
  appType?: GeneratedAppType;
  designDirection?: DesignDirection;
}): WorldClassUiPolicy {
  const appType = input.appType || classifyGeneratedAppType(input.prompt);
  const designDirection = input.designDirection || chooseDesignDirection(appType, input.prompt);
  const rules = getAppTypeUxRules(appType);

  const systemPrompt = [
    'WORLD-CLASS UI GENERATION ENGINE / Anti-AI-Design Protocol.',
    'Act as a Principal Product Designer and Senior Frontend Engineer.',
    `Detected app type: ${appType}.`,
    `Design direction: ${designDirection}.`,
    'App-type rules:',
    ...rules.map(rule => `- ${rule}`),
    'Global anti-AI-design rules:',
    ...antiAiDesignRules.map(rule => `- ${rule}`),
    'Self-audit before output:',
    ...selfAudit.map(rule => `- ${rule}`),
  ].join('\n');

  return {
    appType,
    designDirection,
    appTypeRules: rules,
    systemPrompt,
    userContext: {
      appType,
      designDirection,
      antiAiDesignRules,
      appTypeRules: rules,
      selfAudit,
    },
  };
}
