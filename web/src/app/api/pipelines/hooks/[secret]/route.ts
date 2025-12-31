import { NextResponse } from 'next/server';
import {
  getPipelineRepository,
  shouldFallbackToLocalPipelineRepository,
  fallbackPipelineRepository,
} from '../../context';
import { parseRunPayload } from '../../_lib/validate';
import { runPipelineOnServer } from '../../_lib/runner';
import {
  verifyWebhookSignature,
  verifyWebhookTimestamp,
  getWebhookHeaders,
  isHmacRequired,
} from '@/lib/pipelines/webhookAuth';

type RouteContext = { params: Promise<{ secret: string }> };

interface WebhookRequestBody {
  content?: string;
  title?: string;
  summary?: string;
  source?: {
    type: string;
    url?: string;
    identifier?: string;
    id?: string;
  };
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { secret } = await context.params;

  const rawBodyText = await request.text();
  let rawBody: WebhookRequestBody;
  try {
    rawBody = rawBodyText ? JSON.parse(rawBodyText) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const executeWebhook = async (): Promise<Response> => {
    const repository = getPipelineRepository();
    const pipeline = await repository.findByWebhookSecret(secret);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    const { signature, timestamp } = getWebhookHeaders(request);

    if (isHmacRequired() || signature) {
      const signatureResult = verifyWebhookSignature(
        pipeline.webhookSecret,
        rawBodyText,
        signature,
        timestamp,
      );
      if (!signatureResult.valid) {
        return NextResponse.json({ error: signatureResult.error }, { status: 401 });
      }
    }

    if (timestamp) {
      const timestampResult = verifyWebhookTimestamp(timestamp);
      if (!timestampResult.valid) {
        return NextResponse.json({ error: timestampResult.error }, { status: 401 });
      }
    }

    const bodyWithDefaults: WebhookRequestBody = { ...rawBody };
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
