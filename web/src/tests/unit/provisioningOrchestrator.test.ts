import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryProvisioningStore,
  ProvisioningOrchestrator,
  ProvisioningProvider,
  InMemoryProvisioningTokenCache,
} from '../../lib/provisioning';
import {
  IssueCredentialRequest,
  RevokeCredentialRequest,
} from '../../lib/provisioning/types';

function buildProvider(overrides?: {
  issueImpl?: (request: IssueCredentialRequest) => Promise<{ token: string; expiresAt: number }>;
  revokeImpl?: (request: RevokeCredentialRequest) => Promise<void>;
}): ProvisioningProvider {
  const issueCredential = overrides?.issueImpl ??
    (async () => ({ token: 'mock-token', expiresAt: Date.now() + 60_000 }));
  const revokeCredential = overrides?.revokeImpl ?? (async () => {});

  return {
    provider: 'openai',
    issueCredential,
    revokeCredential,
  };
}

describe('ProvisioningOrchestrator', () => {
  it('issues a credential and stores a hashed token', async () => {
    const store = new InMemoryProvisioningStore();
    const tokenCache = new InMemoryProvisioningTokenCache();
    const issueSpy = vi.fn(async () => ({ token: 'clear-text-token', expiresAt: 1_000_000 }));
    const provider = buildProvider({ issueImpl: issueSpy });
    const orchestrator = new ProvisioningOrchestrator({
      providers: [provider],
      store,
      tokenCache,
      clock: { now: () => 500_000 },
    });

    const response = await orchestrator.issueCredential({
      userId: 'user-123',
      provider: 'openai',
      planTier: 'starter',
      scopes: ['tts.generate'],
    });

    expect(response.credentialId).toBeTruthy();
    expect(response.expiresAt).toBe(1_000_000);
    expect(issueSpy).toHaveBeenCalledOnce();

    const matchingRecord = store.getRecord(response.credentialId);
    expect(matchingRecord).not.toBeNull();
    expect(matchingRecord?.status).toBe('active');
    expect(matchingRecord?.tokenHash.includes('clear-text-token')).toBe(false);
    expect(matchingRecord?.scopes).toEqual(['tts.generate']);
  });

  it('rotates existing credentials before issuing a new one', async () => {
    const store = new InMemoryProvisioningStore();
    const tokenCache = new InMemoryProvisioningTokenCache();
    const issueSpy = vi
      .fn<(request: IssueCredentialRequest) => Promise<{ token: string; expiresAt: number }>>()
      .mockResolvedValueOnce({ token: 'token-a', expiresAt: 2_000_000 })
      .mockResolvedValueOnce({ token: 'token-b', expiresAt: 3_000_000 });
    const revokeSpy = vi.fn(async () => {});
    const provider = buildProvider({ issueImpl: issueSpy, revokeImpl: revokeSpy });
    const orchestrator = new ProvisioningOrchestrator({
      providers: [provider],
      store,
      tokenCache,
      clock: { now: () => 1_500_000 },
    });

    const first = await orchestrator.issueCredential({
      userId: 'user-456',
      provider: 'openai',
      planTier: 'starter',
    });

    const second = await orchestrator.issueCredential({
      userId: 'user-456',
      provider: 'openai',
      planTier: 'starter',
    });

    expect(first.credentialId).not.toBe(second.credentialId);
    expect(revokeSpy).toHaveBeenCalledOnce();

    const records = store.listRecords();
    const revoked = records.find((record) => record.id === first.credentialId);
    const active = records.find((record) => record.id === second.credentialId);

    expect(revoked?.status).toBe('revoked');
    expect(active?.status).toBe('active');
  });

  it('rethrows when provider is missing', async () => {
    const store = new InMemoryProvisioningStore();
    const orchestrator = new ProvisioningOrchestrator({ providers: [], store });

    await expect(() =>
      orchestrator.issueCredential({ userId: 'user', provider: 'missing', planTier: 'starter' }),
    ).rejects.toThrow(/not registered/);
  });

  it('resolves active tokens when available', async () => {
    const store = new InMemoryProvisioningStore();
    const tokenCache = new InMemoryProvisioningTokenCache();
    const futureExpiry = Date.now() + 600_000;
    const provider = buildProvider({
      issueImpl: async () => ({ token: 'token-123', expiresAt: futureExpiry }),
    });
    const orchestrator = new ProvisioningOrchestrator({
      providers: [provider],
      store,
      tokenCache,
      clock: { now: () => 100_000 },
    });

    await orchestrator.issueCredential({ userId: 'user-xyz', provider: 'openai', planTier: 'starter' });

    const result = await orchestrator.resolveActiveCredential('user-xyz', 'openai');
    expect(result?.token).toBe('token-123');
    expect(result?.record.status).toBe('active');
  });
});
