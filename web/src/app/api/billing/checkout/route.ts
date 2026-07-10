import { NextResponse } from 'next/server';
import { getAccountRepository } from '@/app/api/account/context';
import { isAuthFailure, requireVerifiedIdentity } from '@/app/api/_lib/requireAuth';
import { createCheckoutSession } from '@/lib/billing';

export async function POST(request: Request) {
  const verified = requireVerifiedIdentity(request);
  if (isAuthFailure(verified)) {
    return verified;
  }
  const userId = verified.userId;

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
