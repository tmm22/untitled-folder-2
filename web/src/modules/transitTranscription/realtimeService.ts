import { secureFetchJson } from '@/lib/fetch/secureFetch';

export interface TransitRealtimeSession {
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

interface RealtimeSessionOptions {
  languageHint?: string;
}

export async function createTransitRealtimeSession(
  options: RealtimeSessionOptions = {},
): Promise<TransitRealtimeSession> {
  return secureFetchJson<TransitRealtimeSession>('/api/transit/realtime/session', {
    method: 'POST',
    body: JSON.stringify({
      languageHint: options.languageHint,
    }),
    credentials: 'include',
  });
}
