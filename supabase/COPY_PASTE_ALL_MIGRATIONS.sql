

-- ============================================================
-- 0001_platform_schema.sql
-- ============================================================

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


-- ============================================================
-- 0002_visual_streaming.sql
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'stream_visibility') then
    create type stream_visibility as enum ('public', 'internal');
  end if;
  if not exists (select 1 from pg_type where typname = 'stream_severity') then
    create type stream_severity as enum ('info', 'success', 'warning', 'error');
  end if;
  if not exists (select 1 from pg_type where typname = 'chat_role') then
    create type chat_role as enum ('user', 'assistant', 'system');
  end if;
  if not exists (select 1 from pg_type where typname = 'tool_call_status') then
    create type tool_call_status as enum ('pending', 'running', 'completed', 'failed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'file_change_type') then
    create type file_change_type as enum ('created', 'updated', 'deleted', 'renamed');
  end if;
  if not exists (select 1 from pg_type where typname = 'preview_status') then
    create type preview_status as enum ('building', 'ready', 'failed', 'expired');
  end if;
end $$;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  agent_run_id uuid references agent_runs(id) on delete set null,
  role chat_role not null,
  content text not null default '',
  status text not null default 'completed',
  sequence_number bigint not null,
  parent_message_id uuid references chat_messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table agent_runs add column if not exists conversation_id uuid references conversations(id) on delete cascade;
alter table agent_runs add column if not exists user_message_id uuid references chat_messages(id) on delete set null;
alter table agent_runs add column if not exists assistant_message_id uuid references chat_messages(id) on delete set null;
alter table agent_runs add column if not exists mode text not null default 'generate';
alter table agent_runs add column if not exists objective text;
alter table agent_runs add column if not exists cancellation_requested_at timestamptz;

alter table agent_steps add column if not exists conversation_id uuid references conversations(id) on delete cascade;
alter table agent_steps add column if not exists title text;
alter table agent_steps add column if not exists phase text;
alter table agent_steps add column if not exists progress numeric;
alter table agent_steps add column if not exists summary text;

create table if not exists conversation_event_counters (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  last_sequence_number bigint not null default 0
);

create or replace function next_conversation_sequence(p_conversation_id uuid)
returns bigint
language plpgsql
as $$
declare
  next_seq bigint;
begin
  insert into conversation_event_counters(conversation_id, last_sequence_number)
  values (p_conversation_id, 0)
  on conflict (conversation_id) do nothing;

  update conversation_event_counters
  set last_sequence_number = last_sequence_number + 1
  where conversation_id = p_conversation_id
  returning last_sequence_number into next_seq;

  return next_seq;
end;
$$;

create table if not exists stream_events (
  event_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  agent_run_id uuid references agent_runs(id) on delete set null,
  step_id uuid references agent_steps(id) on delete set null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  visibility stream_visibility not null default 'public',
  severity stream_severity not null default 'info',
  sequence_number bigint not null default 0,
  created_at timestamptz not null default now()
);

create or replace function set_stream_event_sequence()
returns trigger
language plpgsql
as $$
begin
  if new.sequence_number is null or new.sequence_number = 0 then
    new.sequence_number := next_conversation_sequence(new.conversation_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stream_events_sequence on stream_events;
create trigger trg_stream_events_sequence
before insert on stream_events
for each row execute function set_stream_event_sequence();

create table if not exists tool_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  step_id uuid references agent_steps(id) on delete set null,
  name text not null,
  status tool_call_status not null default 'pending',
  input_summary text,
  output_summary text,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists file_change_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  step_id uuid references agent_steps(id) on delete set null,
  change_type file_change_type not null,
  path text not null,
  previous_path text,
  summary text,
  additions integer,
  deletions integer,
  patch_preview text,
  patch_storage_path text,
  created_at timestamptz not null default now(),
  check (path not like '../%'),
  check (path not like '/%')
);

create table if not exists build_log_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  agent_run_id uuid references agent_runs(id) on delete cascade,
  build_id uuid not null,
  chunk_index integer not null,
  level text not null default 'info',
  content text not null,
  diagnostics jsonb not null default '[]'::jsonb,
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists preview_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  agent_run_id uuid references agent_runs(id) on delete cascade,
  status preview_status not null,
  url text,
  screenshot_url text,
  error jsonb,
  created_at timestamptz not null default now(),
  ready_at timestamptz
);

create table if not exists deployment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  agent_run_id uuid references agent_runs(id) on delete cascade,
  provider text not null default 'vercel',
  provider_deployment_id text,
  status text not null default 'queued',
  target environment_type not null default 'preview',
  url text,
  domain text,
  metadata jsonb not null default '{}'::jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists conversations_project_id_idx on conversations(project_id, id);
create index if not exists conversations_org_project_idx on conversations(organization_id, project_id);
create unique index if not exists chat_messages_conversation_sequence_idx on chat_messages(conversation_id, sequence_number);
create index if not exists chat_messages_conversation_created_idx on chat_messages(conversation_id, created_at);
create index if not exists agent_runs_conversation_idx on agent_runs(conversation_id);
create index if not exists agent_runs_project_status_idx on agent_runs(project_id, status);
create index if not exists agent_steps_conversation_idx on agent_steps(conversation_id);
create unique index if not exists stream_events_conversation_sequence_idx on stream_events(conversation_id, sequence_number);
create index if not exists stream_events_project_conversation_idx on stream_events(project_id, conversation_id);
create index if not exists stream_events_conversation_created_idx on stream_events(conversation_id, created_at);
create index if not exists stream_events_public_realtime_idx on stream_events(conversation_id, sequence_number) where visibility = 'public';
create index if not exists tool_calls_run_idx on tool_calls(agent_run_id);
create index if not exists tool_calls_step_idx on tool_calls(step_id);
create index if not exists file_change_events_run_idx on file_change_events(agent_run_id);
create index if not exists file_change_events_project_path_idx on file_change_events(project_id, path);
create unique index if not exists build_log_chunks_build_chunk_idx on build_log_chunks(build_id, chunk_index);
create index if not exists build_log_chunks_conversation_idx on build_log_chunks(conversation_id, build_id);
create index if not exists preview_events_project_idx on preview_events(project_id);
create index if not exists preview_events_run_idx on preview_events(agent_run_id);
create index if not exists deployment_events_project_idx on deployment_events(project_id);
create index if not exists deployment_events_run_idx on deployment_events(agent_run_id);

alter table conversations enable row level security;
alter table chat_messages enable row level security;
alter table stream_events enable row level security;
alter table tool_calls enable row level security;
alter table file_change_events enable row level security;
alter table build_log_chunks enable row level security;
alter table preview_events enable row level security;
alter table deployment_events enable row level security;

create policy conversations_select_member on conversations for select using (public.can_read_project(organization_id));
create policy conversations_insert_editor on conversations for insert with check (public.can_edit_project(organization_id) and created_by = auth.uid());
create policy conversations_update_editor on conversations for update using (public.can_edit_project(organization_id)) with check (public.can_edit_project(organization_id));

create policy chat_messages_select_member on chat_messages for select using (public.can_read_project(organization_id));
create policy chat_messages_insert_editor on chat_messages for insert with check (public.can_edit_project(organization_id));

create policy stream_events_select_public_member on stream_events for select using (public.can_read_project(organization_id) and visibility = 'public');

create policy tool_calls_select_member on tool_calls for select using (public.can_read_project(organization_id));
create policy file_change_events_select_member on file_change_events for select using (public.can_read_project(organization_id));
create policy build_log_chunks_select_member on build_log_chunks for select using (public.can_read_project(organization_id));
create policy preview_events_select_member on preview_events for select using (public.can_read_project(organization_id));
create policy deployment_events_select_member on deployment_events for select using (public.can_read_project(organization_id));

create or replace function cleanup_old_build_log_chunks(retention interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from build_log_chunks
  where created_at < now() - retention
    and storage_path is null;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;


-- ============================================================
-- 0003_billing_ai_domains.sql
-- ============================================================

create extension if not exists "pgcrypto";

DO $$ BEGIN
  CREATE TYPE billing_interval AS ENUM ('monthly', 'yearly', 'one_time');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE credit_reservation_status AS ENUM ('reserved', 'finalized', 'released', 'refunded', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_model_tier AS ENUM ('economy', 'standard', 'pro', 'premium', 'max_quality');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_routing_mode AS ENUM ('auto', 'fast', 'balanced', 'pro', 'max_quality', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE domain_type AS ENUM ('subdomain', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE billing_alert_status AS ENUM ('open', 'acknowledged', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create table if not exists plans (
  key text primary key,
  name text not null,
  description text,
  price_monthly_usd numeric(10,2),
  price_yearly_usd numeric(10,2),
  stripe_monthly_price_id text,
  stripe_yearly_price_id text,
  sort_order integer not null default 0,
  is_public boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists plan_features (
  plan_key text primary key references plans(key) on delete cascade,
  monthly_credits numeric(12,1) not null default 0,
  active_projects_limit integer,
  custom_domains_limit integer not null default 0,
  allowed_model_tiers ai_model_tier[] not null default array['economy']::ai_model_tier[],
  github_sync boolean not null default false,
  supabase_integration boolean not null default false,
  team_collaboration boolean not null default false,
  audit_logs boolean not null default false,
  version_history_days integer,
  priority_builds boolean not null default false,
  badge_removal boolean not null default false,
  public_projects_only boolean not null default false,
  private_projects boolean not null default true,
  export_code boolean not null default false,
  max_credit_per_action numeric(12,1) not null default 25,
  premium_requires_confirmation boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stripe_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table subscriptions add column if not exists stripe_customer_id text;
alter table subscriptions add column if not exists stripe_price_id text;
alter table subscriptions add column if not exists interval billing_interval not null default 'monthly';
alter table subscriptions add column if not exists seats integer not null default 1;
alter table subscriptions add column if not exists trial_end timestamptz;
alter table subscriptions add column if not exists ended_at timestamptz;
alter table subscriptions add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists stripe_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  api_version text,
  livemode boolean not null default false,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);

create table if not exists topup_products (
  key text primary key,
  credits numeric(12,1) not null,
  price_usd numeric(10,2) not null,
  stripe_price_id text,
  expires_after interval not null default interval '12 months',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price_usd / nullif(credits, 0) between 0.16 and 0.20)
);

create table if not exists credit_wallets (
  organization_id uuid primary key references organizations(id) on delete cascade,
  plan_credits_balance numeric(12,1) not null default 0,
  topup_credits_balance numeric(12,1) not null default 0,
  reserved_credits numeric(12,1) not null default 0,
  lifetime_credits_granted numeric(12,1) not null default 0,
  lifetime_credits_used numeric(12,1) not null default 0,
  current_plan_key text references plans(key),
  sell_value_per_credit_usd numeric(10,4) not null default 0.20,
  period_started_at timestamptz,
  period_ends_at timestamptz,
  updated_at timestamptz not null default now(),
  check (plan_credits_balance >= 0),
  check (topup_credits_balance >= 0),
  check (reserved_credits >= 0)
);

alter table credit_ledger alter column amount type numeric(12,1) using amount::numeric(12,1);
alter table credit_ledger add column if not exists wallet_organization_id uuid references credit_wallets(organization_id) on delete cascade;
alter table credit_ledger add column if not exists direction text not null default 'debit';
alter table credit_ledger add column if not exists source text not null default 'system';
alter table credit_ledger add column if not exists balance_after numeric(12,1);
alter table credit_ledger add column if not exists unit_value_usd numeric(10,4);
alter table credit_ledger add column if not exists estimated_cost_usd numeric(12,6);
alter table credit_ledger add column if not exists actual_cost_usd numeric(12,6);
alter table credit_ledger add column if not exists margin_multiplier numeric(10,4);
alter table credit_ledger add column if not exists expires_at timestamptz;
alter table credit_ledger add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists credit_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  amount numeric(12,1) not null,
  status credit_reservation_status not null default 'reserved',
  reason text not null,
  reference_type text,
  reference_id uuid,
  estimated_cost_usd numeric(12,6) not null default 0,
  actual_cost_usd numeric(12,6),
  estimated_margin_multiplier numeric(10,4),
  actual_margin_multiplier numeric(10,4),
  confirmation_required boolean not null default false,
  confirmed_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 minutes',
  finalized_at timestamptz,
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (amount > 0)
);

create table if not exists ai_model_catalog (
  id uuid primary key default gen_random_uuid(),
  model_key text not null unique,
  provider text not null default 'openrouter',
  display_name text not null,
  openrouter_model text not null,
  tier ai_model_tier not null,
  context_window integer,
  supports_streaming boolean not null default true,
  supports_json_mode boolean not null default false,
  supports_tool_calling boolean not null default false,
  supports_vision boolean not null default false,
  strengths text[] not null default '{}',
  speed text not null default 'medium',
  cost_indicator text not null default 'medium',
  requires_confirmation boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_model_pricing (
  id uuid primary key default gen_random_uuid(),
  model_key text not null references ai_model_catalog(model_key) on delete cascade,
  currency text not null default 'usd',
  input_cost_per_1m_tokens numeric(12,6) not null default 0,
  output_cost_per_1m_tokens numeric(12,6) not null default 0,
  cached_input_cost_per_1m_tokens numeric(12,6),
  request_cost_usd numeric(12,6) not null default 0,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists ai_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  agent_run_id uuid references agent_runs(id) on delete set null,
  routing_decision_id uuid,
  model_key text references ai_model_catalog(model_key),
  provider text not null default 'openrouter',
  openrouter_request_id text,
  routing_mode ai_routing_mode not null default 'auto',
  prompt_hash text,
  status text not null default 'queued',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  actual_cost_usd numeric(12,6),
  estimated_credits numeric(12,1) not null default 0,
  charged_credits numeric(12,1),
  confirmation_required boolean not null default false,
  confirmed_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists ai_request_usage (
  id uuid primary key default gen_random_uuid(),
  ai_request_id uuid not null references ai_requests(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  openrouter_cost_usd numeric(12,6) not null default 0,
  infra_cost_usd numeric(12,6) not null default 0,
  storage_cost_usd numeric(12,6) not null default 0,
  build_cost_usd numeric(12,6) not null default 0,
  domain_operation_cost_usd numeric(12,6) not null default 0,
  total_cost_usd numeric(12,6) generated always as (openrouter_cost_usd + infra_cost_usd + storage_cost_usd + build_cost_usd + domain_operation_cost_usd) stored,
  credits_charged numeric(12,1) not null default 0,
  estimated_margin_multiplier numeric(10,4),
  actual_margin_multiplier numeric(10,4),
  created_at timestamptz not null default now()
);

create table if not exists ai_routing_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  requested_mode ai_routing_mode not null default 'auto',
  selected_model_key text references ai_model_catalog(model_key),
  selected_tier ai_model_tier,
  task_type text not null,
  complexity_score numeric(5,2) not null default 0,
  allowed_tiers ai_model_tier[] not null default array['economy']::ai_model_tier[],
  rejected_models jsonb not null default '[]'::jsonb,
  rationale text,
  estimated_credits numeric(12,1) not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  confirmation_required boolean not null default false,
  fallback_used boolean not null default false,
  created_at timestamptz not null default now()
);

DO $$ BEGIN
  ALTER TABLE ai_requests ADD CONSTRAINT ai_requests_routing_decision_fk FOREIGN KEY (routing_decision_id) REFERENCES ai_routing_decisions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create table if not exists user_ai_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_mode ai_routing_mode not null default 'auto',
  preferred_model_key text references ai_model_catalog(model_key),
  max_credits_per_action numeric(12,1) not null default 10,
  confirm_before_premium boolean not null default true,
  revert_to_auto_after_response boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists project_ai_preferences (
  project_id uuid primary key references projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  default_mode ai_routing_mode not null default 'auto',
  preferred_model_key text references ai_model_catalog(model_key),
  max_credits_per_action numeric(12,1) not null default 25,
  confirm_before_premium boolean not null default true,
  allow_manual_model_selection boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table domains add column if not exists domain text generated always as (hostname) stored;
alter table domains add column if not exists type domain_type not null default 'custom';
alter table domains add column if not exists is_primary boolean not null default false;
alter table domains add column if not exists vercel_project_id text;
alter table domains add column if not exists verification_token text default encode(gen_random_bytes(16), 'hex');
alter table domains add column if not exists last_checked_at timestamptz;
alter table domains add column if not exists verified_at timestamptz;
alter table domains add column if not exists error_message text;
alter table domains add column if not exists created_by uuid references auth.users(id) on delete set null;
update domains set created_by = added_by where created_by is null and added_by is not null;

DO $$ BEGIN
  ALTER TABLE domains ADD CONSTRAINT domains_status_check CHECK (status in ('pending','verified','active','failed','removed')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

alter table dns_verifications add column if not exists status text not null default 'pending';
alter table dns_verifications add column if not exists checked_at timestamptz;

alter table deployment_aliases add column if not exists domain_id uuid references domains(id) on delete set null;
alter table deployment_aliases add column if not exists vercel_alias_id text;
alter table deployment_aliases add column if not exists status text not null default 'active';

create table if not exists domain_addons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  quantity integer not null default 1,
  stripe_subscription_item_id text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity > 0)
);

create table if not exists member_credit_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  monthly_credit_limit numeric(12,1),
  per_action_credit_limit numeric(12,1),
  premium_models_allowed boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists billing_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  alert_type text not null,
  severity text not null default 'medium',
  status billing_alert_status not null default 'open',
  title text not null,
  message text,
  threshold numeric(12,6),
  observed_value numeric(12,6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

alter table usage_events add column if not exists estimated_cost_usd numeric(12,6);
alter table usage_events add column if not exists actual_cost_usd numeric(12,6);
alter table usage_events add column if not exists credits_charged numeric(12,1);
alter table usage_events add column if not exists model_key text;
alter table usage_events add column if not exists plan_key text;

create unique index if not exists idx_domains_primary_true on domains(project_id) where is_primary = true and deleted_at is null;
create index if not exists idx_plans_public_active on plans(is_public, is_active, sort_order);
create index if not exists idx_subscriptions_org_status on subscriptions(organization_id, status);
create index if not exists idx_stripe_events_type_created on stripe_events(event_type, created_at);
create index if not exists idx_credit_reservations_org_status on credit_reservations(organization_id, status, created_at);
create index if not exists idx_ai_model_catalog_tier_active on ai_model_catalog(tier, is_active);
create index if not exists idx_ai_model_pricing_model_effective on ai_model_pricing(model_key, effective_from desc);
create index if not exists idx_ai_requests_org_created on ai_requests(organization_id, created_at desc);
create index if not exists idx_ai_requests_project_created on ai_requests(project_id, created_at desc);
create index if not exists idx_ai_routing_decisions_org_created on ai_routing_decisions(organization_id, created_at desc);
create index if not exists idx_domain_addons_org_status on domain_addons(organization_id, status);
create index if not exists idx_billing_alerts_org_status on billing_alerts(organization_id, status, created_at desc);

alter table plans enable row level security;
alter table plan_features enable row level security;
alter table stripe_customers enable row level security;
alter table stripe_events enable row level security;
alter table topup_products enable row level security;
alter table credit_wallets enable row level security;
alter table credit_reservations enable row level security;
alter table ai_model_catalog enable row level security;
alter table ai_model_pricing enable row level security;
alter table ai_requests enable row level security;
alter table ai_request_usage enable row level security;
alter table ai_routing_decisions enable row level security;
alter table user_ai_preferences enable row level security;
alter table project_ai_preferences enable row level security;
alter table domain_addons enable row level security;
alter table member_credit_limits enable row level security;
alter table billing_alerts enable row level security;

DO $$ BEGIN
  CREATE POLICY plans_select_public ON plans FOR SELECT USING (is_public = true and is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY plan_features_select_public ON plan_features FOR SELECT USING (exists (select 1 from plans p where p.key = plan_key and p.is_public = true and p.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY topup_products_select_public ON topup_products FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ai_model_catalog_select_active ON ai_model_catalog FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ai_model_pricing_select_active_models ON ai_model_pricing FOR SELECT USING (exists (select 1 from ai_model_catalog m where m.model_key = ai_model_pricing.model_key and m.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY stripe_customers_select_admin ON stripe_customers FOR SELECT USING (public.can_admin_org(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY credit_wallets_select_admin ON credit_wallets FOR SELECT USING (public.can_admin_org(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY credit_reservations_select_admin ON credit_reservations FOR SELECT USING (public.can_admin_org(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ai_requests_select_member ON ai_requests FOR SELECT USING (public.can_read_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ai_request_usage_select_admin ON ai_request_usage FOR SELECT USING (public.can_admin_org(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ai_routing_decisions_select_member ON ai_routing_decisions FOR SELECT USING (public.can_read_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY user_ai_preferences_select_self ON user_ai_preferences FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY user_ai_preferences_update_self ON user_ai_preferences FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY user_ai_preferences_insert_self ON user_ai_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY project_ai_preferences_select_member ON project_ai_preferences FOR SELECT USING (public.can_read_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY project_ai_preferences_upsert_editor ON project_ai_preferences FOR INSERT WITH CHECK (public.can_edit_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY project_ai_preferences_update_editor ON project_ai_preferences FOR UPDATE USING (public.can_edit_project(organization_id)) WITH CHECK (public.can_edit_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY domains_insert_editor ON domains FOR INSERT WITH CHECK (public.can_edit_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY domains_update_editor ON domains FOR UPDATE USING (public.can_edit_project(organization_id)) WITH CHECK (public.can_edit_project(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY dns_verifications_manage_editor ON dns_verifications FOR ALL USING (exists (select 1 from domains d where d.id = domain_id and public.can_edit_project(d.organization_id))) WITH CHECK (exists (select 1 from domains d where d.id = domain_id and public.can_edit_project(d.organization_id)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY domain_addons_select_admin ON domain_addons FOR SELECT USING (public.can_admin_org(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY member_credit_limits_select_admin ON member_credit_limits FOR SELECT USING (public.can_admin_org(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY member_credit_limits_manage_admin ON member_credit_limits FOR ALL USING (public.can_admin_org(organization_id)) WITH CHECK (public.can_admin_org(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY billing_alerts_select_admin ON billing_alerts FOR SELECT USING (organization_id is not null and public.can_admin_org(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

insert into plans (key, name, description, price_monthly_usd, price_yearly_usd, sort_order, is_public, is_active)
values
  ('free', 'Free', 'Try AI app generation with public projects and Economy models.', 0, 0, 10, true, true),
  ('starter', 'Starter', 'Transparent AI generation with private projects and one custom domain.', 20, 200, 20, true, true),
  ('pro', 'Pro', 'Higher limits, advanced agents, GitHub sync and more domains.', 49, 490, 30, true, true),
  ('studio', 'Studio', 'Team-ready AI generation with premium models and faster builds.', 99, 990, 40, true, true),
  ('business', 'Business', 'Organization controls, audit logs, policy limits and priority support.', 199, 1990, 50, true, true),
  ('enterprise', 'Enterprise', 'Custom scale, compliance, SSO/SAML and dedicated support.', null, null, 60, true, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  price_monthly_usd = excluded.price_monthly_usd,
  price_yearly_usd = excluded.price_yearly_usd,
  sort_order = excluded.sort_order,
  is_public = excluded.is_public,
  is_active = excluded.is_active,
  updated_at = now();

insert into plan_features (plan_key, monthly_credits, active_projects_limit, custom_domains_limit, allowed_model_tiers, github_sync, supabase_integration, team_collaboration, audit_logs, version_history_days, priority_builds, badge_removal, public_projects_only, private_projects, export_code, max_credit_per_action)
values
  ('free', 20, 1, 0, array['economy']::ai_model_tier[], false, false, false, false, null, false, false, true, false, false, 5),
  ('starter', 100, 3, 1, array['economy','standard']::ai_model_tier[], false, false, false, false, 7, false, true, false, true, true, 15),
  ('pro', 300, 10, 5, array['economy','standard','pro']::ai_model_tier[], true, true, false, false, 30, true, true, false, true, true, 35),
  ('studio', 700, 30, 15, array['economy','standard','pro','premium']::ai_model_tier[], true, true, true, true, 90, true, true, false, true, true, 75),
  ('business', 1500, null, 50, array['economy','standard','pro','premium']::ai_model_tier[], true, true, true, true, 180, true, true, false, true, true, 150),
  ('enterprise', 0, null, 0, array['economy','standard','pro','premium','max_quality']::ai_model_tier[], true, true, true, true, null, true, true, false, true, true, 500)
on conflict (plan_key) do update set
  monthly_credits = excluded.monthly_credits,
  active_projects_limit = excluded.active_projects_limit,
  custom_domains_limit = excluded.custom_domains_limit,
  allowed_model_tiers = excluded.allowed_model_tiers,
  github_sync = excluded.github_sync,
  supabase_integration = excluded.supabase_integration,
  team_collaboration = excluded.team_collaboration,
  audit_logs = excluded.audit_logs,
  version_history_days = excluded.version_history_days,
  priority_builds = excluded.priority_builds,
  badge_removal = excluded.badge_removal,
  public_projects_only = excluded.public_projects_only,
  private_projects = excluded.private_projects,
  export_code = excluded.export_code,
  max_credit_per_action = excluded.max_credit_per_action,
  updated_at = now();

insert into topup_products (key, credits, price_usd, sort_order)
values
  ('credits_100', 100, 20, 10),
  ('credits_250', 250, 47, 20),
  ('credits_500', 500, 90, 30),
  ('credits_1000', 1000, 170, 40),
  ('credits_2500', 2500, 400, 50)
on conflict (key) do update set credits = excluded.credits, price_usd = excluded.price_usd, sort_order = excluded.sort_order, updated_at = now();

insert into ai_model_catalog (model_key, provider, display_name, openrouter_model, tier, context_window, supports_streaming, supports_json_mode, supports_tool_calling, supports_vision, strengths, speed, cost_indicator, requires_confirmation)
values
  ('openai/gpt-5.5', 'openrouter', 'GPT-5.5', 'openai/gpt-5.5', 'premium', 256000, true, true, true, true, array['Architecture','Full app generation','Reasoning'], 'medium', 'very_high', true),
  ('openai/gpt-5.5-pro', 'openrouter', 'GPT-5.5 Pro', 'openai/gpt-5.5-pro', 'max_quality', 256000, true, true, true, true, array['Critical reasoning','Complex debugging','Architecture'], 'slow', 'very_high', true),
  ('anthropic/claude-opus-4.7', 'openrouter', 'Claude Opus 4.7', 'anthropic/claude-opus-4.7', 'max_quality', 200000, true, true, true, true, array['Long context','Architecture','Security'], 'slow', 'very_high', true),
  ('anthropic/claude-sonnet-4.6', 'openrouter', 'Claude Sonnet 4.6', 'anthropic/claude-sonnet-4.6', 'premium', 200000, true, true, true, true, array['Code','Refactoring','Planning'], 'medium', 'high', true),
  ('google/gemini-3-pro', 'openrouter', 'Gemini 3 Pro', 'google/gemini-3-pro', 'pro', 1000000, true, true, true, true, array['Large context','Planning','Vision'], 'medium', 'high', false),
  ('google/gemini-3-flash', 'openrouter', 'Gemini 3 Flash', 'google/gemini-3-flash', 'standard', 1000000, true, true, true, true, array['Fast edits','Summaries','Vision'], 'fast', 'medium', false),
  ('openai/gpt-5-mini', 'openrouter', 'GPT-5 Mini', 'openai/gpt-5-mini', 'standard', 128000, true, true, true, true, array['Components','Chat','UI'], 'fast', 'medium', false),
  ('openai/gpt-5-nano', 'openrouter', 'GPT-5 Nano', 'openai/gpt-5-nano', 'economy', 64000, true, true, true, false, array['Simple chat','Small edits','Classification'], 'fast', 'low', false),
  ('deepseek/deepseek-coder', 'openrouter', 'DeepSeek Coder', 'deepseek/deepseek-coder', 'pro', 128000, true, true, true, false, array['Code generation','Debugging','Refactoring'], 'medium', 'medium', false),
  ('qwen/qwen-coder', 'openrouter', 'Qwen Coder', 'qwen/qwen-coder', 'standard', 128000, true, true, true, false, array['Code generation','Fast edits','Utilities'], 'fast', 'medium', false),
  ('mistralai/codestral', 'openrouter', 'Codestral', 'mistralai/codestral', 'pro', 128000, true, true, true, false, array['Code completion','Refactoring','Tests'], 'medium', 'medium', false)
on conflict (model_key) do update set
  display_name = excluded.display_name,
  openrouter_model = excluded.openrouter_model,
  tier = excluded.tier,
  context_window = excluded.context_window,
  supports_streaming = excluded.supports_streaming,
  supports_json_mode = excluded.supports_json_mode,
  supports_tool_calling = excluded.supports_tool_calling,
  supports_vision = excluded.supports_vision,
  strengths = excluded.strengths,
  speed = excluded.speed,
  cost_indicator = excluded.cost_indicator,
  requires_confirmation = excluded.requires_confirmation,
  updated_at = now();

insert into ai_model_pricing (model_key, input_cost_per_1m_tokens, output_cost_per_1m_tokens, cached_input_cost_per_1m_tokens, request_cost_usd, source)
select model_key, input_cost_per_1m_tokens, output_cost_per_1m_tokens, cached_input_cost_per_1m_tokens, request_cost_usd, source
from (values
  ('openai/gpt-5.5', 5, 20, 1, 0, 'seed'),
  ('openai/gpt-5.5-pro', 15, 60, 7.5, 0, 'seed'),
  ('anthropic/claude-opus-4.7', 15, 75, 1.5, 0, 'seed'),
  ('anthropic/claude-sonnet-4.6', 3, 15, 0.3, 0, 'seed'),
  ('google/gemini-3-pro', 2.5, 10, 0.25, 0, 'seed'),
  ('google/gemini-3-flash', 0.15, 0.6, 0.075, 0, 'seed'),
  ('openai/gpt-5-mini', 0.25, 1, 0.125, 0, 'seed'),
  ('openai/gpt-5-nano', 0.05, 0.2, 0.025, 0, 'seed'),
  ('deepseek/deepseek-coder', 0.14, 0.28, 0.07, 0, 'seed'),
  ('qwen/qwen-coder', 0.2, 0.8, 0.1, 0, 'seed'),
  ('mistralai/codestral', 0.3, 0.9, 0.15, 0, 'seed')
) as seed(model_key, input_cost_per_1m_tokens, output_cost_per_1m_tokens, cached_input_cost_per_1m_tokens, request_cost_usd, source)
where not exists (
  select 1 from ai_model_pricing p where p.model_key = seed.model_key and p.source = 'seed'
);


-- ============================================================
-- 0004_strict_ai_model_allowlist.sql
-- ============================================================

create extension if not exists "pgcrypto";

alter table ai_model_catalog add column if not exists openrouter_model_id text;
update ai_model_catalog set openrouter_model_id = coalesce(openrouter_model_id, openrouter_model, model_key);
alter table ai_model_catalog alter column openrouter_model_id set not null;

alter table ai_model_catalog add column if not exists supports_tools boolean not null default false;
update ai_model_catalog set supports_tools = supports_tool_calling where supports_tool_calling is not null;

alter table ai_model_catalog add column if not exists max_context_tokens integer;
update ai_model_catalog set max_context_tokens = coalesce(max_context_tokens, context_window);

alter table ai_model_catalog add column if not exists is_allowed boolean not null default false;
alter table ai_model_catalog add column if not exists is_available boolean not null default false;
alter table ai_model_catalog add column if not exists plan_minimum text not null default 'free';

create table if not exists ai_blocked_model_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  requested_model text not null,
  reason text not null,
  source text not null check (source in ('auto','custom','api')),
  created_at timestamptz not null default now()
);

alter table ai_requests add column if not exists model_id uuid references ai_model_catalog(id) on delete restrict;

truncate table ai_model_pricing restart identity cascade;
truncate table ai_model_catalog restart identity cascade;

insert into ai_model_catalog (model_key, openrouter_model_id, provider, display_name, openrouter_model, tier, context_window, max_context_tokens, supports_streaming, supports_json_mode, supports_tool_calling, supports_tools, supports_vision, strengths, speed, cost_indicator, requires_confirmation, is_allowed, is_available, plan_minimum)
values
  ('openai/gpt-5.5', 'openai/gpt-5.5', 'openrouter', 'GPT-5.5', 'openai/gpt-5.5', 'premium', 256000, 256000, true, true, true, true, true, array['Architecture','Full app generation','Reasoning'], 'medium', 'very_high', true, true, false, 'studio'),
  ('openai/gpt-5.5-pro', 'openai/gpt-5.5-pro', 'openrouter', 'GPT-5.5 Pro', 'openai/gpt-5.5-pro', 'max_quality', 256000, 256000, true, true, true, true, true, array['Critical reasoning','Complex debugging','Architecture'], 'slow', 'very_high', true, true, false, 'enterprise'),
  ('anthropic/claude-opus-4.7', 'anthropic/claude-opus-4.7', 'openrouter', 'Claude Opus 4.7', 'anthropic/claude-opus-4.7', 'max_quality', 200000, 200000, true, true, true, true, true, array['Long context','Architecture','Security'], 'slow', 'very_high', true, true, false, 'enterprise'),
  ('anthropic/claude-sonnet-4.6', 'anthropic/claude-sonnet-4.6', 'openrouter', 'Claude Sonnet 4.6', 'anthropic/claude-sonnet-4.6', 'premium', 200000, 200000, true, true, true, true, true, array['Code','Refactoring','Planning'], 'medium', 'high', true, true, false, 'studio'),
  ('google/gemini-3-pro', 'google/gemini-3-pro', 'openrouter', 'Gemini 3 Pro', 'google/gemini-3-pro', 'pro', 1000000, 1000000, true, true, true, true, true, array['Large context','Planning','Vision'], 'medium', 'high', false, true, false, 'pro'),
  ('google/gemini-3-flash', 'google/gemini-3-flash', 'openrouter', 'Gemini 3 Flash', 'google/gemini-3-flash', 'standard', 1000000, 1000000, true, true, true, true, true, array['Fast edits','Summaries','Vision'], 'fast', 'medium', false, true, false, 'starter'),
  ('openai/gpt-5-mini', 'openai/gpt-5-mini', 'openrouter', 'GPT-5 Mini', 'openai/gpt-5-mini', 'standard', 128000, 128000, true, true, true, true, true, array['Components','Chat','UI'], 'fast', 'medium', false, true, false, 'starter'),
  ('openai/gpt-5-nano', 'openai/gpt-5-nano', 'openrouter', 'GPT-5 Nano', 'openai/gpt-5-nano', 'economy', 64000, 64000, true, true, true, true, false, array['Simple chat','Small edits','Classification'], 'fast', 'low', false, true, false, 'free'),
  ('deepseek/deepseek-coder', 'deepseek/deepseek-coder', 'openrouter', 'DeepSeek Coder', 'deepseek/deepseek-coder', 'pro', 128000, 128000, true, true, true, true, false, array['Code generation','Debugging','Refactoring'], 'medium', 'medium', false, true, false, 'pro'),
  ('qwen/qwen-coder', 'qwen/qwen-coder', 'openrouter', 'Qwen Coder', 'qwen/qwen-coder', 'standard', 128000, 128000, true, true, true, true, false, array['Code generation','Fast edits','Utilities'], 'fast', 'medium', false, true, false, 'starter'),
  ('mistralai/codestral', 'mistralai/codestral', 'openrouter', 'Codestral', 'mistralai/codestral', 'pro', 128000, 128000, true, true, true, true, false, array['Code completion','Refactoring','Tests'], 'medium', 'medium', false, true, false, 'pro');

insert into ai_model_pricing (model_key, input_cost_per_1m_tokens, output_cost_per_1m_tokens, cached_input_cost_per_1m_tokens, request_cost_usd, source)
values
  ('openai/gpt-5.5', 5, 20, 1, 0, 'strict_allowlist_seed'),
  ('openai/gpt-5.5-pro', 15, 60, 7.5, 0, 'strict_allowlist_seed'),
  ('anthropic/claude-opus-4.7', 15, 75, 1.5, 0, 'strict_allowlist_seed'),
  ('anthropic/claude-sonnet-4.6', 3, 15, 0.3, 0, 'strict_allowlist_seed'),
  ('google/gemini-3-pro', 2.5, 10, 0.25, 0, 'strict_allowlist_seed'),
  ('google/gemini-3-flash', 0.15, 0.6, 0.075, 0, 'strict_allowlist_seed'),
  ('openai/gpt-5-mini', 0.25, 1, 0.125, 0, 'strict_allowlist_seed'),
  ('openai/gpt-5-nano', 0.05, 0.2, 0.025, 0, 'strict_allowlist_seed'),
  ('deepseek/deepseek-coder', 0.14, 0.28, 0.07, 0, 'strict_allowlist_seed'),
  ('qwen/qwen-coder', 0.2, 0.8, 0.1, 0, 'strict_allowlist_seed'),
  ('mistralai/codestral', 0.3, 0.9, 0.15, 0, 'strict_allowlist_seed');

DO $$ BEGIN
  ALTER TABLE ai_model_catalog ADD CONSTRAINT ai_model_catalog_strict_allowed_check CHECK (
    is_allowed = (openrouter_model_id in (
      'openai/gpt-5.5',
      'openai/gpt-5.5-pro',
      'anthropic/claude-opus-4.7',
      'anthropic/claude-sonnet-4.6',
      'google/gemini-3-pro',
      'google/gemini-3-flash',
      'openai/gpt-5-mini',
      'openai/gpt-5-nano',
      'deepseek/deepseek-coder',
      'qwen/qwen-coder',
      'mistralai/codestral'
    ))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ai_model_catalog ADD CONSTRAINT ai_model_catalog_openrouter_model_id_unique UNIQUE (openrouter_model_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create index if not exists idx_ai_model_catalog_allowed_available on ai_model_catalog(is_allowed, is_available, tier);
create index if not exists idx_ai_blocked_model_audit_logs_org_created on ai_blocked_model_audit_logs(organization_id, created_at desc);

alter table ai_blocked_model_audit_logs enable row level security;

DO $$ BEGIN
  CREATE POLICY ai_blocked_model_audit_logs_select_admin ON ai_blocked_model_audit_logs FOR SELECT USING (organization_id is not null and public.can_admin_org(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- 0005_deployment_preview_backend_completion.sql
-- ============================================================

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

