import { NextResponse } from 'next/server';
import { getAccountRepository } from '@/app/api/account/context';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { createBillingPortalSession } from '@/lib/billing';

export async function POST(request: Request) {
  const identity = resolveRequestIdentity(request);
  const userId = identity.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Missing account identifier' }, { status: 400 });
  }

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
