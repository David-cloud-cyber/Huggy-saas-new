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
  | 'ai_tool'
  | 'fintech_billing'
  | 'healthcare_education'
  | 'gaming_creative'
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
  | 'warm_saas'
  | 'mobile_product'
  | 'regulated_trust'
  | 'immersive_creative';

export type PlatformDensity = 'low' | 'medium' | 'high';
export type PlatformTrustLevel = 'standard' | 'high' | 'critical';

export interface PlatformIntelligence {
  platformType: GeneratedAppType;
  designStrategy: string;
  layoutStrategy: string;
  density: PlatformDensity;
  trustLevel: PlatformTrustLevel;
  paletteStrategy: string;
  typographyStrategy: string;
  requiredComponents: string[];
  requiredInteractions: string[];
  requiredStates: string[];
  motionRules: string[];
  forbiddenPatterns: string[];
  auditRules: string[];
  functionalRules: string[];
}

export interface GeneratedDesignBrief {
  platform_type: GeneratedAppType;
  design_direction: DesignDirection;
  audience: string;
  product_promise: string;
  design_mood: string;
  layout_strategy: string;
  density: PlatformDensity;
  palette: string;
  typography: string;
  required_components: string[];
  required_interactions: string[];
  required_states: string[];
  motion_plan: string[];
  forbidden_patterns: string[];
  audit_rules: string[];
  functionality_rules: string[];
  risk_flags: string[];
}

export interface WorldClassUiPolicy {
  appType: GeneratedAppType;
  designDirection: DesignDirection;
  appTypeRules: string[];
  platformIntelligence: PlatformIntelligence;
  designBrief: GeneratedDesignBrief;
  systemPrompt: string;
  userContext: {
    appType: GeneratedAppType;
    designDirection: DesignDirection;
    platformIntelligence: PlatformIntelligence;
    designBrief: GeneratedDesignBrief;
    antiAiDesignRules: string[];
    appTypeRules: string[];
    selfAudit: string[];
    functionalQualityGate: string[];
  };
}

const keywordGroups: Record<GeneratedAppType, string[]> = {
  landing_page: [
    'landing',
    'homepage',
    'home page',
    'page accueil',
    "page d'accueil",
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
    'tableau de bord saas',
    'espace de travail',
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
    'statistiques',
    'metriques',
    'graphiques',
    'analyse',
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
    'panneau admin',
    'administration',
    'gerer utilisateurs',
  ],
  marketplace: [
    'marketplace',
    'vendors',
    'sellers',
    'buyers',
    'listings',
    'book providers',
    'multi vendor',
    'place de marche',
    'vendeurs',
    'annonces',
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
    'boutique',
    'panier',
    'catalogue',
    'paiement',
    'commande',
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
    'livraison',
    'reserver',
    'horaires',
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
    'freelance',
    'agence',
    'projets',
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
    'facture',
    'stock',
    'inventaire',
    'prospects',
  ],
  mobile_first_app: [
    'mobile app',
    'ios',
    'android',
    'phone',
    'bottom nav',
    'mobile first',
    'swipe',
    'pwa',
    'application mobile',
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
    'connexion',
    'inscription',
    'mot de passe',
    'authentification',
  ],
  ai_tool: [
    'ai tool',
    'ai app',
    'prompt',
    'chatbot',
    'agent',
    'builder',
    'model selector',
    'streaming',
    'outil ia',
    'assistant ia',
    'generateur',
  ],
  fintech_billing: [
    'fintech',
    'billing',
    'wallet',
    'payment',
    'subscription',
    'invoice',
    'banking',
    'credits',
    'facturation',
    'abonnement',
    'portefeuille',
    'paiement',
  ],
  healthcare_education: [
    'healthcare',
    'medical',
    'clinic',
    'patient',
    'education',
    'course',
    'learning',
    'school',
    'sante',
    'clinique',
    'patient',
    'education',
    'cours',
  ],
  gaming_creative: [
    'game',
    'gaming',
    'creative tool',
    'canvas',
    'avatar',
    'music app',
    'video editor',
    'jeu',
    'creation',
    'dessin',
  ],
  generic_web_app: [],
};

const appTypeRules: Record<GeneratedAppType, string[]> = {
  landing_page: [
    'Create a conversion-focused product page, not a generic app shell.',
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
    'Prefer bottom navigation, sticky actions, and short flows over desktop sidebars.',
  ],
  auth_flow: [
    'Create trustworthy auth/onboarding screens with validation, helpful errors, privacy reassurance, and recovery paths.',
    'Use precise form states, focus rings, password assistance, and accessible labels.',
    'Do not make the auth screen feel like a marketing landing page.',
  ],
  ai_tool: [
    'Create an AI-native product surface with prompt input, conversation/history, streaming status, model/tool state, and preview/output areas.',
    'Make the AI status honest: show thinking, running checks, errors, and completed output without fake steps.',
    'Keep controls compact and direct; avoid giant marketing panels inside the tool surface.',
  ],
  fintech_billing: [
    'Create a trust-first finance interface with balances, invoices, plan details, usage, receipts, and clear risk states.',
    'Use tabular numbers, strong contrast, confirmation flows, and restrained color. Avoid playful ambiguity.',
    'Never expose fake payment success without clear mock/demo labeling when there is no real backend.',
  ],
  healthcare_education: [
    'Create a calm, highly readable interface with clear hierarchy, accessibility, consent/help states, and supportive microcopy.',
    'Avoid flashy visuals; prioritize comprehension, focus, and safe error states.',
    'Do not imply medical certainty or real clinical processing without explicit backend support.',
  ],
  gaming_creative: [
    'Create an expressive interactive surface with stronger visuals, responsive controls, and immediate feedback.',
    'Use animation and canvas-like interactions only when they support play or creation.',
    'Avoid static marketing composition; the first screen should invite interaction.',
  ],
  generic_web_app: [
    'Infer the most likely product type from the prompt and make the first screen immediately useful.',
    'Avoid generic template composition; choose one clear focal point and app-specific controls.',
    'If the platform is ambiguous, still create a coherent product experience with working controls and honest placeholder states.',
  ],
};

const platformIntelligence: Record<GeneratedAppType, PlatformIntelligence> = {
  landing_page: {
    platformType: 'landing_page',
    designStrategy: 'Product-led marketing with a strong first screen, proof, and a clear path to action.',
    layoutStrategy: 'Centered hero or asymmetric editorial hero, then proof, mechanics, templates, pricing/CTA.',
    density: 'medium',
    trustLevel: 'standard',
    paletteStrategy: 'Warm light surfaces with one memorable accent; gradients only as subtle accents.',
    typographyStrategy: 'Confident sans display with readable body and short high-impact copy.',
    requiredComponents: ['hero', 'prompt or CTA input', 'social proof', 'feature proof', 'CTA band'],
    requiredInteractions: ['primary CTA', 'secondary CTA', 'prompt submission or intent handoff', 'FAQ or objection reveal'],
    requiredStates: ['hover', 'focus-visible', 'loading for prompt/CTA', 'empty prompt validation'],
    motionRules: ['section reveal', 'CTA hover lift', 'reduced-motion fallback'],
    forbiddenPatterns: ['generic title subtitle two buttons image below', 'three identical feature cards', 'dashboard sidebar'],
    auditRules: ['first viewport must show product category and action', 'next section must be visible', 'copy must be specific'],
    functionalRules: ['CTA must navigate or update state', 'prompt field must validate and hand off', 'links must have destinations'],
  },
  saas_dashboard: {
    platformType: 'saas_dashboard',
    designStrategy: 'Operational workspace that helps a team repeat work quickly.',
    layoutStrategy: 'Sidebar or topbar, command/search area, primary work list, recent activity, settings/usage.',
    density: 'high',
    trustLevel: 'high',
    paletteStrategy: 'Neutral light surfaces, clear status colors, restrained brand accent.',
    typographyStrategy: 'Compact UI sans with tabular numbers and clear section hierarchy.',
    requiredComponents: ['navigation', 'search', 'project/list cards', 'usage/status area', 'settings entry'],
    requiredInteractions: ['search/filter', 'create action', 'item selection', 'menu/dropdown', 'settings modal'],
    requiredStates: ['loading', 'empty', 'error', 'success', 'disabled', 'selected'],
    motionRules: ['menu pop', 'card hover lift', 'tab indicator motion', 'reduced-motion fallback'],
    forbiddenPatterns: ['marketing hero', 'decorative card-only layout', 'huge editorial type inside workspace'],
    auditRules: ['first viewport must be operational', 'primary workflow must be obvious', 'empty states must guide action'],
    functionalRules: ['search/filter must update visible results', 'create/menu actions must provide feedback', 'settings must open'],
  },
  analytics_dashboard: {
    platformType: 'analytics_dashboard',
    designStrategy: 'Decision support with dense but calm information hierarchy.',
    layoutStrategy: 'Metric strip, filter bar, chart panels, comparison table, insight notes.',
    density: 'high',
    trustLevel: 'high',
    paletteStrategy: 'Neutral backgrounds with semantic chart colors and no decorative gradients.',
    typographyStrategy: 'Tabular numeric system, compact labels, readable chart captions.',
    requiredComponents: ['metric cards', 'date range/filter controls', 'charts', 'table', 'insight panel'],
    requiredInteractions: ['filter/date changes', 'chart hover details', 'table sorting', 'empty chart state'],
    requiredStates: ['loading skeleton', 'empty data', 'error', 'active filter', 'selected row'],
    motionRules: ['chart reveal', 'metric count-up only if honest', 'reduced-motion fallback'],
    forbiddenPatterns: ['marketing copy as main content', 'meaningless charts', 'random decorative colors'],
    auditRules: ['numbers must be coherent', 'filters must be visible', 'charts must have labels'],
    functionalRules: ['filters must affect metrics or clearly show demo behavior', 'tables must sort/filter if controls exist'],
  },
  admin_panel: {
    platformType: 'admin_panel',
    designStrategy: 'Reliable internal control surface with safe operations.',
    layoutStrategy: 'Sidebar, search/filter bar, data table, detail drawer, confirmation states.',
    density: 'high',
    trustLevel: 'critical',
    paletteStrategy: 'Neutral, high contrast, semantic warnings for destructive actions.',
    typographyStrategy: 'Compact UI text, tabular data, strong labels.',
    requiredComponents: ['sidebar', 'table', 'filters', 'row actions', 'confirmation modal'],
    requiredInteractions: ['bulk selection', 'row actions', 'search/filter', 'confirm/cancel destructive action'],
    requiredStates: ['loading', 'empty', 'error', 'permission denied', 'selected', 'destructive confirm'],
    motionRules: ['drawer/modal fade', 'row hover', 'reduced-motion fallback'],
    forbiddenPatterns: ['playful marketing UI', 'destructive button without confirmation', 'hidden permissions'],
    auditRules: ['destructive actions must be safe', 'tables must be scannable', 'permissions/roles must be visible if relevant'],
    functionalRules: ['row actions must change state or open a detail', 'bulk actions must require selection'],
  },
  marketplace: {
    platformType: 'marketplace',
    designStrategy: 'Discovery plus trust, optimized for comparing options.',
    layoutStrategy: 'Search, filters, listings grid/list, seller trust, saved items, contact/buy flow.',
    density: 'medium',
    trustLevel: 'high',
    paletteStrategy: 'Light commerce surfaces with trust accents and clear availability states.',
    typographyStrategy: 'Readable item titles, compact metadata, strong price/action treatment.',
    requiredComponents: ['search', 'filters', 'listing cards', 'trust badges', 'saved/favorite action'],
    requiredInteractions: ['filter results', 'save item', 'open listing detail', 'contact/buy action'],
    requiredStates: ['loading listings', 'no results', 'saved', 'unavailable', 'error'],
    motionRules: ['filter chips motion', 'card hover zoom/lift', 'reduced-motion fallback'],
    forbiddenPatterns: ['identical generic cards', 'no seller trust', 'dead filters'],
    auditRules: ['listings must have differentiating data', 'trust signals must be present', 'no-results state required'],
    functionalRules: ['filters/search must affect list', 'save/contact actions must show feedback'],
  },
  ecommerce: {
    platformType: 'ecommerce',
    designStrategy: 'Commerce flow with product confidence and purchase intent.',
    layoutStrategy: 'Catalog, filters, product detail/quick view, cart drawer, checkout summary.',
    density: 'medium',
    trustLevel: 'high',
    paletteStrategy: 'Warm neutral commerce base with clear price, stock, and CTA hierarchy.',
    typographyStrategy: 'Readable product names, tabular prices, compact metadata.',
    requiredComponents: ['catalog', 'filters', 'product cards', 'cart', 'checkout summary', 'trust/returns'],
    requiredInteractions: ['add to cart', 'quantity changes', 'variant selection', 'remove from cart'],
    requiredStates: ['empty cart', 'out of stock', 'loading products', 'order success', 'form error'],
    motionRules: ['cart drawer slide', 'add-to-cart feedback', 'reduced-motion fallback'],
    forbiddenPatterns: ['fake checkout success without demo label', 'generic SaaS cards', 'missing price/stock'],
    auditRules: ['cart path must be visible', 'product data must be coherent', 'purchase controls must be wired'],
    functionalRules: ['add/remove/quantity must update totals', 'checkout form must validate or show honest demo state'],
  },
  restaurant: {
    platformType: 'restaurant',
    designStrategy: 'Hospitality product with immediate service actions.',
    layoutStrategy: 'Hero/venue signal, menu categories, reservation widget, hours/location, reviews.',
    density: 'medium',
    trustLevel: 'standard',
    paletteStrategy: 'Warm restrained palette with appetite-friendly imagery blocks and readable menus.',
    typographyStrategy: 'Human sans with menu-friendly hierarchy and compact metadata.',
    requiredComponents: ['menu', 'reservation form', 'hours', 'location/contact', 'reviews'],
    requiredInteractions: ['category switch', 'reservation validation', 'call/directions action', 'menu item detail'],
    requiredStates: ['closed/open status', 'reservation success/error', 'empty category', 'loading'],
    motionRules: ['menu category transition', 'reservation feedback', 'reduced-motion fallback'],
    forbiddenPatterns: ['generic SaaS dashboard', 'no menu', 'no reservation or contact path'],
    auditRules: ['service actions must be above the fold or easy to reach', 'hours/location must be visible'],
    functionalRules: ['reservation form must validate', 'category/filter controls must change menu display'],
  },
  portfolio: {
    platformType: 'portfolio',
    designStrategy: 'Editorial proof of craft and personality.',
    layoutStrategy: 'Editorial intro, selected work, case study rhythm, process, contact.',
    density: 'low',
    trustLevel: 'standard',
    paletteStrategy: 'Distinct but restrained editorial palette tied to the creator/agency mood.',
    typographyStrategy: 'High-contrast display/body pairing with careful line length.',
    requiredComponents: ['selected work', 'case studies', 'bio/about', 'services/process', 'contact'],
    requiredInteractions: ['project filter or carousel', 'case study reveal', 'contact CTA'],
    requiredStates: ['hover', 'focus-visible', 'empty projects if filtered', 'contact feedback'],
    motionRules: ['clip/blur reveal', 'image hover', 'reduced-motion fallback'],
    forbiddenPatterns: ['three identical service cards only', 'generic agency hero', 'no real project detail'],
    auditRules: ['must show craft proof quickly', 'projects need meaningful descriptions', 'contact path must be clear'],
    functionalRules: ['project interactions must reveal or filter content', 'contact action must work or show demo feedback'],
  },
  crm_erp: {
    platformType: 'crm_erp',
    designStrategy: 'Business operations with records, workflows, and accountability.',
    layoutStrategy: 'Sidebar, pipeline/table, record detail, forms, activity log, alerts.',
    density: 'high',
    trustLevel: 'critical',
    paletteStrategy: 'Neutral operational palette with strong semantic status colors.',
    typographyStrategy: 'Compact UI text and tabular numbers for records, invoices, inventory.',
    requiredComponents: ['record list', 'filters', 'pipeline/table', 'detail panel', 'form', 'activity log'],
    requiredInteractions: ['search/filter', 'record selection', 'status update', 'form validation'],
    requiredStates: ['empty records', 'validation error', 'saved', 'permission warning', 'selected'],
    motionRules: ['detail drawer', 'status chip transition', 'reduced-motion fallback'],
    forbiddenPatterns: ['landing-page layout', 'no data relationships', 'decorative-only charts'],
    auditRules: ['records must have fields and next actions', 'data relationships must be legible'],
    functionalRules: ['status/form updates must mutate local state', 'filters must affect records'],
  },
  mobile_first_app: {
    platformType: 'mobile_first_app',
    designStrategy: 'Thumb-first product with a complete compact flow.',
    layoutStrategy: 'Mobile frame/responsive layout, bottom nav, sticky primary action, short task screens.',
    density: 'medium',
    trustLevel: 'standard',
    paletteStrategy: 'Clear high-contrast mobile surfaces with restrained accent.',
    typographyStrategy: 'Readable mobile text, compact labels, no viewport-based font scaling.',
    requiredComponents: ['bottom nav', 'cards/list', 'primary sticky action', 'screen states'],
    requiredInteractions: ['tab switching', 'swipe-like or button navigation', 'form/action feedback'],
    requiredStates: ['active tab', 'empty', 'loading', 'error', 'success'],
    motionRules: ['screen transition', 'button feedback', 'reduced-motion fallback'],
    forbiddenPatterns: ['desktop sidebar squeezed into mobile', 'tiny tap targets', 'overflowing text'],
    auditRules: ['tap targets must be large enough', 'mobile first must not break desktop'],
    functionalRules: ['navigation must change visible screen', 'primary action must update state or show feedback'],
  },
  auth_flow: {
    platformType: 'auth_flow',
    designStrategy: 'Calm trust and low-friction access.',
    layoutStrategy: 'Focused auth panel with supporting trust visual, progress/steps if onboarding.',
    density: 'low',
    trustLevel: 'critical',
    paletteStrategy: 'Neutral light base, high text contrast, subtle success/error colors.',
    typographyStrategy: 'Clear labels, compact helper text, no oversized marketing type in forms.',
    requiredComponents: ['auth form', 'validation messages', 'social sign-in affordance', 'recovery path', 'privacy note'],
    requiredInteractions: ['show/hide password', 'submit validation', 'mode toggle login/signup', 'forgot password'],
    requiredStates: ['invalid input', 'loading submit', 'success', 'error', 'disabled'],
    motionRules: ['form field focus', 'error slide', 'reduced-motion fallback'],
    forbiddenPatterns: ['blurred controls', 'missing labels', 'auth without recovery path'],
    auditRules: ['forms need labels and validation', 'privacy/recovery must be visible'],
    functionalRules: ['submit must validate inputs', 'mode toggles must work', 'password controls must work'],
  },
  ai_tool: {
    platformType: 'ai_tool',
    designStrategy: 'Fast AI workspace with honest state and visible output.',
    layoutStrategy: 'Prompt/input area, conversation/history, output/preview, tool/status rail, settings/model controls.',
    density: 'high',
    trustLevel: 'high',
    paletteStrategy: 'Warm product surface with subtle blue accents for active AI state.',
    typographyStrategy: 'Compact UI plus readable message text; mono only for code/data.',
    requiredComponents: ['prompt input', 'conversation stream', 'status steps', 'output/preview', 'settings/model state'],
    requiredInteractions: ['send/stop', 'mode/model select', 'copy/download', 'clear or retry', 'settings open'],
    requiredStates: ['thinking', 'streaming', 'cancelled', 'error', 'empty conversation', 'output ready'],
    motionRules: ['shimmer only while working', 'status step reveal', 'reduced-motion fallback'],
    forbiddenPatterns: ['fake steps', 'generic shimmer forever', 'forcing user to choose technical modes'],
    auditRules: ['AI states must be honest', 'simple conversation must be fast', 'output must persist'],
    functionalRules: ['send/stop must work', 'streamed messages must remain after completion', 'retry/copy must provide feedback'],
  },
  fintech_billing: {
    platformType: 'fintech_billing',
    designStrategy: 'Financial clarity, safety, and trust.',
    layoutStrategy: 'Balance summary, transactions, invoices/plans, alerts, payment method, export.',
    density: 'high',
    trustLevel: 'critical',
    paletteStrategy: 'Neutral trust palette with sober blue/green semantics and no playful gradients.',
    typographyStrategy: 'Tabular numbers, precise labels, clear small print.',
    requiredComponents: ['balance', 'transactions', 'plan/invoices', 'payment method', 'alerts'],
    requiredInteractions: ['filter transactions', 'download/export', 'payment method edit', 'confirm payment-like actions'],
    requiredStates: ['loading', 'failed payment', 'refunded', 'pending', 'success'],
    motionRules: ['subtle status transitions', 'modal confirm', 'reduced-motion fallback'],
    forbiddenPatterns: ['fake bank behavior', 'unclear money movement', 'missing confirmation'],
    auditRules: ['financial actions must be explicit', 'amounts must be tabular and coherent'],
    functionalRules: ['filters/export must work or show honest demo state', 'dangerous actions must confirm'],
  },
  healthcare_education: {
    platformType: 'healthcare_education',
    designStrategy: 'Accessible guidance with low cognitive load.',
    layoutStrategy: 'Clear dashboard/course/patient list, progress, resources, help, forms.',
    density: 'medium',
    trustLevel: 'critical',
    paletteStrategy: 'Calm neutral base with accessible semantic accents.',
    typographyStrategy: 'Large readable body, clear labels, no cramped low-contrast text.',
    requiredComponents: ['progress or records', 'resource list', 'forms', 'help/consent note', 'status cards'],
    requiredInteractions: ['progress update', 'resource filtering', 'form validation', 'help access'],
    requiredStates: ['loading', 'empty', 'error', 'completed', 'needs attention'],
    motionRules: ['gentle reveal', 'feedback motion only', 'reduced-motion fallback'],
    forbiddenPatterns: ['clinical claims without caveats', 'low contrast', 'playful confusion'],
    auditRules: ['readability and accessibility are mandatory', 'sensitive states must be clear'],
    functionalRules: ['forms must validate', 'progress/filter actions must update state'],
  },
  gaming_creative: {
    platformType: 'gaming_creative',
    designStrategy: 'Expressive interaction with immediate creative feedback.',
    layoutStrategy: 'Interactive canvas/play area, controls, settings, score/history/output panel.',
    density: 'medium',
    trustLevel: 'standard',
    paletteStrategy: 'More expressive accent palette but controlled contrast and no eye-searing neon.',
    typographyStrategy: 'Playful display used sparingly with readable UI labels.',
    requiredComponents: ['interactive stage', 'controls', 'settings', 'score/history or output', 'empty/help state'],
    requiredInteractions: ['play/create action', 'settings change', 'reset', 'save/export if relevant'],
    requiredStates: ['idle', 'active', 'paused', 'success', 'error'],
    motionRules: ['gameplay/creative motion', 'input feedback', 'reduced-motion fallback'],
    forbiddenPatterns: ['static marketing page', 'controls that do nothing', 'no reset/help'],
    auditRules: ['primary interaction must be visible immediately', 'motion must serve interaction'],
    functionalRules: ['core play/create controls must update visible state', 'reset must work'],
  },
  generic_web_app: {
    platformType: 'generic_web_app',
    designStrategy: 'Infer a product-specific app and avoid bland template defaults.',
    layoutStrategy: 'Choose the most likely layout from the request and make the first screen useful.',
    density: 'medium',
    trustLevel: 'standard',
    paletteStrategy: 'Warm neutral base with one distinctive accent chosen for the product mood.',
    typographyStrategy: 'Readable sans with a deliberate type scale and clear hierarchy.',
    requiredComponents: ['primary workflow', 'navigation or clear sections', 'content/data area', 'feedback states'],
    requiredInteractions: ['primary action', 'secondary action', 'form/filter/toggle when relevant'],
    requiredStates: ['loading', 'empty', 'error', 'success', 'focus-visible'],
    motionRules: ['useful hover/focus motion', 'reduced-motion fallback'],
    forbiddenPatterns: ['generic cards only', 'static screenshot', 'dead controls'],
    auditRules: ['must feel like an app for the prompt, not a generic template'],
    functionalRules: ['primary controls must work or show honest feedback'],
  },
};

const antiAiDesignRules = [
  'Never produce UI that looks AI-generated, like a Tailwind starter kit, purple-blue gradient page, generic hero, or identical card grid.',
  'Use a deliberate mini design system: CSS custom properties for color, semantic states, type, spacing, radius, shadows, z-index, and motion.',
  'Define one primary color, one secondary/accent color, neutral surfaces/text/borders, and semantic --success, --warning, --error, and --info tokens.',
  'Use at least two distinct font roles: display/body or body/mono, with intentional contrast and safe fallbacks.',
  'Use a fixed type scale close to 12 / 14 / 16 / 20 / 24 / 32 / 48px, context-specific line heights, and tabular numbers for metrics or data.',
  'Use distinctive accent colors that match the product mood; avoid Tailwind default blue, indigo, violet, and the common AI gradient.',
  'Use 4px/8px-grid spacing. Every value must feel deliberate and consistent, never random one-off spacing.',
  'Buttons and core controls must have an accessible touch target close to 44x44px unless the component is a compact secondary icon with a clear surrounding hit area.',
  'Create component states for hover, active, focus-visible, disabled, loading, empty, success, warning, and error.',
  'Use real perceived-performance patterns: skeletons for loading lists/cards and graceful empty states.',
  'Respect WCAG AA contrast, semantic landmarks, visible focus, and reduced motion.',
  'Use purposeful motion with custom cubic-bezier timings; avoid transition-all and decoration-only animation.',
  'Never include secrets, API keys, .env files, lockfiles, node_modules, absolute paths, or path traversal.',
  'Generate production-ready code that is self-contained for preview and would pass a senior product design review.',
];

const functionalQualityGate = [
  'A beautiful app that is broken is a failed generation.',
  'Never sacrifice functionality for aesthetics. Every primary UI control must have a working interaction, visible feedback, or an honest placeholder state.',
  'The app must render without a blank preview or obvious JavaScript crash.',
  'Buttons, forms, filters, tabs, modals, menus, toggles, carts, and navigation must update visible state when present.',
  'Forms must include labels, validation, field-level errors, disabled/loading submit state when sending, and success feedback.',
  'Search must filter visible data in real time with debounce when the dataset is non-trivial. Filters and sorting must visibly change the displayed content.',
  'Add actions must add an item locally. Delete/remove actions must ask for confirmation or provide an undo-safe interaction, then update the list.',
  'Tabs must switch content. Modals/drawers must open, close, support Escape, and not trap the user visually.',
  'Do not claim real backend, payments, auth, emails, AI calls, or persistence unless the generated project actually implements or clearly labels the behavior as demo/local.',
  'If package.json exists, the generated scripts should be runnable by the runner without hidden packages or secrets.',
  'If functionality is mocked, the UI must remain honest, useful, and interactive.',
];

const selfAudit = [
  'Before returning JSON, silently audit whether the platform type, layout, typography, color, spacing, motion, loading, empty, error, and responsive states match the prompt.',
  'Write an internal design brief before coding: problem solved, end user, primary action, critical journey, visual mood, truly necessary screens/components, interactions, states, motion, and platform risks.',
  'Apply the 3-second rule to every screen: useful title, obvious primary action, discreet secondary actions, clean grid, and clearly separated zones.',
  'If the design feels generic, revise it internally before output.',
  'If the prompt asks for an operational app, do not output a landing page.',
  'If the prompt asks for a landing page, do not output a generic dashboard shell.',
  'If the prompt asks for a mobile app, do not output a desktop page simply squeezed to mobile.',
  'If the prompt asks for finance, health, auth, or admin, prioritize trust, clarity, confirmations, and error states.',
  'Ensure the preview is not blank and index.html is a Vite shell for new apps, not the whole product.',
  'Ensure every primary UI control has behavior, visible feedback, or an honest demo state.',
  'Ensure final summary is product-oriented, not raw file accounting. Mention what users can test next.',
];

function normalizePrompt(prompt: string) {
  return prompt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some(keyword => text.includes(normalizePrompt(keyword)));
}

export function classifyGeneratedAppType(prompt: string): GeneratedAppType {
  const text = normalizePrompt(prompt);

  if (!text) return 'generic_web_app';

  const explicitOrder: GeneratedAppType[] = [
    'landing_page',
    'analytics_dashboard',
    'fintech_billing',
    'healthcare_education',
    'gaming_creative',
    'ai_tool',
    'auth_flow',
    'admin_panel',
    'crm_erp',
    'marketplace',
    'ecommerce',
    'portfolio',
    'mobile_first_app',
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

  if (hasAny(text, ['luxury', 'premium', 'high end', 'exclusive', 'luxe'])) return 'luxury_minimal';
  if (hasAny(text, ['playful', 'kids', 'game', 'fun', 'colorful', 'jeu'])) return 'playful_consumer';

  switch (appType) {
    case 'landing_page':
      return 'cinematic_landing';
    case 'analytics_dashboard':
    case 'admin_panel':
    case 'crm_erp':
      return 'data_operational';
    case 'saas_dashboard':
    case 'ai_tool':
      return 'dense_devtool';
    case 'marketplace':
    case 'ecommerce':
      return 'commerce_trust';
    case 'restaurant':
      return 'hospitality_warm';
    case 'portfolio':
      return 'editorial_portfolio';
    case 'mobile_first_app':
      return 'mobile_product';
    case 'auth_flow':
      return 'luxury_minimal';
    case 'fintech_billing':
    case 'healthcare_education':
      return 'regulated_trust';
    case 'gaming_creative':
      return 'immersive_creative';
    default:
      return 'warm_saas';
  }
}

export function getAppTypeUxRules(appType: GeneratedAppType) {
  return appTypeRules[appType];
}

export function getPlatformIntelligence(appType: GeneratedAppType) {
  return platformIntelligence[appType];
}

export function buildGeneratedDesignBrief(input: {
  prompt: string;
  appType: GeneratedAppType;
  designDirection: DesignDirection;
}): GeneratedDesignBrief {
  const intelligence = getPlatformIntelligence(input.appType);
  const normalizedPrompt = normalizePrompt(input.prompt);
  const riskFlags = [
    normalizedPrompt.includes('auth') || normalizedPrompt.includes('connexion') ? 'auth trust and validation risk' : '',
    normalizedPrompt.includes('payment') || normalizedPrompt.includes('paiement') || normalizedPrompt.includes('billing') ? 'payment or billing trust risk' : '',
    normalizedPrompt.includes('dashboard') || normalizedPrompt.includes('crm') ? 'must not become a marketing page' : '',
    normalizedPrompt.includes('mobile') || normalizedPrompt.includes('pwa') ? 'mobile interaction and tap target risk' : '',
  ].filter(Boolean);

  return {
    platform_type: input.appType,
    design_direction: input.designDirection,
    audience: inferAudience(input.appType),
    product_promise: inferProductPromise(input.appType),
    design_mood: intelligence.designStrategy,
    layout_strategy: intelligence.layoutStrategy,
    density: intelligence.density,
    palette: intelligence.paletteStrategy,
    typography: intelligence.typographyStrategy,
    required_components: intelligence.requiredComponents,
    required_interactions: intelligence.requiredInteractions,
    required_states: intelligence.requiredStates,
    motion_plan: intelligence.motionRules,
    forbidden_patterns: intelligence.forbiddenPatterns,
    audit_rules: intelligence.auditRules,
    functionality_rules: intelligence.functionalRules,
    risk_flags: riskFlags.length ? riskFlags : ['avoid generic layout and dead controls'],
  };
}

function inferAudience(appType: GeneratedAppType) {
  switch (appType) {
    case 'admin_panel':
    case 'crm_erp':
      return 'operators who repeat work daily and need speed, clarity, and safety';
    case 'analytics_dashboard':
      return 'decision makers who need fast insight and reliable numbers';
    case 'ecommerce':
    case 'marketplace':
      return 'buyers comparing options and needing trust before acting';
    case 'restaurant':
      return 'mobile visitors who want menu, hours, contact, and reservations quickly';
    case 'auth_flow':
      return 'new or returning users who need confidence and low friction';
    case 'ai_tool':
      return 'users asking an AI product to produce visible work and explain status clearly';
    case 'fintech_billing':
      return 'users handling money, credits, invoices, and plans';
    case 'healthcare_education':
      return 'users who need calm guidance, accessibility, and readable information';
    case 'gaming_creative':
      return 'users who want immediate creative or playful feedback';
    case 'portfolio':
      return 'clients or recruiters judging taste and proof of craft';
    case 'mobile_first_app':
      return 'mobile users completing short tasks with one hand';
    case 'landing_page':
      return 'prospects deciding whether the product is worth trying';
    default:
      return 'product users who need a clear, useful first experience';
  }
}

function inferProductPromise(appType: GeneratedAppType) {
  switch (appType) {
    case 'landing_page':
      return 'explain the product and convert interest into action';
    case 'saas_dashboard':
      return 'help users manage work and understand status quickly';
    case 'analytics_dashboard':
      return 'turn data into decisions without visual noise';
    case 'admin_panel':
      return 'let internal teams act safely on operational data';
    case 'marketplace':
      return 'help users discover, compare, trust, and transact';
    case 'ecommerce':
      return 'help shoppers choose products and complete a credible cart flow';
    case 'restaurant':
      return 'help guests choose, reserve, visit, or contact the venue';
    case 'portfolio':
      return 'prove taste, capability, and fit through selected work';
    case 'crm_erp':
      return 'help teams track records, status, and next actions';
    case 'mobile_first_app':
      return 'make the core task fast and thumb-friendly';
    case 'auth_flow':
      return 'get users safely into the product with clear recovery paths';
    case 'ai_tool':
      return 'turn prompts into useful output with transparent progress';
    case 'fintech_billing':
      return 'make balances, payments, invoices, and credits understandable and safe';
    case 'healthcare_education':
      return 'make learning or sensitive information calm, readable, and actionable';
    case 'gaming_creative':
      return 'make play or creation immediate, responsive, and delightful';
    default:
      return 'deliver a useful interactive product, not a static mockup';
  }
}

function bulletList(title: string, items: string[]) {
  return [title, ...items.map(item => `- ${item}`)].join('\n');
}

export function buildWorldClassUiPolicy(input: {
  prompt: string;
  appType?: GeneratedAppType;
  designDirection?: DesignDirection;
}): WorldClassUiPolicy {
  const appType = input.appType || classifyGeneratedAppType(input.prompt);
  const designDirection = input.designDirection || chooseDesignDirection(appType, input.prompt);
  const rules = getAppTypeUxRules(appType);
  const intelligence = getPlatformIntelligence(appType);
  const designBrief = buildGeneratedDesignBrief({ prompt: input.prompt, appType, designDirection });

  const systemPrompt = [
    'WORLD-CLASS UI GENERATION ENGINE / Anti-AI-Design Protocol V6.',
    'Act as a Principal Product Designer, Senior Frontend Engineer, and Product QA reviewer.',
    `Detected platform type: ${appType}.`,
    `Design direction: ${designDirection}.`,
    '',
    'Structured design brief to follow before coding:',
    JSON.stringify(designBrief, null, 2),
    '',
    'Platform intelligence:',
    `- Design strategy: ${intelligence.designStrategy}`,
    `- Layout strategy: ${intelligence.layoutStrategy}`,
    `- Density: ${intelligence.density}`,
    `- Trust level: ${intelligence.trustLevel}`,
    `- Palette: ${intelligence.paletteStrategy}`,
    `- Typography: ${intelligence.typographyStrategy}`,
    bulletList('Required components:', intelligence.requiredComponents),
    bulletList('Required interactions:', intelligence.requiredInteractions),
    bulletList('Required states:', intelligence.requiredStates),
    bulletList('Motion rules:', intelligence.motionRules),
    bulletList('Forbidden platform patterns:', intelligence.forbiddenPatterns),
    bulletList('Platform audit rules:', intelligence.auditRules),
    bulletList('Platform functional rules:', intelligence.functionalRules),
    '',
    bulletList('App-type rules:', rules),
    bulletList('Global anti-AI-design rules:', antiAiDesignRules),
    bulletList('Functional quality gate:', functionalQualityGate),
    bulletList('Self-audit before output:', selfAudit),
  ].join('\n');

  return {
    appType,
    designDirection,
    appTypeRules: rules,
    platformIntelligence: intelligence,
    designBrief,
    systemPrompt,
    userContext: {
      appType,
      designDirection,
      platformIntelligence: intelligence,
      designBrief,
      antiAiDesignRules,
      appTypeRules: rules,
      selfAudit,
      functionalQualityGate,
    },
  };
}
