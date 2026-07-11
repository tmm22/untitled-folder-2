import { NextResponse } from 'next/server';
import type { ProviderSynthesisPayload, ProviderType } from '@/modules/tts/types';
import { resolveProviderAdapter } from '@/lib/providers';
import { resolveProviderAuthorization } from '@/app/api/_lib/providerAuth';
import { isAuthFailure, requireVerifiedIdentity } from '@/app/api/_lib/requireAuth';
import { getProvisioningStore } from '@/app/api/provisioning/context';
import { getAccountRepository, getAccountRepositoryKind } from '@/app/api/account/context';
import { resolveRequestIdentity } from '@/lib/auth/identity';

const SUPPORTED_PROVIDERS: readonly ProviderType[] = ['openAI', 'elevenLabs', 'google', 'tightAss'];
const MAX_TEXT_LENGTH = 20_000;

function parseProvider(value: string | undefined): ProviderType | undefined {
  return SUPPORTED_PROVIDERS.find((candidate) => candidate === value);
}

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
  const provider = parseProvider(params.provider);

  if (!provider) {
    return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
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

  if (typeof payload.text !== 'string' || payload.text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text exceeds the maximum length of ${MAX_TEXT_LENGTH} characters` },
      { status: 400 },
    );
  }

  const authorization = await resolveProviderAuthorization(request, provider);
  const identity = resolveRequestIdentity(request);
  const accountId = identity.userId ?? null;

  // Spending the server's provider key requires a verified identity and an
  // atomic quota reservation. BYOK callers bring their own key and skip the
  // quota; managed (provisioned) callers spend the server key like everyone
  // else and reserve against their tier's allowance.
  const hasByokCredential = Boolean(authorization.apiKey);
  const usesServerKey = !hasByokCredential;
  const tokenCount = payload.text.length;
  let reservedTokens = 0;
  if (usesServerKey) {
    const verified = requireVerifiedIdentity(request);
    if (isAuthFailure(verified)) {
      return verified;
    }
    // Quota enforcement needs the durable store; refuse rather than fall back
    // to per-instance memory in production.
    if (process.env.NODE_ENV === 'production' && getAccountRepositoryKind() !== 'convex') {
      return NextResponse.json({ error: 'Usage service is temporarily unavailable.' }, { status: 503 });
    }
    const reservation = await getAccountRepository().reserveUsage(verified.userId, provider, tokenCount);
    if (!reservation) {
      return NextResponse.json({ error: 'Usage quota exceeded.' }, { status: 429 });
    }
    reservedTokens = tokenCount;
  }

  const recordUsage = async () => {
    // Synthesis has succeeded: the reservation is spent, so a failure past
    // this point must not refund it.
    reservedTokens = 0;
    if (!accountId) {
      return;
    }
    const tokensUsed = tokenCount;
    if (hasByokCredential) {
      const accountRepo = getAccountRepository();
      await accountRepo.recordUsage(accountId, provider, tokensUsed);
    }

    const store = getProvisioningStore();
    if ('recordUsage' in store) {
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
  };

  const wantsAudio = (request.headers.get('accept') ?? '').toLowerCase().includes('audio/');

  try {
    const adapter = resolveProviderAdapter({
      provider,
      apiKey: authorization.apiKey,
      managedCredential: authorization.managedCredential,
      allowServerKey: true,
    });

    if (wantsAudio) {
      // Binary path: pipe vendor audio through as it arrives so playback can
      // start downloading during synthesis instead of after it.
      const streamed = adapter.synthesizeStream ? await adapter.synthesizeStream(payload) : null;
      if (streamed) {
        await recordUsage();
        return new Response(streamed.stream, {
          status: 200,
          headers: {
            'Content-Type': streamed.contentType,
            'Cache-Control': 'no-store',
            'X-Request-Id': streamed.requestId,
          },
        });
      }

      const result = await adapter.synthesize(payload);
      await recordUsage();
      const bytes = Buffer.from(result.audioBase64, 'base64');
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'Content-Type': result.audioContentType,
          'Content-Length': String(bytes.byteLength),
          'Cache-Control': 'no-store',
          'X-Request-Id': result.requestId,
        },
      });
    }

    const result = await adapter.synthesize(payload);
    await recordUsage();

    return NextResponse.json(result);
  } catch (error) {
    if (reservedTokens > 0 && accountId) {
      try {
        await getAccountRepository().releaseUsage(accountId, reservedTokens);
      } catch (releaseError) {
        console.error('Failed to release reserved synthesis usage', releaseError);
      }
    }
    console.error('Failed to synthesize speech', error);
    return NextResponse.json(
      {
        error: sanitizeSynthesisError(error),
      },
      { status: 500 },
    );
  }
}
