import { XChaCha20Poly1305 } from '@stablelib/xchacha20poly1305';
import type { ManagedCredential } from '@/lib/providers/types';
import { getProvisioningOrchestrator } from '@/app/api/provisioning/context';
import { resolveSessionSecret } from './sessionRegistry';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { getAccountRepository } from '@/app/api/account/context';
import { hasProvisioningAccess } from '@/lib/provisioning/access';
import type { AccountPayload } from '@/lib/account/types';

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

async function resolveProvisionedCredential(
  account: AccountPayload,
  provider: string,
): Promise<ManagedCredential | undefined> {
  if (!hasProvisioningAccess(account)) {
    return undefined;
  }

  const orchestrator = getProvisioningOrchestrator();
  let resolved = await orchestrator.resolveActiveCredential(account.userId, provider);
  if (!resolved) {
    try {
      await orchestrator.issueCredential({
        userId: account.userId,
        provider,
        planTier: account.planTier,
        metadata: { planStatus: account.billingStatus },
      });
      resolved = await orchestrator.resolveActiveCredential(account.userId, provider);
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

  const identity = resolveRequestIdentity(request);
  const accountId = identity.userId?.trim();
  if (accountId) {
    try {
      const repository = getAccountRepository();
      const account = await repository.getOrCreate(accountId);
      const managedCredential = await resolveProvisionedCredential(account, provider);
      if (managedCredential) {
        return { managedCredential };
      }
    } catch (error) {
      console.error('Failed to resolve managed credential for account', error);
    }
  }

  return {};
}
