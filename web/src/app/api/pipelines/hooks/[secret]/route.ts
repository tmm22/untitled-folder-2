import { NextResponse } from 'next/server';
import {
  getPipelineRepository,
  shouldFallbackToLocalPipelineRepository,
  fallbackPipelineRepository,
} from '../../context';
import { parseRunPayload } from '../../_lib/validate';
import { runPipelineOnServer } from '../../_lib/runner';

type PipelineWebhookParams = { params: { secret: string } };

export async function POST(request: Request, context: any): Promise<Response> {
  const { params } = context as PipelineWebhookParams;
  const rawBody = await request.json().catch(() => ({}));

  const executeWebhook = async (): Promise<Response> => {
    const repository = getPipelineRepository();
    const pipeline = await repository.findByWebhookSecret(params.secret);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    const bodyWithDefaults: any = { ...rawBody };
    if (
      (!rawBody || (typeof rawBody === 'object' && !rawBody.content && !rawBody.source)) &&
      pipeline.defaultSource?.kind === 'url'
    ) {
      bodyWithDefaults.source = {
        type: 'url',
        url: pipeline.defaultSource.value,
      };
    }

    let input;
    try {
      input = parseRunPayload(bodyWithDefaults, pipeline.id);
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
    return await executeWebhook();
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
        return await executeWebhook();
      } catch (fallbackError) {
        if (fallbackError instanceof Response) {
          return fallbackError;
        }
        if (fallbackError instanceof Error && fallbackError.message === 'PIPELINE_ENGINE_NOT_IMPLEMENTED') {
          return NextResponse.json({ error: 'Pipeline engine unavailable' }, { status: 503 });
        }
        console.error('Webhook pipeline execution failed after fallback', fallbackError);
      }
    }
    console.error('Webhook pipeline execution failed', error);
    return NextResponse.json({ error: 'Pipeline execution failed' }, { status: 500 });
  }
}
