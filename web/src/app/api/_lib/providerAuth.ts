import { XChaCha20Poly1305 } from '@stablelib/xchacha20poly1305';
import type { ManagedCredential } from '@/lib/providers/types';
import type { PlanTier } from '@/lib/provisioning';
import { getProvisioningOrchestrator } from '@/app/api/provisioning/context';
import { resolveSessionSecret } from './sessionRegistry';

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function decryptSessionPayload(payload: string, secret: Uint8Array): string | null {
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
    return null;
  }
}

const PREMIUM_STATUSES = new Set(['trial', 'active']);

const isPlanTier = (value: string | null): value is PlanTier => {
  return value === 'trial' || value === 'starter' || value === 'pro' || value === 'enterprise';
};

async function resolveProvisionedCredential(
  request: Request,
  provider: string,
): Promise<ManagedCredential | undefined> {
  const accountId = request.headers.get('x-account-id');
  const planTier = request.headers.get('x-plan-tier');
  const planStatus = request.headers.get('x-plan-status');

  if (!accountId || !isPlanTier(planTier) || !planStatus || !PREMIUM_STATUSES.has(planStatus)) {
    return undefined;
  }

  const orchestrator = getProvisioningOrchestrator();
  let resolved = await orchestrator.resolveActiveCredential(accountId, provider);
  if (!resolved) {
    try {
      await orchestrator.issueCredential({
        userId: accountId,
        provider,
        planTier,
        metadata: { planStatus },
      });
      resolved = await orchestrator.resolveActiveCredential(accountId, provider);
    } catch (error) {
      console.error('Provisioned credential issuance during request failed', error);
      return undefined;
    }
  }

  if (!resolved) {
    return undefined;
  }

  return {
    source: 'provisioned',
    credentialId: resolved.record.id,
    token: resolved.token,
    expiresAt: resolved.record.expiresAt,
  };
}

export interface ProviderAuthorization {
  apiKey?: string;
  managedCredential?: ManagedCredential;
}

export async function resolveProviderAuthorization(
  request: Request,
  provider: string,
): Promise<ProviderAuthorization> {
  const sessionId = request.headers.get('x-ttsauth-id');
  const payload = request.headers.get('x-ttsauth');

  if (sessionId && payload) {
    const secret = await resolveSessionSecret(sessionId);
    if (secret) {
      const apiKey = decryptSessionPayload(payload, secret);
      if (apiKey) {
        return { apiKey };
      }
    }
  }

  const legacyKey = request.headers.get('x-provider-key');
  if (legacyKey) {
    return { apiKey: legacyKey };
  }

  const managedCredential = await resolveProvisionedCredential(request, provider);
  if (managedCredential) {
    return { managedCredential };
  }

  return {};
}
