import { NextResponse } from 'next/server';
import { getProvisioningOrchestrator } from '@/app/api/provisioning/context';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { getAccountRepository } from '@/app/api/account/context';
import { hasProvisioningAccess } from '@/lib/provisioning/access';

interface TokenRequestBody {
  provider: string;
  ttlMs?: number;
  scopes?: string[];
}

export async function POST(request: Request) {
  const identity = resolveRequestIdentity(request);
  const accountId = identity.userId?.trim();

  if (!accountId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const repository = getAccountRepository();
  let account;
  try {
    account = await repository.getOrCreate(accountId);
  } catch (error) {
    console.error('Provisioning token lookup failed', error);
    return NextResponse.json({ error: 'Unable to resolve account' }, { status: 500 });
  }

  if (!hasProvisioningAccess(account)) {
    return NextResponse.json({ error: 'Account is not eligible for provisioning' }, { status: 403 });
  }

  const orchestrator = getProvisioningOrchestrator();
  const body = (await request.json()) as TokenRequestBody;
  const provider = body.provider?.trim();

  if (!provider) {
    return NextResponse.json({ error: 'Missing provider' }, { status: 400 });
  }

  try {
    const response = await orchestrator.issueCredential({
      userId: account.userId,
      provider,
      planTier: account.planTier,
      ttlMs: body.ttlMs,
      scopes: body.scopes,
      metadata: {
        planStatus: account.billingStatus,
      },
    });

    return NextResponse.json({
      credentialId: response.credentialId,
      expiresAt: response.expiresAt,
      providerReference: response.providerReference,
      metadata: response.metadata,
    });
  } catch (error) {
    console.error('Provisioning issuance failed', error);
    return NextResponse.json({ error: 'Unable to issue credential' }, { status: 500 });
  }
}
