import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_HEADER = 'x-webhook-signature';
const TIMESTAMP_HEADER = 'x-webhook-timestamp';
const DEFAULT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
}

function parseSignature(header: string | null): { algorithm: string; hash: string } | null {
  if (!header) return null;
  const match = header.match(/^(sha256)=([a-f0-9]+)$/i);
  if (!match) return null;
  return { algorithm: match[1].toLowerCase(), hash: match[2].toLowerCase() };
}

export function computeSignature(secret: string, payload: string, timestamp?: string): string {
  const data = timestamp ? `${timestamp}.${payload}` : payload;
  return createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

export function verifyWebhookSignature(
  secret: string,
  payload: string,
  signatureHeader: string | null,
  timestampHeader: string | null = null,
): WebhookVerificationResult {
  const parsed = parseSignature(signatureHeader);
  if (!parsed) {
    return { valid: false, error: 'Missing or malformed signature header' };
  }

  const expected = computeSignature(secret, payload, timestampHeader ?? undefined);
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(parsed.hash, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return { valid: false, error: 'Invalid signature' };
  }

  if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}

export function verifyWebhookTimestamp(
  timestampHeader: string | null,
  toleranceMs: number = DEFAULT_TIMESTAMP_TOLERANCE_MS,
): WebhookVerificationResult {
  if (!timestampHeader) {
    return { valid: true };
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: 'Invalid timestamp format' };
  }

  const now = Date.now();
  const age = Math.abs(now - timestamp);

  if (age > toleranceMs) {
    return { valid: false, error: 'Request timestamp too old or in the future' };
  }

  return { valid: true };
}

export function getWebhookHeaders(request: Request): {
  signature: string | null;
  timestamp: string | null;
} {
  return {
    signature: request.headers.get(SIGNATURE_HEADER),
    timestamp: request.headers.get(TIMESTAMP_HEADER),
  };
}

export function isHmacRequired(): boolean {
  return process.env.WEBHOOK_REQUIRE_HMAC === '1';
}
