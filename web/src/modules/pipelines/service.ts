import { secureFetchJson } from '@/lib/fetch/secureFetch';
import type {
  PipelineCreateInput,
  PipelineDefinition,
  PipelineListItem,
  PipelineRunInput,
  PipelineRunResult,
  PipelineUpdateInput,
} from '@/lib/pipelines/types';

interface ListResponse {
  pipelines: PipelineListItem[];
}

interface PipelineResponse {
  pipeline: PipelineDefinition;
}

interface RunResponse {
  result: PipelineRunResult;
}

export async function listPipelines(): Promise<PipelineListItem[]> {
  const response = await secureFetchJson<ListResponse>('/api/pipelines');
  return response.pipelines;
}

export async function fetchPipelineById(id: string): Promise<PipelineDefinition> {
  const response = await secureFetchJson<PipelineResponse>(`/api/pipelines/${id}`);
  return response.pipeline;
}

export async function createPipeline(input: PipelineCreateInput): Promise<PipelineDefinition> {
  const response = await secureFetchJson<PipelineResponse>('/api/pipelines', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.pipeline;
}

export async function updatePipeline(id: string, input: PipelineUpdateInput): Promise<PipelineDefinition> {
  const response = await secureFetchJson<PipelineResponse>(`/api/pipelines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return response.pipeline;
}

export async function deletePipeline(id: string): Promise<void> {
  await secureFetchJson(`/api/pipelines/${id}`, {
    method: 'DELETE',
  });
}

export async function runPipeline(input: PipelineRunInput): Promise<PipelineRunResult> {
  const response = await secureFetchJson<RunResponse>(`/api/pipelines/${input.pipelineId}/run`, {
    method: 'POST',
    body: JSON.stringify({
      content: input.content,
      title: input.title,
      summary: input.summary,
      source: input.source,
    }),
  });
  return response.result;
}
