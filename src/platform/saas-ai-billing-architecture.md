# SaaS AI app generation architecture

## Positioning

The platform competes with Lovable, Bolt, v0 and Replit Agent by making AI generation more transparent, controllable and margin-safe.

Key differentiators:

- Starter at `$20/month` with `100 credits`.
- One custom domain included from Starter.
- Auto model routing enabled by default.
- Manual model selector for advanced users.
- Pre-action credit estimates.
- Post-action credit receipts.
- Automatic refunds for platform failures.
- Clear project, version, deployment and cost history.
- No surprise billing and no negative-margin actions.

## Product plans

| Plan | Price | Credits | Active projects | Custom domains | Models | Version history |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Free | $0 | 20 | 1 | 0 | Economy | Limited |
| Starter | $20 | 100 | 3 | 1 | Economy, Standard | 7 days |
| Pro | $49 | 300 | 10 | 5 | Economy, Standard, Pro | 30 days |
| Studio | $99 | 700 | 30 | 15 | Economy, Standard, Pro, Premium with confirmation | 90 days |
| Business | $199 | 1,500 | Fair use | 50 | Economy, Standard, Pro, Premium, Max Quality with confirmation | 180 days |
| Enterprise | Custom | Custom | Custom | Custom | Dedicated/custom | Custom |

## Top-ups

| Credits | Price | Unit price |
| ---: | ---: | ---: |
| 100 | $20 | $0.20 |
| 250 | $47 | $0.188 |
| 500 | $90 | $0.18 |
| 1,000 | $170 | $0.17 |
| 2,500 | $400 | $0.16 |

Top-up credits expire after 12 months. Monthly plan credits reset every billing period.

## Credit accounting

Credit balance is never updated directly by clients. Backend service-role mutations append immutable `credit_ledger` rows and maintain `credit_wallets`.

Credit lifecycle:

1. Estimate real cost.
2. Compute required credits with margin protection.
3. Reserve credits.
4. Execute action.
5. Capture real usage and real cost.
6. Finalize reservation with debit adjustment or refund.
7. Log usage, routing and margin metrics.

Anti-negative-margin formula:

```txt
real_cost_usd = openrouter_cost_usd + infra_cost_usd + storage_cost_usd + build_cost_usd + domain_operation_cost_usd
required_credits = ceil_to_0_1(real_cost_usd * minimum_margin_multiplier / sell_value_per_credit)
final_credits = max(minimum_action_credits, required_credits + complexity_surcharge)
minimum_margin_multiplier = 2.5
```

If an action exceeds user or plan thresholds, the backend returns a confirmation requirement with model, reason, estimated credits and cheaper alternatives.

## Model tiers

| Tier | Use cases | Plan access |
| --- | --- | --- |
| Economy | Summaries, classification, tiny edits | Free+ |
| Standard | UI changes, components, small workflows | Starter+ |
| Pro | Full pages, debugging, medium architecture | Pro+ |
| Premium | Complex architecture, difficult debugging, security | Studio+ with confirmation |
| Max Quality | Very expensive specialist models | Explicit confirmation only |

## Model routing

Modes:

- Auto: default, optimizes quality, speed and credits.
- Fast: favors latency and low-cost models.
- Balanced: uses Standard or Pro depending complexity.
- Pro: favors code quality and debugging strength.
- Max Quality: uses the best available model with mandatory confirmation.
- Custom: user-selected model with backend validation.

Routing constraints:

- plan allowed tiers;
- wallet balance;
- per-action credit limit;
- project/user preferences;
- model availability;
- premium confirmation;
- margin safety.

## OpenRouter integration

`OpenRouterService` runs only on the backend and never exposes `OPENROUTER_API_KEY`.

Responsibilities:

- streaming and non-streaming completions;
- optional JSON mode;
- optional tool calling;
- timeout, retry and fallback;
- normalized responses;
- input/output/cached token capture;
- estimated and actual cost capture;
- secret redaction;
- usage persistence in `ai_requests` and `ai_request_usage`.

## Domains

Domain support starts at Starter.

Limits:

- Free: no custom domain.
- Starter: 1 included custom domain.
- Pro: 5 included custom domains.
- Studio: 15 included custom domains.
- Business: 50 included custom domains.
- Additional domains can be sold through `domain_addons`.

Domain lifecycle:

1. Validate domain and reject reserved SaaS subdomains.
2. Check plan/domain limits.
3. Require ownership verification.
4. Add domain to Vercel project.
5. Return DNS instructions.
6. Poll or manually verify DNS.
7. Activate SSL through Vercel.
8. Allow primary domain switch.
9. Audit all critical changes.

Takeover protection:

- global domain uniqueness;
- verification token per domain;
- pending domains expire or require re-check;
- removed domains keep tombstone metadata for audit;
- viewers cannot manage domains.

## Stripe billing

Stripe owns payment collection, while Supabase stores product, subscription and ledger state.

Flows:

- subscription checkout;
- annual/monthly prices;
- one-time top-up checkout;
- customer portal;
- signed webhooks;
- idempotent event processing;
- monthly credit grants on `invoice.paid`;
- top-up credit grants on payment success;
- downgrade at period end;
- cancellation and failed payment handling.

## Observability and margin alerts

Every billable action logs:

- estimated cost USD;
- actual cost USD;
- charged credits;
- estimated margin;
- actual margin;
- selected model;
- model tier;
- plan key;
- fallback path;
- user confirmation state.

Internal alerts:

- margin below 50%;
- premium abuse;
- abnormal refunds;
- Vercel/DNS cost spike;
- OpenRouter model price changes;
- estimate vs actual delta greater than 20%.

## API surface

Billing:

- `GET /billing/plans`
- `GET /billing/wallet`
- `GET /billing/ledger`
- `POST /billing/checkout/subscription`
- `POST /billing/checkout/topup`
- `POST /billing/portal`
- `POST /stripe/webhook`

AI:

- `GET /ai/models`
- `POST /ai/estimate`
- `POST /ai/route`
- `PATCH /users/me/ai-preferences`
- `PATCH /projects/:id/ai-preferences`
- `POST /projects/:id/messages`

Domains and deploys:

- `POST /projects/:id/domains`
- `GET /projects/:id/domains`
- `POST /projects/:id/domains/:domainId/verify`
- `DELETE /projects/:id/domains/:domainId`
- `PATCH /projects/:id/domains/:domainId/primary`
- `POST /projects/:id/deploy`
- `GET /projects/:id/deployments`

## Frontend UX

Pricing page emphasizes:

- Starter value;
- custom domain from Starter;
- transparent credits;
- estimation before every action;
- model control;
- refund on platform error;
- clear non-unlimited fair-use limits.

Chat model selector components:

- `ModelSelectorButton`
- `ModelSelectorPopover`
- `AutoModeCard`
- `ModelTierBadge`
- `ModelCostIndicator`
- `ModelCapabilityIcons`
- `ModelFilterTabs`
- `ModelListItem`
- `MaxCreditPerActionInput`
- `HighCostConfirmationModal`
- `EstimatedCreditBadge`
- `MessageCreditReceipt`
- `ModelUsageDetailsDrawer`

## MVP to production roadmap

1. Ship plan catalog, model catalog, credit wallet and ledger.
2. Add estimator and reservation/finalization pipeline.
3. Integrate OpenRouter streaming with routing decisions.
4. Add Stripe subscriptions and top-ups.
5. Add domain limits, Vercel domain verification and primary aliases.
6. Add pricing page and model selector UX.
7. Add observability dashboards and internal alerts.
8. Add admin tools for refunds, ledger audits and model price updates.
