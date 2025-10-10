import { create } from 'zustand';
import type {
  PipelineCreateInput,
  PipelineDefinition,
  PipelineListItem,
  PipelineRunInput,
  PipelineRunResult,
  PipelineUpdateInput,
} from '@/lib/pipelines/types';
import {
  createPipeline,
  deletePipeline,
  fetchPipelineById,
  listPipelines,
  runPipeline,
  updatePipeline,
} from './service';

interface PipelineState {
  pipelines: PipelineListItem[];
  pipelineDetails: Record<string, PipelineDefinition>;
  isLoading: boolean;
  hydrated: boolean;
  error?: string;
  lastRunResult?: PipelineRunResult;
  actions: {
    hydrate: () => Promise<void>;
    refresh: () => Promise<void>;
    getPipeline: (id: string) => Promise<PipelineDefinition | null>;
    create: (input: PipelineCreateInput) => Promise<PipelineDefinition | null>;
    update: (id: string, input: PipelineUpdateInput) => Promise<PipelineDefinition | null>;
    remove: (id: string) => Promise<boolean>;
    run: (input: PipelineRunInput) => Promise<PipelineRunResult | null>;
    clearError: () => void;
    clearLastRun: () => void;
  };
}

const sortPipelines = (items: PipelineListItem[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name));

export const usePipelineStore = create<PipelineState>((set, get) => ({
  pipelines: [],
  pipelineDetails: {},
  isLoading: false,
  hydrated: false,
  error: undefined,
  lastRunResult: undefined,
  actions: {
    hydrate: async () => {
      if (get().hydrated) {
        return;
      }
      await get().actions.refresh();
    },
    refresh: async () => {
      set({ isLoading: true, error: undefined });
      try {
        const pipelines = await listPipelines();
        set((state) => ({
          pipelines: sortPipelines(pipelines),
          pipelineDetails: state.pipelineDetails,
          isLoading: false,
          hydrated: true,
        }));
      } catch (error) {
        console.error('Failed to load pipelines', error);
        set({ error: 'Unable to load pipelines', isLoading: false, hydrated: true });
      }
    },
    getPipeline: async (id: string) => {
      const cached = get().pipelineDetails[id];
      if (cached) {
        return cached;
      }
      try {
        const pipeline = await fetchPipelineById(id);
        set((state) => ({
          pipelineDetails: {
            ...state.pipelineDetails,
            [id]: pipeline,
          },
        }));
        return pipeline;
      } catch (error) {
        console.error('Failed to fetch pipeline', error);
        set({ error: 'Unable to load pipeline details' });
        return null;
      }
    },
    create: async (input: PipelineCreateInput) => {
      try {
        const pipeline = await createPipeline(input);
        set((state) => ({
          pipelines: sortPipelines([
            ...state.pipelines,
            {
              id: pipeline.id,
              name: pipeline.name,
              description: pipeline.description,
              schedule: pipeline.schedule,
              lastRunAt: pipeline.lastRunAt,
            },
          ]),
          pipelineDetails: {
            ...state.pipelineDetails,
            [pipeline.id]: pipeline,
          },
        }));
        return pipeline;
      } catch (error) {
        console.error('Failed to create pipeline', error);
        set({ error: 'Unable to create pipeline' });
        return null;
      }
    },
    update: async (id: string, input: PipelineUpdateInput) => {
      try {
        const pipeline = await updatePipeline(id, input);
        set((state) => ({
          pipelines: sortPipelines(
            state.pipelines.map((item) =>
              item.id === id
                ? {
                    id: pipeline.id,
                    name: pipeline.name,
                    description: pipeline.description,
                    schedule: pipeline.schedule,
                    lastRunAt: pipeline.lastRunAt,
                  }
                : item,
            ),
          ),
          pipelineDetails: {
            ...state.pipelineDetails,
            [pipeline.id]: pipeline,
          },
        }));
        return pipeline;
      } catch (error) {
        console.error('Failed to update pipeline', error);
        set({ error: 'Unable to update pipeline' });
        return null;
      }
    },
    remove: async (id: string) => {
      try {
        await deletePipeline(id);
        set((state) => {
          const { [id]: _removed, ...rest } = state.pipelineDetails;
          return {
            pipelines: state.pipelines.filter((item) => item.id !== id),
            pipelineDetails: rest,
          };
        });
        return true;
      } catch (error) {
        console.error('Failed to delete pipeline', error);
        set({ error: 'Unable to delete pipeline' });
        return false;
      }
    },
    run: async (input: PipelineRunInput) => {
      try {
        const result = await runPipeline(input);
        set((state) => ({
          lastRunResult: result,
          pipelines: state.pipelines.map((item) =>
            item.id === input.pipelineId
              ? { ...item, lastRunAt: result.completedAt }
              : item,
          ),
          pipelineDetails: state.pipelineDetails[input.pipelineId]
            ? {
                ...state.pipelineDetails,
                [input.pipelineId]: {
                  ...state.pipelineDetails[input.pipelineId],
                  lastRunAt: result.completedAt,
                },
              }
            : state.pipelineDetails,
        }));
        return result;
      } catch (error) {
        console.error('Failed to run pipeline', error);
        set({ error: 'Pipeline run failed' });
        return null;
      }
    },
    clearError: () => {
      set({ error: undefined });
    },
    clearLastRun: () => {
      set({ lastRunResult: undefined });
    },
  },
}));

export function resetPipelineStoreForTesting(): void {
  usePipelineStore.setState((state) => ({
    ...state,
    pipelines: [],
    pipelineDetails: {},
    isLoading: false,
    hydrated: false,
    error: undefined,
    lastRunResult: undefined,
  }));
}
