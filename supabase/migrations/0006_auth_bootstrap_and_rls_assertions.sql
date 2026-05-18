create extension if not exists "pgcrypto";

create or replace function public.slugify_workspace(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, 'workspace')), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.handle_new_user_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
  org_name text;
  org_slug text;
  org_id uuid;
  free_plan_key text;
begin
  display_name := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Utilisateur');
  org_name := display_name || ' Workspace';
  org_slug := public.slugify_workspace(display_name) || '-' || substr(new.id::text, 1, 8);

  insert into public.users_profile(id, display_name, email)
  values (new.id, display_name, new.email)
  on conflict (id) do update
  set display_name = coalesce(excluded.display_name, public.users_profile.display_name),
      email = coalesce(excluded.email, public.users_profile.email),
      updated_at = now();

  select organization_id into org_id
  from public.organization_members
  where user_id = new.id
  order by created_at asc
  limit 1;

  if org_id is null then
    insert into public.organizations(name, slug, created_by)
    values (org_name, org_slug, new.id)
    on conflict (slug) do update set updated_at = now()
    returning id into org_id;

    insert into public.organization_members(organization_id, user_id, role)
    values (org_id, new.id, 'owner')
    on conflict (organization_id, user_id) do update set role = 'owner', updated_at = now();
  end if;

  select key into free_plan_key from public.plans where key = 'free' limit 1;

  if to_regclass('public.credit_wallets') is not null then
    insert into public.credit_wallets(
      organization_id,
      current_plan_key,
      plan_credits_balance,
      topup_credits_balance,
      reserved_credits,
      lifetime_credits_granted,
      updated_at
    )
    values (org_id, free_plan_key, 100, 0, 0, 100, now())
    on conflict (organization_id) do nothing;
  end if;

  insert into public.audit_logs(organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (org_id, new.id, 'auth_user_bootstrap', 'user', new.id, jsonb_build_object('email', new.email))
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_workspace on auth.users;
create trigger on_auth_user_created_workspace
after insert on auth.users
for each row execute function public.handle_new_user_workspace();

create or replace function public.assert_platform_rls_enabled()
returns table(table_name text, rls_enabled boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.relname::text as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in (
      'users_profile',
      'organizations',
      'organization_members',
      'projects',
      'project_files',
      'project_versions',
      'project_prompts',
      'agent_runs',
      'agent_steps',
      'build_jobs',
      'build_logs',
      'conversations',
      'chat_messages',
      'stream_events',
      'file_change_events',
      'build_log_chunks',
      'preview_events',
      'deployment_events',
      'previews',
      'deployments',
      'deployment_aliases',
      'domains',
      'dns_verifications',
      'project_backends',
      'project_backend_resources',
      'credit_wallets',
      'credit_reservations',
      'credit_ledger',
      'ai_requests',
      'ai_request_usage',
      'ai_routing_decisions',
      'audit_logs'
    )
  order by c.relname;
$$;
