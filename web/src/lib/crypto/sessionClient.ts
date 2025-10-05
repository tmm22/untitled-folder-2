'use client';

import { XChaCha20Poly1305 } from '@stablelib/xchacha20poly1305';
import { encodeBase64, encodeString } from '@/lib/utils/base64';

interface SessionHandle {
  id: string;
  secret: Uint8Array;
  expiresAt: number;
  nonceCounter: number;
}

let sessionHandle: SessionHandle | null = null;
const SESSION_TTL_MS = 15 * 60 * 1000;

function getRandomBytes(length: number): Uint8Array {
  const buffer = new Uint8Array(length);
  if (typeof window === 'undefined') {
    throw new Error('Session client is only available in the browser');
  }
  window.crypto.getRandomValues(buffer);
  return buffer;
}

async function registerSession(id: string, secret: Uint8Array): Promise<void> {
  const response = await fetch('/api/session/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId: id, secret: encodeBase64(secret) }),
  });

  if (!response.ok) {
    throw new Error('Unable to initialize secure session');
  }
}

function ensureNonce(): Uint8Array {
  if (!sessionHandle) {
    throw new Error('Session has not been initialised');
  }
  // Use random 24-byte nonce each request (counter kept for informational purposes)
  sessionHandle.nonceCounter += 1;
  return getRandomBytes(24);
}

export async function ensureSession(rawMasterKey: ArrayBuffer): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (sessionHandle && sessionHandle.expiresAt > Date.now()) {
    return;
  }

  const masterBytes = new Uint8Array(rawMasterKey);
  const salt = getRandomBytes(16);
  const concatenated = new Uint8Array(masterBytes.length + salt.length);
  concatenated.set(masterBytes, 0);
  concatenated.set(salt, masterBytes.length);

  const secret = await window.crypto.subtle.digest('SHA-256', concatenated.buffer);
  const secretBytes = new Uint8Array(secret);
  const sessionId = encodeBase64(getRandomBytes(18));

  await registerSession(sessionId, secretBytes);

  sessionHandle = {
    id: sessionId,
    secret: secretBytes,
    expiresAt: Date.now() + SESSION_TTL_MS,
    nonceCounter: 0,
  };
}

export function clearSession(): void {
  sessionHandle = null;
}

export function getSessionHeaders(plaintext: string): Record<string, string> {
  if (!sessionHandle) {
    return {};
  }

  const cipher = new XChaCha20Poly1305(sessionHandle.secret);
  const nonce = ensureNonce();
  const ciphertext = cipher.seal(nonce, encodeString(plaintext));

  const payload = new Uint8Array(nonce.length + ciphertext.length);
  payload.set(nonce, 0);
  payload.set(ciphertext, nonce.length);

  return {
    'x-ttsauth-id': sessionHandle.id,
    'x-ttsauth': encodeBase64(payload),
  };
}

