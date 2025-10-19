import Link from 'next/link';
import { PronunciationPanel } from '@/components/settings/PronunciationPanel';
import { HistoryPanel } from '@/components/history/HistoryPanel';
import { SnippetPanel } from '@/components/snippets/SnippetPanel';
import { ImportPanel } from '@/components/imports/ImportPanel';
import { CredentialsPanel } from '@/components/settings/CredentialsPanel';
import { ThemePanel } from '@/components/settings/ThemePanel';
import { CompactPanel } from '@/components/settings/CompactPanel';
import { NotificationPanel } from '@/components/settings/NotificationPanel';
import { AccountBootstrapper } from '@/components/account/AccountBootstrapper';
import { PremiumDashboard } from '@/components/account/PremiumDashboard';
import { AuthPanel } from '@/components/account/AuthPanel';
import { AppVersionBadge } from '@/components/shared/AppVersionBadge';
import { TransitTranscriptionHistoryDashboardPanel } from '@/components/transit/TransitTranscriptionHistoryDashboardPanel';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-12 text-cocoa-900">
      <AccountBootstrapper />
      <header className="rounded-3xl bg-charcoal-900 px-8 py-10 text-cream-50 shadow-[0_35px_70px_-35px_rgba(33,28,25,0.8)]">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-accent-300">
          Narration studio
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-cream-50 md:text-5xl">Transcribe, clean, and narrate in one flow</h1>
        <p className="mt-4 max-w-3xl text-base text-charcoal-200">
          Capture audio, polish transcripts with cleanup presets, and generate speech with your favourite providers — the unified workspace lives under one roof.
        </p>
      </header>

      <AuthPanel />
      <PremiumDashboard />

      <section className="grid gap-6 lg:grid-cols-2">
        <Link
          href="/studio"
          className="flex flex-col justify-between rounded-2xl border border-charcoal-200/70 bg-white/80 px-6 py-6 shadow-sm shadow-charcoal-200/60 transition hover:border-accent-500 hover:shadow-accent-300/40"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent-600">Narration Studio</p>
            <h2 className="mt-3 text-xl font-semibold text-charcoal-900">Open the unified transcription &amp; TTS workspace</h2>
            <p className="mt-2 text-sm text-charcoal-600">
              Launch the full capture, cleanup, and narration experience — including batching, pronunciation rules, and calendar follow-ups.
            </p>
          </div>
          <span className="mt-4 self-start rounded-full bg-accent-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-cream-50">
            Launch
          </span>
        </Link>
        <TransitTranscriptionHistoryDashboardPanel />
        <HistoryPanel />
        <SnippetPanel />
        <ImportPanel />
        <PronunciationPanel />
        <CredentialsPanel />
        <ThemePanel />
        <CompactPanel />
        <NotificationPanel />
      </section>
      <footer className="mt-16 text-center text-xs text-charcoal-400">
        Copyright Mangan Distributions Pty Ltd.  This is a free service bought to you by the Wheelie Mods team with optional paid extras.
      </footer>
    <AppVersionBadge />
  </main>
);
}
