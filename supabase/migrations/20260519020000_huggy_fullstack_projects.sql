create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null,
  content text not null,
  language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, path)
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.builds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'queued',
  logs text not null default '',
  preview_html text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null default 'vercel',
  deployment_url text not null,
  status text not null default 'queued',
  provider_project_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_domains (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  domain text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(domain)
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  event_type text not null,
  quantity numeric not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_files enable row level security;
alter table public.ai_messages enable row level security;
alter table public.builds enable row level security;
alter table public.deployments enable row level security;
alter table public.project_domains enable row level security;
alter table public.usage_events enable row level security;

create policy "Profiles are owned by user" on public.profiles
for all to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Projects are owned by user" on public.projects
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Project files are owned through project" on public.project_files
for all to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "AI messages are owned through project" on public.ai_messages
for all to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "Builds are owned through project" on public.builds
for all to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "Deployments are owned through project" on public.deployments
for all to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "Domains are owned through project" on public.project_domains
for all to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "Usage events are readable by user" on public.usage_events
for select to authenticated
using ((select auth.uid()) = user_id);

create index if not exists projects_user_updated_idx on public.projects(user_id, updated_at desc);
create index if not exists project_files_project_path_idx on public.project_files(project_id, path);
create index if not exists deployments_project_created_idx on public.deployments(project_id, created_at desc);
