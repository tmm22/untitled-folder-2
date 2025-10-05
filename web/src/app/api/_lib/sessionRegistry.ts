const SESSION_TTL_MS = 15 * 60 * 1000;

interface SessionRecord {
  secret: Uint8Array;
  expiresAt: number;
}

const registry = new Map<string, SessionRecord>();

function bufferFromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export function registerSession(sessionId: string, secretBase64: string) {
  const secret = bufferFromBase64(secretBase64);
  registry.set(sessionId, {
    secret,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
}

export function resolveSessionSecret(sessionId: string): Uint8Array | null {
  const record = registry.get(sessionId);
  if (!record) {
    return null;
  }

  if (record.expiresAt < Date.now()) {
    registry.delete(sessionId);
    return null;
  }

  // Extend TTL on access
  record.expiresAt = Date.now() + SESSION_TTL_MS;
  return record.secret;
}

export function clearSession(sessionId: string) {
  registry.delete(sessionId);
}

export function pruneExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, record] of registry.entries()) {
    if (record.expiresAt < now) {
      registry.delete(sessionId);
    }
  }
}
