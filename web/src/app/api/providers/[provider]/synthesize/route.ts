import { NextResponse } from 'next/server';
import type { ProviderSynthesisPayload, ProviderType } from '@/modules/tts/types';
import { resolveProviderAdapter } from '@/lib/providers';
import { resolveProviderAuthorization } from '@/app/api/_lib/providerAuth';
import { getProvisioningStore } from '@/app/api/provisioning/context';
import { getAccountRepository } from '@/app/api/account/context';
import { resolveRequestIdentity } from '@/lib/auth/identity';

type ProviderRouteContext = {
  params: Promise<{
    provider?: string;
  }>;
};

type ProvisioningUsageRecorder = {
  recordUsage: (input: {
    userId: string;
    provider: ProviderType;
    tokensUsed: number;
    costMinorUnits: number;
    recordedAt: number;
  }) => Promise<unknown>;
};

function sanitizeSynthesisError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Failed to synthesize speech';
  }
  if (error.message.includes('API key') || error.message.includes('401') || error.message.includes('403')) {
    return 'Authentication failed. Please check your API key.';
  }
  if (error.message.includes('rate limit') || error.message.includes('429')) {
    return 'Rate limit exceeded. Please try again later.';
  }
  if (error.message.includes('quota') || error.message.includes('limit exceeded')) {
    return 'Usage quota exceeded.';
  }
  if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
    return 'Request timed out. Please try again.';
  }
  if (error.message.includes('voice') && error.message.includes('not found')) {
    return 'The selected voice is not available.';
  }
  return 'Failed to synthesize speech';
}

export async function POST(request: Request, context: ProviderRouteContext) {
  const params = await context.params;
  const provider = params.provider as ProviderType | undefined;

  if (!provider) {
    return NextResponse.json({ error: 'Missing provider' }, { status: 400 });
  }
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
  const identity = resolveRequestIdentity(request);
  const accountId = identity.userId ?? null;

  try {
    const adapter = resolveProviderAdapter({
      provider,
      apiKey: authorization.apiKey,
      managedCredential: authorization.managedCredential,
    });
    const result = await adapter.synthesize(payload);
    const tokensUsed = Math.max(0, Math.round(payload.text.length));

    if (accountId) {
      const accountRepo = getAccountRepository();
      await accountRepo.recordUsage(accountId, provider, tokensUsed);
    }

    const store = getProvisioningStore();
    if (accountId && 'recordUsage' in store) {
      const usageStore = store as unknown as ProvisioningUsageRecorder;
      if (typeof usageStore.recordUsage === 'function') {
        await usageStore.recordUsage({
          userId: accountId,
          provider,
          tokensUsed,
          costMinorUnits: 0,
          recordedAt: Date.now(),
        });
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to synthesize speech', error);
    return NextResponse.json(
      {
        error: sanitizeSynthesisError(error),
      },
      { status: 500 },
    );
  }
}
