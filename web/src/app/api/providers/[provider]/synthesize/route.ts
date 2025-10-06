import { NextResponse } from 'next/server';
import type { ProviderSynthesisPayload, ProviderType } from '@/modules/tts/types';
import { resolveProviderAdapter } from '@/lib/providers';
import { resolveProviderAuthorization } from '@/app/api/_lib/providerAuth';
import { getProvisioningStore } from '@/app/api/provisioning/context';
import { getAccountRepository } from '@/app/api/account/context';

interface RouteParams {
  params: {
    provider: string;
  };
}

export async function POST(request: Request, { params }: RouteParams) {
  const provider = params.provider as ProviderType;
  let payload: ProviderSynthesisPayload;

  try {
    payload = (await request.json()) as ProviderSynthesisPayload;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!payload?.text || !payload.voiceId || !payload.settings) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const authorization = await resolveProviderAuthorization(request, provider);

  try {
    const adapter = resolveProviderAdapter({
      provider,
      apiKey: authorization.apiKey,
      managedCredential: authorization.managedCredential,
    });
    const result = await adapter.synthesize(payload);
    const accountId = request.headers.get('x-account-id');
    const tokensUsed = Math.max(0, Math.round(payload.text.length));

    if (accountId) {
      const accountRepo = getAccountRepository();
      await accountRepo.recordUsage(accountId, provider, tokensUsed);
    }

    const store = getProvisioningStore();
    if (typeof store.recordUsage === 'function' && accountId) {
      await store.recordUsage({
        userId: accountId,
        provider,
        tokensUsed,
        costMinorUnits: 0,
        recordedAt: Date.now(),
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to synthesize speech',
      },
      { status: 500 },
    );
  }
}
