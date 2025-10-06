import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  IssueCredentialRequest,
  ProvisionedCredentialRecord,
  ProvisioningClock,
  ProvisioningProvider,
  ProvisioningStore,
  RevokeCredentialRequest,
  ProvisioningTokenCache,
} from './types';

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

class SystemClock implements ProvisioningClock {
  now(): number {
    return Date.now();
  }
}

function buildRecord(
  request: IssueCredentialRequest,
  issuedAt: number,
  expiresAt: number,
  token: string,
  providerReference: string | undefined,
  metadata: Record<string, unknown> | undefined,
): ProvisionedCredentialRecord {
  const salt = randomBytes(16).toString('hex');
  return {
    id: randomUUID(),
    userId: request.userId,
    provider: request.provider,
    tokenHash: sha256Hex(`${salt}:${token}`),
    salt,
    scopes: request.scopes ?? [],
    planTier: request.planTier,
    issuedAt,
    expiresAt,
    status: 'active',
    providerReference,
    metadata,
    lastRotatedAt: issuedAt,
  };
}

export interface ProvisioningOrchestratorOptions {
  providers: readonly ProvisioningProvider[];
  store: ProvisioningStore;
  clock?: ProvisioningClock;
  tokenCache?: ProvisioningTokenCache;
}

export interface IssueCredentialResponse {
  credentialId: string;
  expiresAt: number;
  providerReference?: string;
  metadata?: Record<string, unknown>;
}

export class ProvisioningOrchestrator {
  private readonly providers: Map<string, ProvisioningProvider>;
  private readonly store: ProvisioningStore;
  private readonly clock: ProvisioningClock;
  private readonly tokenCache?: ProvisioningTokenCache;

  constructor(options: ProvisioningOrchestratorOptions) {
    this.providers = new Map(options.providers.map((provider) => [provider.provider, provider]));
    this.store = options.store;
    this.clock = options.clock ?? new SystemClock();
    this.tokenCache = options.tokenCache;
  }

  async issueCredential(request: IssueCredentialRequest): Promise<IssueCredentialResponse> {
    const provider = this.resolveProvider(request.provider);
    const now = this.clock.now();
    const existing = await this.store.findActive(request.userId, request.provider);

    if (existing) {
      await this.revokeExistingCredential(provider, existing, 'rotated');
    }

    const issued = await provider.issueCredential(request);
    const expiresAt = issued.expiresAt ?? now + (request.ttlMs ?? DEFAULT_TTL_MS);
    const record = buildRecord(request, now, expiresAt, issued.token, issued.providerReference, issued.metadata);

    await this.store.save(record);
    await this.tokenCache?.store(record.id, issued.token, record.expiresAt);

    return {
      credentialId: record.id,
      expiresAt: record.expiresAt,
      providerReference: record.providerReference,
      metadata: record.metadata,
    };
  }

  async revokeCredential(request: RevokeCredentialRequest): Promise<void> {
    const provider = this.resolveProvider(request.provider);
    await provider.revokeCredential(request);
    await this.store.markRevoked(request.credentialId);
    await this.tokenCache?.delete(request.credentialId);
  }

  async resolveActiveCredential(
    userId: string,
    providerKey: string,
  ): Promise<{ record: ProvisionedCredentialRecord; token: string } | null> {
    const record = await this.store.findActive(userId, providerKey);
    if (!record) {
      return null;
    }

    const token = this.tokenCache?.resolve(record.id);
    if (!token) {
      return null;
    }

    if (record.expiresAt < this.clock.now()) {
      await this.store.markRevoked(record.id);
      await this.tokenCache?.delete(record.id);
      return null;
    }

    return { record, token };
  }

  private resolveProvider(providerKey: string): ProvisioningProvider {
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new Error(`Provisioning provider '${providerKey}' is not registered`);
    }
    return provider;
  }

  private async revokeExistingCredential(
    provider: ProvisioningProvider,
    existing: ProvisionedCredentialRecord,
    reason: string,
  ): Promise<void> {
    const request: RevokeCredentialRequest = {
      userId: existing.userId,
      provider: existing.provider,
      credentialId: existing.id,
      reason,
    };

    await provider.revokeCredential(request);
    await this.store.markRevoked(existing.id);
    await this.tokenCache?.delete(existing.id);
  }
}
