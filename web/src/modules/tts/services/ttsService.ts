import { secureFetch, secureFetchJson } from '@/lib/fetch/secureFetch';
import { useCredentialStore } from '@/modules/credentials/store';
import {
  ClientSynthesisResult,
  ProviderSynthesisPayload,
  ProviderSynthesisResponse,
  ProviderType,
  Voice,
} from '../types';

const basePath = '/api/providers';

const VOICE_CACHE_TTL_MS = 5 * 60 * 1000;

const voiceCache = new Map<string, { voices: Voice[]; expiresAt: number }>();

const buildAuthHeaders = async (provider: ProviderType) => {
  if (typeof window === 'undefined') {
    return {} as Record<string, string>;
  }

  try {
    const actions = useCredentialStore.getState().actions;
    return await actions.getAuthHeaders(provider);
  } catch (error) {
    console.error('Unable to prepare auth headers', error);
    return {} as Record<string, string>;
  }
};

const voiceCacheKey = (provider: ProviderType, headers: Record<string, string>) =>
  `${provider}:${headers['x-ttsauth-id'] ?? headers['x-provider-key'] ?? ''}`;

export function clearVoiceCache() {
  voiceCache.clear();
}

export async function fetchVoices(provider: ProviderType): Promise<Voice[]> {
  const headers = await buildAuthHeaders(provider);
  const cacheKey = voiceCacheKey(provider, headers);
  const cached = voiceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.voices;
  }

  const voices = await secureFetchJson<Voice[]>(`${basePath}/${provider}/voices`, {
    headers,
    // Same-origin cookies carry the Clerk session for verified-identity checks.
    credentials: 'same-origin',
  });
  voiceCache.set(cacheKey, { voices, expiresAt: Date.now() + VOICE_CACHE_TTL_MS });
  return voices;
}

export async function synthesizeSpeech(
  provider: ProviderType,
  payload: ProviderSynthesisPayload,
): Promise<ClientSynthesisResult> {
  const headers = await buildAuthHeaders(provider);
  const response = await secureFetch(`${basePath}/${provider}/synthesize`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      ...headers,
      // Prefer the binary streaming path; the server falls back to JSON when
      // a provider cannot stream.
      Accept: 'audio/mpeg, audio/*;q=0.9, application/json;q=0.8',
    },
    // Same-origin cookies carry the Clerk session for verified-identity checks.
    credentials: 'same-origin',
  });

  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.toLowerCase().startsWith('audio/')) {
    const audioBlob = await response.blob();
    return {
      audioBase64: '',
      audioBlob,
      audioContentType: contentType,
      transcript: undefined,
      durationMs: undefined,
      requestId: response.headers.get('X-Request-Id') ?? crypto.randomUUID(),
    };
  }

  return (await response.json()) as ProviderSynthesisResponse;
}
