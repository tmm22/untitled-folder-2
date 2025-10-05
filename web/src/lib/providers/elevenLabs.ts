import { randomUUID } from 'node:crypto';
import type {
  ProviderSynthesisPayload,
  ProviderSynthesisResponse,
  Voice,
} from '@/modules/tts/types';
import type { ProviderAdapter, ProviderContext } from './types';
import { mockSynthesize } from './mock';

const ELEVEN_LABS_VOICES: Voice[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', language: 'en-US', gender: 'female', provider: 'elevenLabs' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', language: 'en-US', gender: 'female', provider: 'elevenLabs' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', language: 'en-US', gender: 'female', provider: 'elevenLabs' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', language: 'en-US', gender: 'male', provider: 'elevenLabs' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', language: 'en-US', gender: 'female', provider: 'elevenLabs' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', language: 'en-US', gender: 'male', provider: 'elevenLabs' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', language: 'en-US', gender: 'male', provider: 'elevenLabs' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', language: 'en-US', gender: 'male', provider: 'elevenLabs' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', language: 'en-US', gender: 'male', provider: 'elevenLabs' },
];

const applyGlossary = (text: string, payload: ProviderSynthesisPayload) => {
  if (!payload.glossaryRules?.length) {
    return text;
  }

  return payload.glossaryRules.reduce((current, rule) => {
    if (rule.provider !== 'all' && rule.provider !== 'elevenLabs') {
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

class ElevenLabsAdapter implements ProviderAdapter {
  private apiKey?: string;

  constructor(context: ProviderContext) {
    this.apiKey = context.apiKey ?? process.env.ELEVENLABS_API_KEY;
  }

  async listVoices(): Promise<Voice[]> {
    return ELEVEN_LABS_VOICES;
  }

  async synthesize(payload: ProviderSynthesisPayload): Promise<ProviderSynthesisResponse> {
    if (!this.apiKey || process.env.MOCK_TTS === '1') {
      return mockSynthesize(payload);
    }

    const requestBody = {
      text: applyGlossary(payload.text, payload),
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: payload.settings.styleValues['stability'] ?? 0.5,
        similarity_boost: payload.settings.styleValues['similarityBoost'] ?? 0.75,
        style: payload.settings.styleValues['styleExaggeration'] ?? 0.65,
        use_speaker_boost: true,
      },
    };

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${payload.voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ElevenLabs TTS failed (${response.status}): ${text}`);
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

export const createElevenLabsAdapter = (context: ProviderContext): ProviderAdapter =>
  new ElevenLabsAdapter(context);
