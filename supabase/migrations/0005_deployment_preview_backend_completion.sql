create extension if not exists "pgcrypto";

DO $$ BEGIN
  CREATE TYPE preview_status AS ENUM ('building', 'ready', 'failed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE project_backend_mode AS ENUM ('shared_tables', 'dedicated_schema', 'dedicated_project');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE project_backend_status AS ENUM ('provisioning', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE platform_domain_type AS ENUM ('saas_subdomain', 'custom_domain');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE domain_type ADD VALUE IF NOT EXISTS 'saas_subdomain';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE domain_type ADD VALUE IF NOT EXISTS 'custom_domain';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

alter table deployments add column if not exists provider text not null default 'vercel';
alter table deployments add column if not exists provider_project_id text;
alter table deployments add column if not exists provider_deployment_id text;
alter table deployments add column if not exists preview_url text;
alter table deployments add column if not exists production_url text;
alter table deployments add column if not exists updated_at timestamptz not null default now();

update deployments
set provider_project_id = coalesce(provider_project_id, vercel_project_id),
    provider_deployment_id = coalesce(provider_deployment_id, vercel_deployment_id),
    preview_url = case when environment = 'preview' then coalesce(preview_url, url) else preview_url end,
    production_url = case when environment = 'production' then coalesce(production_url, url) else production_url end;

create table if not exists previews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  version_id uuid not null references project_versions(id) on delete cascade,
  deployment_id uuid references deployments(id) on delete set null,
  status preview_status not null default 'building',
  url text,
  screenshot_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table domains add column if not exists domain text;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'domains'
      AND column_name = 'domain'
      AND is_generated = 'NEVER'
  ) THEN
    update domains set domain = hostname where domain is null;
    alter table domains alter column domain set not null;
  END IF;
END $$;
alter table domains add column if not exists type platform_domain_type not null default 'custom_domain';
alter table domains add column if not exists is_primary boolean not null default false;
alter table domains add column if not exists provider_domain_id text;
alter table domains add column if not exists verification_token text default encode(gen_random_bytes(16), 'hex');
alter table domains add column if not exists error_message text;
alter table domains add column if not exists created_by uuid references auth.users(id) on delete set null;
update domains set created_by = added_by where created_by is null and added_by is not null;

create table if not exists project_backends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  mode project_backend_mode not null default 'shared_tables',
  status project_backend_status not null default 'provisioning',
  schema_name text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

create table if not exists project_backend_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  backend_id uuid not null references project_backends(id) on delete cascade,
  resource_type text not null check (resource_type in ('table','rls_policy','storage_bucket','function')),
  name text not null,
  definition jsonb not null default '{}'::jsonb,
  rls_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check (rls_enabled = true or resource_type not in ('table','storage_bucket'))
);

create index if not exists idx_previews_project_version on previews(project_id, version_id, created_at desc);
create index if not exists idx_previews_deployment on previews(deployment_id);
create index if not exists idx_deployments_provider_ids on deployments(provider, provider_project_id, provider_deployment_id);
create index if not exists idx_project_backends_project on project_backends(project_id, status);
create index if not exists idx_project_backend_resources_backend on project_backend_resources(backend_id, resource_type);
create unique index if not exists idx_domains_project_primary on domains(project_id) where is_primary = true and deleted_at is null;

alter table previews enable row level security;
alter table project_backends enable row level security;
alter table project_backend_resources enable row level security;

DO $$ BEGIN
  CREATE POLICY previews_select_member ON previews FOR SELECT USING (public.can_read_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY previews_insert_editor ON previews FOR INSERT WITH CHECK (public.can_edit_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY previews_update_editor ON previews FOR UPDATE USING (public.can_edit_project(organization_id)) WITH CHECK (public.can_edit_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY project_backends_select_member ON project_backends FOR SELECT USING (public.can_read_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY project_backends_manage_admin ON project_backends FOR ALL USING (public.can_admin_org(organization_id)) WITH CHECK (public.can_admin_org(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY project_backend_resources_select_member ON project_backend_resources FOR SELECT USING (public.can_read_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY project_backend_resources_manage_admin ON project_backend_resources FOR ALL USING (public.can_admin_org(organization_id)) WITH CHECK (public.can_admin_org(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
