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
  ('business', 1500, null, 50, array['economy','standard','pro','premium','max_quality']::ai_model_tier[], true, true, true, true, 180, true, true, false, true, true, 150),
  ('enterprise', 0, null, 999, array['economy','standard','pro','premium','max_quality']::ai_model_tier[], true, true, true, true, null, true, true, false, true, true, 500)
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
