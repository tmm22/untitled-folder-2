import { randomUUID } from 'node:crypto';
import type {
  ProviderSynthesisPayload,
  ProviderSynthesisResponse,
  Voice,
} from '@/modules/tts/types';
import type { ProviderAdapter, ProviderContext } from './types';
import { mockSynthesize } from './mock';

const OPENAI_VOICES: Voice[] = [
  { id: 'alloy', name: 'Alloy', language: 'en-US', gender: 'neutral', provider: 'openAI' },
  { id: 'echo', name: 'Echo', language: 'en-US', gender: 'male', provider: 'openAI' },
  { id: 'fable', name: 'Fable', language: 'en-US', gender: 'neutral', provider: 'openAI' },
  { id: 'onyx', name: 'Onyx', language: 'en-US', gender: 'male', provider: 'openAI' },
  { id: 'nova', name: 'Nova', language: 'en-US', gender: 'female', provider: 'openAI' },
  { id: 'shimmer', name: 'Shimmer', language: 'en-US', gender: 'female', provider: 'openAI' },
];

const formatMap: Record<string, string> = {
  mp3: 'mp3',
  wav: 'wav',
  aac: 'aac',
  flac: 'flac',
};

const applyGlossary = (text: string, payload: ProviderSynthesisPayload) => {
  if (!payload.glossaryRules?.length) {
    return text;
  }

  return payload.glossaryRules.reduce((current, rule) => {
    if (rule.provider !== 'all' && rule.provider !== 'openAI') {
      return current;
    }

    if (rule.isRegex) {
      try {
        const regex = new RegExp(rule.search, 'gi');
        return current.replace(regex, rule.replace);
      } catch {
        return current;
      }
    }

    return current.split(rule.search).join(rule.replace);
  }, text);
};

class OpenAIAdapter implements ProviderAdapter {
  private apiKey?: string;

  constructor(context: ProviderContext) {
    this.apiKey = context.apiKey ?? process.env.OPENAI_API_KEY;
  }

  async listVoices(): Promise<Voice[]> {
    return OPENAI_VOICES;
  }

  async synthesize(payload: ProviderSynthesisPayload): Promise<ProviderSynthesisResponse> {
    if (!this.apiKey || process.env.MOCK_TTS === '1') {
      return mockSynthesize(payload);
    }

    const requestBody = {
      model: 'tts-1',
      input: applyGlossary(payload.text, payload),
      voice: payload.voiceId,
      response_format: formatMap[payload.settings.format] ?? 'mp3',
      speed: payload.settings.speed,
      style: {
        expressiveness: payload.settings.styleValues['expressiveness'] ?? 0.6,
        warmth: payload.settings.styleValues['warmth'] ?? 0.5,
      },
    };

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorPayload = await response.text();
      throw new Error(`OpenAI TTS failed (${response.status}): ${errorPayload}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      audioBase64: buffer.toString('base64'),
      audioContentType: response.headers.get('Content-Type') ?? 'audio/mpeg',
      transcript: undefined,
      durationMs: undefined,
      requestId: randomUUID(),
    };
  }
}

export const createOpenAIAdapter = (context: ProviderContext): ProviderAdapter => new OpenAIAdapter(context);
