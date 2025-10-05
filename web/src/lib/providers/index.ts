import type { ProviderType } from '@/modules/tts/types';
import type { ProviderAdapter, ProviderContext } from './types';
import { createOpenAIAdapter } from './openAI';
import { createElevenLabsAdapter } from './elevenLabs';
import { createGoogleAdapter } from './google';
import { mockSynthesize } from './mock';

export const resolveProviderAdapter = (context: ProviderContext): ProviderAdapter => {
  switch (context.provider) {
    case 'openAI':
      return createOpenAIAdapter(context);
    case 'elevenLabs':
      return createElevenLabsAdapter(context);
    case 'google':
      return createGoogleAdapter(context);
    case 'tightAss':
      return {
        async listVoices() {
          return [
            { id: 'browser-default', name: 'Browser Default', language: 'en-US', gender: 'neutral', provider: 'tightAss' },
          ];
        },
        async synthesize(payload) {
          return mockSynthesize(payload);
        },
      };
    default:
      throw new Error(`Unsupported provider: ${context.provider}`);
  }
};
