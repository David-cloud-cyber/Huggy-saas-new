-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PLANS
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    price_monthly NUMERIC(10, 2) NOT NULL,
    credits_monthly INTEGER NOT NULL,
    active_projects_limit INTEGER NOT NULL,
    custom_domains_limit INTEGER NOT NULL,
    allowed_model_tiers TEXT[] NOT NULL, -- {'economy', 'standard', 'pro', 'premium'}
    version_history_days INTEGER NOT NULL,
    github_sync BOOLEAN DEFAULT FALSE,
    supabase_integration BOOLEAN DEFAULT FALSE,
    priority_builds BOOLEAN DEFAULT FALSE,
    badge_removal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Plans
INSERT INTO public.plans (name, price_monthly, credits_monthly, active_projects_limit, custom_domains_limit, allowed_model_tiers, version_history_days, github_sync, supabase_integration, priority_builds, badge_removal) VALUES
('Free', 0.00, 20, 1, 0, ARRAY['economy'], 1, FALSE, FALSE, FALSE, FALSE),
('Starter', 20.00, 100, 3, 1, ARRAY['economy', 'standard'], 7, FALSE, FALSE, FALSE, TRUE),
('Pro', 49.00, 300, 10, 5, ARRAY['economy', 'standard', 'pro'], 30, TRUE, TRUE, TRUE, TRUE),
('Studio', 99.00, 700, 30, 15, ARRAY['economy', 'standard', 'pro', 'premium'], 90, TRUE, TRUE, TRUE, TRUE),
('Business', 199.00, 1500, 100, 50, ARRAY['economy', 'standard', 'pro', 'premium'], 180, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (name) DO NOTHING;

-- 2. SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.plans(id),
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL, -- active, trialing, past_due, canceled
    current_period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CREDIT WALLETS
CREATE TABLE IF NOT EXISTS public.credit_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CREDIT LEDGER
CREATE TABLE IF NOT EXISTS public.credit_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL, -- positive for credit, negative for debit
    description TEXT NOT NULL,
    source_action TEXT NOT NULL, -- subscription_grant, topup, chat_cost, deployment_cost, refund
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CREDIT RESERVATIONS
CREATE TABLE IF NOT EXISTS public.credit_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, refunded
    action_type TEXT NOT NULL, -- chat, preview, deploy
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PROJECTS
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- active, archived, deleted
    active_version_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, slug)
);

-- 7. PROJECT VERSIONS
CREATE TABLE IF NOT EXISTS public.project_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    source TEXT NOT NULL, -- initial_generation, chat_edit, rollback, import
    message TEXT,
    snapshot_storage_path TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link projects back to active version
ALTER TABLE public.projects ADD CONSTRAINT fk_active_version FOREIGN KEY (active_version_id) REFERENCES public.project_versions(id) ON DELETE SET NULL;

-- 8. PROJECT FILES
CREATE TABLE IF NOT EXISTS public.project_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    version_id UUID REFERENCES public.project_versions(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    file_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(version_id, path)
);

-- 9. PROJECT BACKENDS
CREATE TABLE IF NOT EXISTS public.project_backends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    mode TEXT NOT NULL, -- shared_tables, dedicated_schema, dedicated_project
    status TEXT NOT NULL DEFAULT 'provisioning', -- provisioning, ready, failed
    schema_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. PROJECT BACKEND RESOURCES
CREATE TABLE IF NOT EXISTS public.project_backend_resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    resource_type TEXT NOT NULL, -- table, policy, function, bucket
    resource_name TEXT NOT NULL,
    schema_name TEXT,
    definition_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. BUILD JOBS
CREATE TABLE IF NOT EXISTS public.build_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    version_id UUID REFERENCES public.project_versions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued', -- queued, running, succeeded, failed, cancelled
    logs_storage_path TEXT,
    error_summary TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. PREVIEWS
CREATE TABLE IF NOT EXISTS public.previews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    version_id UUID REFERENCES public.project_versions(id) ON DELETE CASCADE,
    build_job_id UUID REFERENCES public.build_jobs(id) ON DELETE SET NULL,
    url TEXT,
    status TEXT NOT NULL DEFAULT 'loading', -- loading, building, ready, failed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. DEPLOYMENTS
CREATE TABLE IF NOT EXISTS public.deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    version_id UUID REFERENCES public.project_versions(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'vercel',
    provider_project_id TEXT,
    provider_deployment_id TEXT,
    status TEXT NOT NULL, -- queued, building, deploying, ready, failed
    url TEXT,
    production_url TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. DOMAINS
CREATE TABLE IF NOT EXISTS public.domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    domain TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL, -- saas_subdomain, custom_domain
    status TEXT NOT NULL DEFAULT 'pending', -- pending, verified, active, failed, removed
    is_primary BOOLEAN DEFAULT FALSE,
    verification_token TEXT,
    provider_domain_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. DNS VERIFICATIONS
CREATE TABLE IF NOT EXISTS public.dns_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID REFERENCES public.domains(id) ON DELETE CASCADE,
    record_type TEXT NOT NULL, -- CNAME, TXT, A
    record_name TEXT NOT NULL,
    record_value TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, verified, failed
    checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- create_project, delete_project, deploy, add_domain, verify_domain, rollback
    target_type TEXT NOT NULL,
    target_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS) Policies
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_backends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_backend_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dns_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- General policy helper: Users can only see/modify their own records
CREATE POLICY user_read_subscriptions ON public.subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_read_credit_wallets ON public.credit_wallets FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_read_credit_ledger ON public.credit_ledger FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_read_credit_reservations ON public.credit_reservations FOR SELECT USING (user_id = auth.uid());

CREATE POLICY user_all_projects ON public.projects FOR ALL USING (user_id = auth.uid());
CREATE POLICY user_all_project_versions ON public.project_versions FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY user_all_project_files ON public.project_files FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY user_all_project_backends ON public.project_backends FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY user_all_project_backend_resources ON public.project_backend_resources FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY user_all_build_jobs ON public.build_jobs FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY user_all_previews ON public.previews FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY user_all_deployments ON public.deployments FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY user_all_domains ON public.domains FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY user_all_dns_verifications ON public.dns_verifications FOR ALL USING (
    domain_id IN (SELECT id FROM public.domains WHERE project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
);
CREATE POLICY user_read_audit_logs ON public.audit_logs FOR SELECT USING (user_id = auth.uid());

-- Triggers for automatic wallet provisioning on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    free_plan_id UUID;
BEGIN
    -- Get Free Plan ID
    SELECT id INTO free_plan_id FROM public.plans WHERE name = 'Free' LIMIT 1;
    
    -- Insert Default Subscription
    INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_end)
    VALUES (new.id, free_plan_id, 'active', NOW() + INTERVAL '1 month');

    -- Create Wallet
    INSERT INTO public.credit_wallets (user_id, balance)
    VALUES (new.id, 20.00); -- 20 free credits starting

    -- Record in Ledger
    INSERT INTO public.credit_ledger (user_id, amount, description, source_action)
    VALUES (new.id, 20.00, 'Free tier initial grant', 'subscription_grant');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
