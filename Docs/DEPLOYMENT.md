# Deployment & Configuration

## Environment Variables

Set the following secrets in your deployment platform (and in `web/.env.local` for local work):

| Variable | Purpose | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key | Exposed to browser; use test vs prod keys appropriately. |
| `CLERK_SECRET_KEY` | Clerk server key | Keep private; required for server-side auth. |
| `CONVEX_URL` | Convex deployment URL | Needed for HTTP actions and store fallbacks. |
| `CONVEX_DEPLOYMENT_KEY` / `CONVEX_ADMIN_KEY` | Convex admin tokens | At least one required; the HTTP router fails closed if both missing. |
| `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `GOOGLE_TTS_API_KEY` | Provider keys | Optional for local mock, required for real synthesis. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_PLAN_ID_*` | Billing integration | Only for paid upgrade flows. |
| `ACCOUNT_ID_SECRET` | HMAC signing key for `account_id` cookie | **Mandatory in production.** Must be ≥32 characters; server throws if missing/short. Generate e.g. `openssl rand -base64 48`, store in secret manager, redeploy. |
| `ACCOUNT_UPDATE_SECRET` | Service token for `/api/account` PATCH | Required for plan/billing updates. Only trusted automation should send header `x-account-update-token`. |

### Local development

Create `web/.env.local` with the variables above. Never commit `.env.local`.

### Deployment steps (Vercel example)
1. `npm install && npm run lint && npm test`
2. `vercel env add` the secrets above (or configure via dashboard).
3. `vercel --prod` to deploy once secrets are in place.
4. After rotation/update of any secret, redeploy to propagate.

### Secret Rotation
- Generate the new value.
- Update it in your secret store (Vercel/Render/Kubernetes secret, etc.).
- Trigger a redeploy or rolling restart.
- For `ACCOUNT_UPDATE_SECRET`, update any automations that call `/api/account` with the new header.

Keep audit logs of secret rotation events where your platform supports it.
