import { afterEach, describe, expect, test, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import Home from '@/app/page';
import { __dangerous__resetAccountSyncState } from '@/modules/account/store';
import { __dangerous__resetAccountBootstrapper } from '@/components/account/AccountBootstrapper';

vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'inter-font' }),
}));

vi.mock('@/components/account/AccountBootstrapper', () => ({
  AccountBootstrapper: () => null,
  __dangerous__resetAccountBootstrapper: () => {},
}));

vi.mock('@/components/account/AuthPanel', () => ({
  AuthPanel: () => null,
}));

describe('Home page render', () => {
  beforeEach(() => {
    __dangerous__resetAccountSyncState();
    __dangerous__resetAccountBootstrapper();
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (url.includes('/api/account')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              userId: 'test-user',
              planTier: 'free',
              billingStatus: 'free',
              usage: {
                monthTokensUsed: 0,
                monthlyAllowance: 50_000,
                lastUpdated: Date.now(),
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      }

      if (url.includes('/api/providers')) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders without crashing', async () => {
    render(<Home />);
  });
});
