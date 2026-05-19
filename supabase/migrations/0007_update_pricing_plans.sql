-- Synchronize the public pricing catalog, plan limits and credit top-ups.

insert into plans (key, name, description, price_monthly_usd, price_yearly_usd, sort_order, is_public, is_active)
values
  ('free', 'Free', 'Try AI app generation with public projects and Economy models.', 0, 0, 10, true, true),
  ('starter', 'Starter', 'Transparent AI generation with private projects and one custom domain.', 20, 200, 20, true, true),
  ('pro', 'Pro', 'Higher limits, advanced agents, GitHub sync and more domains.', 49, 490, 30, true, true),
  ('studio', 'Studio', 'Team-ready AI generation with premium models and faster builds.', 99, 990, 40, true, true),
  ('business', 'Business', 'Organization controls, audit logs, Max Quality confirmation and priority support.', 199, 1990, 50, true, true),
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

insert into plan_features (
  plan_key,
  monthly_credits,
  active_projects_limit,
  custom_domains_limit,
  allowed_model_tiers,
  github_sync,
  supabase_integration,
  team_collaboration,
  audit_logs,
  version_history_days,
  priority_builds,
  badge_removal,
  public_projects_only,
  private_projects,
  export_code,
  max_credit_per_action
)
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
on conflict (key) do update set
  credits = excluded.credits,
  price_usd = excluded.price_usd,
  sort_order = excluded.sort_order,
  updated_at = now();
