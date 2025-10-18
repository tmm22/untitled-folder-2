import { NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { getTransitTranscriptionRepository } from '@/lib/transit/repository';

export async function GET(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const repository = getTransitTranscriptionRepository();
    const records = await repository.list(identity.userId);
    return NextResponse.json({ records });
  } catch (error) {
    console.error('Failed to list transit transcriptions', error);
    return NextResponse.json({ error: 'Unable to load transcripts' }, { status: 500 });
  }
}
