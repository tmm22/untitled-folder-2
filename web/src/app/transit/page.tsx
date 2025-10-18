import { Suspense } from 'react';
import { AccountBootstrapper } from '@/components/account/AccountBootstrapper';
import { AppVersionBadge } from '@/components/shared/AppVersionBadge';
import { TransitTranscriptionPanel } from '@/components/transit/TransitTranscriptionPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function TransitPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-12 text-cocoa-900">
      <AccountBootstrapper />
      <header className="rounded-3xl bg-charcoal-900 px-8 py-10 text-cream-50 shadow-[0_35px_70px_-35px_rgba(33,28,25,0.8)]">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-accent-300">
          Transit operations
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-cream-50 md:text-5xl">Transcribe and summarise field comms</h1>
        <p className="mt-4 max-w-3xl text-base text-charcoal-200">
          Capture live dispatch audio or upload recorded calls, stream OpenAI-powered transcripts, and convert insights into calendar-ready actions.
        </p>
      </header>

      <Suspense fallback={<div className="rounded-3xl border border-charcoal-200/70 bg-white/80 px-6 py-8 text-sm text-charcoal-600 shadow-sm">Loading transit workspace…</div>}>
        <TransitTranscriptionPanel />
      </Suspense>
      <footer className="mt-16 text-center text-xs text-charcoal-400">
        Built for the Wheelie Mods transit ops team.
      </footer>
      <AppVersionBadge />
    </main>
  );
}
