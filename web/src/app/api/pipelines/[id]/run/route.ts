import { NextResponse } from 'next/server';
import { getPipelineRepository } from '../../context';
import { parseRunPayload } from '../../_lib/validate';
import { runPipelineOnServer } from '../../_lib/runner';

export async function POST(request: Request, context: any): Promise<Response> {
  try {
    const { params } = context as { params: { id: string } };
    const repository = getPipelineRepository();
    const pipeline = await repository.get(params.id);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const input = parseRunPayload(body, pipeline.id);
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
    console.error('Failed to execute pipeline', error);
    return NextResponse.json({ error: 'Pipeline execution failed' }, { status: 500 });
  }
}
