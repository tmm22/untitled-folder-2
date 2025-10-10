'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useImportStore } from '@/modules/imports/store';
import { importFromUrl, buildImportedEntry } from '@/modules/imports/service';
import { useTTSStore } from '@/modules/tts/store';
import { generateId } from '@/lib/utils/id';
import { usePipelineStore } from '@/modules/pipelines/store';
import { PipelineManager } from './PipelineManager';
import { useQueueStore } from '@/modules/queue/store';
import { useHistoryStore } from '@/modules/history/store';
import { resolveVoiceForQueue } from '@/modules/pipelines/voice';
import { providerRegistry } from '@/modules/tts/providerRegistry';

export function ImportPanel() {
  const entries = useImportStore((state) => state.entries);
  const hydrated = useImportStore((state) => state.hydrated);
  const { hydrate, record, remove } = useImportStore((state) => state.actions);
  const { setInputText } = useTTSStore((state) => state.actions);

  const pipelines = usePipelineStore((state) => state.pipelines);
  const pipelineError = usePipelineStore((state) => state.error);
  const { run: runPipeline } = usePipelineStore((state) => state.actions);
  const enqueueSegments = useQueueStore((state) => state.actions.enqueueSegments);
  const historyHydrated = useHistoryStore((state) => state.hydrated);
  const historyEntries = useHistoryStore((state) => state.entries);
  const historyActions = useHistoryStore((state) => state.actions);

  const [url, setUrl] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [pipelineSelections, setPipelineSelections] = useState<Record<string, string>>({});
  const [pipelineStatuses, setPipelineStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (pipelineError) {
      setStatus(pipelineError);
    }
  }, [pipelineError]);

  const handleImport = async (event: FormEvent) => {
    event.preventDefault();

    if (!url.trim() && !manualContent.trim()) {
      setStatus('Provide a URL or paste content to import.');
      return;
    }

    if (url.trim()) {
      setStatus('Fetching content…');
      const response = await importFromUrl(url.trim());
      if (response.error) {
        setStatus(`Import failed: ${response.error}`);
        return;
      }

      const entry = buildImportedEntry({
        id: generateId('import'),
        source: url.trim(),
        title: response.title,
        content: response.content ?? '',
        summary: response.summary,
      });
      await record(entry);
      setStatus('Import saved.');
    } else {
      const entry = buildImportedEntry({
        id: generateId('import'),
        source: 'Manual entry',
        title: 'Manual content',
        content: manualContent.trim(),
      });
      await record(entry);
      setStatus('Manual content saved.');
    }

    setUrl('');
    setManualContent('');
  };

  const handleUseEntry = (content: string) => {
    setInputText(content);
    setStatus('Imported content loaded into editor.');
  };

  const setEntryPipelineStatus = (entryId: string, message: string) => {
    setPipelineStatuses((prev) => ({
      ...prev,
      [entryId]: message,
    }));
  };

  const handleRunPipeline = async (entryId: string) => {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) {
      return;
    }
    const selected = pipelineSelections[entryId] || pipelines[0]?.id;
    if (!selected) {
      setEntryPipelineStatus(entryId, 'Create a pipeline before running automation.');
      return;
    }
    setEntryPipelineStatus(entryId, 'Running pipeline…');
    const result = await runPipeline({
      pipelineId: selected,
      content: entry.content,
      title: entry.title,
      summary: entry.summary,
      source: { type: 'import', identifier: entry.id },
    });
    if (!result) {
      setEntryPipelineStatus(entryId, 'Pipeline failed.');
      return;
    }
    if (!historyHydrated) {
      try {
        await historyActions.hydrate();
      } catch (error) {
        console.error('Failed to hydrate history before pipeline queue', error);
      }
    }
    const segments = result.artifacts.segments;
    const queueSpec = result.artifacts.queue;

    if (!queueSpec) {
      const warningMessage =
        result.warnings.length > 0 ? ` Warnings: ${result.warnings.join('; ')}` : '';
      setEntryPipelineStatus(
        entryId,
        `Pipeline completed without queue step (${segments.length} segment${
          segments.length === 1 ? '' : 's'
        }).${warningMessage}`,
      );
      return;
    }

    const currentHistoryEntries = useHistoryStore.getState().entries;

    const voiceId =
      resolveVoiceForQueue(queueSpec, currentHistoryEntries) ??
      providerRegistry.get(queueSpec.provider).defaultVoiceId ??
      'default';

    enqueueSegments(segments, {
      provider: queueSpec.provider,
      voiceId,
    });

    const warningMessage = result.warnings.length > 0 ? ` Warnings: ${result.warnings.join('; ')}` : '';
    setEntryPipelineStatus(
      entryId,
      `Queued ${segments.length} segment${segments.length === 1 ? '' : 's'} with ${queueSpec.provider} (${voiceId}).${warningMessage}`,
    );
  };

  if (!hydrated) {
    return (
      <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-300">
        Loading imports…
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <h2 className="text-lg font-semibold text-white">Imports</h2>
      <p className="text-sm text-slate-400">Fetch web content or stash manual notes for later narration.</p>
      <form className="mt-3 flex flex-col gap-3" onSubmit={handleImport}>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          URL
          <input
            type="url"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
            placeholder="https://example.com/article"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Or paste content
          <textarea
            className="min-h-[120px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
            value={manualContent}
            onChange={(event) => setManualContent(event.target.value)}
            placeholder="Paste cleaned-up content here…"
          />
        </label>
        <button
          type="submit"
          className="inline-flex w-max items-center justify-center rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Save import
        </button>
        <p className="text-xs text-slate-500">Reddit links are handled via the .json API; article summaries use OpenAI when configured.</p>
      </form>

      <div className="mt-4 space-y-3">
        {entries.length === 0 && <p className="text-sm text-slate-500">No imports captured yet.</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span className="font-medium truncate" title={entry.source}>
                {entry.title || entry.source}
              </span>
              <span className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleDateString()}</span>
            </div>
            {entry.summary && <p className="text-xs text-slate-400">Summary: {entry.summary}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-white"
                onClick={() => handleUseEntry(entry.content)}
              >
                Load into editor
              </button>
              <div className="flex items-center gap-2 text-xs">
                <select
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                  value={pipelineSelections[entry.id] ?? ''}
                  onChange={(event) =>
                    setPipelineSelections((prev) => ({
                      ...prev,
                      [entry.id]: event.target.value,
                    }))
                  }
                >
                  <option value="">{pipelines.length === 0 ? 'No pipelines' : 'Select pipeline'}</option>
                  {pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-md border border-sky-500/60 px-3 py-1 text-sky-300 disabled:opacity-40"
                  onClick={() => void handleRunPipeline(entry.id)}
                  disabled={pipelines.length === 0}
                >
                  Run pipeline
                </button>
              </div>
              <button
                type="button"
                className="rounded-md border border-rose-500/60 px-3 py-1 text-xs text-rose-300"
                onClick={() => void remove(entry.id)}
              >
                Delete
              </button>
            </div>
            {pipelineStatuses[entry.id] && (
              <p className="text-xs text-slate-400">{pipelineStatuses[entry.id]}</p>
            )}
          </div>
        ))}
      </div>

      {status && <p className="mt-4 text-sm text-slate-300">{status}</p>}

      <div className="mt-6">
        <PipelineManager />
      </div>
    </section>
  );
}
