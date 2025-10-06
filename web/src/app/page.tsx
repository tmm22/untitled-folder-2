import { ProviderSelector } from '@/components/settings/ProviderSelector';
import { TextEditor } from '@/components/editor/TextEditor';
import { GenerateButton } from '@/components/editor/GenerateButton';
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

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-10 text-slate-100">
      <AccountBootstrapper />
      <header className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-[0.4em] text-sky-400">Text to speech studio</p>
        <h1 className="text-4xl font-semibold text-white">Bring your scripts to life</h1>
        <p className="max-w-3xl text-base text-slate-400">
          Generate natural-sounding narration using OpenAI, ElevenLabs, Google Cloud, or your browser. Manage
          batches, save snippets, and preview voices — all from the web.
        </p>
      </header>

      <PremiumDashboard />

      <div className="flex flex-col gap-8">
        <ProviderSelector />
        <TextEditor />
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
    </main>
  );
}
