import { NextResponse } from 'next/server';
import { getPipelineRepository } from './context';
import { parseCreatePayload } from './_lib/validate';

export async function GET(): Promise<Response> {
  try {
    const repository = getPipelineRepository();
    const pipelines = await repository.list();
    return NextResponse.json({ pipelines });
  } catch (error) {
    console.error('Failed to list pipelines', error);
    return NextResponse.json({ error: 'Unable to load pipelines' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const input = parseCreatePayload(body);
    const repository = getPipelineRepository();
    const pipeline = await repository.create(input);
    return NextResponse.json({ pipeline }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Failed to create pipeline', error);
    return NextResponse.json({ error: 'Unable to create pipeline' }, { status: 500 });
  }
}
