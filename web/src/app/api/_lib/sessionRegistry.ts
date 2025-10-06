import { getSessionStore } from '@/lib/session';

const SESSION_TTL_MS = 15 * 60 * 1000;

function bufferFromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export async function registerSession(sessionId: string, secretBase64: string): Promise<void> {
  const store = getSessionStore();
  await store.save({
    id: sessionId,
    secret: secretBase64,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
}

export async function resolveSessionSecret(sessionId: string): Promise<Uint8Array | null> {
  const store = getSessionStore();
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
}

export async function clearSession(sessionId: string): Promise<void> {
  const store = getSessionStore();
  await store.delete(sessionId);
}

export async function pruneExpiredSessions(): Promise<void> {
  const store = getSessionStore();
  if (typeof store.prune === 'function') {
    await store.prune(Date.now());
  }
}
