import type { ProviderType } from '@/modules/tts/types';

interface ProvisioningResponse {
  credentialId: string;
  expiresAt: number;
}

const EXPIRY_SAFETY_MS = 30 * 1000;
const cache = new Map<ProviderType, ProvisioningResponse>();

export async function ensureProvisionedCredential(
  provider: ProviderType,
  headers: Record<string, string>,
): Promise<void> {
  const cached = cache.get(provider);
  const now = Date.now();
  if (cached && cached.expiresAt > now + EXPIRY_SAFETY_MS) {
    return;
  }

  const response = await fetch('/api/provisioning/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ provider }),
  });

  const payload = (await response.json().catch(() => null)) as ProvisioningResponse | null;
  if (!response.ok || !payload) {
    const errorMessage = (payload as unknown as { error?: string } | null)?.error;
    throw new Error(errorMessage ?? 'Provisioning request failed');
  }

  cache.set(provider, payload);
}
