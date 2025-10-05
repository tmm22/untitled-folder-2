'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueueStore } from '@/modules/queue/store';
import { useTTSStore } from '@/modules/tts/store';
import { providerRegistry } from '@/modules/tts/providerRegistry';

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  running: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const contentTypeToExtension = (contentType?: string) => {
  if (!contentType) {
    return 'mp3';
  }
  if (contentType.includes('mpeg')) {
    return 'mp3';
  }
  if (contentType.includes('wav') || contentType.includes('wave')) {
    return 'wav';
  }
  if (contentType.includes('aac')) {
    return 'aac';
  }
  if (contentType.includes('flac')) {
    return 'flac';
  }
  return 'mp3';
};

export function BatchPanel() {
  const [status, setStatus] = useState<string | undefined>();

  const { items, isRunning, currentItemId } = useQueueStore((state) => ({
    items: state.items,
    isRunning: state.isRunning,
    currentItemId: state.currentItemId,
  }));
  const { enqueueSegments, start, cancel, clear, remove, retryFailed } = useQueueStore((state) => state.actions);

  const { inputText, selectedProvider, selectedVoice } = useTTSStore((state) => ({
    inputText: state.inputText,
    selectedProvider: state.selectedProvider,
    selectedVoice: state.selectedVoice,
  }));

  useEffect(() => {
    if (status) {
      const timeout = setTimeout(() => setStatus(undefined), 4000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [status]);

  const segmentsInEditor = useMemo(() => {
    if (!inputText.trim()) {
      return [] as string[];
    }
    return inputText
      .split(/^\s*---+\s*$/m)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }, [inputText]);

  const pendingCount = items.filter((item) => item.status === 'pending').length;
  const failedCount = items.filter((item) => item.status === 'failed').length;

  const handleQueueSegments = () => {
    if (segmentsInEditor.length === 0) {
      setStatus('Add text separated by lines containing --- to create batch segments.');
      return;
    }

    if (!selectedProvider) {
      setStatus('Select a provider before queueing segments.');
      return;
    }

    const providerDescriptor = providerRegistry.get(selectedProvider);
    const voiceId = selectedVoice?.id ?? providerDescriptor.defaultVoiceId;

    if (!voiceId) {
      setStatus('Select a voice before queueing segments.');
      return;
    }

    enqueueSegments(segmentsInEditor, { provider: selectedProvider, voiceId });
    setStatus(`Added ${segmentsInEditor.length} segment${segmentsInEditor.length === 1 ? '' : 's'} to the queue.`);
  };

  const handleStart = async () => {
    await start();
  };

  return (
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Batch queue</h2>
          <p className="text-sm text-slate-400">Split scripts with lines containing --- and process them sequentially.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>Total: {items.length}</span>
          <span>Pending: {pendingCount}</span>
          <span>Running: {isRunning ? 'Yes' : 'No'}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
        <button
          type="button"
          onClick={handleQueueSegments}
          className="inline-flex items-center justify-center rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
        >
          Queue segments from editor ({segmentsInEditor.length})
        </button>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={handleStart}
            className="rounded-md bg-emerald-500 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-900"
            disabled={isRunning || items.length === 0}
          >
            Start queue
          </button>
          <button
            type="button"
            onClick={cancel}
            className="rounded-md border border-amber-500/60 px-3 py-2 text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isRunning}
          >
            Cancel after current
          </button>
          <button
            type="button"
            onClick={retryFailed}
            className="rounded-md border border-sky-500/60 px-3 py-2 text-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={failedCount === 0 || isRunning}
          >
            Retry failed
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded-md border border-rose-500/60 px-3 py-2 text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={items.length === 0 || isRunning}
          >
            Clear queue
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 && <p className="text-sm text-slate-500">No queued segments yet.</p>}
        {items.map((item) => (
          <div key={item.id} className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <span className="font-semibold capitalize">{item.provider}</span>
                <span className={`text-xs ${
                  item.status === 'failed'
                    ? 'text-rose-300'
                    : item.status === 'completed'
                    ? 'text-emerald-300'
                    : 'text-slate-400'
                }`}>{statusLabels[item.status]}</span>
              </div>
              <span className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</span>
            </div>
            <p className="line-clamp-2 text-sm text-slate-400">{item.text}</p>
            <div className="relative h-1 rounded-full bg-slate-800">
              <div
                className={`absolute inset-y-0 rounded-full transition-all ${
                  item.status === 'completed'
                    ? 'bg-emerald-500'
                    : item.status === 'failed'
                    ? 'bg-rose-500'
                    : 'bg-sky-500'
                }`}
                style={{ width: `${Math.min(100, Math.round(item.progress * 100))}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Voice: {item.voiceId || 'default'}</span>
              {item.status === 'failed' && item.errorMessage && (
                <span className="text-rose-300">{item.errorMessage}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {item.result?.audioUrl && (
                <a
                  href={item.result.audioUrl}
                  download={`batch-${item.id}.${contentTypeToExtension(item.audioContentType)}`}
                  className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Download
                </a>
              )}
              <button
                type="button"
                className="rounded-md border border-rose-500/60 px-3 py-1 text-xs text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => remove(item.id)}
                disabled={item.status === 'running' && currentItemId === item.id}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {status && <p className="mt-4 text-sm text-slate-300">{status}</p>}
    </section>
  );
}
