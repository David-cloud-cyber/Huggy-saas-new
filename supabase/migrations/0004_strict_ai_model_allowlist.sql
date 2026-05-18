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
