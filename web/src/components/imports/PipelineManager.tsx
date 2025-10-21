import { useEffect, useMemo, useState } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import type { PipelineDefinition, PipelineStep } from '@/lib/pipelines/types';
import { PipelineEditor, type PipelineDraft, type ProviderOption } from './PipelineEditor';
import { usePipelineStore } from '@/modules/pipelines/store';
import { providerRegistry } from '@/modules/tts/providerRegistry';
import { generateId } from '@/lib/utils/id';
import { FormattedTimestamp } from '@/components/shared/FormattedTimestamp';

function buildDefaultDraft(providerOptions: ProviderOption[]): PipelineDraft {
  const initialQueueProvider = providerOptions[0]?.id ?? 'tightAss';
  const steps: PipelineStep[] = [
    {
      id: generateId('step'),
      kind: 'clean',
      options: {
        normaliseWhitespace: true,
        stripBullets: false,
        preserveQuotes: true,
      },
    },
    {
      id: generateId('step'),
      kind: 'chunk',
      options: {
        strategy: 'paragraph',
        maxCharacters: 1600,
        joinShortSegments: true,
      },
    },
    {
      id: generateId('step'),
      kind: 'queue',
      options: {
        provider: initialQueueProvider,
        voicePreference: 'history',
      },
    },
  ];

  return {
    name: '',
    description: '',
    steps,
  };
}

function cloneSteps(steps: PipelineStep[]): PipelineStep[] {
  return steps.map((step) => ({
    ...step,
    id: step.id ?? generateId('step'),
    options: JSON.parse(JSON.stringify(step.options)),
  }));
}

function pipelineToDraft(pipeline: PipelineDefinition): PipelineDraft {
  return {
    id: pipeline.id,
    name: pipeline.name,
    description: pipeline.description,
    steps: cloneSteps(pipeline.steps),
    schedule: pipeline.schedule,
    defaultSourceUrl: pipeline.defaultSource?.kind === 'url' ? pipeline.defaultSource.value : undefined,
  };
}

export function PipelineManager() {
  const pipelines = usePipelineStore((state) => state.pipelines);
  const pipelineDetails = usePipelineStore((state) => state.pipelineDetails);
  const isLoading = usePipelineStore((state) => state.isLoading);
  const error = usePipelineStore((state) => state.error);
  const actions = usePipelineStore((state) => state.actions);

  const providerOptions = useMemo<ProviderOption[]>(
    () =>
      providerRegistry.all().map((provider) => ({
        id: provider.id,
        label: provider.displayName,
        defaultVoiceId: provider.defaultVoiceId,
      })),
    [],
  );

  const [editorState, setEditorState] = useState<
    | { mode: 'create'; draft: PipelineDraft }
    | { mode: 'edit'; pipelineId: string; draft: PipelineDraft }
    | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    void actions.hydrate();
  }, [actions]);

  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => actions.clearError(), 4000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [error, actions]);

  useEffect(() => {
    if (status) {
      const timeout = setTimeout(() => setStatus(undefined), 4000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [status]);

  const handleCreate = () => {
    setEditorState({ mode: 'create', draft: buildDefaultDraft(providerOptions) });
  };

  const handleEdit = async (pipelineId: string) => {
    const pipeline = await actions.getPipeline(pipelineId);
    if (!pipeline) {
      return;
    }
    setEditorState({ mode: 'edit', pipelineId, draft: pipelineToDraft(pipeline) });
  };

  const handleToggleDetails = async (pipelineId: string) => {
    if (expandedId === pipelineId) {
      setExpandedId(null);
      return;
    }
    if (!pipelineDetails[pipelineId]) {
      await actions.getPipeline(pipelineId);
    }
    setExpandedId(pipelineId);
  };

  const handleDelete = async (pipelineId: string) => {
    const pipeline = pipelines.find((item) => item.id === pipelineId);
    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm(`Delete pipeline "${pipeline?.name ?? pipelineId}"? This cannot be undone.`)
        : true;
    if (!confirmed) {
      return;
    }
    const removed = await actions.remove(pipelineId);
    if (removed) {
      setStatus('Pipeline deleted.');
    }
  };

  const handleSave = async (draft: PipelineDraft) => {
    setIsSaving(true);
    try {
      if (editorState?.mode === 'edit' && editorState.pipelineId) {
        await actions.update(editorState.pipelineId, {
          name: draft.name,
          description: draft.description,
          steps: draft.steps,
          schedule: draft.schedule ?? null,
          defaultSource: draft.defaultSourceUrl
            ? { kind: 'url', value: draft.defaultSourceUrl }
            : null,
        });
        setStatus('Pipeline updated.');
      } else {
        await actions.create({
          name: draft.name,
          description: draft.description,
          steps: draft.steps,
          schedule: draft.schedule,
          defaultSource: draft.defaultSourceUrl
            ? { kind: 'url', value: draft.defaultSourceUrl }
            : undefined,
        });
        setStatus('Pipeline created.');
      }
      setEditorState(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRotateSecret = async (pipelineId: string) => {
    setIsSaving(true);
    try {
      await actions.update(pipelineId, { rotateSecret: true });
      setStatus('Webhook secret rotated.');
      if (expandedId === pipelineId) {
        await actions.getPipeline(pipelineId);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const buildWebhookUrl = (secret: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api/pipelines/hooks/${secret}`;
    }
    return `/api/pipelines/hooks/${secret}`;
  };

  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text).then(() => setStatus('Webhook URL copied to clipboard.'));
    }
  };

  return (
    <CollapsibleSection title="Automation pipelines" minHeight={320} maxHeight={960}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="panel-title">Automation pipelines</h2>
          <p className="panel-subtitle">
            Save post-processing flows and reuse them on imports or via scheduled webhooks.
          </p>
        </div>
        <button
          type="button"
          className="action-button action-button--accent"
          onClick={handleCreate}
        >
          New pipeline
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {status && <p className="mt-3 text-sm text-emerald-600">{status}</p>}

      <div className="mt-5 space-y-4">
        {isLoading && <p className="text-sm text-cocoa-500">Loading pipelines…</p>}
        {!isLoading && pipelines.length === 0 && (
          <p className="text-sm text-cocoa-500">No pipelines configured yet. Create one to automate your imports.</p>
        )}
        {pipelines.map((pipeline) => {
          const detail = pipelineDetails[pipeline.id];
          const isExpanded = expandedId === pipeline.id;
          const webhookUrl = detail ? buildWebhookUrl(detail.webhookSecret) : undefined;
          return (
            <div
              key={pipeline.id}
              className="flex flex-col gap-3 rounded-2xl border border-cream-300 bg-cream-50/80 p-4 shadow-inner"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-cocoa-700">
                <div>
                  <span className="font-semibold text-charcoal-900">{pipeline.name}</span>
                  {pipeline.description && <p className="text-xs text-cocoa-600">{pipeline.description}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-cocoa-500">
                  <span>
                    Last run:{' '}
                    <FormattedTimestamp value={pipeline.lastRunAt ?? null} placeholder="Never" />
                  </span>
                  {pipeline.schedule?.cron && <span>Schedule: {pipeline.schedule.cron}</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  type="button"
                  className="pill-button border-charcoal-300 text-cocoa-700"
                  onClick={() => void handleEdit(pipeline.id)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="pill-button border-charcoal-300 text-cocoa-700"
                  onClick={() => void handleToggleDetails(pipeline.id)}
                >
                  {isExpanded ? 'Hide details' : 'Webhook details'}
                </button>
                <button
                  type="button"
                  className="pill-button border-rose-300 text-rose-700 hover:bg-rose-100"
                  onClick={() => void handleDelete(pipeline.id)}
                >
                  Delete
                </button>
              </div>
              {isExpanded && detail && (
                <div className="space-y-3 rounded-2xl border border-cream-300 bg-cream-50/90 p-4 text-xs text-cocoa-600 shadow-inner">
                  <div>
                    <p className="font-semibold text-charcoal-900">Webhook endpoint</p>
                    <p className="mt-1 break-all rounded-2xl border border-cream-300 bg-cream-100/80 px-3 py-2 text-[11px] text-cocoa-700">
                      {webhookUrl}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="pill-button border-charcoal-300 text-cocoa-700"
                        onClick={() => webhookUrl && handleCopy(webhookUrl)}
                      >
                        Copy URL
                      </button>
                      <button
                        type="button"
                        className="pill-button border-amber-300 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                        onClick={() => void handleRotateSecret(detail.id)}
                        disabled={isSaving}
                      >
                        Rotate secret
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 text-cocoa-600">
                    <p>POST to this URL to trigger the pipeline remotely. Body options:</p>
                    <ul className="list-disc pl-6">
                      <li>
                        <code className="font-mono text-charcoal-900">content</code>: override raw text for this run.
                      </li>
                      <li>
                        <code className="font-mono text-charcoal-900">title</code> &amp; <code className="font-mono text-charcoal-900">summary</code>: optional metadata.
                      </li>
                      <li>
                        Omit content to use the pipeline&apos;s default source URL ({detail.defaultSource?.value ?? 'not set'}).
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editorState && (
        <PipelineEditor
          initial={editorState.draft}
          mode={editorState.mode}
          providerOptions={providerOptions}
          onSave={handleSave}
          onCancel={() => setEditorState(null)}
          isSaving={isSaving}
        />
      )}
    </CollapsibleSection>
  );
}
