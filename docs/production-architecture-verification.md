# Production architecture verification

Date: 2026-05-18

## Matrix

| Capability | Status | Evidence |
| --- | --- | --- |
| Railway control center backend | Present | `server.js`, `src/platform/runtime-api.mjs` |
| Supabase service-role backend API | Present | `supabaseAdmin()` reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side only |
| Supabase RLS tables | Present | migrations `0001`-`0006`, including RLS assertion function |
| OpenRouter strict whitelist | Present | `src/config/ai-models.ts`, runtime API loads the central allowlist |
| OpenRouter catalog sync | Present | `OpenRouterService.syncOpenRouterAllowedModels()` only checks whitelisted IDs |
| Vercel API service | Present | `VercelService` supports projects, env vars, deployments, domains, aliases, rollback |
| Preview service | Present | `PreviewService`, runtime `/preview`, `previews` table |
| Deployment tracking | Present | `DeploymentService`, runtime `/deploy`, `deployments` table |
| Domain limits and DNS flow | Present | `DomainService`, runtime `/domains`, `domains` and `dns_verifications` tables |
| Project files and versions | Present | `project_files`, `project_versions`, `ProjectVersionService` |
| Backend provisioning | Present | `BackendProvisioningService`, `project_backends`, `project_backend_resources` |
| Rollback | Present | `RollbackService`, version restore and Vercel deployment promote wrapper |
| Build sandbox policy | Partial | command allowlist and secret/path checks exist; real isolated worker runtime remains to connect |
| Stripe production checkout | Partial | schema and billing foundations exist; live checkout/portal endpoints still require Stripe wiring |
| Full Playwright browser E2E | Partial | static E2E mock checks exist; live browser automation was blocked by local tab timeouts in this environment |

## Security checks

- `VERCEL_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` are referenced only by backend/runtime code.
- Vercel env injection filters `VERCEL_TOKEN`, `VERCEL_API_TOKEN`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Runtime OpenRouter requests validate model IDs against the central allowlist before reading `OPENROUTER_API_KEY`.
- Forbidden runtime model attempts are written to `ai_blocked_model_audit_logs`.
- Generated deploy bundles exclude real `.env` files and generate `.env.example` only.

## Required production variables

Railway/backend:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_PUBLIC_DOMAIN=
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_PREFIX=huggy
OPENROUTER_API_KEY=
OPENROUTER_SITE_URL=
OPENROUTER_APP_NAME=Huggy SaaS
AI_ALLOWED_MODELS=openai/gpt-5.5,openai/gpt-5.5-pro,anthropic/claude-opus-4.7,anthropic/claude-sonnet-4.6,google/gemini-3-pro,google/gemini-3-flash,openai/gpt-5-mini,openai/gpt-5-nano,deepseek/deepseek-coder,qwen/qwen-coder,mistralai/codestral
AI_STRICT_MODEL_ALLOWLIST=true
AI_DISABLE_UNLISTED_FALLBACKS=true
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Frontend/public:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_APP_URL=
```

## Remaining production risks

- Real Vercel, OpenRouter, Supabase and Stripe calls need final verification in Railway with real secrets.
- The current build validation is a controlled preflight, not a full remote sandbox runner with dependency installation isolation.
- Stripe checkout, customer portal and webhook business flows need live-key or Stripe test-mode validation.
- Browser visual E2E should be run in CI with Playwright once browser automation can open local tabs reliably.
