'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useAccountStore } from '@/modules/account/store';

export default function BillingSuccessPage() {
  const refreshAccount = useAccountStore((state) => state.actions.refreshFromServer);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16 text-cocoa-700">
      <header className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold text-charcoal-900">Welcome to premium</h1>
        <p className="text-sm">
          Your payment succeeded. We&apos;re updating your workspace with the new plan benefits.
        </p>
      </header>
      <section className="rounded-3xl border border-cream-300 bg-cream-50/80 p-6 shadow-inner">
        <h2 className="text-lg font-semibold text-charcoal-900">Next steps</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          <li>Give us a moment to finalize provisioning—this page will refresh automatically.</li>
          <li>
            Return to your dashboard to start using the premium features.{' '}
            <Link href="/" className="underline decoration-accent-400 decoration-2 underline-offset-2">
              Go to dashboard
            </Link>
          </li>
          <li>
            If your status still shows as free after a couple minutes, refresh the page or contact support with your
            receipt ID.
          </li>
        </ul>
      </section>
    </main>
  );
}
