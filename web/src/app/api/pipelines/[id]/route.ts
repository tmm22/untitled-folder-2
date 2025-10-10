import { NextResponse } from 'next/server';
import { getPipelineRepository } from '../context';
import { parseUpdatePayload } from '../_lib/validate';

export async function GET(_: Request, context: any): Promise<Response> {
  try {
    const { params } = context as { params: { id: string } };
    const repository = getPipelineRepository();
    const pipeline = await repository.get(params.id);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    return NextResponse.json({ pipeline });
  } catch (error) {
    console.error('Failed to load pipeline', error);
    return NextResponse.json({ error: 'Unable to load pipeline' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: any): Promise<Response> {
  try {
    const { params } = context as { params: { id: string } };
    const body = await request.json().catch(() => ({}));
    const input = parseUpdatePayload(body);
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
    const repository = getPipelineRepository();
    const pipeline = await repository.update(params.id, input);
    return NextResponse.json({ pipeline });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    if (error instanceof Error && error.message === 'Pipeline not found') {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    console.error('Failed to update pipeline', error);
    return NextResponse.json({ error: 'Unable to update pipeline' }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: any): Promise<Response> {
  try {
    const { params } = context as { params: { id: string } };
    const repository = getPipelineRepository();
    await repository.delete(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete pipeline', error);
    return NextResponse.json({ error: 'Unable to delete pipeline' }, { status: 500 });
  }
}
