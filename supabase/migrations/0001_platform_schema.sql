create extension if not exists "pgcrypto";

create type org_role as enum ('owner', 'admin', 'editor', 'viewer');
create type project_status as enum ('draft', 'generating', 'ready', 'building', 'deployed', 'archived');
create type job_status as enum ('queued', 'running', 'success', 'failed', 'cancelled');
create type deployment_status as enum ('queued', 'building', 'ready', 'error', 'cancelled');
create type environment_type as enum ('preview', 'production');

create table users_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  email text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users(id),
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role org_role not null default 'viewer',
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text,
  framework text not null default 'nextjs',
  is_active boolean not null default true,
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table template_files (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  path text not null,
  content text,
  storage_path text,
  is_binary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (template_id, path),
  check (path not like '../%'),
  check (path not like '/%')
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null,
  slug text not null,
  description text,
  status project_status not null default 'draft',
  template_id uuid references templates(id) on delete set null,
  current_version_id uuid,
  vercel_project_id text,
  default_subdomain text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, slug)
);

create table project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid references auth.users(id),
  version_number integer not null,
  label text,
  snapshot_storage_path text,
  manifest jsonb not null default '{}'::jsonb,
  source_hash text,
  build_job_id uuid,
  deployment_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, version_number)
);

alter table projects add constraint projects_current_version_fk foreign key (current_version_id) references project_versions(id);

create table project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  version_id uuid references project_versions(id) on delete set null,
  path text not null,
  content text,
  storage_path text,
  content_hash text,
  size_bytes bigint not null default 0,
  mime_type text,
  is_binary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, version_id, path),
  check (path not like '../%'),
  check (path not like '/%')
);

create table project_prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  prompt text not null,
  mode text not null default 'agent',
  input_files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  prompt_id uuid references project_prompts(id) on delete set null,
  status job_status not null default 'queued',
  model_provider text,
  model_name text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table agent_steps (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_name text not null,
  step_order integer not null,
  status job_status not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table build_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  version_id uuid references project_versions(id) on delete set null,
  status job_status not null default 'queued',
  sandbox_id text,
  command text,
  artifact_storage_path text,
  preview_url text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

alter table project_versions add constraint project_versions_build_job_fk foreign key (build_job_id) references build_jobs(id) on delete set null;

create table build_logs (
  id uuid primary key default gen_random_uuid(),
  build_job_id uuid not null references build_jobs(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  sequence integer not null,
  level text not null default 'info',
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  version_id uuid references project_versions(id) on delete set null,
  build_job_id uuid references build_jobs(id) on delete set null,
  environment environment_type not null default 'preview',
  status deployment_status not null default 'queued',
  vercel_project_id text,
  vercel_deployment_id text,
  url text,
  inspector_url text,
  created_by uuid references auth.users(id),
  error_message text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  deleted_at timestamptz
);

alter table project_versions add constraint project_versions_deployment_fk foreign key (deployment_id) references deployments(id) on delete set null;

create table deployment_aliases (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references deployments(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  hostname text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (hostname)
);

create table domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  hostname text not null unique,
  status text not null default 'pending',
  vercel_domain_id text,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table dns_verifications (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references domains(id) on delete cascade,
  record_type text not null,
  record_name text not null,
  record_value text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table project_secrets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  key text not null,
  encrypted_value text not null,
  environment environment_type not null default 'preview',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, key, environment)
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  provider text not null,
  status text not null default 'active',
  config jsonb not null default '{}'::jsonb,
  encrypted_credentials text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  quantity integer not null default 1,
  unit text not null default 'event',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  amount integer not null,
  reason text not null,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  stripe_subscription_id text unique,
  plan_key text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  stripe_invoice_id text unique,
  amount_due integer not null default 0,
  amount_paid integer not null default 0,
  currency text not null default 'usd',
  status text not null,
  hosted_invoice_url text,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table abuse_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  deployment_id uuid references deployments(id) on delete set null,
  category text not null,
  status text not null default 'open',
  severity text not null default 'medium',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table security_scans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  version_id uuid references project_versions(id) on delete set null,
  deployment_id uuid references deployments(id) on delete set null,
  status job_status not null default 'queued',
  risk_level text not null default 'unknown',
  report jsonb not null default '{}'::jsonb,
  publish_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_org_members_user on organization_members(user_id);
create index idx_org_members_org on organization_members(organization_id);
create index idx_projects_org on projects(organization_id);
create index idx_projects_status on projects(status);
create index idx_project_versions_project on project_versions(project_id);
create index idx_project_files_project_version on project_files(project_id, version_id);
create index idx_project_prompts_project on project_prompts(project_id);
create index idx_agent_runs_project on agent_runs(project_id);
create index idx_agent_steps_run on agent_steps(agent_run_id);
create index idx_build_jobs_project on build_jobs(project_id);
create index idx_build_logs_job_sequence on build_logs(build_job_id, sequence);
create index idx_deployments_project on deployments(project_id);
create index idx_domains_project on domains(project_id);
create index idx_usage_events_org_created on usage_events(organization_id, created_at);
create index idx_credit_ledger_org_created on credit_ledger(organization_id, created_at);
create index idx_audit_logs_org_created on audit_logs(organization_id, created_at);
create index idx_security_scans_project on security_scans(project_id);
create index idx_notifications_user_read on notifications(user_id, read_at);

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members om
    where om.organization_id = org_id and om.user_id = auth.uid()
  )
$$;

create or replace function public.has_org_role(org_id uuid, allowed_roles org_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members om
    where om.organization_id = org_id and om.user_id = auth.uid() and om.role = any(allowed_roles)
  )
$$;

create or replace function public.can_read_project(org_id uuid)
returns boolean
language sql
stable
as $$ select public.has_org_role(org_id, array['owner','admin','editor','viewer']::org_role[]) $$;

create or replace function public.can_edit_project(org_id uuid)
returns boolean
language sql
stable
as $$ select public.has_org_role(org_id, array['owner','admin','editor']::org_role[]) $$;

create or replace function public.can_admin_org(org_id uuid)
returns boolean
language sql
stable
as $$ select public.has_org_role(org_id, array['owner','admin']::org_role[]) $$;

create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
stable
as $$ select public.has_org_role(org_id, array['owner']::org_role[]) $$;

alter table users_profile enable row level security;
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table projects enable row level security;
alter table project_versions enable row level security;
alter table project_files enable row level security;
alter table project_prompts enable row level security;
alter table agent_runs enable row level security;
alter table agent_steps enable row level security;
alter table build_jobs enable row level security;
alter table build_logs enable row level security;
alter table deployments enable row level security;
alter table deployment_aliases enable row level security;
alter table domains enable row level security;
alter table dns_verifications enable row level security;
alter table project_secrets enable row level security;
alter table integrations enable row level security;
alter table usage_events enable row level security;
alter table credit_ledger enable row level security;
alter table subscriptions enable row level security;
alter table invoices enable row level security;
alter table templates enable row level security;
alter table template_files enable row level security;
alter table audit_logs enable row level security;
alter table abuse_reports enable row level security;
alter table security_scans enable row level security;
alter table notifications enable row level security;

create policy users_profile_read_self on users_profile for select using (id = auth.uid());
create policy users_profile_update_self on users_profile for update using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_select_member on organizations for select using (public.is_org_member(id));
create policy organizations_update_admin on organizations for update using (public.can_admin_org(id)) with check (public.can_admin_org(id));

create policy organization_members_select_member on organization_members for select using (public.is_org_member(organization_id));
create policy organization_members_insert_admin on organization_members for insert with check (public.can_admin_org(organization_id));
create policy organization_members_update_admin on organization_members for update using (public.can_admin_org(organization_id)) with check (public.can_admin_org(organization_id));
create policy organization_members_delete_owner on organization_members for delete using (public.is_org_owner(organization_id));

create policy projects_select_member on projects for select using (public.can_read_project(organization_id));
create policy projects_insert_editor on projects for insert with check (public.can_edit_project(organization_id));
create policy projects_update_editor on projects for update using (public.can_edit_project(organization_id)) with check (public.can_edit_project(organization_id));
create policy projects_delete_admin on projects for delete using (public.can_admin_org(organization_id));

create policy project_versions_select_member on project_versions for select using (public.can_read_project(organization_id));
create policy project_versions_insert_editor on project_versions for insert with check (public.can_edit_project(organization_id));
create policy project_versions_update_editor on project_versions for update using (public.can_edit_project(organization_id)) with check (public.can_edit_project(organization_id));

create policy project_files_select_member on project_files for select using (public.can_read_project(organization_id));
create policy project_files_insert_editor on project_files for insert with check (public.can_edit_project(organization_id));
create policy project_files_update_editor on project_files for update using (public.can_edit_project(organization_id)) with check (public.can_edit_project(organization_id));

create policy project_prompts_select_member on project_prompts for select using (public.can_read_project(organization_id));
create policy project_prompts_insert_editor on project_prompts for insert with check (public.can_edit_project(organization_id) and user_id = auth.uid());

create policy agent_runs_select_member on agent_runs for select using (public.can_read_project(organization_id));
create policy agent_steps_select_member on agent_steps for select using (public.can_read_project(organization_id));
create policy build_jobs_select_member on build_jobs for select using (public.can_read_project(organization_id));
create policy build_logs_select_member on build_logs for select using (public.can_read_project(organization_id));
create policy deployments_select_member on deployments for select using (public.can_read_project(organization_id));
create policy deployment_aliases_select_member on deployment_aliases for select using (public.can_read_project(organization_id));

create policy domains_select_member on domains for select using (public.can_read_project(organization_id));
create policy domains_insert_admin on domains for insert with check (public.can_admin_org(organization_id));
create policy domains_update_admin on domains for update using (public.can_admin_org(organization_id)) with check (public.can_admin_org(organization_id));
create policy domains_delete_admin on domains for delete using (public.can_admin_org(organization_id));

create policy dns_verifications_select_member on dns_verifications for select using (exists (select 1 from domains d where d.id = domain_id and public.can_read_project(d.organization_id)));

create policy project_secrets_no_client_select on project_secrets for select using (false);
create policy project_secrets_insert_admin on project_secrets for insert with check (public.can_admin_org(organization_id));
create policy project_secrets_update_admin on project_secrets for update using (public.can_admin_org(organization_id)) with check (public.can_admin_org(organization_id));
create policy project_secrets_delete_admin on project_secrets for delete using (public.can_admin_org(organization_id));

create policy integrations_select_member on integrations for select using (public.can_read_project(organization_id));
create policy usage_events_select_member on usage_events for select using (public.can_read_project(organization_id));
create policy credit_ledger_select_admin on credit_ledger for select using (public.can_admin_org(organization_id));
create policy subscriptions_select_admin on subscriptions for select using (public.can_admin_org(organization_id));
create policy invoices_select_admin on invoices for select using (public.can_admin_org(organization_id));

create policy templates_select_all on templates for select using (is_active = true);
create policy template_files_select_all on template_files for select using (exists (select 1 from templates t where t.id = template_id and t.is_active = true));

create policy audit_logs_select_admin on audit_logs for select using (organization_id is not null and public.can_admin_org(organization_id));
create policy abuse_reports_select_admin on abuse_reports for select using (organization_id is not null and public.can_admin_org(organization_id));
create policy security_scans_select_member on security_scans for select using (public.can_read_project(organization_id));
create policy notifications_select_self on notifications for select using (user_id = auth.uid());
create policy notifications_update_self on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
