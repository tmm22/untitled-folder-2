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
}

export type ProviderFactory = (context: ProviderContext) => ProviderAdapter;
