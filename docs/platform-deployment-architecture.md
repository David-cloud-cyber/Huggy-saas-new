# Platform deployment architecture

## Runtime roles

- Railway is the backend control center for project orchestration, health checks, API routes, webhooks and provider calls.
- Vercel hosts generated user applications and manages SSL, aliases and custom domains.
- Supabase is the primary SaaS database, auth provider and shared backend for generated project resources.
- OpenRouter handles AI calls through the backend allowlist.
- Stripe handles billing, credits and plan limits.

## Railway variables

Set these backend-only variables in Railway:

```env
VERCEL_TOKEN="your-vercel-token"
VERCEL_TEAM_ID="optional-team-id"
VERCEL_PROJECT_PREFIX="huggy"
VERCEL_WEBHOOK_SECRET="optional-webhook-secret"
APP_PUBLIC_DOMAIN="your-saas-domain.com"
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
DATABASE_URL="postgresql://..."
OPENROUTER_API_KEY="your-openrouter-key"
STRIPE_SECRET_KEY="your-stripe-secret-key"
```

Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_URL` may be exposed to frontend code.

## Vercel configuration

- Create a Vercel token with project/deployment/domain permissions.
- Add it to Railway as `VERCEL_TOKEN`.
- If using a team, add `VERCEL_TEAM_ID`.
- Use `VERCEL_PROJECT_PREFIX` to avoid name collisions.
- Configure wildcard DNS for `*.APP_PUBLIC_DOMAIN` to point to Vercel when SaaS subdomains are enabled.

## Deployment flow

1. User generates or edits files.
2. `ProjectVersionService` creates a version snapshot.
3. `BackendProvisioningService` provisions shared Supabase resources with RLS requirements.
4. `BuildService` validates the generated app in a sandboxed workflow.
5. `DeploymentService` creates preview or production deploys through `VercelService`.
6. `PreviewService` records preview status and URL.
7. `DomainService` attaches SaaS/custom domains through Vercel and enforces plan limits.
8. `RollbackService` restores project versions or promotes a previous deployment.

## Build and sandbox rules

- Workspace must be isolated by project/version.
- Commands must come from the allowlist in `src/platform/security.ts`.
- Dangerous command fragments are blocked.
- Generated bundles must not include `.env` files.
- `package.json`, `vercel.json` and `.env.example` are generated when absent.
- Backend-only secrets are filtered before Vercel env injection.
- Logs and errors must be redacted before being shown to users.

## Supabase RLS requirements

Generated backend resources must include `organization_id` and `project_id` tenant isolation. The provisioning service rejects generated table specs without RLS. Migration `0005_deployment_preview_backend_completion.sql` adds `previews`, `project_backends` and `project_backend_resources` with RLS enabled.

## Local testing

Use mock mode by setting:

```env
VERCEL_TOKEN="mock"
```

Then run:

```bash
npm run lint
npm run test
npm run build
npm run preview
npm run test:smoke
```

## Production checklist

- Railway has `VERCEL_TOKEN`, Supabase service role, OpenRouter key and Stripe keys.
- Supabase migrations `0001` through `0005` are applied.
- Vercel wildcard DNS and custom-domain DNS instructions are verified.
- Secrets are not present in frontend bundle or generated project files.
- Preview and production deploy histories are separated.
- Domain limits match Stripe plan entitlements.
- Audit logs are retained for deploy/domain/rollback actions.
