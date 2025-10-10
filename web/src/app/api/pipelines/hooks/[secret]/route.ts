import { NextResponse } from 'next/server';
import { getPipelineRepository } from '../../context';
import { parseRunPayload } from '../../_lib/validate';
import { runPipelineOnServer } from '../../_lib/runner';

export async function POST(request: Request, context: any): Promise<Response> {
  try {
    const { params } = context as { params: { secret: string } };
    const repository = getPipelineRepository();
    const pipeline = await repository.findByWebhookSecret(params.secret);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    const rawBody = await request.json().catch(() => ({}));
    const bodyWithDefaults = {
      ...rawBody,
    };
    if (
      (!rawBody || (typeof rawBody === 'object' && !rawBody.content && !rawBody.source)) &&
      pipeline.defaultSource?.kind === 'url'
    ) {
      bodyWithDefaults.source = {
        type: 'url',
        url: pipeline.defaultSource.value,
      };
    }

    const input = parseRunPayload(bodyWithDefaults, pipeline.id);
    const result = await runPipelineOnServer(pipeline, input);
    await repository.recordRun(pipeline.id, result.completedAt);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    if (error instanceof Error && error.message === 'PIPELINE_ENGINE_NOT_IMPLEMENTED') {
      return NextResponse.json({ error: 'Pipeline engine unavailable' }, { status: 503 });
    }
    console.error('Webhook pipeline execution failed', error);
    return NextResponse.json({ error: 'Pipeline execution failed' }, { status: 500 });
  }
}
