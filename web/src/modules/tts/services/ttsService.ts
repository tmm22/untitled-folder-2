import { secureFetchJson } from '@/lib/fetch/secureFetch';
import { useCredentialStore } from '@/modules/credentials/store';
import {
  ProviderSynthesisPayload,
  ProviderSynthesisResponse,
  ProviderType,
  Voice,
} from '../types';

const basePath = '/api/providers';

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

export async function fetchVoices(provider: ProviderType): Promise<Voice[]> {
  const headers = await buildAuthHeaders(provider);
  const response = await secureFetchJson<Voice[]>(`${basePath}/${provider}/voices`, { headers });
  return response;
}

export async function synthesizeSpeech(
  provider: ProviderType,
  payload: ProviderSynthesisPayload,
): Promise<ProviderSynthesisResponse> {
  const headers = await buildAuthHeaders(provider);
  const response = await secureFetchJson<ProviderSynthesisResponse>(
    `${basePath}/${provider}/synthesize`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers,
    },
  );

  return response;
}
