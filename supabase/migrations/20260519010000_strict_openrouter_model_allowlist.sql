CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.ai_model_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    openrouter_model_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('economy', 'standard', 'pro', 'premium', 'max_quality')),
    supports_streaming BOOLEAN NOT NULL DEFAULT TRUE,
    supports_tools BOOLEAN NOT NULL DEFAULT FALSE,
    supports_vision BOOLEAN NOT NULL DEFAULT FALSE,
    supports_json_mode BOOLEAN NOT NULL DEFAULT FALSE,
    max_context_tokens INTEGER NOT NULL,
    is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    is_available BOOLEAN NOT NULL DEFAULT FALSE,
    plan_minimum TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_model_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES public.ai_model_catalog(id) ON DELETE CASCADE,
    input_price_per_million_tokens NUMERIC(12, 6) NOT NULL DEFAULT 0,
    output_price_per_million_tokens NUMERIC(12, 6) NOT NULL DEFAULT 0,
    cache_read_price_per_million_tokens NUMERIC(12, 6),
    cache_write_price_per_million_tokens NUMERIC(12, 6),
    image_price NUMERIC(12, 6),
    request_price NUMERIC(12, 6) NOT NULL DEFAULT 0,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    source TEXT NOT NULL DEFAULT 'strict_allowlist_seed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_blocked_model_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    requested_model TEXT NOT NULL,
    reason TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('auto', 'custom', 'api')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    model_id UUID NOT NULL REFERENCES public.ai_model_catalog(id) ON DELETE RESTRICT,
    routing_mode TEXT NOT NULL DEFAULT 'auto',
    status TEXT NOT NULL DEFAULT 'queued',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cached_tokens INTEGER NOT NULL DEFAULT 0,
    provider_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
    estimated_credits NUMERIC(12, 1) NOT NULL DEFAULT 0,
    final_credits NUMERIC(12, 1),
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

TRUNCATE TABLE public.ai_model_pricing RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.ai_model_catalog RESTART IDENTITY CASCADE;

INSERT INTO public.ai_model_catalog (
    openrouter_model_id,
    display_name,
    provider,
    tier,
    supports_streaming,
    supports_tools,
    supports_vision,
    supports_json_mode,
    max_context_tokens,
    is_allowed,
    is_available,
    plan_minimum
) VALUES
('openai/gpt-5.5', 'GPT-5.5', 'openai', 'premium', TRUE, TRUE, TRUE, TRUE, 256000, TRUE, FALSE, 'studio'),
('openai/gpt-5.5-pro', 'GPT-5.5 Pro', 'openai', 'max_quality', TRUE, TRUE, TRUE, TRUE, 256000, TRUE, FALSE, 'enterprise'),
('anthropic/claude-opus-4.7', 'Claude Opus 4.7', 'anthropic', 'max_quality', TRUE, TRUE, TRUE, TRUE, 200000, TRUE, FALSE, 'enterprise'),
('anthropic/claude-sonnet-4.6', 'Claude Sonnet 4.6', 'anthropic', 'premium', TRUE, TRUE, TRUE, TRUE, 200000, TRUE, FALSE, 'studio'),
('google/gemini-3-pro', 'Gemini 3 Pro', 'google', 'pro', TRUE, TRUE, TRUE, TRUE, 1000000, TRUE, FALSE, 'pro'),
('google/gemini-3-flash', 'Gemini 3 Flash', 'google', 'standard', TRUE, TRUE, TRUE, TRUE, 1000000, TRUE, FALSE, 'starter'),
('openai/gpt-5-mini', 'GPT-5 Mini', 'openai', 'standard', TRUE, TRUE, TRUE, TRUE, 128000, TRUE, FALSE, 'starter'),
('openai/gpt-5-nano', 'GPT-5 Nano', 'openai', 'economy', TRUE, TRUE, FALSE, TRUE, 64000, TRUE, FALSE, 'free'),
('deepseek/deepseek-coder', 'DeepSeek Coder', 'deepseek', 'pro', TRUE, TRUE, FALSE, TRUE, 128000, TRUE, FALSE, 'pro'),
('qwen/qwen-coder', 'Qwen Coder', 'qwen', 'standard', TRUE, TRUE, FALSE, TRUE, 128000, TRUE, FALSE, 'starter'),
('mistralai/codestral', 'Codestral', 'mistralai', 'pro', TRUE, TRUE, FALSE, TRUE, 128000, TRUE, FALSE, 'pro');

INSERT INTO public.ai_model_pricing (
    model_id,
    input_price_per_million_tokens,
    output_price_per_million_tokens,
    cache_read_price_per_million_tokens,
    source
)
SELECT id, input_price, output_price, cache_read_price, 'strict_allowlist_seed'
FROM (
    VALUES
    ('openai/gpt-5.5', 5::NUMERIC, 20::NUMERIC, 1::NUMERIC),
    ('openai/gpt-5.5-pro', 15::NUMERIC, 60::NUMERIC, 7.5::NUMERIC),
    ('anthropic/claude-opus-4.7', 15::NUMERIC, 75::NUMERIC, 1.5::NUMERIC),
    ('anthropic/claude-sonnet-4.6', 3::NUMERIC, 15::NUMERIC, 0.3::NUMERIC),
    ('google/gemini-3-pro', 2.5::NUMERIC, 10::NUMERIC, 0.25::NUMERIC),
    ('google/gemini-3-flash', 0.15::NUMERIC, 0.6::NUMERIC, 0.075::NUMERIC),
    ('openai/gpt-5-mini', 0.25::NUMERIC, 1::NUMERIC, 0.125::NUMERIC),
    ('openai/gpt-5-nano', 0.05::NUMERIC, 0.2::NUMERIC, 0.025::NUMERIC),
    ('deepseek/deepseek-coder', 0.14::NUMERIC, 0.28::NUMERIC, 0.07::NUMERIC),
    ('qwen/qwen-coder', 0.2::NUMERIC, 0.8::NUMERIC, 0.1::NUMERIC),
    ('mistralai/codestral', 0.3::NUMERIC, 0.9::NUMERIC, 0.15::NUMERIC)
) AS pricing(openrouter_model_id, input_price, output_price, cache_read_price)
JOIN public.ai_model_catalog catalog ON catalog.openrouter_model_id = pricing.openrouter_model_id;

DO $$ BEGIN
    ALTER TABLE public.ai_model_catalog ADD CONSTRAINT ai_model_catalog_strict_allowed_check CHECK (
        is_allowed = (openrouter_model_id IN (
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

CREATE INDEX IF NOT EXISTS idx_ai_model_catalog_allowed_available ON public.ai_model_catalog(is_allowed, is_available, tier);
CREATE INDEX IF NOT EXISTS idx_ai_blocked_model_audit_logs_created ON public.ai_blocked_model_audit_logs(created_at DESC);

ALTER TABLE public.ai_model_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_blocked_model_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_model_catalog_read ON public.ai_model_catalog FOR SELECT USING (TRUE);
CREATE POLICY ai_model_pricing_read ON public.ai_model_pricing FOR SELECT USING (TRUE);
CREATE POLICY ai_requests_read_own ON public.ai_requests FOR SELECT USING (user_id = auth.uid());
CREATE POLICY ai_blocked_model_audit_logs_read_own ON public.ai_blocked_model_audit_logs FOR SELECT USING (user_id = auth.uid());
