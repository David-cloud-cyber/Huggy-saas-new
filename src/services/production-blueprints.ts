export type ProductionBlueprintType =
  | 'saas'
  | 'marketplace'
  | 'crm'
  | 'booking'
  | 'ecommerce'
  | 'admin_dashboard'
  | 'internal_tool'
  | 'ai_tool'
  | 'blog_cms';

export type ProductionBlueprintTable = {
  name: string;
  purpose: string;
  columns: string[];
  access: 'owner' | 'organization' | 'public_read_private_write';
  indexes: string[];
  sensitive?: boolean;
};

export type ProductionBlueprint = {
  type: ProductionBlueprintType;
  label: string;
  frontend: {
    framework: 'vite-react-ts' | 'nextjs-react-ts';
    requiredFiles: string[];
    requiredStates: string[];
  };
  backend: {
    provider: 'huggy-cloud-supabase';
    features: string[];
    requiresAuth: boolean;
    requiresDatabase: boolean;
    requiresStorage: boolean;
    requiresBilling: boolean;
  };
  pages: string[];
  tables: ProductionBlueprintTable[];
  components: string[];
  workflows: string[];
  tests: string[];
  risks: string[];
  acceptanceCriteria: string[];
};

const COMMON_REQUIRED_FILES = [
  'package.json',
  'index.html',
  'src/main.tsx',
  'src/App.tsx',
  'src/index.css',
  'src/app.test.ts',
  'README.md',
];

const COMMON_STATES = ['loading', 'empty', 'error', 'success', 'disabled'];

const COMMON_TESTS = [
  'typescript_build',
  'preview_non_empty',
  'responsive_mobile_first',
  'primary_controls_work',
  'no_frontend_secrets',
  'no_fake_production_readiness',
];

const COMMON_ACCEPTANCE = [
  'The generated app renders without a blank screen.',
  'Primary controls have visible behavior or honest disabled feedback.',
  'Private data paths require a session and role-aware access.',
  'No service role key, provider secret, or raw token is present in frontend files.',
  'Generated SQL enables RLS on every user table and includes matching policies.',
];

function table(
  name: string,
  purpose: string,
  columns: string[] = [],
  access: ProductionBlueprintTable['access'] = 'organization',
  options: Partial<Pick<ProductionBlueprintTable, 'indexes' | 'sensitive'>> = {},
): ProductionBlueprintTable {
  return {
    name,
    purpose,
    columns,
    access,
    indexes: options.indexes || ['organization_id', 'owner_id', 'created_at'],
    sensitive: options.sensitive,
  };
}

const BLUEPRINTS: Record<ProductionBlueprintType, ProductionBlueprint> = {
  saas: {
    type: 'saas',
    label: 'SaaS',
    frontend: { framework: 'vite-react-ts', requiredFiles: COMMON_REQUIRED_FILES, requiredStates: COMMON_STATES },
    backend: { provider: 'huggy-cloud-supabase', features: ['auth', 'database', 'usage', 'billing-ready'], requiresAuth: true, requiresDatabase: true, requiresStorage: false, requiresBilling: false },
    pages: ['landing', 'auth', 'dashboard', 'settings', 'billing', 'admin'],
    tables: [
      table('app_projects', 'User-created SaaS projects'),
      table('app_usage_events', 'Metered product usage', ['event_type text not null', "units integer not null default 1"], 'organization', { sensitive: true }),
      table('app_subscriptions', 'Subscription state mirrored from billing provider', ['provider_customer_id text', 'provider_subscription_id text', "status text not null default 'inactive'"], 'organization', { sensitive: true }),
      table('app_audit_logs', 'Sensitive action audit trail', ['action text not null', "actor_role text not null default 'member'"], 'organization', { sensitive: true }),
    ],
    components: ['workspace shell', 'dashboard cards', 'settings panel', 'usage meter', 'billing status'],
    workflows: ['invite member', 'create project', 'update settings', 'record usage', 'review audit log'],
    tests: [...COMMON_TESTS, 'auth_route_protection', 'usage_events_rls', 'billing_not_client_only'],
    risks: ['tenant isolation', 'billing drift', 'admin permission leakage'],
    acceptanceCriteria: [...COMMON_ACCEPTANCE, 'Workspace data is isolated by organization membership.'],
  },
  marketplace: {
    type: 'marketplace',
    label: 'Marketplace',
    frontend: { framework: 'vite-react-ts', requiredFiles: COMMON_REQUIRED_FILES, requiredStates: COMMON_STATES },
    backend: { provider: 'huggy-cloud-supabase', features: ['auth', 'database', 'storage', 'payments-ready'], requiresAuth: true, requiresDatabase: true, requiresStorage: true, requiresBilling: true },
    pages: ['home', 'search', 'listing detail', 'seller dashboard', 'orders', 'checkout'],
    tables: [
      table('app_sellers', 'Seller profiles and verification state', ['display_name text not null', "verification_status text not null default 'pending'"], 'organization', { sensitive: true }),
      table('app_products', 'Seller products or listings', ['seller_id uuid', 'price_cents integer not null default 0', "status text not null default 'draft'"], 'organization'),
      table('app_orders', 'Buyer orders', ['buyer_id uuid references auth.users(id)', 'seller_id uuid', "status text not null default 'pending'", 'total_cents integer not null default 0'], 'organization', { sensitive: true }),
      table('app_payments', 'Payment status mirrored from Stripe', ['order_id uuid', 'provider_payment_id text', "status text not null default 'pending'"], 'organization', { sensitive: true }),
      table('app_reviews', 'Buyer reviews', ['product_id uuid', 'rating integer check (rating between 1 and 5)', 'body text'], 'organization'),
    ],
    components: ['search filters', 'listing cards', 'seller trust badge', 'cart/checkout state', 'order timeline'],
    workflows: ['seller onboarding', 'publish listing', 'place order', 'review order', 'moderate listing'],
    tests: [...COMMON_TESTS, 'seller_product_policy', 'buyer_order_policy', 'payment_webhook_signature'],
    risks: ['buyer/seller data leakage', 'client-only pricing', 'unsafe uploads'],
    acceptanceCriteria: [...COMMON_ACCEPTANCE, 'Orders, payments, products, and sellers have RLS policies.'],
  },
  crm: {
    type: 'crm',
    label: 'CRM',
    frontend: { framework: 'vite-react-ts', requiredFiles: COMMON_REQUIRED_FILES, requiredStates: COMMON_STATES },
    backend: { provider: 'huggy-cloud-supabase', features: ['auth', 'database', 'audit_logs'], requiresAuth: true, requiresDatabase: true, requiresStorage: false, requiresBilling: false },
    pages: ['dashboard', 'contacts', 'companies', 'deals', 'tasks', 'settings'],
    tables: [
      table('app_companies', 'Account records', ['domain text', "status text not null default 'active'"]),
      table('app_contacts', 'People linked to companies', ['company_id uuid', 'email text', 'phone text']),
      table('app_deals', 'Pipeline opportunities', ['company_id uuid', 'amount_cents integer not null default 0', "stage text not null default 'lead'"]),
      table('app_tasks', 'Follow-up tasks', ['due_at timestamptz', "status text not null default 'todo'"]),
      table('app_notes', 'Private notes on CRM records', ['body text not null'], 'organization', { sensitive: true }),
      table('app_audit_logs', 'Sensitive CRM action audit trail', ['action text not null'], 'organization', { sensitive: true }),
    ],
    components: ['sidebar', 'client table', 'contacts table', 'pipeline board', 'task drawer', 'notes panel'],
    workflows: ['create contact', 'move deal stage', 'assign task', 'add note', 'export safe view'],
    tests: [...COMMON_TESTS, 'contact_crud', 'pipeline_stage_updates', 'notes_private_policy'],
    risks: ['private customer data leakage', 'notes visible across organizations'],
    acceptanceCriteria: [...COMMON_ACCEPTANCE, 'Contacts, deals, tasks, notes, and audit logs are organization-scoped.'],
  },
  booking: {
    type: 'booking',
    label: 'Booking',
    frontend: { framework: 'vite-react-ts', requiredFiles: COMMON_REQUIRED_FILES, requiredStates: COMMON_STATES },
    backend: { provider: 'huggy-cloud-supabase', features: ['auth', 'database', 'payments-ready', 'realtime-optional'], requiresAuth: true, requiresDatabase: true, requiresStorage: false, requiresBilling: true },
    pages: ['services', 'calendar', 'booking flow', 'customers', 'payments'],
    tables: [
      table('app_services', 'Bookable services', ['duration_minutes integer not null default 30', 'price_cents integer not null default 0']),
      table('app_availability', 'Availability windows', ['starts_at timestamptz not null', 'ends_at timestamptz not null']),
      table('app_customers', 'Customer profiles', ['email text', 'phone text'], 'organization', { sensitive: true }),
      table('app_bookings', 'Reservations', ['customer_id uuid', 'service_id uuid', 'starts_at timestamptz not null', "status text not null default 'pending'"], 'organization', { sensitive: true }),
      table('app_payments', 'Booking payment state', ['booking_id uuid', 'provider_payment_id text', "status text not null default 'pending'"], 'organization', { sensitive: true }),
    ],
    components: ['calendar', 'service cards', 'booking form', 'availability editor', 'confirmation state'],
    workflows: ['choose service', 'select time', 'validate booking', 'confirm payment', 'reschedule'],
    tests: [...COMMON_TESTS, 'booking_validation', 'double_booking_guard', 'payment_status_server_side'],
    risks: ['double booking', 'private customer data leakage', 'client-only payment status'],
    acceptanceCriteria: [...COMMON_ACCEPTANCE, 'Booking writes validate service, customer, time, and ownership.'],
  },
  ecommerce: {
    type: 'ecommerce',
    label: 'E-commerce',
    frontend: { framework: 'vite-react-ts', requiredFiles: COMMON_REQUIRED_FILES, requiredStates: COMMON_STATES },
    backend: { provider: 'huggy-cloud-supabase', features: ['auth', 'database', 'storage', 'payments-ready'], requiresAuth: true, requiresDatabase: true, requiresStorage: true, requiresBilling: true },
    pages: ['catalog', 'product detail', 'cart', 'checkout', 'orders', 'admin inventory'],
    tables: [
      table('app_products', 'Product catalog', ['sku text', 'price_cents integer not null default 0', 'inventory_count integer not null default 0'], 'public_read_private_write'),
      table('app_customers', 'Customer profiles', ['user_id uuid references auth.users(id)', 'email text'], 'owner', { sensitive: true }),
      table('app_orders', 'Customer orders', ['customer_id uuid', "status text not null default 'pending'", 'total_cents integer not null default 0'], 'organization', { sensitive: true }),
      table('app_order_items', 'Order line items', ['order_id uuid', 'product_id uuid', 'quantity integer not null default 1', 'price_cents integer not null default 0'], 'organization', { sensitive: true }),
      table('app_payments', 'Payment state mirrored by webhook', ['order_id uuid', 'provider_payment_id text', "status text not null default 'pending'"], 'organization', { sensitive: true }),
    ],
    components: ['catalog filters', 'product cards', 'cart drawer', 'checkout summary', 'order status'],
    workflows: ['filter products', 'add to cart', 'checkout', 'view order', 'manage inventory'],
    tests: [...COMMON_TESTS, 'cart_state_mutates', 'checkout_not_client_only', 'inventory_non_negative'],
    risks: ['price tampering', 'stock drift', 'payment status spoofing'],
    acceptanceCriteria: [...COMMON_ACCEPTANCE, 'Checkout pricing is server-owned or marked as preview-only.'],
  },
  admin_dashboard: {
    type: 'admin_dashboard',
    label: 'Admin Dashboard',
    frontend: { framework: 'vite-react-ts', requiredFiles: COMMON_REQUIRED_FILES, requiredStates: COMMON_STATES },
    backend: { provider: 'huggy-cloud-supabase', features: ['auth', 'database', 'audit_logs'], requiresAuth: true, requiresDatabase: true, requiresStorage: false, requiresBilling: false },
    pages: ['overview', 'users', 'reports', 'settings', 'audit logs'],
    tables: [
      table('app_resources', 'Managed internal resources', ['kind text not null', "status text not null default 'active'"]),
      table('app_reports', 'Operational reports', ['report_type text not null', "payload jsonb not null default '{}'::jsonb"]),
      table('app_audit_logs', 'Admin action audit trail', ['action text not null'], 'organization', { sensitive: true }),
    ],
    components: ['sidebar', 'metrics', 'tables', 'filters', 'role badges', 'audit log'],
    workflows: ['review metrics', 'filter table', 'approve action', 'inspect audit log'],
    tests: [...COMMON_TESTS, 'admin_routes_protected', 'audit_log_present'],
    risks: ['admin overexposure', 'missing audit trail'],
    acceptanceCriteria: [...COMMON_ACCEPTANCE, 'Admin views are role-protected and audited.'],
  },
  internal_tool: {
    type: 'internal_tool',
    label: 'Internal Tool',
    frontend: { framework: 'vite-react-ts', requiredFiles: COMMON_REQUIRED_FILES, requiredStates: COMMON_STATES },
    backend: { provider: 'huggy-cloud-supabase', features: ['auth', 'database', 'audit_logs'], requiresAuth: true, requiresDatabase: true, requiresStorage: false, requiresBilling: false },
    pages: ['workspace', 'records', 'approvals', 'settings', 'audit logs'],
    tables: [
      table('app_resources', 'Internal records', ['kind text not null', "status text not null default 'open'"]),
      table('app_tasks', 'Operational tasks', ['assignee_id uuid references auth.users(id)', "status text not null default 'todo'"]),
      table('app_audit_logs', 'Internal action audit trail', ['action text not null'], 'organization', { sensitive: true }),
    ],
    components: ['command bar', 'record table', 'approval queue', 'detail drawer'],
    workflows: ['create record', 'approve task', 'assign owner', 'audit action'],
    tests: [...COMMON_TESTS, 'role_guarded_actions', 'approval_feedback'],
    risks: ['private operational data leakage', 'missing confirmation on destructive actions'],
    acceptanceCriteria: [...COMMON_ACCEPTANCE, 'Sensitive internal actions require role-aware checks.'],
  },
  ai_tool: {
    type: 'ai_tool',
    label: 'AI Tool',
    frontend: { framework: 'vite-react-ts', requiredFiles: COMMON_REQUIRED_FILES, requiredStates: COMMON_STATES },
    backend: { provider: 'huggy-cloud-supabase', features: ['auth', 'database', 'edge_functions', 'secrets'], requiresAuth: true, requiresDatabase: true, requiresStorage: false, requiresBilling: false },
    pages: ['prompt workspace', 'history', 'settings', 'usage'],
    tables: [
      table('app_prompts', 'Saved user prompts', ['body text not null']),
      table('app_generations', 'Generated outputs', ['prompt_id uuid', "status text not null default 'queued'", "result jsonb not null default '{}'::jsonb"], 'organization', { sensitive: true }),
      table('app_usage_events', 'AI usage accounting', ['event_type text not null', "units integer not null default 1"], 'organization', { sensitive: true }),
    ],
    components: ['prompt input', 'stream status', 'history list', 'usage meter', 'settings'],
    workflows: ['submit prompt', 'view result', 'retry generation', 'review usage'],
    tests: [...COMMON_TESTS, 'ai_secret_server_only', 'usage_recorded', 'history_persists'],
    risks: ['provider key exposure', 'unbounded usage', 'fake streaming'],
    acceptanceCriteria: [...COMMON_ACCEPTANCE, 'Provider keys stay server-side and usage is recorded.'],
  },
  blog_cms: {
    type: 'blog_cms',
    label: 'Blog/CMS',
    frontend: { framework: 'vite-react-ts', requiredFiles: COMMON_REQUIRED_FILES, requiredStates: COMMON_STATES },
    backend: { provider: 'huggy-cloud-supabase', features: ['auth', 'database', 'storage'], requiresAuth: true, requiresDatabase: true, requiresStorage: true, requiresBilling: false },
    pages: ['home', 'post detail', 'editor', 'media library', 'settings'],
    tables: [
      table('app_posts', 'Published and draft content', ['slug text not null', 'body text not null', "status text not null default 'draft'"], 'public_read_private_write'),
      table('app_categories', 'Content categories', ['slug text not null'], 'public_read_private_write'),
      table('app_comments', 'Reader comments', ['post_id uuid', 'body text not null', "status text not null default 'pending'"], 'organization', { sensitive: true }),
      table('app_assets', 'Uploaded media metadata', ['bucket text not null default \'app-assets\'', 'path text not null', 'mime_type text', 'size_bytes bigint not null default 0'], 'organization', { sensitive: true }),
    ],
    components: ['post list', 'editor', 'media picker', 'category filters', 'preview state'],
    workflows: ['write draft', 'publish post', 'upload media', 'moderate comment'],
    tests: [...COMMON_TESTS, 'editor_validation', 'public_read_private_write_policy', 'storage_metadata_safe'],
    risks: ['unsafe uploads', 'unmoderated public content', 'private draft leakage'],
    acceptanceCriteria: [...COMMON_ACCEPTANCE, 'Drafts are private and published content is intentionally public.'],
  },
};

export function inferProductionBlueprint(prompt: string): ProductionBlueprint {
  const text = String(prompt || '').toLowerCase();
  if (/\b(marketplace|seller|buyer|listing|vendeur|acheteur|annonce)\b/.test(text)) return BLUEPRINTS.marketplace;
  if (/\b(crm|client|pipeline|deal|lead|contact|prospect)\b/.test(text)) return BLUEPRINTS.crm;
  if (/\b(booking|reservation|appointment|calendar|availability|rendez-vous|calendrier)\b/.test(text)) return BLUEPRINTS.booking;
  if (/\b(e-?commerce|shop|store|cart|catalog|checkout|inventory|boutique|panier|catalogue)\b/.test(text)) return BLUEPRINTS.ecommerce;
  if (/\b(admin dashboard|admin panel|back office|back-office|operations dashboard)\b/.test(text)) return BLUEPRINTS.admin_dashboard;
  if (/\b(internal tool|outil interne|approval|approbation|ops tool)\b/.test(text)) return BLUEPRINTS.internal_tool;
  if (/\b(ai tool|chatbot|prompt|agent|generator|generateur ia|outil ia)\b/.test(text)) return BLUEPRINTS.ai_tool;
  if (/\b(blog|cms|article|editorial|content management|publication)\b/.test(text)) return BLUEPRINTS.blog_cms;
  return BLUEPRINTS.saas;
}

export function listProductionBlueprints() {
  return Object.values(BLUEPRINTS);
}

export function buildProductionBlueprintPromptContext(blueprint: ProductionBlueprint) {
  return [
    'Production architecture blueprint:',
    JSON.stringify({
      type: blueprint.type,
      label: blueprint.label,
      frontend: blueprint.frontend,
      backend: blueprint.backend,
      pages: blueprint.pages,
      tables: blueprint.tables.map(table => ({
        name: table.name,
        purpose: table.purpose,
        access: table.access,
        sensitive: Boolean(table.sensitive),
      })),
      components: blueprint.components,
      workflows: blueprint.workflows,
      tests: blueprint.tests,
      risks: blueprint.risks,
      acceptanceCriteria: blueprint.acceptanceCriteria,
      hardRules: [
        'Do not deliver a plain demo when the user asked for a real app.',
        'Do not use localStorage as production persistence for real data.',
        'Do not expose service_role or provider secrets in frontend code.',
        'Every private table needs RLS and policies.',
        'Payments require a server-side webhook signature path.',
        'Production-ready can only be claimed after real checks.',
      ],
    }),
  ].join('\n');
}

export function isPaymentBlueprint(blueprint: ProductionBlueprint) {
  return blueprint.backend.requiresBilling || blueprint.tables.some(item => /payment|subscription/i.test(item.name));
}

export function isStorageBlueprint(blueprint: ProductionBlueprint) {
  return blueprint.backend.requiresStorage || blueprint.tables.some(item => /asset|file|media/i.test(item.name));
}
