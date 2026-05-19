# Huggy SaaS AI production readiness audit

Date: 2026-05-19

## Executive summary

Huggy already contains the foundations of an AI app generation SaaS: a Vite/TypeScript frontend, a Node control-center backend for Railway, Supabase migrations with RLS, OpenRouter model allowlisting, credit primitives, Vercel deployment primitives, domain primitives, and a builder UI with chat, files, versions, domains, backend status, preview and deploy controls.

The platform is not yet a complete Lovable/Bolt/v0-class production system. The current generator persists files and versions and can call OpenRouter, validate project files, and deploy through Vercel when backend secrets are configured, but generation is still template/scaffold based, streaming is not full SSE token streaming end-to-end, build sandboxing is validation-oriented rather than isolated execution, and some UI surfaces remain partially static.

## Service matrix

| Block | Status | Evidence | Gap / action |
|---|---|---|---|
| ProjectService | Present | `src/platform/services.ts`, runtime `/api/platform/projects` | Persisted runtime path exists; needs quota/project-limit enforcement in runtime API. |
| DeploymentService | Present | `src/platform/services.ts`, `src/platform/runtime-api.mjs` | Vercel deployment exists; richer status streaming and alias lifecycle still partial. |
| PreviewService | Present | `src/platform/services.ts`, `previews` table, builder controls | Preview uses Vercel deployment path; needs nonblank visual e2e and fallback sandbox preview. |
| DomainService | Present | `src/platform/services.ts`, runtime `/domains`, migrations | Limits exist; verify/remove/primary UI is partial. |
| VercelService | Present | Backend-only token reads in `services.ts` and `runtime-api.mjs` | Needs webhook signature validation and polling worker for final status. |
| BuildService | Partial | `BuildService`, runtime build validation | Needs isolated workspace, dependency install policy, timeout, log cap, cleanup. |
| VersionService | Present | `ProjectVersionService`, `project_versions`, `project_files` | Rollback UI exists; runtime rollback endpoint is still partial. |
| AgentOrchestrator | Partial | `AgentOrchestrator`, `runtime-api.mjs` chat flow | Current runtime returns concise guidance and scaffold files; needs multi-step tool execution and real SSE. |
| BackendProvisioningService | Partial | `BackendProvisioningService`, `project_backends` tables | RLS-aware resources are represented; actual generated table provisioning remains MVP. |
| SupabaseProvisioningService | Partial | Backend provisioning uses Supabase shared tables | Dedicated schema/project provisioning not productionized. |
| OpenRouterService | Present | Runtime `callOpenRouter`, `src/config/ai-models.ts` | Strict allowlist exists; catalog sync job still not wired to a scheduler. |
| ModelRouterService | Partial | `src/platform/billing-ai.ts`, allowlist config | Needs UI/server persistence of user/project preferences and availability filtering in runtime route. |
| CostEstimatorService | Partial | `estimateCredits`, `billing-ai.ts` | Needs real provider pricing and actual-vs-estimated reconciliation. |
| CreditWalletService | Partial | `credit_wallets`, reservations in runtime | Needs refund paths for all platform failures and member spend policy in runtime. |
| CreditLedgerService | Partial | `credit_ledger`, runtime inserts | Ledger exists; immutable/service-role-only enforcement should be verified against live DB. |
| StripeService | Partial | Stripe tables and docs exist | Checkout, portal and signed webhook runtime endpoints are not complete. |
| AuditLogService | Present | `AuditLogService`, `audit_logs`, runtime audit writes | Needs correlation_id coverage for every build/deploy/agent_run path. |
| RollbackService | Partial | `RollbackService`, versions UI | Needs runtime endpoint to restore files and refresh preview. |

## Supabase table matrix

| Table | Status |
|---|---|
| projects | Present |
| project_files | Present |
| project_versions | Present |
| project_backends | Present |
| project_backend_resources | Present |
| project_secrets | Present |
| build_jobs | Present |
| build_logs | Present |
| previews | Present |
| deployments | Present |
| deployment_aliases | Present |
| domains | Present |
| dns_verifications | Present |
| agent_runs | Present |
| agent_steps | Present |
| plans | Present |
| plan_features | Present |
| subscriptions | Present |
| stripe_customers | Present |
| stripe_events | Present |
| topup_products | Present |
| credit_wallets | Present |
| credit_ledger | Present |
| credit_reservations | Present |
| usage_events | Present |
| ai_model_catalog | Present |
| ai_model_pricing | Present |
| ai_requests | Present |
| ai_routing_decisions | Present |
| user_ai_preferences | Present |
| project_ai_preferences | Present |
| audit_logs | Present |
| member_credit_limits | Present |
| billing_alerts | Present |

RLS is enabled for the exposed tables in the migrations. Live Supabase verification still requires applying migrations to the target project and running Supabase advisors.

## Environment matrix

| Variable | Status | Notes |
|---|---|---|
| VERCEL_TOKEN | Documented | Backend-only; required for real Vercel API calls. |
| VERCEL_TEAM_ID | Documented | Optional team scoping. |
| VERCEL_PROJECT_PREFIX | Documented | Used for Vercel project names. |
| SUPABASE_SERVICE_ROLE_KEY | Documented | Backend-only; required for runtime API. |
| OPENROUTER_API_KEY | Documented | Backend-only; required for AI calls. |
| STRIPE_SECRET_KEY | Documented | Required when billing runtime is completed. |
| STRIPE_WEBHOOK_SECRET | Documented | Required for signed Stripe webhooks. |
| APP_PUBLIC_DOMAIN | Documented | Required for SaaS subdomains. |
| NEXT_PUBLIC_SUPABASE_URL | Absent by design | Current app is Vite, uses `VITE_SUPABASE_URL`. |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Absent by design | Current app is Vite, uses `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`. |

## UI matrix

| UI area | Status | Notes |
|---|---|---|
| Dashboard | Partial | Connected to Supabase when configured; static fallback remains. New-project hijack fixed. |
| Editor | Partial | Builder tabs and controls exist; some data still static. |
| Chat IA | Partial | Runtime API connected; true token SSE and persisted history refresh need completion. |
| Preview iframe | Partial | Real URL iframe exists; preview depends on Vercel deployment path. |
| Model selector | Partial | UI exists; full filter/credit/upgrade presentation not complete. |
| Billing | Partial | Pricing page and schema exist; Stripe checkout/portal runtime incomplete. |
| Domains | Partial | UI tab and API add path exist; verify/remove/primary page incomplete. |
| Deployments | Partial | Deploy button and deployment records exist; full page/history/status polling incomplete. |
| Versions | Partial | Version tab exists; runtime rollback incomplete. |
| Settings | Partial | Settings panel exists; persistence is partial. |
| Responsive | Improved | Landing responsive and footer/reveal issues fixed; builder/dashboard still need Playwright visual e2e across all target widths. |

## Corrections made in this pass

- Landing no longer loads `src/main.ts` twice.
- Landing sign-in no longer conflicts between inline redirect and fake modal.
- Landing reveal animations now have a visible fallback if JS fails.
- Footer structure and responsive behavior were tightened.
- Dashboard static navigation no longer hijacks `Nouveau projet`.
- Dashboard empty project state is useful instead of leaving stale cards only.
- Builder chat now escapes user input instead of injecting prompt HTML.
- Production server now answers API CORS preflight and emits API CORS headers.
- Static QA checks now cover these regressions.

## Current capability answer

The SaaS can create a project, persist generated files, create versions, validate deployable file inputs, call OpenRouter from the backend, and create Vercel deployments when the required secrets and Supabase migrations are configured. It is capable of a basic generated Vite app workflow.

It is not yet fully capable of reliably generating arbitrary production-grade web applications with complete live preview, iterative repair, build sandboxing, robust billing, custom domains, rollback and production deployment at the level expected for real customers.

## Roadmap to production

1. Replace scaffold generation with a multi-step agent that outputs structured file patches and backend specs.
2. Add SSE token/tool/build streaming end-to-end and reload state from `stream_events`.
3. Implement isolated build workspaces with allowlisted commands, timeout, cleanup, size/log limits and redaction.
4. Add runtime rollback endpoint that restores `project_files`, creates a rollback version and refreshes preview.
5. Complete Stripe checkout, portal, signed webhooks, idempotency, top-up grants and failed-payment handling.
6. Complete domains page: verify DNS, set primary, remove, takeover protection and alias sync.
7. Add Vercel webhook validation and deployment polling worker.
8. Add Playwright e2e for login, new project, mock generation, preview nonblank, deploy mock, domains, billing and mobile screenshots.
9. Run Supabase migrations in production and verify with advisors plus cross-tenant access tests.
10. Add admin monitoring for provider status, cost margin, repeated build failures and billing alerts.
