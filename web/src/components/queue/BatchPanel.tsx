'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueueStore } from '@/modules/queue/store';
import { useTTSStore } from '@/modules/tts/store';
import { providerRegistry } from '@/modules/tts/providerRegistry';
import { extensionFromContentType } from '@/lib/utils/audio';
import { FormattedTimestamp } from '@/components/shared/FormattedTimestamp';

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  running: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function BatchPanel() {
  const [status, setStatus] = useState<string | undefined>();

  const items = useQueueStore((state) => state.items);
  const isRunning = useQueueStore((state) => state.isRunning);
  const currentItemId = useQueueStore((state) => state.currentItemId);
  const { enqueueSegments, start, cancel, clear, remove, retryFailed } = useQueueStore((state) => state.actions);

  const inputText = useTTSStore((state) => state.inputText);
  const selectedProvider = useTTSStore((state) => state.selectedProvider);
  const selectedVoice = useTTSStore((state) => state.selectedVoice);

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
    <section className="panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="panel-title">Batch queue</h2>
          <p className="panel-subtitle">Split scripts with lines containing --- and process them sequentially.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-cocoa-600">
          <span>Total: {items.length}</span>
          <span>Pending: {pendingCount}</span>
          <span>Running: {isRunning ? 'Yes' : 'No'}</span>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
        <button
          type="button"
          onClick={handleQueueSegments}
          className="action-button action-button--accent"
        >
          Queue segments from editor ({segmentsInEditor.length})
        </button>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={handleStart}
            className="cta-button px-4 py-2"
            disabled={isRunning || items.length === 0}
          >
            Start queue
          </button>
          <button
            type="button"
            onClick={cancel}
            className="pill-button border-amber-300 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            disabled={!isRunning}
          >
            Cancel after current
          </button>
          <button
            type="button"
            onClick={retryFailed}
            className="pill-button border-accent-400 text-charcoal-900 hover:bg-accent-200 disabled:opacity-50"
            disabled={failedCount === 0 || isRunning}
          >
            Retry failed
          </button>
          <button
            type="button"
            onClick={clear}
            className="pill-button border-rose-300 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            disabled={items.length === 0 || isRunning}
          >
            Clear queue
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {items.length === 0 && <p className="text-sm text-cocoa-500">No queued segments yet.</p>}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-3 rounded-2xl border border-cream-300 bg-cream-50/80 p-4 shadow-inner"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-cocoa-700">
              <div className="flex items-center gap-2">
                <span className="font-semibold capitalize text-cocoa-900">{item.provider}</span>
                <span
                  className={`text-xs font-medium ${
                    item.status === 'failed'
                      ? 'text-rose-600'
                      : item.status === 'completed'
                      ? 'text-emerald-600'
                      : 'text-cocoa-500'
                  }`}
                >
                  {statusLabels[item.status]}
                </span>
              </div>
              <FormattedTimestamp value={item.createdAt} className="text-xs text-cocoa-500" />
            </div>
            <p className="line-clamp-2 text-sm text-cocoa-600">{item.text}</p>
            <div className="relative h-1 rounded-full bg-cream-200">
              <div
                className={`absolute inset-y-0 rounded-full transition-all ${
                  item.status === 'completed'
                    ? 'bg-emerald-500'
                    : item.status === 'failed'
                    ? 'bg-rose-500'
                    : 'bg-charcoal-900'
                }`}
                style={{ width: `${Math.min(100, Math.round(item.progress * 100))}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-cocoa-500">
              <span>Voice: {item.voiceId || 'default'}</span>
              {item.status === 'failed' && item.errorMessage && (
                <span className="text-rose-600">{item.errorMessage}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {item.result?.audioUrl && (
                <a
                  href={item.result.audioUrl}
                  download={`batch-${item.id}.${extensionFromContentType(item.result?.audioContentType ?? item.audioContentType)}`}
                  className="pill-button border-charcoal-300 text-cocoa-700"
                >
                  Download
                </a>
              )}
              <button
                type="button"
                className="pill-button border-rose-300 text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                onClick={() => remove(item.id)}
                disabled={item.status === 'running' && currentItemId === item.id}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {status && <p className="mt-5 text-sm text-cocoa-600">{status}</p>}
    </section>
  );
}
