-- Huggy generated-app persistence schema.
-- Safe to run multiple times; compatible with an existing public.projects table.

create extension if not exists "uuid-ossp";

create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now() not null
);

alter table public.projects add column if not exists owner_id uuid;
alter table public.projects add column if not exists organization_id uuid;
alter table public.projects add column if not exists name text;
alter table public.projects add column if not exists slug text;
alter table public.projects add column if not exists prompt text;
alter table public.projects add column if not exists template text default 'custom';
alter table public.projects add column if not exists theme text default 'dark';
alter table public.projects add column if not exists model_id text default 'auto';
alter table public.projects add column if not exists status text default 'draft';
alter table public.projects add column if not exists preview_status text default 'idle';
alter table public.projects add column if not exists preview_html text;
alter table public.projects add column if not exists updated_at timestamptz default now();

update public.projects set owner_id = organization_id where owner_id is null and organization_id is not null;
update public.projects set organization_id = owner_id where organization_id is null and owner_id is not null;
update public.projects set name = coalesce(name, 'Untitled project') where name is null;
update public.projects set slug = coalesce(slug, 'project-' || left(id::text, 8)) where slug is null;
update public.projects set status = coalesce(status, 'draft') where status is null;
update public.projects set preview_status = coalesce(preview_status, 'idle') where preview_status is null;
update public.projects set updated_at = coalesce(updated_at, now()) where updated_at is null;

create table if not exists public.project_files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null,
  content text not null,
  language text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.project_files add column if not exists language text;
alter table public.project_files add column if not exists updated_at timestamptz default now();

create table if not exists public.deployments (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid,
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text default 'vercel' not null,
  provider_deployment_id text,
  deployment_url text,
  status text not null,
  commit_hash text,
  branch text default 'main',
  created_at timestamptz default now() not null
);

alter table public.deployments add column if not exists organization_id uuid;
alter table public.deployments add column if not exists provider text default 'vercel';
alter table public.deployments add column if not exists provider_deployment_id text;
alter table public.deployments add column if not exists deployment_url text;
alter table public.deployments add column if not exists commit_hash text;
alter table public.deployments add column if not exists branch text default 'main';

alter table public.projects enable row level security;
alter table public.project_files enable row level security;
alter table public.deployments enable row level security;

drop policy if exists "Projects owner isolation" on public.projects;
create policy "Projects owner isolation" on public.projects
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Project files owner isolation" on public.project_files;
create policy "Project files owner isolation" on public.project_files
  for all using (
    project_id in (select id from public.projects where owner_id = auth.uid())
  )
  with check (
    project_id in (select id from public.projects where owner_id = auth.uid())
  );

drop policy if exists "Deployments owner isolation" on public.deployments;
create policy "Deployments owner isolation" on public.deployments
  for all using (
    project_id in (select id from public.projects where owner_id = auth.uid())
  )
  with check (
    project_id in (select id from public.projects where owner_id = auth.uid())
  );

create unique index if not exists projects_owner_slug_idx on public.projects (owner_id, slug);
create unique index if not exists project_files_project_path_unique_idx on public.project_files (project_id, path);
create index if not exists projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
create index if not exists deployments_project_created_idx on public.deployments (project_id, created_at desc);
