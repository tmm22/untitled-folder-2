# Polar Billing Environment Setup

Use this checklist to configure the web workspace to use Polar as the billing engine.

## 1. Select the Billing Provider
- Edit `web/.env.local`.
- Set `BILLING_PROVIDER=polar` to switch from PayPal to Polar.

## 2. Create & Configure Polar Credentials
- Sign in at [https://polar.sh](https://polar.sh) and locate your **organization ID** (Dashboard → Settings → Organization).
- Generate an **API access token** (Dashboard → Developers → API Tokens).
- Add these to `.env.local`:
  ```
  POLAR_ACCESS_TOKEN=your_access_token
  POLAR_ORGANIZATION_ID=your_org_id
  POLAR_ENVIRONMENT=sandbox   # switch to production when ready
  ```

## 3. Map Products to Plan Tiers
- In Polar, create the products/pricing plans corresponding to your app tiers.
- Copy each product ID and map it in `.env.local`:
  ```
  POLAR_PLAN_ID=prod_main              # optional single-tier fallback
  POLAR_PLAN_ID_STARTER=prod_starter   # tier-specific overrides
  POLAR_PLAN_ID_PRO=prod_pro
  ```
- Optional redirect customization:
  ```
  POLAR_CHECKOUT_SUCCESS_URL=http://localhost:3000/billing/success
  POLAR_CUSTOMER_PORTAL_URL=https://polar.sh/<org-slug>/portal
  ```

## 4. Configure the Webhook
- In Polar → Developers → Webhooks, create an endpoint pointing to:
  - `https://your-domain.com/api/billing/polar/events` (production), or
  - `http://localhost:3000/api/billing/polar/events` via a tunnel during development.
- Allow subscription lifecycle events (`subscription.created`, `subscription.active`, `subscription.canceled`, etc.).
- Copy the generated secret into `.env.local`:
  ```
  POLAR_WEBHOOK_SECRET=your_webhook_secret
  ```

## 5. Restart the Workspace
- Restart `npm run dev` (or redeploy) so the updated environment variables take effect.
- The “Start free trial” button now generates Polar checkout URLs.
- Webhook events drive account tier changes and provisioning automatically.

## 6. Monitoring & Verification
- Watch logs for entries containing `"type":"polar_webhook"` to verify webhook flow.
- Confirm managed provisioning issues/revokes credentials when plan status changes.
- When ready for production, set `POLAR_ENVIRONMENT=production`, update product IDs, and ensure HTTPS webhook endpoints are reachable.
