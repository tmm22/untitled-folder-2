import { NextResponse } from 'next/server';
import {
  getPipelineRepository,
  shouldFallbackToLocalPipelineRepository,
  fallbackPipelineRepository,
} from '../../context';
import { parseRunPayload } from '../../_lib/validate';
import { runPipelineOnServer } from '../../_lib/runner';

type PipelineRunParams = { params: { id: string } };

export async function POST(request: Request, context: any): Promise<Response> {
  const { params } = context as PipelineRunParams;
  const body = await request.json().catch(() => ({}));

  const executeRun = async (): Promise<Response> => {
    const repository = getPipelineRepository();
    const pipeline = await repository.get(params.id);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    let input;
    try {
      input = parseRunPayload(body, pipeline.id);
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }
      throw error;
    }

    const result = await runPipelineOnServer(pipeline, input);
    await repository.recordRun(pipeline.id, result.completedAt);
    return NextResponse.json({ result });
  };

  try {
    return await executeRun();
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    if (error instanceof Error && error.message === 'PIPELINE_ENGINE_NOT_IMPLEMENTED') {
      return NextResponse.json({ error: 'Pipeline engine unavailable' }, { status: 503 });
    }
    if (shouldFallbackToLocalPipelineRepository(error)) {
      try {
        fallbackPipelineRepository(error);
        return await executeRun();
      } catch (fallbackError) {
        if (fallbackError instanceof Response) {
          return fallbackError;
        }
        if (fallbackError instanceof Error && fallbackError.message === 'PIPELINE_ENGINE_NOT_IMPLEMENTED') {
          return NextResponse.json({ error: 'Pipeline engine unavailable' }, { status: 503 });
        }
        console.error('Pipeline run failed after fallback', fallbackError);
      }
    }
    console.error('Failed to execute pipeline', error);
    return NextResponse.json({ error: 'Pipeline execution failed' }, { status: 500 });
  }
}
