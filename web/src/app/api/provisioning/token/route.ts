import { NextResponse } from 'next/server';
import type { PlanTier } from '@/lib/provisioning';
import { getProvisioningOrchestrator } from '@/app/api/provisioning/context';

interface TokenRequestBody {
  provider: string;
  ttlMs?: number;
  scopes?: string[];
}

const PREMIUM_STATUSES = new Set(['trial', 'active']);

const isPlanTier = (value: unknown): value is PlanTier => {
  return value === 'trial' || value === 'starter' || value === 'pro' || value === 'enterprise';
};

export async function POST(request: Request) {
  const accountId = request.headers.get('x-account-id');
  const planTier = request.headers.get('x-plan-tier');
  const planStatus = request.headers.get('x-plan-status');

  if (!accountId || !planTier || !planStatus) {
    return NextResponse.json({ error: 'Missing account headers' }, { status: 400 });
  }

  if (!isPlanTier(planTier)) {
    return NextResponse.json({ error: 'Plan tier does not allow provisioning' }, { status: 403 });
  }

  if (!PREMIUM_STATUSES.has(planStatus)) {
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
      userId: accountId,
      provider,
      planTier,
      ttlMs: body.ttlMs,
      scopes: body.scopes,
      metadata: {
        planStatus,
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
