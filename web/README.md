This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Authentication & Data Laye....r

The web studio uses Clerk for authentication and Convex as the backing data store for account metadata.

Set the following environment variables before running the app:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` – Clerk publishable key for client-side rendering.
- `CLERK_SECRET_KEY` – Clerk secret key used by server routes.
- `CONVEX_URL` – Base URL of your Convex deployment (e.g. `https://flat-moon-123.convex.cloud`).
- `CONVEX_DEPLOYMENT_KEY` or `CONVEX_ADMIN_KEY` – Token the app uses to call Convex HTTP actions.

After updating `convex/schema.ts` run `npx convex dev` in `web/` to regenerate `_generated` types.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
