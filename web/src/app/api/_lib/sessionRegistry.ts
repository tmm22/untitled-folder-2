import { getSessionStore, promoteSessionFallbackStore } from '@/lib/session';
import type { SessionStore } from '@/lib/session/types';

const SESSION_TTL_MS = 15 * 60 * 1000;

function bufferFromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function isConvexSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (/Convex session request failed/i.test(error.message)) {
    return true;
  }
  if (error.name === 'TypeError') {
    return true;
  }
  const withCause = error as { cause?: unknown };
  if (withCause.cause) {
    return isConvexSessionError(withCause.cause);
  }
  return /fetch failed/i.test(error.message);
}

async function withResilientStore<T>(operation: (store: SessionStore) => Promise<T>): Promise<T> {
  const store = getSessionStore();
  try {
    return await operation(store);
  } catch (error) {
    if (!isConvexSessionError(error)) {
      throw error;
    }
    const fallback = promoteSessionFallbackStore(error);
    if (!fallback) {
      throw error;
    }
    return operation(fallback);
  }
}

export async function registerSession(sessionId: string, secretBase64: string): Promise<void> {
  await withResilientStore(async (store) => {
    await store.save({
      id: sessionId,
      secret: secretBase64,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
  });
}

export async function resolveSessionSecret(sessionId: string): Promise<Uint8Array | null> {
  return withResilientStore(async (store) => {
    const record = await store.find(sessionId);
    if (!record) {
      return null;
    }

    if (record.expiresAt < Date.now()) {
      await store.delete(sessionId);
      return null;
    }

    const nextExpiry = Date.now() + SESSION_TTL_MS;
    if (nextExpiry !== record.expiresAt) {
      await store.save({ ...record, expiresAt: nextExpiry });
    }

    return bufferFromBase64(record.secret);
  });
}

export async function clearSession(sessionId: string): Promise<void> {
  await withResilientStore(async (store) => {
    await store.delete(sessionId);
  });
}

export async function pruneExpiredSessions(): Promise<void> {
  await withResilientStore(async (store) => {
    if (typeof store.prune === 'function') {
      await store.prune(Date.now());
    }
  });
}
