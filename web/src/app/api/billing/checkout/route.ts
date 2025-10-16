import { NextResponse } from 'next/server';
import { getAccountRepository } from '@/app/api/account/context';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { createCheckoutSession } from '@/lib/billing';

export async function POST(request: Request) {
  const identity = resolveRequestIdentity(request);
  const userId = identity.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Missing account identifier' }, { status: 400 });
  }

  const repository = getAccountRepository();
  const payload = await repository.updateAccount({
    userId,
    planTier: 'starter',
    billingStatus: 'active',
    premiumExpiresAt: undefined,
  });

  const checkout = await createCheckoutSession({
    userId,
    planTier: 'starter',
  });

  return NextResponse.json({
    account: payload,
    checkoutUrl: checkout.url,
    message: checkout.message ?? 'Subscription active',
  });
}
