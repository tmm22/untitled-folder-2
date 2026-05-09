import { secureFetchJson } from '@/lib/fetch/secureFetch';
import { useCredentialStore } from '@/modules/credentials/store';
import type { ProviderType } from '@/modules/tts/types';

export interface TTSRealtimeSession {
  enabled: boolean;
  model: string;
  websocketUrl: string;
  session: {
    id?: string;
    client_secret?: {
      value?: string;
      expires_at?: number;
    };
    expires_at?: number;
    [key: string]: unknown;
  };
}

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

export async function createTTSRealtimeSession(provider: ProviderType, voice?: string): Promise<TTSRealtimeSession> {
  const headers = await buildAuthHeaders(provider);
  return secureFetchJson<TTSRealtimeSession>(`/api/providers/${provider}/realtime/session`, {
    method: 'POST',
    body: JSON.stringify({ voice }),
    headers,
    credentials: 'include',
  });
}
