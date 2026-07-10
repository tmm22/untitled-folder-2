import type {
  ProviderSynthesisPayload,
  ProviderSynthesisResponse,
  ProviderType,
  Voice,
} from '@/modules/tts/types';

export interface ProviderSynthesisStream {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  requestId: string;
}

export interface ProviderAdapter {
  listVoices(): Promise<Voice[]>;
  synthesize(payload: ProviderSynthesisPayload): Promise<ProviderSynthesisResponse>;
  /**
   * Stream synthesized audio straight from the vendor without buffering.
   * Returns null when streaming is unavailable (no key, mock mode) so the
   * caller can fall back to synthesize().
   */
  synthesizeStream?(payload: ProviderSynthesisPayload): Promise<ProviderSynthesisStream | null>;
}

export interface ProviderContext {
  provider: ProviderType;
  apiKey?: string;
  managedCredential?: ManagedCredential;
  /**
   * Whether the adapter may fall back to the server's env API key when the
   * caller supplied no key of their own. Routes must only enable this for
   * verified identities or managed (provisioned) credentials.
   */
  allowServerKey?: boolean;
}

export type ProviderFactory = (context: ProviderContext) => ProviderAdapter;

export interface ManagedCredential {
  source: 'provisioned';
  credentialId: string;
  token: string;
  expiresAt: number;
}
