import { ProviderSelector } from '@/components/settings/ProviderSelector';
import { TextEditor } from '@/components/editor/TextEditor';
import { GenerateButton } from '@/components/editor/GenerateButton';
import { TranslationControls } from '@/components/translations/TranslationControls';
import { TranslationHistoryPanel } from '@/components/translations/TranslationHistoryPanel';
import { PlaybackControls } from '@/components/playback/PlaybackControls';
import { CredentialsPanel } from '@/components/settings/CredentialsPanel';
import { PronunciationPanel } from '@/components/settings/PronunciationPanel';
import { ThemePanel } from '@/components/settings/ThemePanel';
import { CompactPanel } from '@/components/settings/CompactPanel';
import { NotificationPanel } from '@/components/settings/NotificationPanel';
import { HistoryPanel } from '@/components/history/HistoryPanel';
import { SnippetPanel } from '@/components/snippets/SnippetPanel';
import { ImportPanel } from '@/components/imports/ImportPanel';
import { BatchPanel } from '@/components/queue/BatchPanel';
import { AccountBootstrapper } from '@/components/account/AccountBootstrapper';
import { PremiumDashboard } from '@/components/account/PremiumDashboard';
import { AuthPanel } from '@/components/account/AuthPanel';
import { AppVersionBadge } from '@/components/shared/AppVersionBadge';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-12 text-cocoa-900">
      <AccountBootstrapper />
      <header className="rounded-3xl bg-charcoal-900 px-8 py-10 text-cream-50 shadow-[0_35px_70px_-35px_rgba(33,28,25,0.8)]">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-accent-300">
          Text to speech studio
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-cream-50 md:text-5xl">Bring your scripts to life</h1>
        <p className="mt-4 max-w-3xl text-base text-charcoal-200">
          Generate natural-sounding narration using OpenAI, ElevenLabs, Google Cloud, or your browser. Manage
          batches, save snippets, and preview voices — all from the web.
        </p>
      </header>

      <AuthPanel />
      <PremiumDashboard />

      <div className="flex flex-col gap-8">
        <ProviderSelector />
        <TextEditor />
        <section className="flex flex-col gap-6">
          <TranslationControls />
          <TranslationHistoryPanel />
        </section>
        <GenerateButton />
        <PlaybackControls />
        <ThemePanel />
        <CompactPanel />
        <NotificationPanel />
        <CredentialsPanel />
        <BatchPanel />
        <div className="grid gap-6 lg:grid-cols-2">
          <HistoryPanel />
          <SnippetPanel />
          <PronunciationPanel />
          <ImportPanel />
        </div>
      </div>
      <AppVersionBadge />
    </main>
  );
}
