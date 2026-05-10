import { createHmac, timingSafeEqual } from 'crypto';

export class PolarWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolarWebhookVerificationError';
  }
}

function resolveSignature(headers: Record<string, string>): string | null {
  const raw =
    headers['polar-signature'] ??
    headers['x-polar-signature'] ??
    headers['Polar-Signature'] ??
    headers['X-Polar-Signature'];
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const prefixed = trimmed.split(',').map((part) => part.trim()).find((part) => part.startsWith('sha256='));
  if (prefixed) {
    return prefixed.slice('sha256='.length);
  }
  return trimmed;
}

function normalizeHex(value: string): Buffer {
  return Buffer.from(value.trim().toLowerCase(), 'hex');
}

export function validatePolarEvent<T>(
  body: Buffer,
  headers: Record<string, string>,
  secret: string,
): T {
  const signature = resolveSignature(headers);
  if (!signature) {
    throw new PolarWebhookVerificationError('Missing webhook signature');
  }

  const digest = createHmac('sha256', secret).update(body).digest('hex');
  const expected = normalizeHex(digest);
  const received = normalizeHex(signature);
  if (expected.length === 0 || received.length === 0 || expected.length !== received.length) {
    throw new PolarWebhookVerificationError('Invalid webhook signature');
  }

  if (!timingSafeEqual(expected, received)) {
    throw new PolarWebhookVerificationError('Invalid webhook signature');
  }

  try {
    return JSON.parse(body.toString('utf8')) as T;
  } catch {
    throw new PolarWebhookVerificationError('Invalid webhook JSON payload');
  }
}
