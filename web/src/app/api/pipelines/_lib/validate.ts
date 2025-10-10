import { NextResponse } from 'next/server';
import type {
  PipelineCreateInput,
  PipelineRunInput,
  PipelineRunSource,
  PipelineScheduleConfig,
  PipelineStep,
  PipelineStepKind,
  PipelineUpdateInput,
} from '@/lib/pipelines/types';

const STEP_KINDS: PipelineStepKind[] = ['clean', 'summarise', 'translate', 'tone', 'chunk', 'queue'];

function ensureString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw NextResponse.json({ error: `${field} must be a non-empty string` }, { status: 400 });
  }
  return value.trim();
}

function ensureOptionalString(value: unknown): string | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw NextResponse.json({ error: 'Expected string value' }, { status: 400 });
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function ensureSchedule(value: unknown): PipelineScheduleConfig | undefined {
  if (value === null || typeof value === 'undefined') {
    return undefined;
  }
  if (typeof value !== 'object') {
    throw NextResponse.json({ error: 'Schedule must be an object' }, { status: 400 });
  }
  const candidate = value as Partial<PipelineScheduleConfig>;
  return {
    cron: ensureString(candidate.cron, 'schedule.cron'),
    description: ensureOptionalString(candidate.description),
  };
}

function cloneOptions<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function ensureStep(step: any): PipelineStep {
  if (!step || typeof step !== 'object') {
    throw NextResponse.json({ error: 'Invalid pipeline step' }, { status: 400 });
  }
  if (typeof step.id !== 'string' || step.id.trim().length === 0) {
    throw NextResponse.json({ error: 'Pipeline step requires an id' }, { status: 400 });
  }
  if (!STEP_KINDS.includes(step.kind)) {
    throw NextResponse.json({ error: `Unsupported pipeline step kind: ${step.kind}` }, { status: 400 });
  }
  if (!step.options || typeof step.options !== 'object') {
    throw NextResponse.json({ error: 'Pipeline step options must be provided' }, { status: 400 });
  }

  const normalizedOptions = cloneOptions(step.options);

  return {
    id: step.id.trim(),
    kind: step.kind,
    label: ensureOptionalString(step.label),
    options: normalizedOptions,
  } as PipelineStep;
}

const SOURCE_TYPES = new Set<PipelineRunSource['type']>(['import', 'url', 'manual']);

function ensureRunSource(value: unknown): PipelineRunSource | undefined {
  if (value === null || typeof value === 'undefined') {
    return undefined;
  }
  if (typeof value !== 'object') {
    throw NextResponse.json({ error: 'source must be an object' }, { status: 400 });
  }
  const candidate = value as any;
  if (!SOURCE_TYPES.has(candidate.type)) {
    throw NextResponse.json({ error: 'source.type is invalid' }, { status: 400 });
  }

  let identifier: string | undefined = ensureOptionalString(candidate.identifier);
  if (candidate.type === 'url') {
    const directUrl = typeof candidate.url === 'string' ? candidate.url : undefined;
    identifier = ensureString(directUrl ?? identifier, 'source.url');
  } else if (typeof candidate.id === 'string' && !identifier) {
    identifier = candidate.id.trim();
  }

  return {
    type: candidate.type,
    identifier,
  };
}

export function parseCreatePayload(body: unknown): PipelineCreateInput {
  if (!body || typeof body !== 'object') {
    throw NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const payload = body as Partial<PipelineCreateInput>;
  const name = ensureString(payload.name, 'name');
  if (!Array.isArray(payload.steps) || payload.steps.length === 0) {
    throw NextResponse.json({ error: 'At least one pipeline step is required' }, { status: 400 });
  }

  return {
    name,
    description: ensureOptionalString(payload.description),
    steps: payload.steps.map(ensureStep),
    schedule: ensureSchedule(payload.schedule),
    defaultSource:
      payload.defaultSource && payload.defaultSource.kind === 'url' && typeof payload.defaultSource.value === 'string'
        ? {
            kind: 'url' as const,
            value: ensureString(payload.defaultSource.value, 'defaultSource.value'),
          }
        : undefined,
  };
}

export function parseUpdatePayload(body: unknown): PipelineUpdateInput {
  if (!body || typeof body !== 'object') {
    throw NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const payload = body as Partial<PipelineUpdateInput>;

  const result: PipelineUpdateInput = {};
  if (typeof payload.name === 'string') {
    result.name = ensureString(payload.name, 'name');
  }
  if (typeof payload.description !== 'undefined') {
    result.description = ensureOptionalString(payload.description);
  }
  if (Array.isArray(payload.steps)) {
    if (payload.steps.length === 0) {
      throw NextResponse.json({ error: 'Pipeline must contain at least one step' }, { status: 400 });
    }
    result.steps = payload.steps.map(ensureStep);
  }
  if (payload.schedule === null) {
    result.schedule = null;
  } else if (typeof payload.schedule !== 'undefined') {
    result.schedule = ensureSchedule(payload.schedule);
  }
  if (payload.defaultSource === null) {
    result.defaultSource = null;
  } else if (payload.defaultSource && payload.defaultSource.kind === 'url') {
    result.defaultSource = {
      kind: 'url' as const,
      value: ensureString(payload.defaultSource.value, 'defaultSource.value'),
    };
  }
  if (typeof payload.rotateSecret === 'boolean') {
    result.rotateSecret = payload.rotateSecret;
  }
  return result;
}

export function parseRunPayload(body: unknown, pipelineId: string): PipelineRunInput {
  if (!body || typeof body !== 'object') {
    throw NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const payload = body as any;
  const content = typeof payload.content === 'string' && payload.content.trim().length > 0
    ? payload.content.trim()
    : undefined;
  const title = ensureOptionalString(payload.title);
  const summary = ensureOptionalString(payload.summary);
  const source = ensureRunSource(payload.source);

  if (!content && !source) {
    throw NextResponse.json({ error: 'Provide content or a valid source' }, { status: 400 });
  }

  return {
    pipelineId,
    content,
    title,
    summary,
    source,
  };
}
