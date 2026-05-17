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
