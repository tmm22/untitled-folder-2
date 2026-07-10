import { NextResponse } from 'next/server';
import { isAuthFailure, requireVerifiedIdentity } from '../_lib/requireAuth';
import {
  getPipelineRepository,
  shouldFallbackToLocalPipelineRepository,
  fallbackPipelineRepository,
} from './context';
import { parseCreatePayload } from './_lib/validate';

export async function GET(request: Request): Promise<Response> {
  const auth = requireVerifiedIdentity(request);
  if (isAuthFailure(auth)) {
    return auth;
  }

  try {
    const repository = getPipelineRepository();
    const pipelines = await repository.list(auth.userId);
    return NextResponse.json({ pipelines });
  } catch (error) {
    if (shouldFallbackToLocalPipelineRepository(error)) {
      try {
        const repository = fallbackPipelineRepository(error);
        const pipelines = await repository.list(auth.userId);
        return NextResponse.json({ pipelines });
      } catch (fallbackError) {
        console.error('Pipeline list failed after fallback', fallbackError);
      }
    }
    console.error('Failed to list pipelines', error);
    return NextResponse.json({ error: 'Unable to load pipelines' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireVerifiedIdentity(request);
  if (isAuthFailure(auth)) {
    return auth;
  }

  const body = await request.json().catch(() => ({}));
  let input;
  try {
    input = parseCreatePayload(body);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }

  const ownedInput = { ...input, ownerId: auth.userId };

  try {
    const repository = getPipelineRepository();
    const pipeline = await repository.create(ownedInput);
    return NextResponse.json({ pipeline }, { status: 201 });
  } catch (error) {
    if (shouldFallbackToLocalPipelineRepository(error)) {
      try {
        const repository = fallbackPipelineRepository(error);
        const pipeline = await repository.create(ownedInput);
        return NextResponse.json({ pipeline }, { status: 201 });
      } catch (fallbackError) {
        console.error('Pipeline creation failed after fallback', fallbackError);
      }
    }
    console.error('Failed to create pipeline', error);
    return NextResponse.json({ error: 'Unable to create pipeline' }, { status: 500 });
  }
}
