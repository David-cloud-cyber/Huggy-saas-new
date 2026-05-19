create extension if not exists "pgcrypto";

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table public.projects add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
create index if not exists idx_projects_organization_id on public.projects(organization_id);

create table if not exists public.plans (
  id text primary key,
  name text not null,
  monthly_price_usd numeric(10,2),
  monthly_credits numeric(12,1) not null,
  active_projects_limit integer,
  custom_domains_limit integer not null default 0,
  public_projects_only boolean not null default false,
  badge_can_disable boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.plans(id) on delete cascade,
  monthly_credits numeric(12,1) not null,
  active_projects_limit integer,
  custom_domains_limit integer not null,
  allowed_model_tiers text[] not null,
  github_sync boolean not null default false,
  supabase_integration boolean not null default false,
  team_collaboration boolean not null default false,
  audit_logs boolean not null default false,
  version_history_days integer,
  priority_builds boolean not null default false,
  badge_removal boolean not null default false,
  created_at timestamptz not null default now(),
  unique(plan_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id text not null references public.plans(id),
  stripe_subscription_id text unique,
  status text not null check (status in ('trialing','active','past_due','canceled','unpaid','incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.topup_products (
  id uuid primary key default gen_random_uuid(),
  credits numeric(12,1) not null,
  price_usd numeric(10,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(credits)
);

create table if not exists public.credit_wallets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id text not null references public.plans(id),
  monthly_credits numeric(12,1) not null default 0,
  purchased_credits numeric(12,1) not null default 0,
  reserved_credits numeric(12,1) not null default 0,
  balance numeric(12,1) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('grant','debit','reservation','release','refund','topup','adjustment')),
  amount numeric(12,1) not null,
  balance_after numeric(12,1) not null,
  reason text not null,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  amount numeric(12,1) not null check (amount >= 0),
  status text not null check (status in ('reserved','committed','released','refunded','expired')),
  reason text not null,
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_model_catalog (
  id uuid primary key default gen_random_uuid(),
  openrouter_model_id text not null unique,
  display_name text not null,
  provider text not null,
  tier text not null check (tier in ('economy','standard','pro','premium','max_quality')),
  supports_streaming boolean not null default true,
  supports_tools boolean not null default false,
  supports_vision boolean not null default false,
  supports_json_mode boolean not null default false,
  max_context_tokens integer not null default 32000,
  is_allowed boolean not null default true,
  is_available boolean not null default true,
  plan_minimum text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_model_pricing (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.ai_model_catalog(id) on delete cascade,
  input_usd_per_million numeric(12,6) not null,
  output_usd_per_million numeric(12,6) not null,
  cached_input_usd_per_million numeric(12,6),
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  model_id uuid references public.ai_model_catalog(id),
  mode text not null default 'auto',
  action_kind text not null,
  status text not null check (status in ('estimated','reserved','streaming','succeeded','failed','refunded')),
  estimated_cost_usd numeric(12,6) not null default 0,
  real_cost_usd numeric(12,6),
  estimated_credits numeric(12,1) not null default 0,
  charged_credits numeric(12,1),
  estimated_margin_usd numeric(12,6),
  real_margin_usd numeric(12,6),
  confirmation_required boolean not null default false,
  confirmation_accepted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_request_usage (
  id uuid primary key default gen_random_uuid(),
  ai_request_id uuid not null references public.ai_requests(id) on delete cascade,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  openrouter_request_id text,
  raw_usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_routing_decisions (
  id uuid primary key default gen_random_uuid(),
  ai_request_id uuid references public.ai_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  selected_model_id uuid references public.ai_model_catalog(id),
  mode text not null,
  fallback_used boolean not null default false,
  blocked_reason text,
  decision jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_ai_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_mode text not null default 'auto',
  default_model_id uuid references public.ai_model_catalog(id),
  max_credits_per_action numeric(12,1) not null default 8,
  confirm_before_premium boolean not null default true,
  return_to_auto_after_response boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.project_ai_preferences (
  project_id uuid primary key references public.projects(id) on delete cascade,
  default_mode text not null default 'auto',
  default_model_id uuid references public.ai_model_catalog(id),
  max_credits_per_action numeric(12,1) not null default 8,
  confirm_before_premium boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  domain text not null unique,
  type text not null check (type in ('subdomain','custom')),
  status text not null check (status in ('pending','verified','active','failed','removed')),
  is_primary boolean not null default false,
  vercel_project_id text,
  vercel_domain_id text,
  verification_token text,
  last_checked_at timestamptz,
  verified_at timestamptz,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dns_verifications (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.domains(id) on delete cascade,
  record_type text not null,
  record_name text not null,
  record_value text not null,
  status text not null check (status in ('pending','verified','failed')),
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.deployment_aliases (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid references public.deployments(id) on delete cascade,
  domain_id uuid references public.domains(id) on delete cascade,
  alias_url text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.domain_addons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  stripe_subscription_item_id text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.member_credit_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  monthly_limit numeric(12,1) not null,
  created_at timestamptz not null default now(),
  unique(organization_id, user_id)
);

create table if not exists public.billing_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null,
  severity text not null check (severity in ('info','warning','critical')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.stripe_events enable row level security;
alter table public.topup_products enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.ai_model_catalog enable row level security;
alter table public.ai_model_pricing enable row level security;
alter table public.ai_requests enable row level security;
alter table public.ai_request_usage enable row level security;
alter table public.ai_routing_decisions enable row level security;
alter table public.user_ai_preferences enable row level security;
alter table public.project_ai_preferences enable row level security;
alter table public.domains enable row level security;
alter table public.dns_verifications enable row level security;
alter table public.deployment_aliases enable row level security;
alter table public.domain_addons enable row level security;
alter table public.member_credit_limits enable row level security;
alter table public.billing_alerts enable row level security;
alter table public.audit_logs enable row level security;

create index if not exists idx_org_members_user on public.organization_members(user_id);
create index if not exists idx_credit_ledger_org on public.credit_ledger(organization_id, created_at desc);
create index if not exists idx_ai_requests_org on public.ai_requests(organization_id, created_at desc);
create index if not exists idx_domains_project on public.domains(project_id, status);

drop policy if exists "public plans readable" on public.plans;
create policy "public plans readable" on public.plans for select using (true);

drop policy if exists "public plan features readable" on public.plan_features;
create policy "public plan features readable" on public.plan_features for select using (true);

drop policy if exists "public topups readable" on public.topup_products;
create policy "public topups readable" on public.topup_products for select using (active = true);

drop policy if exists "model catalog readable" on public.ai_model_catalog;
create policy "model catalog readable" on public.ai_model_catalog for select using (is_allowed = true);

drop policy if exists "model pricing readable" on public.ai_model_pricing;
create policy "model pricing readable" on public.ai_model_pricing for select using (true);

drop policy if exists "members see organization" on public.organizations;
create policy "members see organization" on public.organizations for select using (
  owner_id = auth.uid() or exists (
    select 1 from public.organization_members om
    where om.organization_id = organizations.id and om.user_id = auth.uid()
  )
);

drop policy if exists "members see memberships" on public.organization_members;
create policy "members see memberships" on public.organization_members for select using (
  user_id = auth.uid() or exists (
    select 1 from public.organization_members om
    where om.organization_id = organization_members.organization_id and om.user_id = auth.uid()
  )
);

drop policy if exists "members see wallet" on public.credit_wallets;
create policy "members see wallet" on public.credit_wallets for select using (
  exists (select 1 from public.organization_members om where om.organization_id = credit_wallets.organization_id and om.user_id = auth.uid())
);

drop policy if exists "members see ledger" on public.credit_ledger;
create policy "members see ledger" on public.credit_ledger for select using (
  exists (select 1 from public.organization_members om where om.organization_id = credit_ledger.organization_id and om.user_id = auth.uid())
);

drop policy if exists "members see reservations" on public.credit_reservations;
create policy "members see reservations" on public.credit_reservations for select using (
  exists (select 1 from public.organization_members om where om.organization_id = credit_reservations.organization_id and om.user_id = auth.uid())
);

drop policy if exists "members see ai requests" on public.ai_requests;
create policy "members see ai requests" on public.ai_requests for select using (
  exists (select 1 from public.organization_members om where om.organization_id = ai_requests.organization_id and om.user_id = auth.uid())
);

drop policy if exists "members see ai usage" on public.ai_request_usage;
create policy "members see ai usage" on public.ai_request_usage for select using (
  exists (
    select 1 from public.ai_requests ar
    join public.organization_members om on om.organization_id = ar.organization_id
    where ar.id = ai_request_usage.ai_request_id and om.user_id = auth.uid()
  )
);

drop policy if exists "members see routing" on public.ai_routing_decisions;
create policy "members see routing" on public.ai_routing_decisions for select using (
  exists (select 1 from public.organization_members om where om.organization_id = ai_routing_decisions.organization_id and om.user_id = auth.uid())
);

drop policy if exists "users manage own ai prefs" on public.user_ai_preferences;
create policy "users manage own ai prefs" on public.user_ai_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "members see project ai prefs" on public.project_ai_preferences;
create policy "members see project ai prefs" on public.project_ai_preferences for select using (
  exists (
    select 1 from public.projects p
    join public.organization_members om on om.organization_id = p.organization_id
    where p.id = project_ai_preferences.project_id and om.user_id = auth.uid()
  )
);

drop policy if exists "members see domains" on public.domains;
create policy "members see domains" on public.domains for select using (
  exists (select 1 from public.organization_members om where om.organization_id = domains.organization_id and om.user_id = auth.uid())
);

drop policy if exists "editors manage domains" on public.domains;
create policy "editors manage domains" on public.domains for all using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = domains.organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','editor')
  )
) with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = domains.organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','editor')
  )
);

drop policy if exists "members see dns verifications" on public.dns_verifications;
create policy "members see dns verifications" on public.dns_verifications for select using (
  exists (
    select 1 from public.domains d
    join public.organization_members om on om.organization_id = d.organization_id
    where d.id = dns_verifications.domain_id and om.user_id = auth.uid()
  )
);

drop policy if exists "members see audit logs" on public.audit_logs;
create policy "members see audit logs" on public.audit_logs for select using (
  exists (select 1 from public.organization_members om where om.organization_id = audit_logs.organization_id and om.user_id = auth.uid())
);

insert into public.plans (id, name, monthly_price_usd, monthly_credits, active_projects_limit, custom_domains_limit, public_projects_only, badge_can_disable)
values
  ('free','Free',0,20,1,0,true,false),
  ('starter','Starter',20,100,3,1,false,true),
  ('pro','Pro',49,300,10,5,false,true),
  ('studio','Studio',99,700,30,15,false,true),
  ('business','Business',199,1500,null,50,false,true),
  ('enterprise','Enterprise',null,0,null,9999,false,true)
on conflict (id) do update set
  monthly_price_usd = excluded.monthly_price_usd,
  monthly_credits = excluded.monthly_credits,
  active_projects_limit = excluded.active_projects_limit,
  custom_domains_limit = excluded.custom_domains_limit,
  public_projects_only = excluded.public_projects_only,
  badge_can_disable = excluded.badge_can_disable;

insert into public.topup_products (credits, price_usd)
values (100,20), (250,47), (500,90), (1000,170), (2500,400)
on conflict (credits) do update set price_usd = excluded.price_usd, active = true;

insert into public.plan_features (
  plan_id, monthly_credits, active_projects_limit, custom_domains_limit, allowed_model_tiers,
  github_sync, supabase_integration, team_collaboration, audit_logs, version_history_days, priority_builds, badge_removal
)
values
  ('free',20,1,0,array['economy'],false,false,false,false,3,false,false),
  ('starter',100,3,1,array['economy','standard'],false,false,false,false,7,false,true),
  ('pro',300,10,5,array['economy','standard','pro'],true,true,false,false,30,true,true),
  ('studio',700,30,15,array['economy','standard','pro','premium'],true,true,true,true,90,true,true),
  ('business',1500,null,50,array['economy','standard','pro','premium'],true,true,true,true,180,true,true),
  ('enterprise',0,null,9999,array['economy','standard','pro','premium','max_quality'],true,true,true,true,null,true,true)
on conflict (plan_id) do update set
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
  badge_removal = excluded.badge_removal;

insert into public.ai_model_catalog (
  openrouter_model_id, display_name, provider, tier, supports_streaming, supports_tools,
  supports_vision, supports_json_mode, max_context_tokens, is_allowed, is_available, plan_minimum
)
values
  ('openai/gpt-5-nano','GPT-5 Nano','OpenAI','economy',true,true,false,true,64000,true,true,'free'),
  ('google/gemini-3-flash','Gemini 3 Flash','Google','economy',true,true,true,true,1000000,true,true,'free'),
  ('openai/gpt-5-mini','GPT-5 Mini','OpenAI','standard',true,true,true,true,128000,true,true,'starter'),
  ('anthropic/claude-sonnet-4.6','Claude Sonnet 4.6','Anthropic','pro',true,true,true,false,200000,true,true,'pro'),
  ('deepseek/deepseek-coder','DeepSeek Coder','DeepSeek','pro',true,false,false,true,128000,true,true,'pro'),
  ('qwen/qwen-coder','Qwen Coder','Qwen','pro',true,true,false,true,128000,true,true,'pro'),
  ('mistralai/codestral','Codestral','Mistral','pro',true,false,false,true,32000,true,true,'pro'),
  ('google/gemini-3-pro','Gemini 3 Pro','Google','premium',true,true,true,true,1000000,true,true,'studio'),
  ('openai/gpt-5.5','GPT-5.5','OpenAI','premium',true,true,true,true,256000,true,true,'studio'),
  ('anthropic/claude-opus-4.7','Claude Opus 4.7','Anthropic','max_quality',true,true,true,false,200000,true,true,'enterprise')
on conflict (openrouter_model_id) do update set
  display_name = excluded.display_name,
  provider = excluded.provider,
  tier = excluded.tier,
  supports_streaming = excluded.supports_streaming,
  supports_tools = excluded.supports_tools,
  supports_vision = excluded.supports_vision,
  supports_json_mode = excluded.supports_json_mode,
  max_context_tokens = excluded.max_context_tokens,
  is_allowed = excluded.is_allowed,
  plan_minimum = excluded.plan_minimum,
  updated_at = now();
