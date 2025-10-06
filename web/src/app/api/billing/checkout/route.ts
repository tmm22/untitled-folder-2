import { NextResponse } from 'next/server';
import { getAccountRepository } from '@/app/api/account/context';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { createCheckoutSession } from '@/lib/billing/stripe';

export async function POST(request: Request) {
  const identity = resolveRequestIdentity(request);
  const userId = identity.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Missing account identifier' }, { status: 400 });
  }

  const repository = getAccountRepository();
  const now = Date.now();
  const trialDays = Number(process.env.PREMIUM_TRIAL_DAYS ?? '14');
  const payload = await repository.updateAccount({
    userId,
    planTier: 'starter',
    billingStatus: trialDays > 0 ? 'trial' : 'active',
    premiumExpiresAt: trialDays > 0 ? now + trialDays * 24 * 60 * 60 * 1000 : undefined,
  });

  const checkout = await createCheckoutSession({
    userId,
    planTier: 'starter',
  });

  return NextResponse.json({
    account: payload,
    checkoutUrl: checkout.url,
    message:
      checkout.message ??
      (trialDays > 0
        ? `Trial active until ${new Date(payload.premiumExpiresAt ?? 0).toISOString()}`
        : 'Subscription active'),
  });
}
