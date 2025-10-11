# Provisioning + Billing Setup (For Real Dummies)

These steps assume you have zero prior experience with environment files, Convex, or PayPal. Follow them in
order and you’ll have the premium provisioning backend running.

---

## 1. Edit `.env.local`

Environment files store secrets like API keys. In the `web/` folder we already created a template.

1. Open Terminal and move into the web project:
   ```bash
   cd /Users/deborahmangan/Desktop/Prototypes/dev/untitled\ folder\ 2/web
   ```
2. Copy the template the first time only:
   ```bash
   cp .env.local.example .env.local
   ```
3. Open `.env.local` in a text editor (macOS example below). Replace the placeholder text **after** each `=`.
   ```bash
   open -a "TextEdit" .env.local
   ```
4. Do not add quotes. When you’re done, save the file.
   The minimum required variables look like:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   CONVEX_URL=https://your.convex.cloud
   CONVEX_DEPLOYMENT_KEY=your_deployment_key
   ACCOUNT_ID_SECRET=<openssl rand -base64 48>   # must be ≥32 chars in production
   ACCOUNT_UPDATE_SECRET=<another strong secret> # used for plan updates
   ```
   You can add provider keys (OpenAI, ElevenLabs, Google) and PayPal keys later if needed.

> **Tip**: You can reopen and edit `.env.local` as often as you like. Restart the dev server after changes.

---

## 2. Set Up Convex (Managed Database)

Convex stores provisioning credentials and account usage. You only need test mode to get started.

1. **Create an account** at <https://dashboard.convex.dev> and spin up a project. Note the deployment URL
   (e.g., `https://happy-amber-123.convex.cloud`).
2. **Install the CLI** (once):
   ```bash
   npm install -g convex
   ```
3. **Log in** from Terminal:
   ```bash
   convex login
   ```
   A browser window opens—approve access.
4. **Initialize Convex in the repo** (inside the same `web/` folder):
   ```bash
   cd /Users/deborahmangan/Desktop/Prototypes/dev/untitled\ folder\ 2/web
   npx convex dev
   ```
   Choose the project you created. This generates a `convex/` folder if it doesn’t already exist.
5. **Implement the functions** described in `convex/README.md`. Create:
   - `convex/provisioning.ts` with the mutations/queries for credentials & usage.
   - `convex/account.ts` with get/update/record mutations for account data.
   - HTTP actions (e.g., `convex/http.ts`) that:
     - Check the admin token (`Authorization: Deployment <CONVEX_DEPLOYMENT_KEY>` or `Bearer <CONVEX_ADMIN_KEY>`)
     - Call the corresponding mutation/query
     - Return JSON `{ result: ... }`
6. **Deploy to Convex**:
   ```bash
   npx convex deploy
   ```
   After deployment, copy the **deployment URL** and **admin key** into `.env.local`:
   ```
   CONVEX_URL=https://your.convex.cloud
   CONVEX_DEPLOYMENT_KEY=your_deployment_key
   ```
7. Restart the dev server (Ctrl+C then `npm run dev`). The app now reads/writes through Convex.

8. **Sync your Clerk user into Convex**:
   - Sign in to the web workspace at <http://localhost:3000>.
   - In the same browser session, open <http://localhost:3000/api/auth/sync>. You should receive a JSON payload confirming the sync (or `{ "skipped": true }` if Convex is disabled).
   - Verify the user record under **Convex Dashboard → Data → users** to ensure the entry exists.

---

## 3. Optional: PayPal Billing

Skip this if you’re happy with the built-in trial messaging. Otherwise:

1. **Create a PayPal developer account** (<https://developer.paypal.com/>) and log into the Dashboard.
2. **Create a sandbox app** under My Apps & Credentials → REST API apps. Copy the **Client ID** and **Secret**
   into `.env.local` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
3. **Create a subscription plan** (Dashboard → Subscriptions → Plans) that matches your pricing. Copy the Plan ID
   into `.env.local` as `PAYPAL_PLAN_ID` (or `PAYPAL_PLAN_ID_STARTER` if you want to map by tier).
4. **Fill success/cancel URLs** in `.env.local` (localhost URLs work in dev):
   ```
   PAYPAL_SUCCESS_URL=http://localhost:3000/billing/success
   PAYPAL_CANCEL_URL=http://localhost:3000/billing/cancel
   PAYPAL_PORTAL_URL=https://www.sandbox.paypal.com/myaccount/autopay/
   ```
   The portal URL can include `{customerId}` if you want to inject the account identifier.
5. (Optional) Switch to production by setting `PAYPAL_ENVIRONMENT=live` and using live credentials + plan IDs.
6. Restart `npm run dev`. Clicking “Start free trial” should now return a PayPal approval link.

---

## 4. Verify Everything

1. Run the dev server:
   ```bash
   npm run dev
   ```
2. Open <http://localhost:3000>. The premium dashboard should show your plan. Try “Start free trial”—with
   Convex + PayPal configured, you’ll get a real approval link and Convex will record usage.
3. Check Convex dashboard logs if things go sideways (`npx convex logs`). PayPal shows request logs under
   Dashboard → My Apps & Credentials → Sandbox/Live App → Logs.

---

## 5. Troubleshooting Cheatsheet

| Problem | Fix |
| ------- | ---- |
| `.env.local` changes not picked up | Stop `npm run dev`, rerun it. |
| Convex request fails | Ensure HTTP actions verify admin token and return JSON; confirm `CONVEX_*` env vars. |
| `npx convex deploy` says "No CONVEX_DEPLOYMENT set" | From `web/`, run `npx convex login` (if needed) then `npx convex dev --once` to select your deployment; retry `npx convex deploy`. |
| PayPal error “client not configured” | Double-check `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` in `.env.local` and restart the dev server. |
| PayPal approval link missing | Ensure `PAYPAL_PLAN_ID` is valid and the plan is in the same environment (sandbox vs live) as your credentials. |
| Cookie errors about `ACCOUNT_ID_SECRET` | Generate a 32+ char secret (`openssl rand -base64 48`), put it in `.env.local`, restart the dev server. |
| Account PATCH returns 401/500 | Ensure `ACCOUNT_UPDATE_SECRET` is present in `.env.local` and the caller includes `x-account-update-token`. |

> If you’re stuck, grab the exact error message and share it. The app now logs helpful hints in the console
> when Convex/PayPal aren’t configured.

---

## Summary Checklist

- Copy `.env.local.example` → `.env.local`; fill Convex + (optionally) PayPal keys.
- Run Convex CLI: `npx convex dev`, implement `convex/provisioning.ts` & `convex/account.ts`, then `npx convex deploy`.
- Restart `npm run dev`—premium provisioning uses your Convex backend immediately.
- Optional PayPal: add keys, set plan IDs + URLs, and restart.

You’re done! 🥳
