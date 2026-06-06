import type { HuggyCloudRequirement } from './huggy-cloud.ts';
import { hasHuggyCloudRequirement } from './huggy-cloud.ts';
import {
  inferProductionBlueprint,
  isPaymentBlueprint,
  isStorageBlueprint,
  type ProductionBlueprint,
  type ProductionBlueprintTable,
} from './production-blueprints.ts';
import { containsSecret } from './secret-redaction.ts';

export type FullstackGeneratedFile = {
  path: string;
  content: string;
  language?: string;
  updated_at?: string;
};

export type FullstackKitInput = {
  files: FullstackGeneratedFile[];
  projectName: string;
  prompt: string;
  requirement: HuggyCloudRequirement;
};

export type FullstackValidationCheck = {
  key: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'info' | 'low' | 'medium' | 'high';
  message: string;
  file?: string;
};

const FULLSTACK_MARKER = 'HUGGY_FULLSTACK_READY';

function normalizePath(value: string) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function inferLanguage(filePath: string) {
  const ext = normalizePath(filePath).split('.').pop()?.toLowerCase();
  if (ext === 'tsx' || ext === 'jsx') return 'tsx';
  if (ext === 'ts' || ext === 'js') return 'ts';
  if (ext === 'css') return 'css';
  if (ext === 'sql') return 'sql';
  if (ext === 'json') return 'json';
  if (ext === 'md') return 'markdown';
  return 'text';
}

function fileByPath(files: FullstackGeneratedFile[], filePath: string) {
  const target = normalizePath(filePath).toLowerCase();
  return files.find(file => normalizePath(file.path).toLowerCase() === target);
}

function hasSupabaseUsage(files: FullstackGeneratedFile[]) {
  return files.some(file => /supabase|@supabase\/supabase-js|Huggy Cloud|huggyCloud|auth\.|\.from\(/i.test(file.content || ''));
}

export function shouldApplyHuggyFullstackKit(input: {
  prompt: string;
  files: FullstackGeneratedFile[];
  requirement: HuggyCloudRequirement;
}) {
  return Boolean(
    hasHuggyCloudRequirement(input.requirement) ||
    hasSupabaseUsage(input.files) ||
    /\b(fullstack|full stack|auth|login|signup|database|supabase|crud|storage|upload|dashboard admin|crm|marketplace|booking|reservation|orders?|products?|clients?|customers?|seller|buyer|checkout|stripe|subscription|cms|blog|internal tool|ai tool|e-?commerce)\b/i.test(input.prompt || '')
  );
}

function upsertFile(files: Map<string, FullstackGeneratedFile>, filePath: string, content: string, language = inferLanguage(filePath)) {
  const key = normalizePath(filePath);
  const existing = files.get(key);
  files.set(key, {
    path: key,
    content,
    language,
    updated_at: existing?.updated_at || new Date().toISOString(),
  });
}

function mergePackageJson(content: string) {
  let pkg: any = {};
  try {
    pkg = JSON.parse(content || '{}');
  } catch {
    pkg = {};
  }

  pkg.scripts = {
    dev: 'vite',
    build: 'vite build',
    test: 'node --experimental-strip-types src/app.test.ts && node --experimental-strip-types src/fullstack.test.ts',
    lint: 'tsc --noEmit',
    ...(pkg.scripts || {}),
  };
  if (!String(pkg.scripts.test || '').includes('src/fullstack.test.ts')) {
    pkg.scripts.test = `${String(pkg.scripts.test || 'node --experimental-strip-types src/app.test.ts').trim()} && node --experimental-strip-types src/fullstack.test.ts`;
  }

  pkg.dependencies = {
    ...(pkg.dependencies || {}),
    '@supabase/supabase-js': pkg.dependencies?.['@supabase/supabase-js'] || '^2.106.0',
    zod: pkg.dependencies?.zod || '^4.2.1',
  };
  pkg.devDependencies = {
    ...(pkg.devDependencies || {}),
  };
  return JSON.stringify(pkg, null, 2);
}

function buildHuggyCloudClient() {
  return [
    "import { createClient, type SupabaseClient } from '@supabase/supabase-js';",
    '',
    'type HuggyCloudRuntimeConfig = {',
    '  supabaseUrl?: string;',
    '  supabaseAnonKey?: string;',
    '};',
    '',
    'declare global {',
    '  interface Window {',
    '    __HUGGY_CLOUD__?: HuggyCloudRuntimeConfig;',
    '  }',
    '}',
    '',
    'const runtimeConfig = typeof window !== "undefined" ? window.__HUGGY_CLOUD__ || {} : {};',
    'const supabaseUrl = import.meta.env.VITE_HUGGY_CLOUD_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || runtimeConfig.supabaseUrl || "";',
    'const supabaseAnonKey = import.meta.env.VITE_HUGGY_CLOUD_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || runtimeConfig.supabaseAnonKey || "";',
    '',
    'export const isHuggyCloudConfigured = Boolean(supabaseUrl && supabaseAnonKey);',
    '',
    'export const huggyCloud: SupabaseClient | null = isHuggyCloudConfigured',
    '  ? createClient(supabaseUrl, supabaseAnonKey, {',
    '      auth: {',
    '        persistSession: true,',
    '        autoRefreshToken: true,',
    '        detectSessionInUrl: true,',
    '      },',
    '    })',
    '  : null;',
    '',
    'export class HuggyCloudUnavailableError extends Error {',
    '  constructor() {',
    "    super('Huggy Cloud is not configured for this preview yet. The app is running with local demo data.');",
    "    this.name = 'HuggyCloudUnavailableError';",
    '  }',
    '}',
    '',
    'export function getHuggyCloudClient() {',
    '  if (!huggyCloud) throw new HuggyCloudUnavailableError();',
    '  return huggyCloud;',
    '}',
    '',
    'export function getHuggyCloudStatus() {',
    '  return {',
    '    ready: isHuggyCloudConfigured,',
    "    message: isHuggyCloudConfigured ? 'Huggy Cloud is connected.' : 'Preview mode: Huggy Cloud is not connected yet.',",
    '  };',
    '}',
    '',
  ].join('\n');
}

function buildAppDataLayer(requirement: HuggyCloudRequirement) {
  const needsAuth = requirement.needs_auth;
  return [
    "import { getHuggyCloudClient, isHuggyCloudConfigured } from './huggyCloud';",
    '',
    'export type AppRecord = {',
    '  id: string;',
    '  title: string;',
    '  status: "todo" | "active" | "done";',
    '  payload?: Record<string, unknown>;',
    '  created_at?: string;',
    '};',
    '',
    "const STORAGE_KEY = 'huggy-demo-records';",
    'const isPreviewRuntime = typeof window !== "undefined" && (',
    '  window.location.hostname === "localhost" ||',
    '  window.location.hostname === "127.0.0.1" ||',
    '  window.location.hostname.includes("preview.") ||',
    '  window.location.search.includes("preview=1")',
    ');',
    '',
    'const demoRecords: AppRecord[] = [',
    "  { id: 'demo-1', title: 'Review the generated experience', status: 'active' },",
    "  { id: 'demo-2', title: 'Connect Huggy Cloud for live data', status: 'todo' },",
    '];',
    '',
    'function readLocalRecords(): AppRecord[] {',
    '  if (!isPreviewRuntime) throw new Error("Live backend is not configured. Huggy Cloud must be connected before using production data.");',
    '  if (typeof localStorage === "undefined") return demoRecords;',
    '  const raw = localStorage.getItem(STORAGE_KEY);',
    '  if (!raw) return demoRecords;',
    '  try { return JSON.parse(raw) as AppRecord[]; } catch { return demoRecords; }',
    '}',
    '',
    'function writeLocalRecords(records: AppRecord[]) {',
    '  if (!isPreviewRuntime) throw new Error("Live backend is not configured. Huggy Cloud must be connected before writing production data.");',
    '  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(records));',
    '}',
    '',
    'export async function listRecords(): Promise<AppRecord[]> {',
    '  if (!isHuggyCloudConfigured) return readLocalRecords();',
    '  const client = getHuggyCloudClient();',
    "  const query = client.from('app_records').select('id,title,status,payload,created_at').order('created_at', { ascending: false });",
    needsAuth ? "  const { data, error } = await query;" : "  const { data, error } = await query;",
    '  if (error) throw error;',
    '  return data || [];',
    '}',
    '',
    'export async function createRecord(title: string): Promise<AppRecord> {',
    '  const cleanTitle = title.trim();',
    "  if (!cleanTitle) throw new Error('Title is required.');",
    '  if (!isHuggyCloudConfigured) {',
    '    const record: AppRecord = { id: crypto.randomUUID(), title: cleanTitle, status: "todo", created_at: new Date().toISOString() };',
    '    const records = [record, ...readLocalRecords()];',
    '    writeLocalRecords(records);',
    '    return record;',
    '  }',
    '  const client = getHuggyCloudClient();',
    "  const { data, error } = await client.from('app_records').insert({ title: cleanTitle, status: 'todo', payload: {} }).select('id,title,status,payload,created_at').single();",
    '  if (error) throw error;',
    '  return data;',
    '}',
    '',
    'export async function updateRecord(id: string, patch: Partial<Pick<AppRecord, "title" | "status" | "payload">>) {',
    '  if (!isHuggyCloudConfigured) {',
    '    const records = readLocalRecords().map(record => record.id === id ? { ...record, ...patch } : record);',
    '    writeLocalRecords(records);',
    '    return records.find(record => record.id === id) || null;',
    '  }',
    '  const client = getHuggyCloudClient();',
    "  const { data, error } = await client.from('app_records').update(patch).eq('id', id).select('id,title,status,payload,created_at').single();",
    '  if (error) throw error;',
    '  return data;',
    '}',
    '',
    'export async function deleteRecord(id: string) {',
    '  if (!isHuggyCloudConfigured) {',
    '    writeLocalRecords(readLocalRecords().filter(record => record.id !== id));',
    '    return;',
    '  }',
    '  const client = getHuggyCloudClient();',
    "  const { error } = await client.from('app_records').delete().eq('id', id);",
    '  if (error) throw error;',
    '}',
    '',
  ].join('\n');
}

function buildValidationLayer(blueprint: ProductionBlueprint) {
  const tableNames = blueprint.tables.map(table => table.name);
  return [
    "import { z } from 'zod';",
    '',
    'export const recordIdSchema = z.string().uuid();',
    'export const safeTitleSchema = z.string().trim().min(1).max(140);',
    'export const safeStatusSchema = z.enum(["todo", "active", "done", "draft", "published", "pending", "paid", "cancelled", "open", "closed"]);',
    'export const appRecordCreateSchema = z.object({',
    '  title: safeTitleSchema,',
    '  status: safeStatusSchema.optional(),',
    '  payload: z.record(z.string(), z.unknown()).optional(),',
    '});',
    '',
    'export const appRecordUpdateSchema = appRecordCreateSchema.partial().extend({',
    '  id: recordIdSchema,',
    '});',
    '',
    'export const uploadPolicySchema = z.object({',
    '  path: z.string().min(3).max(300).refine(value => !value.includes(".."), "Path traversal is not allowed."),',
    '  mime_type: z.string().regex(/^(image|video|application\\/pdf|text\\/plain)\\//).max(120),',
    '  size_bytes: z.number().int().min(0).max(20 * 1024 * 1024),',
    '});',
    '',
    'export const generatedBlueprint = {',
    `  type: ${JSON.stringify(blueprint.type)},`,
    `  tables: ${JSON.stringify(tableNames)},`,
    `  requiresAuth: ${JSON.stringify(blueprint.backend.requiresAuth)},`,
    `  requiresDatabase: ${JSON.stringify(blueprint.backend.requiresDatabase)},`,
    `  requiresBilling: ${JSON.stringify(blueprint.backend.requiresBilling)},`,
    '};',
    '',
  ].join('\n');
}

function buildEdgeSecurityHelpers(blueprint: ProductionBlueprint) {
  return [
    "import { z } from 'zod';",
    '',
    'type RateLimitBucket = { count: number; resetAt: number };',
    'const buckets = new Map<string, RateLimitBucket>();',
    '',
    'export function assertRateLimit(key: string, limit = 20, windowMs = 60_000) {',
    '  const now = Date.now();',
    '  const current = buckets.get(key);',
    '  if (!current || current.resetAt < now) {',
    '    buckets.set(key, { count: 1, resetAt: now + windowMs });',
    '    return;',
    '  }',
    '  current.count += 1;',
    '  if (current.count > limit) throw new Error("RATE_LIMITED");',
    '}',
    '',
    'export function getBearerToken(request: Request) {',
    '  const header = request.headers.get("authorization") || "";',
    '  const match = header.match(/^Bearer\\s+(.+)$/i);',
    '  if (!match) throw new Error("AUTH_REQUIRED");',
    '  return match[1];',
    '}',
    '',
    'export function assertWebhookSignature(request: Request, secret?: string) {',
    '  if (!secret) throw new Error("WEBHOOK_SECRET_NOT_CONFIGURED");',
    '  const signature = request.headers.get("stripe-signature") || request.headers.get("x-signature");',
    '  if (!signature) throw new Error("WEBHOOK_SIGNATURE_MISSING");',
    '  return signature;',
    '}',
    '',
    'export const actionSchema = z.object({',
    '  action: z.string().min(1).max(80),',
    '  payload: z.record(z.string(), z.unknown()).optional(),',
    '});',
    '',
    'export const securityContract = {',
    `  blueprint: ${JSON.stringify(blueprint.type)},`,
    '  noFrontendSecrets: true,',
    '  serverValidationRequired: true,',
    '  rateLimitRequired: true,',
    `  stripeWebhookRequired: ${JSON.stringify(isPaymentBlueprint(blueprint))},`,
    `  storagePolicyRequired: ${JSON.stringify(isStorageBlueprint(blueprint))},`,
    '};',
    '',
  ].join('\n');
}

function quoteSqlLiteral(value: string) {
  return String(value || '').replace(/'/g, "''");
}

function tablePolicySql(table: ProductionBlueprintTable) {
  const tableName = table.name;
  if (table.access === 'public_read_private_write') {
    return [
      `drop policy if exists "Public can read ${tableName}" on public.${tableName};`,
      `create policy "Public can read ${tableName}" on public.${tableName}`,
      '  for select to anon, authenticated using (true);',
      `drop policy if exists "Members can write ${tableName}" on public.${tableName};`,
      `create policy "Members can write ${tableName}" on public.${tableName}`,
      '  for all to authenticated',
      '  using (',
      '    exists (select 1 from public.app_organization_members m where m.organization_id = organization_id and m.user_id = auth.uid() and m.role in (\'owner\', \'admin\', \'member\'))',
      '  )',
      '  with check (',
      '    exists (select 1 from public.app_organization_members m where m.organization_id = organization_id and m.user_id = auth.uid() and m.role in (\'owner\', \'admin\', \'member\'))',
      '  );',
    ].join('\n');
  }
  if (table.access === 'owner') {
    return [
      `drop policy if exists "Users can read their ${tableName}" on public.${tableName};`,
      `create policy "Users can read their ${tableName}" on public.${tableName}`,
      '  for select to authenticated using (owner_id = auth.uid());',
      `drop policy if exists "Users can insert their ${tableName}" on public.${tableName};`,
      `create policy "Users can insert their ${tableName}" on public.${tableName}`,
      '  for insert to authenticated with check (owner_id = auth.uid());',
      `drop policy if exists "Users can update their ${tableName}" on public.${tableName};`,
      `create policy "Users can update their ${tableName}" on public.${tableName}`,
      '  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());',
      `drop policy if exists "Users can delete their ${tableName}" on public.${tableName};`,
      `create policy "Users can delete their ${tableName}" on public.${tableName}`,
      '  for delete to authenticated using (owner_id = auth.uid());',
    ].join('\n');
  }
  return [
    `drop policy if exists "Members can read ${tableName}" on public.${tableName};`,
    `create policy "Members can read ${tableName}" on public.${tableName}`,
    '  for select to authenticated using (',
    '    exists (select 1 from public.app_organization_members m where m.organization_id = organization_id and m.user_id = auth.uid())',
    '  );',
    `drop policy if exists "Members can insert ${tableName}" on public.${tableName};`,
    `create policy "Members can insert ${tableName}" on public.${tableName}`,
    '  for insert to authenticated with check (',
    '    exists (select 1 from public.app_organization_members m where m.organization_id = organization_id and m.user_id = auth.uid() and m.role in (\'owner\', \'admin\', \'member\'))',
    '  );',
    `drop policy if exists "Members can update ${tableName}" on public.${tableName};`,
    `create policy "Members can update ${tableName}" on public.${tableName}`,
    '  for update to authenticated',
    '  using (',
    '    exists (select 1 from public.app_organization_members m where m.organization_id = organization_id and m.user_id = auth.uid() and m.role in (\'owner\', \'admin\', \'member\'))',
    '  )',
    '  with check (',
    '    exists (select 1 from public.app_organization_members m where m.organization_id = organization_id and m.user_id = auth.uid() and m.role in (\'owner\', \'admin\', \'member\'))',
    '  );',
    `drop policy if exists "Members can delete ${tableName}" on public.${tableName};`,
    `create policy "Members can delete ${tableName}" on public.${tableName}`,
    '  for delete to authenticated using (',
    '    exists (select 1 from public.app_organization_members m where m.organization_id = organization_id and m.user_id = auth.uid() and m.role in (\'owner\', \'admin\'))',
    '  );',
  ].join('\n');
}

function buildBlueprintTableSql(table: ProductionBlueprintTable) {
  const baseColumns = [
    '  id uuid primary key default gen_random_uuid()',
    "  organization_id uuid references public.app_organizations(id) on delete cascade",
    '  owner_id uuid references auth.users(id) on delete set null',
    "  title text not null default 'Untitled'",
    "  status text not null default 'active'",
    "  metadata jsonb not null default '{}'::jsonb",
    '  created_at timestamptz not null default now()',
    '  updated_at timestamptz not null default now()',
  ];
  const extraColumns = table.columns
    .filter(column => !baseColumns.some(base => base.includes(column.split(/\s+/)[0] || '__never__')))
    .map(column => `  ${column}`);
  const columns = [...baseColumns, ...extraColumns].join(',\n');
  const indexes = table.indexes.map(index => `create index if not exists ${table.name}_${index}_idx on public.${table.name} (${index});`);
  return [
    '',
    `-- ${table.purpose.replace(/\s+/g, ' ')}`,
    `create table if not exists public.${table.name} (`,
    columns,
    ');',
    '',
    `alter table public.${table.name} enable row level security;`,
    `comment on table public.${table.name} is '${quoteSqlLiteral(table.purpose)}';`,
    ...indexes,
    tablePolicySql(table),
    `grant select, insert, update, delete on public.${table.name} to authenticated;`,
    table.access === 'public_read_private_write' ? `grant select on public.${table.name} to anon;` : '',
  ].filter(Boolean).join('\n');
}

function buildBlueprintSchema(blueprint: ProductionBlueprint) {
  const uniqueTables = new Map<string, ProductionBlueprintTable>();
  for (const table of blueprint.tables) uniqueTables.set(table.name, table);
  return [
    '',
    `-- Production blueprint: ${blueprint.label}`,
    'create table if not exists public.app_organizations (',
    '  id uuid primary key default gen_random_uuid(),',
    "  name text not null default 'Workspace',",
    "  slug text unique,",
    '  created_at timestamptz not null default now(),',
    '  updated_at timestamptz not null default now()',
    ');',
    '',
    'create table if not exists public.app_organization_members (',
    '  id uuid primary key default gen_random_uuid(),',
    '  organization_id uuid not null references public.app_organizations(id) on delete cascade,',
    '  user_id uuid not null references auth.users(id) on delete cascade,',
    "  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),",
    '  created_at timestamptz not null default now(),',
    '  unique (organization_id, user_id)',
    ');',
    '',
    'alter table public.app_organizations enable row level security;',
    'alter table public.app_organization_members enable row level security;',
    'create index if not exists app_organization_members_user_id_idx on public.app_organization_members (user_id);',
    'create index if not exists app_organization_members_organization_id_idx on public.app_organization_members (organization_id);',
    '',
    'drop policy if exists "Members can read organizations" on public.app_organizations;',
    'create policy "Members can read organizations" on public.app_organizations',
    '  for select to authenticated using (',
    '    exists (select 1 from public.app_organization_members m where m.organization_id = id and m.user_id = auth.uid())',
    '  );',
    'drop policy if exists "Users can create organizations" on public.app_organizations;',
    'create policy "Users can create organizations" on public.app_organizations',
    '  for insert to authenticated with check (true);',
    'drop policy if exists "Owners can update organizations" on public.app_organizations;',
    'create policy "Owners can update organizations" on public.app_organizations',
    '  for update to authenticated using (',
    '    exists (select 1 from public.app_organization_members m where m.organization_id = id and m.user_id = auth.uid() and m.role in (\'owner\', \'admin\'))',
    '  );',
    '',
    'drop policy if exists "Members can read organization members" on public.app_organization_members;',
    'create policy "Members can read organization members" on public.app_organization_members',
    '  for select to authenticated using (',
    '    user_id = auth.uid()',
    '  );',
    'drop policy if exists "Users can create their membership" on public.app_organization_members;',
    'create policy "Users can create their membership" on public.app_organization_members',
    '  for insert to authenticated with check (user_id = auth.uid());',
    'drop policy if exists "Users can update their membership" on public.app_organization_members;',
    'create policy "Users can update their membership" on public.app_organization_members',
    '  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());',
    '',
    'grant select, insert, update on public.app_organizations to authenticated;',
    'grant select, insert, update, delete on public.app_organization_members to authenticated;',
    ...Array.from(uniqueTables.values()).map(buildBlueprintTableSql),
  ].join('\n');
}

function buildSchema(requirement: HuggyCloudRequirement, blueprint: ProductionBlueprint) {
  const storageBlock = requirement.needs_storage
    ? [
        '',
        '-- Optional file metadata table. Actual file binaries should live in Supabase Storage.',
        'create table if not exists public.app_assets (',
        '  id uuid primary key default gen_random_uuid(),',
        '  owner_id uuid references auth.users(id) on delete set null,',
        '  record_id uuid references public.app_records(id) on delete cascade,',
        '  bucket text not null default \'app-assets\',',
        '  path text not null,',
        '  mime_type text,',
        '  size_bytes bigint not null default 0,',
        '  created_at timestamptz not null default now()',
        ');',
        '',
        'alter table public.app_assets enable row level security;',
        '',
        'drop policy if exists "Users can read their assets" on public.app_assets;',
        'create policy "Users can read their assets" on public.app_assets',
        '  for select to authenticated using (owner_id = auth.uid());',
        'drop policy if exists "Users can insert their assets" on public.app_assets;',
        'create policy "Users can insert their assets" on public.app_assets',
        '  for insert to authenticated with check (owner_id = auth.uid());',
        'drop policy if exists "Users can update their assets" on public.app_assets;',
        'create policy "Users can update their assets" on public.app_assets',
        '  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());',
        'drop policy if exists "Users can delete their assets" on public.app_assets;',
        'create policy "Users can delete their assets" on public.app_assets',
        '  for delete to authenticated using (owner_id = auth.uid());',
        '',
        'grant select, insert, update, delete on public.app_assets to authenticated;',
      ].join('\n')
    : '';

  return [
    `-- ${FULLSTACK_MARKER}`,
    '-- Managed backend contract generated by Huggy.',
    '-- Apply this migration through Huggy Cloud before enabling live persistence.',
    '-- Supabase note: new public tables may require explicit grants to be reachable through the Data API.',
    '',
    'create extension if not exists pgcrypto;',
    '',
    'create table if not exists public.app_profiles (',
    '  id uuid primary key references auth.users(id) on delete cascade,',
    '  display_name text,',
    '  avatar_url text,',
    '  created_at timestamptz not null default now(),',
    '  updated_at timestamptz not null default now()',
    ');',
    '',
    'create table if not exists public.app_records (',
    '  id uuid primary key default gen_random_uuid(),',
    '  owner_id uuid references auth.users(id) on delete cascade,',
    "  title text not null default 'Untitled record',",
    "  status text not null default 'todo' check (status in ('todo', 'active', 'done')),",
    "  payload jsonb not null default '{}'::jsonb,",
    '  created_at timestamptz not null default now(),',
    '  updated_at timestamptz not null default now()',
    ');',
    '',
    'alter table public.app_profiles enable row level security;',
    'alter table public.app_records enable row level security;',
    '',
    'drop policy if exists "Users can read their profile" on public.app_profiles;',
    'create policy "Users can read their profile" on public.app_profiles',
    '  for select to authenticated using (id = auth.uid());',
    'drop policy if exists "Users can insert their profile" on public.app_profiles;',
    'create policy "Users can insert their profile" on public.app_profiles',
    '  for insert to authenticated with check (id = auth.uid());',
    'drop policy if exists "Users can update their profile" on public.app_profiles;',
    'create policy "Users can update their profile" on public.app_profiles',
    '  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());',
    '',
    'drop policy if exists "Users can read their records" on public.app_records;',
    'create policy "Users can read their records" on public.app_records',
    '  for select to authenticated using (owner_id = auth.uid());',
    'drop policy if exists "Users can insert their records" on public.app_records;',
    'create policy "Users can insert their records" on public.app_records',
    '  for insert to authenticated with check (owner_id = auth.uid());',
    'drop policy if exists "Users can update their records" on public.app_records;',
    'create policy "Users can update their records" on public.app_records',
    '  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());',
    'drop policy if exists "Users can delete their records" on public.app_records;',
    'create policy "Users can delete their records" on public.app_records',
    '  for delete to authenticated using (owner_id = auth.uid());',
    '',
    'grant usage on schema public to anon, authenticated;',
    'grant select, insert, update, delete on public.app_profiles to authenticated;',
    'grant select, insert, update, delete on public.app_records to authenticated;',
    buildBlueprintSchema(blueprint),
    storageBlock,
    '',
  ].join('\n');
}

function buildFullstackReadme(requirement: HuggyCloudRequirement, blueprint: ProductionBlueprint) {
  const parts = requirement.detected_from_prompt.length ? requirement.detected_from_prompt.join(', ') : 'database/auth readiness';
  return [
    '# Huggy Fullstack Notes',
    '',
    `This project includes a Huggy Cloud fullstack kit for: ${parts}.`,
    `Production blueprint: ${blueprint.label} (${blueprint.type}).`,
    '',
    '## What is included',
    '',
    '- `src/lib/huggyCloud.ts`: browser-safe Supabase client wrapper.',
    '- `src/lib/appData.ts`: CRUD data layer with local demo fallback.',
    '- `src/lib/validation.ts`: Zod validation schemas for user input.',
    '- `supabase/functions/_shared/security.ts`: Edge Function security helpers for auth, rate limits and webhooks.',
    '- `supabase/schema.sql`: RLS-enabled schema with explicit Data API grants.',
    '- `src/fullstack.test.ts`: static safety check for generated backend integration.',
    '',
    '## Blueprint requirements',
    '',
    ...blueprint.pages.map(page => `- Page: ${page}`),
    ...blueprint.tables.map(table => `- Table: ${table.name} - ${table.purpose}`),
    '',
    '## Runtime behavior',
    '',
    'The preview may run with local demo data only in preview/local runtime until Huggy Cloud runtime config is available.',
    'Production runtime must connect Huggy Cloud before writing or reading private app data.',
    'Live auth, database, storage, webhooks and secrets must be provisioned by Huggy Cloud on the backend.',
    '',
    'Never place service role keys or provider secrets in frontend files.',
    '',
  ].join('\n');
}

function buildFullstackTest() {
  return [
    "import { readFileSync } from 'node:fs';",
    '',
    "const client = readFileSync(new URL('./lib/huggyCloud.ts', import.meta.url), 'utf8');",
    "const data = readFileSync(new URL('./lib/appData.ts', import.meta.url), 'utf8');",
    "const validation = readFileSync(new URL('./lib/validation.ts', import.meta.url), 'utf8');",
    '',
    "if (!client.includes('createClient')) throw new Error('Huggy Cloud client is missing createClient.');",
    "const forbidden = new RegExp(['service', 'role'].join('[_ -]?') + '|' + ['SUPABASE', 'SERVICE', 'ROLE'].join('_') + '|secret\\\\s+eyJ', 'i');",
    "if (forbidden.test(client + data + validation)) throw new Error('Frontend fullstack files must not contain backend-only credentials.');",
    "if (!/local demo data|Preview mode/i.test(client)) throw new Error('Preview fallback messaging is missing.');",
    "if (!/isPreviewRuntime/.test(data)) throw new Error('Local demo fallback must be preview-only, not production persistence.');",
    "if (!/listRecords|createRecord|updateRecord|deleteRecord/.test(data)) throw new Error('CRUD helpers are incomplete.');",
    "if (!/zod|z\\.object/.test(validation)) throw new Error('Zod validation schemas are missing.');",
    '',
    "console.log('Generated fullstack smoke test passed.');",
    '',
  ].join('\n');
}

export function applyHuggyFullstackKit(input: FullstackKitInput): FullstackGeneratedFile[] {
  if (!shouldApplyHuggyFullstackKit(input)) return input.files;
  const blueprint = inferProductionBlueprint(input.prompt);
  const byPath = new Map(input.files.map(file => [normalizePath(file.path), { ...file, path: normalizePath(file.path) }]));

  const packageFile = fileByPath(input.files, 'package.json');
  upsertFile(byPath, 'package.json', mergePackageJson(packageFile?.content || '{}'), 'json');
  upsertFile(byPath, 'src/lib/huggyCloud.ts', buildHuggyCloudClient(), 'ts');
  upsertFile(byPath, 'src/lib/appData.ts', buildAppDataLayer(input.requirement), 'ts');
  upsertFile(byPath, 'src/lib/validation.ts', buildValidationLayer(blueprint), 'ts');
  upsertFile(byPath, 'supabase/functions/_shared/security.ts', buildEdgeSecurityHelpers(blueprint), 'ts');

  const existingSchema = fileByPath(input.files, 'supabase/schema.sql')?.content || '';
  const generatedSchema = buildSchema(input.requirement, blueprint);
  upsertFile(
    byPath,
    'supabase/schema.sql',
    existingSchema.includes(FULLSTACK_MARKER)
      ? existingSchema
      : [existingSchema.trim(), generatedSchema].filter(Boolean).join('\n\n'),
    'sql',
  );
  upsertFile(byPath, 'FULLSTACK.md', buildFullstackReadme(input.requirement, blueprint), 'markdown');
  upsertFile(byPath, 'src/fullstack.test.ts', buildFullstackTest(), 'ts');

  return Array.from(byPath.values());
}

export function validateHuggyFullstackFiles(files: FullstackGeneratedFile[], requirement: HuggyCloudRequirement): FullstackValidationCheck[] {
  if (!hasHuggyCloudRequirement(requirement) && !hasSupabaseUsage(files)) return [];
  const checks: FullstackValidationCheck[] = [];
  const client = fileByPath(files, 'src/lib/huggyCloud.ts');
  const data = fileByPath(files, 'src/lib/appData.ts');
  const validation = fileByPath(files, 'src/lib/validation.ts');
  const edgeSecurity = fileByPath(files, 'supabase/functions/_shared/security.ts');
  const schema = fileByPath(files, 'supabase/schema.sql');
  const packageFile = fileByPath(files, 'package.json');
  const allSource = files.map(file => `${file.path}\n${file.content || ''}`).join('\n\n');
  const blueprint = inferProductionBlueprint(allSource);

  checks.push(client ? pass('fullstack_client_present', 'Generated app includes a browser-safe Huggy Cloud client.', 'src/lib/huggyCloud.ts') : fail('fullstack_client_present', 'Missing src/lib/huggyCloud.ts browser-safe backend client.', 'src/lib/huggyCloud.ts'));
  checks.push(data ? pass('fullstack_data_layer_present', 'Generated app includes a CRUD data layer.', 'src/lib/appData.ts') : fail('fullstack_data_layer_present', 'Missing src/lib/appData.ts CRUD data layer.', 'src/lib/appData.ts'));
  checks.push(validation ? pass('fullstack_validation_present', 'Generated app includes Zod validation schemas.', 'src/lib/validation.ts') : fail('fullstack_validation_present', 'Missing src/lib/validation.ts validation schemas.', 'src/lib/validation.ts'));
  checks.push(edgeSecurity ? pass('fullstack_edge_security_present', 'Generated app includes Edge Function security helpers.', 'supabase/functions/_shared/security.ts') : fail('fullstack_edge_security_present', 'Missing Edge Function security helpers.', 'supabase/functions/_shared/security.ts'));
  checks.push(schema ? pass('fullstack_schema_present', 'Generated app includes a Supabase migration schema.', 'supabase/schema.sql') : fail('fullstack_schema_present', 'Missing supabase/schema.sql migration.', 'supabase/schema.sql'));

  if (schema) {
    checks.push(/enable row level security/i.test(schema.content) ? pass('fullstack_rls_enabled', 'Schema enables RLS.', schema.path) : fail('fullstack_rls_enabled', 'Schema must enable RLS for exposed tables.', schema.path));
    checks.push(/grant\s+(select|usage|insert|update|delete)/i.test(schema.content) ? pass('fullstack_data_api_grants', 'Schema includes explicit Data API grants.', schema.path) : fail('fullstack_data_api_grants', 'Schema must include explicit grants for Supabase Data API access.', schema.path));
    checks.push(/create policy/i.test(schema.content) ? pass('fullstack_rls_policies', 'Schema includes RLS policies.', schema.path) : fail('fullstack_rls_policies', 'Schema must include RLS policies.', schema.path));
    const createdTables = extractCreatedPublicTables(schema.content).filter(table => /^app_/.test(table));
    const tablesMissingRls = createdTables.filter(table => !new RegExp(`alter\\s+table\\s+public\\.${escapeRegExp(table)}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(schema.content));
    const tablesMissingPolicies = createdTables.filter(table => !new RegExp(`create\\s+policy[\\s\\S]{0,220}\\s+on\\s+public\\.${escapeRegExp(table)}`, 'i').test(schema.content));
    checks.push(!tablesMissingRls.length ? pass('fullstack_all_private_tables_rls', 'Every generated app table enables RLS.', schema.path) : fail('fullstack_all_private_tables_rls', `Missing RLS on tables: ${tablesMissingRls.slice(0, 8).join(', ')}.`, schema.path));
    checks.push(!tablesMissingPolicies.length ? pass('fullstack_all_private_tables_policies', 'Every generated app table has at least one policy.', schema.path) : fail('fullstack_all_private_tables_policies', `Missing policies on tables: ${tablesMissingPolicies.slice(0, 8).join(', ')}.`, schema.path));
    checks.push(/owner_id|organization_id|org_id/i.test(schema.content) ? pass('fullstack_owner_or_org_scope', 'Schema includes owner or organization scoping.', schema.path) : fail('fullstack_owner_or_org_scope', 'Schema must include owner_id or organization_id for private data.', schema.path));
    if (blueprint.tables.some(table => table.sensitive)) {
      checks.push(/app_audit_logs|audit_logs/i.test(schema.content) ? pass('fullstack_audit_logs', 'Sensitive blueprint includes audit logs.', schema.path) : warn('fullstack_audit_logs', 'Sensitive apps should include audit logs.', schema.path));
    }
  }

  if (packageFile) {
    checks.push(/@supabase\/supabase-js/i.test(packageFile.content) ? pass('fullstack_supabase_dependency', 'package.json includes @supabase/supabase-js.', 'package.json') : fail('fullstack_supabase_dependency', 'package.json must include @supabase/supabase-js.', 'package.json'));
    checks.push(/"zod"\s*:/i.test(packageFile.content) ? pass('fullstack_zod_dependency', 'package.json includes Zod for validation.', 'package.json') : fail('fullstack_zod_dependency', 'package.json must include Zod for server/client validation.', 'package.json'));
    checks.push(/fullstack\.test\.ts/i.test(packageFile.content) ? pass('fullstack_test_script', 'package.json runs the fullstack smoke test.', 'package.json') : warn('fullstack_test_script', 'package.json should run src/fullstack.test.ts.', 'package.json'));
  }

  if (data) {
    checks.push(/isPreviewRuntime/i.test(data.content) ? pass('fullstack_no_fake_localstorage_prod', 'Local demo storage is restricted to preview/local runtime.', data.path) : fail('fullstack_no_fake_localstorage_prod', 'Local demo storage must not act as production persistence.', data.path));
  }

  if (validation) {
    checks.push(/z\.object|from 'zod'|from "zod"/i.test(validation.content) ? pass('fullstack_zod_validation', 'Validation layer uses Zod schemas.', validation.path) : fail('fullstack_zod_validation', 'Validation layer must use Zod schemas.', validation.path));
  }

  if (edgeSecurity) {
    checks.push(/assertRateLimit/i.test(edgeSecurity.content) ? pass('fullstack_rate_limit_helper', 'Edge security layer includes a rate limit helper.', edgeSecurity.path) : fail('fullstack_rate_limit_helper', 'Sensitive actions need rate limit helper.', edgeSecurity.path));
    checks.push(/assertWebhookSignature/i.test(edgeSecurity.content) ? pass('fullstack_webhook_signature_helper', 'Edge security layer includes webhook signature guard.', edgeSecurity.path) : warn('fullstack_webhook_signature_helper', 'Payment-capable apps should include webhook signature verification.', edgeSecurity.path));
  }

  checks.push(!/service[_-]?role|SUPABASE_SERVICE_ROLE|sbp_[a-z0-9]|secret eyJ/i.test(allSource) && !containsSecret(allSource)
    ? pass('fullstack_no_frontend_secrets', 'No service role or provider secret found in generated fullstack files.')
    : fail('fullstack_no_frontend_secrets', 'Generated fullstack files must not contain service role keys or secrets.'));

  if (requirement.needs_auth) {
    checks.push(/auth:\s*\{|\.auth\b|getHuggyCloudClient/i.test(client?.content || allSource)
      ? pass('fullstack_auth_client_ready', 'Auth requests have an explicit Supabase client path.', client?.path || 'src/lib/huggyCloud.ts')
      : fail('fullstack_auth_client_ready', 'Auth app needs an explicit Supabase client path.', 'src/lib/huggyCloud.ts'));
  }

  return checks;
}

function extractCreatedPublicTables(sql: string) {
  const tables: string[] = [];
  const re = /create\s+table\s+if\s+not\s+exists\s+public\.([a-zA-Z0-9_]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql))) {
    if (match[1]) tables.push(match[1]);
  }
  return Array.from(new Set(tables));
}

function escapeRegExp(value: string) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pass(key: string, message: string, file?: string): FullstackValidationCheck {
  return { key, status: 'pass', severity: 'info', message, file };
}

function warn(key: string, message: string, file?: string): FullstackValidationCheck {
  return { key, status: 'warn', severity: 'medium', message, file };
}

function fail(key: string, message: string, file?: string): FullstackValidationCheck {
  return { key, status: 'fail', severity: 'high', message, file };
}
