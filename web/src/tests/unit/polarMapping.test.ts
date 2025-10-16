import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractPolarBenefits,
  resolveBillingStatusFromPolar,
  resolvePlanTierFromPolar,
  resolvePolarCurrentPeriodEnd,
  resolvePremiumExpiryFromPolar,
} from '@/lib/billing/polarMapping';

const originalEnv = { ...process.env };

describe('Polar mapping helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('resolvePlanTierFromPolar', () => {
    it('prefers metadata plan tier when provided', () => {
      const tier = resolvePlanTierFromPolar({ metadataPlanTier: 'pro' });
      expect(tier).toBe('pro');
    });

    it('falls back to plan ID mapping when metadata is absent', () => {
      process.env.POLAR_PLAN_ID_STARTER = 'prod_starter';
      const tier = resolvePlanTierFromPolar({ productId: 'prod_starter' });
      expect(tier).toBe('starter');
    });

    it('defaults to starter when mapping is missing', () => {
      delete process.env.POLAR_PLAN_ID_STARTER;
      const tier = resolvePlanTierFromPolar({ productId: 'unknown' });
      expect(tier).toBe('starter');
    });
  });

  describe('resolveBillingStatusFromPolar', () => {
    it.each([
      ['trial', 'active'],
      ['trialing', 'active'],
      ['active', 'active'],
      ['past_due', 'past_due'],
      ['incomplete', 'past_due'],
      ['canceled', 'canceled'],
      ['revoked', 'canceled'],
      ['unknown', 'active'],
    ])('maps %s to %s', (input, expected) => {
      expect(resolveBillingStatusFromPolar(input)).toBe(expected);
    });
  });

  describe('resolvePremiumExpiryFromPolar', () => {
    it('prefers trial end when available', () => {
      const now = new Date();
      const expires = resolvePremiumExpiryFromPolar({ trialEnd: now.toISOString() });
      expect(expires).toBeTypeOf('number');
      expect(expires).toBeCloseTo(now.getTime(), -2);
    });

    it('falls back to current period end', () => {
      const future = Date.now() + 86400000;
      const expires = resolvePremiumExpiryFromPolar({ currentPeriodEnd: future });
      expect(expires).toBe(future);
    });
  });

  describe('resolvePolarCurrentPeriodEnd', () => {
    it('returns numeric timestamp when available', () => {
      const future = Date.now() + 42_000;
      expect(resolvePolarCurrentPeriodEnd({ currentPeriodEnd: future })).toBe(future);
      const iso = new Date().toISOString();
      expect(resolvePolarCurrentPeriodEnd({ currentPeriodEnd: iso })).toBeTypeOf('number');
    });
  });

  describe('extractPolarBenefits', () => {
    it('returns simplified benefit summaries', () => {
      const benefits = extractPolarBenefits([
        { id: 'benefit_1', description: 'License Keys' },
        { id: 'benefit_2', name: 'Downloads' },
        { id: 'invalid' },
      ]);
      expect(benefits).toEqual([
        { id: 'benefit_1', name: 'License Keys' },
        { id: 'benefit_2', name: 'Downloads' },
      ]);
    });

    it('returns undefined when no benefits are provided', () => {
      expect(extractPolarBenefits(undefined)).toBeUndefined();
      expect(extractPolarBenefits(null)).toBeUndefined();
      expect(extractPolarBenefits([{ foo: 'bar' }])).toBeUndefined();
    });
  });
});
