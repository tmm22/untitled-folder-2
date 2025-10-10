import { useState } from 'react';
import type {
  PipelineScheduleConfig,
  PipelineStep,
  PipelineStepKind,
  PipelineCleanStep,
  PipelineSummariseStep,
  PipelineTranslateStep,
  PipelineToneStep,
  PipelineChunkStep,
  PipelineQueueStep,
} from '@/lib/pipelines/types';
import type { ProviderType } from '@/modules/tts/types';
import { generateId } from '@/lib/utils/id';

const STEP_LABELS: Record<PipelineStepKind, string> = {
  clean: 'Clean & normalise',
  summarise: 'Summarise',
  translate: 'Translate',
  tone: 'Adjust tone',
  chunk: 'Create segments',
  queue: 'Queue configuration',
};

const STEP_ORDER: PipelineStepKind[] = ['clean', 'summarise', 'translate', 'tone', 'chunk', 'queue'];

export interface ProviderOption {
  id: ProviderType;
  label: string;
  defaultVoiceId?: string;
}

export interface PipelineDraft {
  id?: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
  schedule?: PipelineScheduleConfig;
  defaultSourceUrl?: string;
}

interface PipelineEditorProps {
  initial: PipelineDraft;
  mode: 'create' | 'edit';
  providerOptions: ProviderOption[];
  onSave: (draft: PipelineDraft) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

const TONE_OPTIONS = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'formal', label: 'Formal' },
  { value: 'dramatic', label: 'Dramatic' },
];

const STEP_TEMPLATES: Record<PipelineStepKind, () => Omit<PipelineStep, 'id'>> = {
  clean: () => ({
    kind: 'clean',
    options: {
      normaliseWhitespace: true,
      stripBullets: false,
      preserveQuotes: true,
    },
  }),
  summarise: () => ({
    kind: 'summarise',
    options: {
      bulletCount: 3,
      includeKeywords: false,
      style: 'bullets',
    },
  }),
  translate: () => ({
    kind: 'translate',
    options: {
      targetLanguage: 'Spanish',
      keepOriginal: false,
    },
  }),
  tone: () => ({
    kind: 'tone',
    options: {
      tone: 'neutral',
      audienceHint: '',
    },
  }),
  chunk: () => ({
    kind: 'chunk',
    options: {
      strategy: 'paragraph',
      maxCharacters: 1600,
      joinShortSegments: true,
    },
  }),
  queue: () => ({
    kind: 'queue',
    options: {
      provider: 'tightAss',
      voicePreference: 'history',
      segmentDelayMs: undefined,
    },
  }),
};

function createStep(kind: PipelineStepKind, providerOptions: ProviderOption[]): PipelineStep {
  const template = STEP_TEMPLATES[kind];
  if (!template) {
    throw new Error(`Unsupported step kind: ${kind}`);
  }
  const base = template();
  if (base.kind === 'queue') {
    const firstProvider = providerOptions[0];
    (base.options as any).provider = firstProvider?.id ?? 'tightAss';
  }
  return {
    id: generateId('step'),
    ...base,
  } as PipelineStep;
}

function reorderSteps(steps: PipelineStep[], fromIndex: number, toIndex: number): PipelineStep[] {
  const next = [...steps];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function PipelineEditor(props: PipelineEditorProps) {
  const { initial, mode, providerOptions, onSave, onCancel, isSaving } = props;
  const [draft, setDraft] = useState<PipelineDraft>(initial);
  const [stepKindToAdd, setStepKindToAdd] = useState<PipelineStepKind>('chunk');
  const [error, setError] = useState<string | undefined>(undefined);

  const handleAddStep = () => {
    const step = createStep(stepKindToAdd, providerOptions);
    setDraft((prev) => ({
      ...prev,
      steps: [...prev.steps, step],
    }));
  };

  const handleRemoveStep = (stepId: string) => {
    setDraft((prev) => ({
      ...prev,
      steps: prev.steps.filter((step) => step.id !== stepId),
    }));
  };

  const updateStep = <T extends PipelineStep>(stepId: string, updater: (step: T) => T) => {
    setDraft((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => (step.id === stepId ? (updater(step as T) as PipelineStep) : step)),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError('Pipeline name is required.');
      return;
    }
    if (draft.steps.length === 0) {
      setError('Add at least one step to the pipeline.');
      return;
    }
    setError(undefined);
    await onSave({
      ...draft,
      name: draft.name.trim(),
      description: draft.description?.trim(),
      defaultSourceUrl: draft.defaultSourceUrl?.trim() || undefined,
    });
  };

  const canReorder = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    return nextIndex >= 0 && nextIndex < draft.steps.length;
  };

  const handleReorder = (index: number, direction: -1 | 1) => {
    if (!canReorder(index, direction)) {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      steps: reorderSteps(prev.steps, index, index + direction),
    }));
  };

  return (
    <form className="panel mt-4 space-y-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-charcoal-900">{mode === 'create' ? 'New pipeline' : 'Edit pipeline'}</h3>
        <p className="text-sm text-cocoa-600">
          Chain post-processing steps and reuse the workflow on imported content or scheduled webhooks.
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="field-label">Name</span>
        <input
          type="text"
          className="field-input"
          value={draft.name}
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Morning summary pipeline"
          required
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="field-label">Description (optional)</span>
        <textarea
          className="field-input min-h-[120px]"
          value={draft.description ?? ''}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="Describe the content this pipeline prepares."
        />
      </label>

      <div className="grid gap-3 text-sm text-cocoa-700 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="field-label">Default source URL (optional)</span>
          <input
            type="url"
            className="field-input"
            value={draft.defaultSourceUrl ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                defaultSourceUrl: event.target.value,
              }))
            }
            placeholder="https://example.com/rss"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="field-label">Schedule cron (optional)</span>
          <input
            type="text"
            className="field-input"
            value={draft.schedule?.cron ?? ''}
            onChange={(event) => {
              const value = event.target.value.trim();
              setDraft((prev) => ({
                ...prev,
                schedule: value ? { cron: value, description: prev.schedule?.description } : undefined,
              }));
            }}
            placeholder="0 7 * * 1-5"
          />
        </label>
      </div>

      {draft.schedule && (
        <label className="flex flex-col gap-2 text-sm text-cocoa-700">
          <span className="field-label">Schedule description (optional)</span>
          <input
            type="text"
            className="field-input"
            value={draft.schedule.description ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                schedule: prev.schedule
                  ? { ...prev.schedule, description: event.target.value }
                  : undefined,
              }))
            }
            placeholder="Weekdays at 7am"
          />
        </label>
      )}

      <div className="rounded-md border border-cream-400 bg-cream-50/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-white">Steps</h4>
            <p className="text-xs text-cocoa-600">
              Configure the transformations executed in order. Use chunk + queue at the end to feed the batch runner.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1 text-sm text-cocoa-700"
              value={stepKindToAdd}
              onChange={(event) => setStepKindToAdd(event.target.value as PipelineStepKind)}
            >
              {STEP_ORDER.map((kind) => (
                <option key={kind} value={kind}>
                  {STEP_LABELS[kind]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-md border border-cream-300 px-3 py-1 text-sm text-cocoa-700 hover:bg-cream-200"
              onClick={handleAddStep}
            >
              Add step
            </button>
          </div>
        </div>

        {draft.steps.length === 0 && (
          <p className="mt-3 text-sm text-cocoa-500">No steps yet. Add a clean/translate/chunk step to get started.</p>
        )}

        <div className="mt-3 space-y-3">
          {draft.steps.map((step, index) => (
            <div key={step.id} className="space-y-3 rounded-md border border-cream-400 bg-cream-50/90 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{STEP_LABELS[step.kind]}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-cream-300 px-2 py-1 text-xs text-cocoa-700 disabled:opacity-40"
                    disabled={!canReorder(index, -1)}
                    onClick={() => handleReorder(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-cream-300 px-2 py-1 text-xs text-cocoa-700 disabled:opacity-40"
                    disabled={!canReorder(index, 1)}
                    onClick={() => handleReorder(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-rose-500/60 px-2 py-1 text-xs text-rose-300"
                    onClick={() => handleRemoveStep(step.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {step.kind === 'clean' && (
                <div className="grid gap-2 text-sm text-cocoa-700 md:grid-cols-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-cream-300 bg-cream-50"
                      checked={Boolean(step.options.normaliseWhitespace ?? true)}
                      onChange={(event) =>
                        updateStep<PipelineCleanStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            normaliseWhitespace: event.target.checked,
                          },
                        }))
                      }
                    />
                    Normalise whitespace
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-cream-300 bg-cream-50"
                      checked={Boolean(step.options.stripBullets)}
                      onChange={(event) =>
                        updateStep<PipelineCleanStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            stripBullets: event.target.checked,
                          },
                        }))
                      }
                    />
                    Remove bullet markers
                  </label>
                </div>
              )}

              {step.kind === 'summarise' && (
                <div className="grid gap-2 text-sm text-cocoa-700 md:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    Bullet count
                    <input
                      type="number"
                      min={1}
                      max={10}
                      className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1"
                      value={(step.options as any).bulletCount ?? 3}
                      onChange={(event) =>
                        updateStep<PipelineSummariseStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            bulletCount: Number.parseInt(event.target.value, 10) || 3,
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Format
                    <select
                      className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1"
                      value={(step.options as any).style ?? 'bullets'}
                      onChange={(event) =>
                        updateStep<PipelineSummariseStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            style: event.target.value as PipelineSummariseStep['options']['style'],
                          },
                        }))
                      }
                    >
                      <option value="bullets">Bullet list</option>
                      <option value="paragraph">Single paragraph</option>
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 md:col-span-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-cream-300 bg-cream-50"
                      checked={Boolean((step.options as any).includeKeywords)}
                      onChange={(event) =>
                        updateStep<PipelineSummariseStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            includeKeywords: event.target.checked,
                          },
                        }))
                      }
                    />
                    Include keyword list
                  </label>
                </div>
              )}

              {step.kind === 'translate' && (
                <div className="grid gap-2 text-sm text-cocoa-700 md:grid-cols-[2fr,1fr]">
                  <label className="flex flex-col gap-1">
                    Target language
                    <input
                      type="text"
                      className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1"
                      value={(step.options as any).targetLanguage ?? ''}
                      onChange={(event) =>
                        updateStep<PipelineTranslateStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            targetLanguage: event.target.value,
                          },
                        }))
                      }
                      placeholder="Spanish"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-cream-300 bg-cream-50"
                      checked={Boolean((step.options as any).keepOriginal)}
                      onChange={(event) =>
                        updateStep<PipelineTranslateStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            keepOriginal: event.target.checked,
                          },
                        }))
                      }
                    />
                    Append original text
                  </label>
                </div>
              )}

              {step.kind === 'tone' && (
                <div className="grid gap-2 text-sm text-cocoa-700 md:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    Target tone
                    <select
                      className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1"
                      value={(step.options as any).tone ?? 'neutral'}
                      onChange={(event) =>
                        updateStep<PipelineToneStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            tone: event.target.value as PipelineToneStep['options']['tone'],
                          },
                        }))
                      }
                    >
                      {TONE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Audience hint (optional)
                    <input
                      type="text"
                      className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1"
                      value={(step.options as any).audienceHint ?? ''}
                      onChange={(event) =>
                        updateStep<PipelineToneStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            audienceHint: event.target.value,
                          },
                        }))
                      }
                      placeholder="Tech-savvy listeners"
                    />
                  </label>
                </div>
              )}

              {step.kind === 'chunk' && (
                <div className="grid gap-2 text-sm text-cocoa-700 md:grid-cols-3">
                  <label className="flex flex-col gap-1">
                    Strategy
                    <select
                      className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1"
                      value={(step.options as any).strategy ?? 'paragraph'}
                      onChange={(event) =>
                        updateStep<PipelineChunkStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            strategy: event.target.value as PipelineChunkStep['options']['strategy'],
                          },
                        }))
                      }
                    >
                      <option value="paragraph">Paragraph</option>
                      <option value="sentence">Sentence</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Max characters
                    <input
                      type="number"
                      min={300}
                      className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1"
                      value={(step.options as any).maxCharacters ?? 1600}
                      onChange={(event) =>
                        updateStep<PipelineChunkStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            maxCharacters: Number.parseInt(event.target.value, 10) || 1600,
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-cream-300 bg-cream-50"
                      checked={Boolean((step.options as any).joinShortSegments)}
                      onChange={(event) =>
                        updateStep<PipelineChunkStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            joinShortSegments: event.target.checked,
                          },
                        }))
                      }
                    />
                    Merge short segments
                  </label>
                </div>
              )}

              {step.kind === 'queue' && (
                <div className="grid gap-2 text-sm text-cocoa-700 md:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    Provider
                    <select
                      className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1"
                      value={(step.options as any).provider}
                      onChange={(event) =>
                        updateStep<PipelineQueueStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            provider: event.target.value as ProviderType,
                          },
                        }))
                      }
                    >
                      {providerOptions.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Voice preference
                    <select
                      className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1"
                      value={(step.options as any).voicePreference ?? 'history'}
                      onChange={(event) =>
                        updateStep<PipelineQueueStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            voicePreference: event.target.value as PipelineQueueStep['options']['voicePreference'],
                          },
                        }))
                      }
                    >
                      <option value="history">Use recent history</option>
                      <option value="default">Provider default</option>
                      <option value="custom">Custom voice</option>
                    </select>
                  </label>
                  {(step.options as any).voicePreference === 'custom' && (
                    <label className="flex flex-col gap-1 md:col-span-2">
                      Voice ID
                      <input
                        type="text"
                        className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1"
                        value={(step.options as any).voiceId ?? ''}
                        onChange={(event) =>
                          updateStep<PipelineQueueStep>(step.id, (prev) => ({
                            ...prev,
                            options: {
                              ...prev.options,
                              voiceId: event.target.value,
                            },
                          }))
                        }
                        placeholder="eleven_monkey"
                      />
                    </label>
                  )}
                  <label className="flex flex-col gap-1">
                    Delay between segments (ms, optional)
                    <input
                      type="number"
                      min={0}
                      className="rounded-md border border-cream-300 bg-cream-50 px-3 py-1"
                      value={(step.options as any).segmentDelayMs ?? ''}
                      onChange={(event) =>
                        updateStep<PipelineQueueStep>(step.id, (prev) => ({
                          ...prev,
                          options: {
                            ...prev.options,
                            segmentDelayMs: event.target.value ? Number.parseInt(event.target.value, 10) : undefined,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="rounded-md border border-cream-300 px-4 py-2 text-sm text-cocoa-700 hover:bg-cream-200"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-900"
          disabled={isSaving}
        >
          {isSaving ? 'Saving…' : mode === 'create' ? 'Create pipeline' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
