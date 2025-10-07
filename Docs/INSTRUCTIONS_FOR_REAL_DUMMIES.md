# Provisioning + Billing Setup (For Real Dummies)

These steps assume you have zero prior experience with environment files, Convex, or Stripe. Follow them in
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

---

## 3. Optional: Stripe Billing

Skip this if you’re happy with the built-in trial messaging. Otherwise:

1. **Create a Stripe account** (<https://dashboard.stripe.com>) and toggle “Test mode”.
2. **Get API keys**: Developers → API keys → copy the Secret Key into `.env.local` as `STRIPE_SECRET_KEY`.
3. **Create a Product + Price**: Products → Add product → create a subscription price. Copy the Price ID into
   `STRIPE_PRICE_ID`.
4. **Fill success/cancel URLs** in `.env.local` (localhost URLs work in dev):
   ```
   STRIPE_SUCCESS_URL=http://localhost:3000/billing/success
   STRIPE_CANCEL_URL=http://localhost:3000/billing/cancel
   STRIPE_PORTAL_RETURN_URL=http://localhost:3000/billing
   ```
5. **Bootstrap Stripe in the app**:
   - We already ship `web/src/app/api/_lib/stripeClient.ts`.
   - Create `web/src/app/api/_lib/stripeBootstrap.ts` with:
     ```ts
     import Stripe from 'stripe';
     import { overrideStripeClient } from '@/app/api/_lib/stripeClient';

     const secret = process.env.STRIPE_SECRET_KEY?.trim();
     if (secret) {
       overrideStripeClient(new Stripe(secret, { apiVersion: '2024-06-20' }));
     }
     ```
   - Import this bootstrap once in a server-only file (e.g., at the top of `app/api/route.ts` or a shared
     `serverInit.ts`) so it runs before checkout/portal routes.
6. Restart `npm run dev`. Clicking “Start free trial” should now return a Stripe checkout URL.

---

## 4. Verify Everything

1. Run the dev server:
   ```bash
   npm run dev
   ```
2. Open <http://localhost:3000>. The premium dashboard should show your plan. Try “Start free trial”—with
   Convex + Stripe configured, you’ll get a real checkout link and Convex will record usage.
3. Check Convex dashboard logs if things go sideways (`npx convex logs`). Stripe also shows request logs under
   Developers → Logs (in Test mode).

---

## 5. Troubleshooting Cheatsheet

| Problem | Fix |
| ------- | ---- |
| `.env.local` changes not picked up | Stop `npm run dev`, rerun it. |
| Convex request fails | Ensure HTTP actions verify admin token and return JSON; confirm `CONVEX_*` env vars. |
| Stripe error “client not configured” | Make sure the bootstrap file runs and `STRIPE_SECRET_KEY` is set. |
| Vitest can’t find Stripe module | The tests mock the client; ensure no direct `import 'stripe'` remains outside server code. |

> If you’re stuck, grab the exact error message and share it. The app now logs helpful hints in the console
> when Convex/Stripe aren’t configured.

---

## Summary Checklist

- Copy `.env.local.example` → `.env.local`; fill Convex + (optionally) Stripe keys.
- Run Convex CLI: `npx convex dev`, implement `convex/provisioning.ts` & `convex/account.ts`, then `npx convex deploy`.
- Restart `npm run dev`—premium provisioning uses your Convex backend immediately.
- Optional Stripe: add keys, bootstrap the SDK, and restart.

You’re done! 🥳
