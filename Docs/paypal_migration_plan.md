# PayPal Migration Plan

| Stage | Status | Notes |
| --- | --- | --- |
| Preparation | ✅ Completed | Audited Stripe touchpoints and defined PayPal REST integration scope. |
| Implementation | ✅ Completed | Replaced Stripe helpers/routes with PayPal-backed equivalents. |
| Verification & Documentation | ✅ Completed | Tests, docs, and rollout notes updated. |

## Preparation Checklist

- [x] Audit every Stripe dependency (server routes, helpers, tests, docs).
- [x] Pick PayPal product surface (Subscriptions API via REST calls).
- [x] Confirm required environment variables and portal equivalents with stakeholders.

## Implementation Checklist

- [x] Introduce PayPal client helper (`web/src/app/api/_lib/paypalClient.ts`).
- [x] Replace billing logic with PayPal integration (`web/src/lib/billing/paypal.ts`).
- [x] Drop Stripe-specific code, types, and dependencies.

## Verification & Documentation Checklist

- [x] Update unit tests to mock PayPal flows.
- [x] Refresh documentation (`README.md`, Docs) with PayPal instructions and env keys.
- [x] Run lint/tests and record results.
- [x] Provide rollout guidance for existing environments.

## Rollout Guidance

1. Remove Stripe environment variables and secrets from deployment targets; revoke unused Stripe API keys.
2. Populate new PayPal credentials (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, plan IDs, URLs) and redeploy the web workspace.
3. Update any automation or infrastructure scripts that referenced Stripe SDK bootstrap logic to rely on the built-in PayPal client instead.
