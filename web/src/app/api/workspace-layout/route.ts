import { NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { parseWorkspaceLayoutSnapshot, serializeWorkspaceLayoutSnapshot } from '@/lib/workspaceLayout/repository';
import {
  getWorkspaceLayoutRepository,
  getWorkspaceLayoutRepositoryKind,
} from './context';

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json({ error: 'Not authorised to access workspace layout' }, { status: 403 });
}

function unavailableResponse() {
  return NextResponse.json({ error: 'Workspace layout service unavailable' }, { status: 503 });
}

function normalizeUserId(candidate: unknown): string | null {
  if (typeof candidate !== 'string') {
    return null;
  }
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return unauthorizedResponse();
  }

  const repository = getWorkspaceLayoutRepository();
  const kind = getWorkspaceLayoutRepositoryKind();
  if (kind !== 'convex') {
    return unavailableResponse();
  }

  const url = new URL(request.url);
  const requestedUserId = normalizeUserId(url.searchParams.get('userId')) ?? identity.userId;
  if (requestedUserId !== identity.userId) {
    return forbiddenResponse();
  }

  try {
    const layout = await repository.load(identity.userId);
    return NextResponse.json({ layout: layout ? serializeWorkspaceLayoutSnapshot(layout) : null });
  } catch (error) {
    console.error('Failed to load workspace layout', error);
    return NextResponse.json({ error: 'Unable to load workspace layout' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return unauthorizedResponse();
  }

  const repository = getWorkspaceLayoutRepository();
  const kind = getWorkspaceLayoutRepositoryKind();
  if (kind !== 'convex') {
    return unavailableResponse();
  }

  let payload: { layout?: unknown; userId?: unknown };
  try {
    payload = (await request.json()) as { layout?: unknown; userId?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const targetUserId = normalizeUserId(payload.userId) ?? identity.userId;
  if (targetUserId !== identity.userId) {
    return forbiddenResponse();
  }

  const layout = parseWorkspaceLayoutSnapshot(payload.layout);
  if (!layout) {
    return NextResponse.json({ error: 'Invalid workspace layout' }, { status: 400 });
  }

  try {
    await repository.save(identity.userId, layout);
    return NextResponse.json({ layout: serializeWorkspaceLayoutSnapshot(layout) });
  } catch (error) {
    console.error('Failed to save workspace layout', error);
    return NextResponse.json({ error: 'Unable to save workspace layout' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return unauthorizedResponse();
  }

  const repository = getWorkspaceLayoutRepository();
  const kind = getWorkspaceLayoutRepositoryKind();
  if (kind !== 'convex') {
    return unavailableResponse();
  }

  const url = new URL(request.url);
  const requestedUserId = normalizeUserId(url.searchParams.get('userId')) ?? identity.userId;
  if (requestedUserId !== identity.userId) {
    return forbiddenResponse();
  }

  try {
    await repository.clear(identity.userId);
    return NextResponse.json({ cleared: true });
  } catch (error) {
    console.error('Failed to clear workspace layout', error);
    return NextResponse.json({ error: 'Unable to clear workspace layout' }, { status: 500 });
  }
}
