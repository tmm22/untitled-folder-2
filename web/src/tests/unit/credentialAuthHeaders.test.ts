import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCredentialStore } from '@/modules/credentials/store';
import { useAccountStore } from '@/modules/account/store';

const vaultMocks = vi.hoisted(() => {
  const getProviderKey = vi.fn(async () => 'sk-web-123');
  const getRawMasterKey = vi.fn(() => new ArrayBuffer(32));
  return {
    createVault: vi.fn(),
    deleteProviderKey: vi.fn(),
    getProviderKey,
    getRawMasterKey,
    hasVault: vi.fn(async () => true),
    isUnlocked: vi.fn(() => true),
    listStoredProviders: vi.fn(async () => ['openAI']),
    lockVault: vi.fn(),
    destroyVault: vi.fn(),
    saveProviderKey: vi.fn(async () => {}),
    unlockVault: vi.fn(async () => {}),
  };
});

const sessionMocks = vi.hoisted(() => ({
  clearSession: vi.fn(),
  ensureSession: vi.fn(async () => {}),
  getSessionHeaders: vi.fn(() => ({
    'x-ttsauth-id': 'session-id',
    'x-ttsauth': 'payload-token',
  })),
}));

const provisioningMocks = vi.hoisted(() => ({
  ensureProvisionedCredential: vi.fn(async () => {}),
}));

vi.mock('@/lib/crypto/LocalVault', () => vaultMocks);
vi.mock('@/lib/crypto/sessionClient', () => sessionMocks);
vi.mock('@/lib/provisioning/client', () => provisioningMocks);

describe('credential auth headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCredentialStore.setState({
      hasVault: true,
      isUnlocked: true,
      storedProviders: ['openAI'],
      status: 'idle',
      error: undefined,
    });
    useAccountStore.setState((prev) => ({
      ...prev,
      hasProvisioningAccess: false,
    }));
    sessionMocks.getSessionHeaders.mockReturnValue({
      'x-ttsauth-id': 'session-id',
      'x-ttsauth': 'payload-token',
    });
    vaultMocks.getProviderKey.mockResolvedValue('sk-web-123');
  });

  it('returns secure session headers when available', async () => {
    const headers = await useCredentialStore.getState().actions.getAuthHeaders('openAI');

    expect(sessionMocks.ensureSession).toHaveBeenCalledTimes(1);
    expect(headers).toEqual({
      'x-ttsauth-id': 'session-id',
      'x-ttsauth': 'payload-token',
    });
    expect(sessionMocks.getSessionHeaders).toHaveBeenCalledWith('sk-web-123');
    expect(provisioningMocks.ensureProvisionedCredential).not.toHaveBeenCalled();
  });

  it('withholds provider key when secure headers are unavailable', async () => {
    sessionMocks.getSessionHeaders.mockReturnValueOnce({});

    const headers = await useCredentialStore.getState().actions.getAuthHeaders('openAI');

    expect(headers).toEqual({});
    expect(sessionMocks.getSessionHeaders).toHaveBeenCalledWith('sk-web-123');
    expect(useCredentialStore.getState().error).toMatch(/secure session/i);
  });
});
