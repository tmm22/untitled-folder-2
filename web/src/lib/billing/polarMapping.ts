import type {
  AccountBenefitSummary,
  AccountBillingStatus,
  AccountPlanTier,
} from '@/lib/account/types';

const KNOWN_PLAN_TIERS: ReadonlySet<AccountPlanTier> = new Set([
  'free',
  'starter',
  'pro',
  'enterprise',
]);

type PolarStatus =
  | 'trial'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'paused'
  | 'revoked'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unknown'
  | string
  | undefined;

interface PlanIdMapping {
  readonly map: Map<string, AccountPlanTier>;
  readonly fallbackPlanTier: AccountPlanTier;
}

const PLAN_ID_MAPPING: PlanIdMapping = (() => {
  const entries = Object.entries(process.env)
    .filter(([key, value]) => key.startsWith('POLAR_PLAN_ID_') && value && value.trim().length > 0)
    .map(([key, value]) => {
      const tier = key.replace('POLAR_PLAN_ID_', '').toLowerCase();
      return [value!.trim(), tier as AccountPlanTier] as const;
    });

  const defaultPlanId = process.env.POLAR_PLAN_ID?.trim();
  if (defaultPlanId && defaultPlanId.length > 0) {
    entries.push([defaultPlanId, 'starter']);
  }

  const map = new Map<string, AccountPlanTier>();
  for (const [planId, tier] of entries) {
    if (KNOWN_PLAN_TIERS.has(tier)) {
      map.set(planId, tier);
    }
  }

  const firstPlanTier = map.values().next().value;
  const defaultPlanTier: AccountPlanTier =
    (firstPlanTier && KNOWN_PLAN_TIERS.has(firstPlanTier)) ? firstPlanTier : 'starter';

  return {
    map,
    fallbackPlanTier: defaultPlanTier,
  };
})();

function normalizePlanTier(value: unknown): AccountPlanTier | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.toLowerCase() as AccountPlanTier;
  return KNOWN_PLAN_TIERS.has(normalized) ? normalized : null;
}

function parseTimestamp(value: unknown): number | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export function resolvePlanTierFromPolar({
  metadataPlanTier,
  productId,
}: {
  metadataPlanTier?: unknown;
  productId?: unknown;
}): AccountPlanTier {
  const metadataTier = normalizePlanTier(metadataPlanTier);
  if (metadataTier && metadataTier !== 'free') {
    return metadataTier;
  }

  if (typeof productId === 'string') {
    const mapped = PLAN_ID_MAPPING.map.get(productId.trim());
    if (mapped) {
      return mapped;
    }
  }

  return PLAN_ID_MAPPING.fallbackPlanTier;
}

export function resolveBillingStatusFromPolar(status: PolarStatus): AccountBillingStatus {
  switch (status) {
    case 'trial':
    case 'trialing':
      return 'active';
    case 'active':
      return 'active';
    case 'past_due':
    case 'paused':
    case 'incomplete':
    case 'incomplete_expired':
      return 'past_due';
    case 'canceled':
    case 'revoked':
      return 'canceled';
    default:
      return 'active';
  }
}

export function resolvePremiumExpiryFromPolar(
  subscription: { trialEnd?: unknown; currentPeriodEnd?: unknown; endsAt?: unknown },
): number | undefined {
  const trialEnd = parseTimestamp(subscription?.trialEnd);
  if (trialEnd) {
    return trialEnd;
  }

  const currentPeriod =
    parseTimestamp(subscription?.currentPeriodEnd) ?? parseTimestamp(subscription?.endsAt);
  return currentPeriod ?? undefined;
}

export function resolvePolarCurrentPeriodEnd(subscription: {
  currentPeriodEnd?: unknown;
  endsAt?: unknown;
}): number | undefined {
  return parseTimestamp(subscription?.currentPeriodEnd) ?? parseTimestamp(subscription?.endsAt);
}

export function resolvePolarPlanId(subscription: {
  productId?: unknown;
  product?: { id?: unknown } | null;
}): string | undefined {
  if (typeof subscription?.productId === 'string') {
    return subscription.productId;
  }
  const product = (subscription?.product ?? undefined) as { id?: unknown } | undefined;
  if (product && typeof product.id === 'string') {
    return product.id;
  }
  return undefined;
}

export function extractPolarBenefits(benefits: unknown): AccountBenefitSummary[] | undefined {
  if (!Array.isArray(benefits)) {
    return undefined;
  }

  const summaries: AccountBenefitSummary[] = [];
  for (const entry of benefits) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const id = typeof entry.id === 'string' ? entry.id : undefined;
    if (!id) {
      continue;
    }
    const nameCandidates = [
      typeof entry.name === 'string' ? entry.name : null,
      typeof entry.description === 'string' ? entry.description : null,
      typeof entry.type === 'string' ? entry.type : null,
    ];
    const firstName = nameCandidates.find((value) => value && value.trim().length > 0) ?? undefined;
    if (!firstName) {
      continue;
    }
    summaries.push({ id, name: firstName });
  }

  return summaries.length > 0 ? summaries : undefined;
}
