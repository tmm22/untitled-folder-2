import type {
  ProviderSynthesisPayload,
  ProviderSynthesisResponse,
  ProviderType,
  Voice,
} from '@/modules/tts/types';

export interface ProviderAdapter {
  listVoices(): Promise<Voice[]>;
  synthesize(payload: ProviderSynthesisPayload): Promise<ProviderSynthesisResponse>;
}

export interface ProviderContext {
  provider: ProviderType;
  apiKey?: string;
  managedCredential?: ManagedCredential;
}

export type ProviderFactory = (context: ProviderContext) => ProviderAdapter;

export interface ManagedCredential {
  source: 'provisioned';
  credentialId: string;
  token: string;
  expiresAt: number;
}
