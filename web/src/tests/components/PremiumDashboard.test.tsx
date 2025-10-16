import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { PremiumDashboard } from '@/components/account/PremiumDashboard';
import { useAccountStore } from '@/modules/account/store';

describe('PremiumDashboard', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        assign: assignSpy,
      } as Partial<Location>,
    });

    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        checkoutUrl: 'https://billing.example/checkout',
        account: { userId: 'user-1', planTier: 'starter', billingStatus: 'active' },
      }),
    })) as unknown as typeof fetch;

    const actions = useAccountStore.getState().actions;
    useAccountStore.setState({
      userId: 'user-1',
      planTier: 'free',
      billingStatus: 'free',
      premiumExpiresAt: undefined,
      hasProvisioningAccess: false,
      usageSummary: undefined,
      polarCustomerId: undefined,
      polarSubscriptionId: undefined,
      polarPlanId: undefined,
      polarCurrentPeriodEnd: undefined,
      polarBenefits: undefined,
      sessionKind: 'guest',
      actions,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    useAccountStore.getState().actions.reset();
    vi.restoreAllMocks();
  });

  it('redirects to checkout url when activating a subscription', async () => {
    const user = userEvent.setup();
    render(<PremiumDashboard />);
    await user.click(screen.getByRole('button', { name: /activate subscription/i }));

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('https://billing.example/checkout');
    });
  });
});
