# SaaS AI billing and domains test plan

## Plan and pricing

- Free receives 20 monthly credits.
- Starter receives 100 monthly credits.
- Pro receives 300 monthly credits.
- Studio receives 700 monthly credits.
- Business receives 1,500 monthly credits.
- Top-up unit prices stay between `$0.16` and `$0.20` per credit.
- Pricing page does not claim unlimited usage.

## Domain limits

- Free cannot add a custom domain.
- Starter can add one custom domain.
- Starter cannot add a second custom domain without upgrade or add-on.
- Pro can add five custom domains.
- Studio can add fifteen custom domains.
- Business can add fifty custom domains.
- Reserved SaaS subdomains are rejected.
- Domain ownership verification is required before activation.
- Removed domains cannot be hijacked without a fresh verification.
- Only owner, admin or editor can manage project domains.
- Viewers cannot add, verify, remove or set primary domains.

## Model routing

- Auto is selected by default.
- Free only sees Economy models as usable.
- Starter can use Economy and Standard models.
- Pro can use Economy, Standard and Pro models.
- Studio can use Premium models only with confirmation.
- Max Quality always requires explicit confirmation.
- Custom model selection validates plan, balance and margin.
- Route alternatives suggest cheaper models when estimate is high.

## Margin and credit safety

- Every action estimates cost before execution.
- Cost estimator applies the 2.5x minimum margin multiplier.
- Estimated credits are rounded up to one decimal.
- Action is blocked when wallet balance is insufficient.
- Action requests confirmation when max per-action credits are exceeded.
- Platform errors refund reservations.
- Finalization adjusts credits after actual usage.
- Ledger rows are append-only from the client perspective.

## Stripe

- Subscription checkout creates or reuses one Stripe customer per organization.
- `invoice.paid` grants monthly credits once.
- Top-up payment grants credits once.
- Webhooks are idempotent by `stripe_event_id`.
- Failed payment marks subscription past due without granting credits.
- Downgrade takes effect at period end.
- Top-up credits expire after 12 months.

## OpenRouter

- `OPENROUTER_API_KEY` is never exposed to the frontend.
- Streaming responses produce token events.
- JSON mode is requested only for compatible models.
- Tool calling is requested only for compatible models.
- Retry and fallback do not double-charge reservations.
- Usage captures input, output and cached input tokens.
- Actual OpenRouter cost overrides estimate when available.

## Observability

- Usage event logs estimated cost, actual cost, charged credits and model key.
- AI routing decision logs selected model, rejected models and rationale.
- Alert is created when margin falls below 50%.
- Alert is created when estimate vs actual cost drift exceeds 20%.
- Alert is created for abnormal refunds.
- Alert is created for Vercel or DNS cost spikes.

## RLS

- Organization data is isolated by `organization_id`.
- Members only see their organization projects.
- Billing tables are visible only to owner/admin where appropriate.
- Credit ledger cannot be inserted or updated by client policies.
- Stripe events have no client policies.
- Project AI preferences are editable only by owner/admin/editor.
- User AI preferences are visible and editable only by the user.
