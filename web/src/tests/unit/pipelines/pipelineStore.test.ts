import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  usePipelineStore,
  resetPipelineStoreForTesting,
} from '@/modules/pipelines/store';
import * as service from '@/modules/pipelines/service';
import type {
  PipelineDefinition,
  PipelineListItem,
  PipelineRunResult,
} from '@/lib/pipelines/types';

vi.mock('@/modules/pipelines/service', () => ({
  listPipelines: vi.fn(),
  fetchPipelineById: vi.fn(),
  createPipeline: vi.fn(),
  updatePipeline: vi.fn(),
  deletePipeline: vi.fn(),
  runPipeline: vi.fn(),
}));

const mockList = service.listPipelines as unknown as vi.Mock;
const mockFetch = service.fetchPipelineById as unknown as vi.Mock;
const mockCreate = service.createPipeline as unknown as vi.Mock;
const mockUpdate = service.updatePipeline as unknown as vi.Mock;
const mockDelete = service.deletePipeline as unknown as vi.Mock;
const mockRun = service.runPipeline as unknown as vi.Mock;

const samplePipeline: PipelineDefinition = {
  id: 'pipeline-1',
  name: 'Morning briefing',
  description: 'Normalise and queue content',
  steps: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  webhookSecret: 'secret-token',
};

describe('pipeline store', () => {
  beforeEach(() => {
    resetPipelineStoreForTesting();
    mockList.mockReset();
    mockFetch.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockRun.mockReset();
  });

  it('hydrates pipeline list', async () => {
    const listItems: PipelineListItem[] = [
      {
        id: 'pipeline-1',
        name: 'Pipeline A',
        description: 'Description',
        schedule: undefined,
        lastRunAt: undefined,
      },
    ];
    mockList.mockResolvedValueOnce(listItems);

    await usePipelineStore.getState().actions.refresh();

    const state = usePipelineStore.getState();
    expect(state.pipelines).toEqual(listItems);
    expect(state.hydrated).toBe(true);
  });

  it('creates a pipeline and adds it to state', async () => {
    mockCreate.mockResolvedValueOnce(samplePipeline);

    const created = await usePipelineStore.getState().actions.create({
      name: samplePipeline.name,
      description: samplePipeline.description,
      steps: samplePipeline.steps,
    });

    expect(created).toEqual(samplePipeline);
    const state = usePipelineStore.getState();
    expect(state.pipelines).toHaveLength(1);
    expect(state.pipelineDetails[samplePipeline.id]).toEqual(samplePipeline);
  });

  it('runs a pipeline and records the result', async () => {
    const runResult: PipelineRunResult = {
      pipelineId: samplePipeline.id,
      startedAt: '2024-01-02T00:00:00.000Z',
      completedAt: '2024-01-02T00:00:10.000Z',
      artifacts: {
        content: 'Processed text',
        summary: 'Summary',
        segments: ['Segment 1'],
        queue: {
          provider: 'tightAss',
          voicePreference: 'default',
          voiceId: 'Alex',
          segmentDelayMs: undefined,
        },
      },
      warnings: [],
    };

    mockRun.mockResolvedValueOnce(runResult);

    const result = await usePipelineStore.getState().actions.run({
      pipelineId: samplePipeline.id,
      content: 'Raw text',
    });

    expect(result).toEqual(runResult);
    const state = usePipelineStore.getState();
    expect(state.lastRunResult).toEqual(runResult);
  });
});
