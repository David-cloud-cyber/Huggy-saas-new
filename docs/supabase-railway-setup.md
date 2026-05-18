# Supabase and Railway setup

## What GitHub connection does

Connecting the GitHub repository to Supabase or Railway only automates source synchronization and deployments. It does not automatically create database tables, apply RLS policies, or inject required secrets.

## Supabase checklist

1. Create or open the Supabase project.
2. Apply the migrations in `supabase/migrations` in order.
3. Confirm RLS is enabled on the generated tables.
4. Copy these values from Supabase project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWT_SECRET`
   - `DATABASE_URL`
5. Put public values in the frontend environment only.
6. Put backend-only values only in Railway variables or worker variables.

## Railway checklist

1. Create a Railway service from the GitHub repository.
2. Set the root directory to the repository root.
3. Let Railway use `railway.json`.
4. Add these variables in Railway:
   - `NODE_ENV`
   - `PORT`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWT_SECRET`
   - `DATABASE_URL`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_BASE_URL`
   - `OPENROUTER_DEFAULT_MODEL`
   - `GEMINI_API_KEY`
   - `VERCEL_API_TOKEN`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
5. Deploy and verify the healthcheck `/`.

## Security rules

- Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend code.
- Never put `OPENROUTER_API_KEY` in frontend code.
- Never expose `VERCEL_API_TOKEN` to browser code.
- Never use `user_metadata` for authorization decisions.
- Keep all authorization decisions backed by organization membership tables and RLS.
- Rotate any token that was pasted into chat, logs, or screenshots.

## Current repository status

This repository currently contains a Vite frontend plus a TypeScript platform foundation. The Railway config serves the current built frontend. A production backend service can be added next as a separate Railway service or as a monorepo app.
