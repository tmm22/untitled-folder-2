import { NextResponse } from 'next/server';
import { getAccountRepository } from '@/app/api/account/context';
import { isAuthFailure, requireVerifiedIdentity } from '@/app/api/_lib/requireAuth';
import { createBillingPortalSession } from '@/lib/billing';

export async function POST(request: Request) {
  const verified = requireVerifiedIdentity(request);
  if (isAuthFailure(verified)) {
    return verified;
  }
  const userId = verified.userId;

  const repository = getAccountRepository();
  const account = await repository.getOrCreate(userId);
  const portal = await createBillingPortalSession({
    customerId: account.userId,
    externalCustomerId: account.userId,
    providerCustomerId: account.polarCustomerId,
  });

  return NextResponse.json({
    account,
    portalUrl: portal.url,
    message: portal.message,
    ok: portal.ok,
  });
}
