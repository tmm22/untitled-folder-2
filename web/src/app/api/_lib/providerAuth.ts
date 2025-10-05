import { XChaCha20Poly1305 } from '@stablelib/xchacha20poly1305';
import { resolveSessionSecret } from './sessionRegistry';

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export function extractApiKey(request: Request): string | undefined {
  const sessionId = request.headers.get('x-ttsauth-id');
  const payload = request.headers.get('x-ttsauth');

  if (sessionId && payload) {
    const secret = resolveSessionSecret(sessionId);
    if (secret) {
      const data = decodeBase64(payload);
      const nonce = data.slice(0, 24);
      const ciphertext = data.slice(24);
      const cipher = new XChaCha20Poly1305(secret);

      try {
        const plaintext = cipher.open(nonce, ciphertext);
        if (!plaintext) {
          throw new Error('Unable to decrypt');
        }
        return Buffer.from(plaintext).toString('utf8');
      } catch (error) {
        console.error('Failed to decrypt provider key', error);
      }
    }
  }

  const legacyKey = request.headers.get('x-provider-key');
  if (legacyKey) {
    return legacyKey;
  }

  return undefined;
}
