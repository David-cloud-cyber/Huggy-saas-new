# Connect Huggy to Supabase

## 1. Create or open a Supabase project

Open the Supabase dashboard and copy:

- Project URL
- publishable key or anon public key
- service role key
- database connection string

## 2. Configure Railway variables

Set these variables in Railway:

```env
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_your-public-key"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
SUPABASE_JWT_SECRET="your-supabase-jwt-secret"
DATABASE_URL="postgresql://postgres:password@host:5432/postgres"
```

Only `VITE_SUPABASE_URL` and either `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY` are exposed to the browser. Prefer the publishable key for new Supabase projects. Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.

## 3. Apply migrations

Run the SQL files in order from Supabase SQL Editor:

```txt
supabase/migrations/0001_platform_schema.sql
supabase/migrations/0002_visual_streaming.sql
supabase/migrations/0003_billing_ai_domains.sql
supabase/migrations/0004_strict_ai_model_allowlist.sql
supabase/migrations/0005_deployment_preview_backend_completion.sql
supabase/migrations/0006_auth_bootstrap_and_rls_assertions.sql
```

If you want a single copy-paste file, use:

```txt
supabase/COPY_PASTE_ALL_MIGRATIONS.sql
```

## 4. Configure Auth redirect URLs

In Supabase Auth settings, add your production URL and local dev URL:

```txt
https://your-railway-domain.up.railway.app
https://your-railway-domain.up.railway.app/dashboard
http://localhost:3000
http://localhost:3000/dashboard
```

## 5. What is connected in this repo

- `/login` and `/signup` display a Supabase magic-link auth panel.
- `index.html` can send Supabase magic links from the existing sign-in modal.
- `dashboard.html` loads the current Supabase session.
- The dashboard reads `users_profile`, `organization_members` and `projects` through RLS using the anon client.
- Missing Supabase configuration is shown as a visible UI notice instead of crashing.

## 6. Validate locally

```bash
npm run lint
npm run test
npm run build
npm run preview
npm run test:smoke
```
