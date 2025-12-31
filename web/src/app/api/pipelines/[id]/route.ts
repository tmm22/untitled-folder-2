import { NextResponse } from 'next/server';
import {
  getPipelineRepository,
  shouldFallbackToLocalPipelineRepository,
  fallbackPipelineRepository,
} from '../context';
import { parseUpdatePayload } from '../_lib/validate';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;

  const respondWithPipeline = async (): Promise<Response> => {
    const repository = getPipelineRepository();
    const pipeline = await repository.get(id);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    return NextResponse.json({ pipeline });
  };

  try {
    return await respondWithPipeline();
  } catch (error) {
    if (shouldFallbackToLocalPipelineRepository(error)) {
      try {
        fallbackPipelineRepository(error);
        return await respondWithPipeline();
      } catch (fallbackError) {
        console.error('Pipeline lookup failed after fallback', fallbackError);
      }
    }
    console.error('Failed to load pipeline', error);
    return NextResponse.json({ error: 'Unable to load pipeline' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  let input;
  try {
    input = parseUpdatePayload(body);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }

  if (
    typeof input.name === 'undefined' &&
    typeof input.description === 'undefined' &&
    typeof input.steps === 'undefined' &&
    typeof input.schedule === 'undefined' &&
    typeof input.defaultSource === 'undefined' &&
    typeof input.rotateSecret === 'undefined'
  ) {
    return NextResponse.json({ error: 'No changes supplied' }, { status: 400 });
  }

  const performUpdate = async (): Promise<Response> => {
    const repository = getPipelineRepository();
    const pipeline = await repository.update(id, input);
    return NextResponse.json({ pipeline });
  };

  try {
    return await performUpdate();
  } catch (error) {
    if (error instanceof Error && error.message === 'Pipeline not found') {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    if (shouldFallbackToLocalPipelineRepository(error)) {
      try {
        fallbackPipelineRepository(error);
        return await performUpdate();
      } catch (fallbackError) {
        if (fallbackError instanceof Error && fallbackError.message === 'Pipeline not found') {
          return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
        }
        console.error('Pipeline update failed after fallback', fallbackError);
      }
    }
    console.error('Failed to update pipeline', error);
    return NextResponse.json({ error: 'Unable to update pipeline' }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;

  const performDelete = async (): Promise<Response> => {
    const repository = getPipelineRepository();
    await repository.delete(id);
    return NextResponse.json({ success: true });
  };

  try {
    return await performDelete();
  } catch (error) {
    if (shouldFallbackToLocalPipelineRepository(error)) {
      try {
        fallbackPipelineRepository(error);
        return await performDelete();
      } catch (fallbackError) {
        console.error('Pipeline delete failed after fallback', fallbackError);
      }
    }
    console.error('Failed to delete pipeline', error);
    return NextResponse.json({ error: 'Unable to delete pipeline' }, { status: 500 });
  }
}
