import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import type { AccountPayload } from '@/lib/account/types';

const { getAccountRepositoryMock, resolveIdentityMock, updateAccountMock } = vi.hoisted(() => {
  const updateAccount = vi.fn(async (payload: AccountPayload) => payload);
  return {
    updateAccountMock: updateAccount,
    getAccountRepositoryMock: vi.fn(() => ({
      getOrCreate: vi.fn(),
      updateAccount,
    })),
    resolveIdentityMock: vi.fn(() => ({ userId: 'user-123', isVerified: true, source: 'clerk' })),
  };
});

vi.mock('@/app/api/account/context', () => ({
  getAccountRepository: getAccountRepositoryMock,
}));

vi.mock('@/lib/auth/identity', () => ({
  resolveRequestIdentity: resolveIdentityMock,
}));

let PATCH: typeof import('@/app/api/account/route').PATCH;

describe('PATCH /api/account security', () => {
  const originalEnvSecret = process.env.ACCOUNT_UPDATE_SECRET;

  beforeEach(async () => {
    getAccountRepositoryMock.mockClear();
    updateAccountMock.mockClear();
    resolveIdentityMock.mockReturnValue({ userId: 'user-123', isVerified: true, source: 'clerk' });
    PATCH = (await import('@/app/api/account/route')).PATCH;
    delete process.env.ACCOUNT_UPDATE_SECRET;
  });

  afterEach(() => {
    if (originalEnvSecret !== undefined) {
      process.env.ACCOUNT_UPDATE_SECRET = originalEnvSecret;
    } else {
      delete process.env.ACCOUNT_UPDATE_SECRET;
    }
  });

  const buildRequest = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('http://localhost/api/account', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });

  it('rejects updates when ACCOUNT_UPDATE_SECRET is missing', async () => {
    const response = await PATCH(
      buildRequest({ planTier: 'starter', billingStatus: 'active' as AccountPayload['billingStatus'] }),
    );
    expect(response.status).toBe(500);
    expect(updateAccountMock).not.toHaveBeenCalled();
  });

  it('rejects updates with missing token header', async () => {
    process.env.ACCOUNT_UPDATE_SECRET = 'test-secret';
    const response = await PATCH(
      buildRequest({ planTier: 'starter', billingStatus: 'active' as AccountPayload['billingStatus'] }),
    );
    expect(response.status).toBe(401);
    expect(updateAccountMock).not.toHaveBeenCalled();
  });

  it('rejects updates with invalid token header', async () => {
    process.env.ACCOUNT_UPDATE_SECRET = 'test-secret';
    const response = await PATCH(
      buildRequest(
        { planTier: 'starter', billingStatus: 'active' as AccountPayload['billingStatus'] },
        { 'x-account-update-token': 'wrong-secret' },
      ),
    );
    expect(response.status).toBe(401);
    expect(updateAccountMock).not.toHaveBeenCalled();
  });

  it('accepts updates with valid credentials', async () => {
    process.env.ACCOUNT_UPDATE_SECRET = 'test-secret';
    const response = await PATCH(
      buildRequest(
        { planTier: 'starter', billingStatus: 'active' as AccountPayload['billingStatus'] },
        { 'x-account-update-token': 'test-secret' },
      ),
    );
    expect(response.status).toBe(200);
    expect(updateAccountMock).toHaveBeenCalledWith({
      planTier: 'starter',
      billingStatus: 'active',
      userId: 'user-123',
    });
  });
});
