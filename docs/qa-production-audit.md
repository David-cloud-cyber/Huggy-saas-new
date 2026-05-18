# QA production audit

## Scope tested

This audit validates the current repository implementation. The repository is currently a Vite multi-page frontend with TypeScript platform/backend foundations. It is not yet a full Next.js/NestJS/Fastify HTTP backend wired to Supabase, OpenRouter, Vercel and Stripe at runtime.

## Automated checks

Run these commands before every release:

```bash
npm run lint
npm run test
npm run build
npm run preview
npm run test:smoke
```

`npm run test` executes:

- strict OpenRouter allowlist checks;
- static QA checks for required CTAs, routes, env variables, model labels and secret leaks.

`npm run test:smoke` executes HTTP checks against the built production server.

## What passed

- TypeScript typecheck.
- Strict OpenRouter allowlist runtime checks.
- Static QA checks.
- Production build.
- Production server smoke routes:
  - `/`
  - `/dashboard`
  - `/projects`
  - `/projects/new`
  - `/projects/:id`
  - `/projects/:id/editor`
  - `/projects/:id/preview`
  - `/projects/:id/versions`
  - `/projects/:id/deployments`
  - `/projects/:id/domains`
  - `/projects/:id/settings`
  - `/billing`
  - `/organization/settings`
  - `/login`
  - `/signup`

## Bugs found and fixed

- Dashboard JavaScript redeclared `const curtain` in the same script scope, which could break dashboard interactivity.
- Dashboard settings panel auto-opened after load as demo behavior.
- UI model labels used non-whitelisted/legacy display names.
- Railway used Vite preview directly, which does not provide production route rewrites for app routes.
- Production route rewrites were missing for `/dashboard`, `/projects/*`, `/billing`, `/login`, `/signup` and organization settings.
- Automated QA coverage only tested OpenRouter allowlist; it now also checks routes, CTAs, env documentation and secret leakage patterns.

## Remaining product gaps

These features cannot be truthfully marked production-complete from this repository alone because no runtime HTTP backend is implemented here yet:

- Supabase Auth signup/login/logout/session persistence.
- Real project persistence in Supabase.
- Real chat message persistence.
- Real OpenRouter streaming calls from an HTTP API.
- Real credit wallet ledger mutation from persisted DB transactions.
- Real Vercel deployments.
- Real Stripe checkout, portal and webhook processing.
- Real DNS verification.
- Real Playwright browser screenshots because Playwright is not installed in this repo.

## Required environment variables

Production must configure:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `DATABASE_URL`
- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_SITE_URL`
- `OPENROUTER_APP_NAME`
- `AI_ALLOWED_MODELS`
- `AI_STRICT_MODEL_ALLOWLIST=true`
- `AI_DISABLE_UNLISTED_FALLBACKS=true`
- `VERCEL_API_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Release recommendation

This repository is safe to deploy as the current frontend/prototype shell with hardened model allowlist foundations and route smoke tests. It is not yet a fully functional SaaS backend product until HTTP API routes are implemented and wired to Supabase/OpenRouter/Vercel/Stripe.
