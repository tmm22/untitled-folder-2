import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useCredentialStore } from '@/modules/credentials/store';
import { useAccountStore, __dangerous__resetAccountSyncState } from '@/modules/account/store';
import { __dangerous__resetAccountBootstrapper } from '@/components/account/AccountBootstrapper';
import type { ProviderType } from '@/modules/tts/types';

const { ensureProvisionedCredentialMock } = vi.hoisted(() => ({
  ensureProvisionedCredentialMock: vi.fn(async () => {}),
}));

vi.mock('@/lib/crypto/LocalVault', () => ({
  createVault: vi.fn(),
  deleteProviderKey: vi.fn(),
  getProviderKey: vi.fn(async () => undefined),
  getRawMasterKey: vi.fn(() => undefined),
  hasVault: vi.fn(async () => false),
  isUnlocked: vi.fn(() => false),
  listStoredProviders: vi.fn(async () => []),
  lockVault: vi.fn(),
  destroyVault: vi.fn(),
  saveProviderKey: vi.fn(async () => {}),
  unlockVault: vi.fn(async () => {}),
}));

vi.mock('@/lib/crypto/sessionClient', () => ({
  clearSession: vi.fn(),
  ensureSession: vi.fn(async () => {}),
  getSessionHeaders: vi.fn(() => ({
    'x-ttsauth-id': 'session-id',
    'x-ttsauth': 'payload',
  })),
}));

vi.mock('@/lib/provisioning/client', () => ({
  ensureProvisionedCredential: ensureProvisionedCredentialMock,
}));

describe('Credential store provisioning fallback', () => {
  beforeEach(() => {
    __dangerous__resetAccountSyncState();
    __dangerous__resetAccountBootstrapper();
    useAccountStore.setState((prev) => ({
      ...prev,
      userId: 'user-test',
      planTier: 'starter',
      billingStatus: 'active',
      premiumExpiresAt: undefined,
      hasProvisioningAccess: true,
    }));
    ensureProvisionedCredentialMock.mockClear();
  });

  it('returns provisioning headers when no stored API key exists', async () => {
    const headers = await useCredentialStore.getState().actions.getAuthHeaders('openAI');
    expect(headers['x-account-id']).toBe('user-test');
    expect(headers['x-plan-tier']).toBe('starter');
    expect(headers['x-plan-status']).toBe('active');
    expect(ensureProvisionedCredentialMock).toHaveBeenCalledWith('openAI' satisfies ProviderType, headers);
  });
});
