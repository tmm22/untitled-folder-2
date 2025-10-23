import Link from 'next/link';
import { AccountBootstrapper } from '@/components/account/AccountBootstrapper';
import { PremiumDashboard } from '@/components/account/PremiumDashboard';
import { AuthPanel } from '@/components/account/AuthPanel';
import { AppVersionBadge } from '@/components/shared/AppVersionBadge';
import { TransitTranscriptionHistoryDashboardPanel } from '@/components/transit/TransitTranscriptionHistoryDashboardPanel';
import { BatchPanel } from '@/components/queue/BatchPanel';

export default function Home() {
  const quickLinks = [
    {
      href: '/studio#capture',
      title: 'Capture & upload',
      description: 'Record from the browser or upload audio clips for instant transcription.',
    },
    {
      href: '/studio#cleanup-controls',
      title: 'Cleanup presets',
      description: 'Apply Australian English, professional tone, or meeting minutes instructions.',
    },
    {
      href: '/studio#transcript-view',
      title: 'Transcript workspace',
      description: 'Edit, review summaries, and grab action items as they stream in.',
    },
    {
      href: '/studio#tts-controls',
      title: 'Voice & synthesis',
      description: 'Pick providers, preview voices, and manage batches from one panel.',
    },
    {
      href: '/studio#transcript-history',
      title: 'Transcript history',
      description: 'Reopen recent captures, download text, or clear archived sessions.',
    },
    {
      href: '/studio#calendar',
      title: 'Calendar follow-up',
      description: 'Schedule Google Calendar events directly from detected action items.',
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-4 py-10 text-cocoa-900 sm:px-6 sm:py-12">
      <AccountBootstrapper />
      <header className="rounded-3xl bg-charcoal-900 px-6 py-8 text-cream-50 shadow-[0_35px_70px_-35px_rgba(33,28,25,0.8)] sm:px-8 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-accent-300">
          Narration studio
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-cream-50 sm:text-4xl md:text-5xl">Transcribe, clean, and narrate in one flow</h1>
        <p className="mt-4 max-w-3xl text-base text-charcoal-200">
          Capture audio, polish transcripts with cleanup presets, and generate speech with your favourite providers — the unified workspace lives under one roof.
        </p>
      </header>

      <AuthPanel />
      <PremiumDashboard />

      <div className="flex flex-col items-center gap-4 text-center">
        <Link
          href="/studio"
          className="inline-flex items-center gap-3 rounded-full bg-accent-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-cream-50 shadow-lg shadow-accent-600/40 transition hover:bg-accent-700"
        >
          Enter Narration Studio
        </Link>
        <p className="max-w-xl text-sm text-charcoal-600">
          Need a specific tool? Jump directly to the panel you need inside the studio.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex flex-col justify-between rounded-2xl border border-charcoal-200/70 bg-white/80 px-5 py-5 text-left shadow-sm shadow-charcoal-200/40 transition hover:border-accent-500 hover:shadow-accent-300/40"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent-600">{link.title}</p>
              <p className="mt-2 text-sm text-charcoal-600">{link.description}</p>
            </div>
            <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent-600">
              Open
              <span aria-hidden>→</span>
            </span>
          </Link>
        ))}
      </section>

      <section className="space-y-4">
        <details className="group rounded-2xl border border-charcoal-200/70 bg-white/80 px-6 py-5 shadow-sm shadow-charcoal-200/50">
          <summary className="cursor-pointer list-none text-sm font-semibold text-charcoal-900">
            Transcript history snapshot
            <span className="ml-2 text-xs text-charcoal-500 group-open:hidden">(expand)</span>
            <span className="ml-2 text-xs text-charcoal-500 hidden group-open:inline">(collapse)</span>
          </summary>
          <div className="mt-4 text-sm text-charcoal-600">
            <TransitTranscriptionHistoryDashboardPanel />
          </div>
        </details>
        <details className="group rounded-2xl border border-charcoal-200/70 bg-white/80 px-6 py-5 shadow-sm shadow-charcoal-200/50">
          <summary className="cursor-pointer list-none text-sm font-semibold text-charcoal-900">
            Batch queue overview
            <span className="ml-2 text-xs text-charcoal-500 group-open:hidden">(expand)</span>
            <span className="ml-2 text-xs text-charcoal-500 hidden group-open:inline">(collapse)</span>
          </summary>
          <div className="mt-4 text-sm text-charcoal-600">
            <BatchPanel />
          </div>
        </details>
      </section>
      <footer className="mt-16 text-center text-xs text-charcoal-400">
        Copyright Mangan Distributions Pty Ltd.  This is a free service bought to you by the Wheelie Mods team with optional paid extras.
      </footer>
    <AppVersionBadge />
  </main>
);
}
