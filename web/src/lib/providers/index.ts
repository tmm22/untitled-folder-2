import type { ProviderType } from '@/modules/tts/types';
import type { ProviderAdapter, ProviderContext } from './types';
import { createOpenAIAdapter } from './openAI';
import { createElevenLabsAdapter } from './elevenLabs';
import { createGoogleAdapter } from './google';
import { createTightAssAdapter } from './tightAss';

export const resolveProviderAdapter = (context: ProviderContext): ProviderAdapter => {
  switch (context.provider) {
    case 'openAI':
      return createOpenAIAdapter(context);
    case 'elevenLabs':
      return createElevenLabsAdapter(context);
    case 'google':
      return createGoogleAdapter(context);
    case 'tightAss':
      return createTightAssAdapter(context);
    default:
      throw new Error(`Unsupported provider: ${context.provider}`);
  }
};
