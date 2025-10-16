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
  const account = await repository.getOrCreate(userId);
  const planTier = 'starter';

  const checkout = await createCheckoutSession({
    userId,
    planTier,
  });

  return NextResponse.json({
    account,
    targetPlanTier: planTier,
    checkoutUrl: checkout.url,
    message: checkout.message ?? 'Complete checkout to activate your subscription.',
  });
}
