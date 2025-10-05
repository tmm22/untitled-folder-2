import { randomUUID } from 'node:crypto';
import type {
  ProviderSynthesisPayload,
  ProviderSynthesisResponse,
  Voice,
} from '@/modules/tts/types';
import type { ProviderAdapter, ProviderContext } from './types';
import { mockSynthesize } from './mock';

const GOOGLE_VOICES: Voice[] = [
  { id: 'en-US-Neural2-A', name: 'Neural2 Male A', language: 'en-US', gender: 'male', provider: 'google' },
  { id: 'en-US-Neural2-C', name: 'Neural2 Female C', language: 'en-US', gender: 'female', provider: 'google' },
  { id: 'en-US-Neural2-D', name: 'Neural2 Male D', language: 'en-US', gender: 'male', provider: 'google' },
  { id: 'en-US-Neural2-F', name: 'Neural2 Female F', language: 'en-US', gender: 'female', provider: 'google' },
  { id: 'en-US-Wavenet-C', name: 'WaveNet Female C', language: 'en-US', gender: 'female', provider: 'google' },
  { id: 'en-US-Wavenet-D', name: 'WaveNet Male D', language: 'en-US', gender: 'male', provider: 'google' },
  { id: 'en-US-Standard-C', name: 'Standard Female C', language: 'en-US', gender: 'female', provider: 'google' },
  { id: 'en-US-Standard-D', name: 'Standard Male D', language: 'en-US', gender: 'male', provider: 'google' },
];

const encodingMap: Record<string, string> = {
  mp3: 'MP3',
  wav: 'LINEAR16',
  aac: 'OGG_OPUS',
  flac: 'FLAC',
};

const applyGlossary = (text: string, payload: ProviderSynthesisPayload) => {
  if (!payload.glossaryRules?.length) {
    return text;
  }

  return payload.glossaryRules.reduce((current, rule) => {
    if (rule.provider !== 'all' && rule.provider !== 'google') {
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

const ssmlGenderMap = {
  male: 'MALE',
  female: 'FEMALE',
  neutral: 'NEUTRAL',
} as const;

const resolveLanguageCode = (voiceId: string) => voiceId.split('-').slice(0, 2).join('-');

class GoogleTTSAdapter implements ProviderAdapter {
  private apiKey?: string;

  constructor(context: ProviderContext) {
    this.apiKey = context.apiKey ?? process.env.GOOGLE_TTS_API_KEY;
  }

  async listVoices(): Promise<Voice[]> {
    return GOOGLE_VOICES;
  }

  async synthesize(payload: ProviderSynthesisPayload): Promise<ProviderSynthesisResponse> {
    if (!this.apiKey || process.env.MOCK_TTS === '1') {
      return mockSynthesize(payload);
    }

    const languageCode = resolveLanguageCode(payload.voiceId);
    const voice = GOOGLE_VOICES.find((candidate) => candidate.id === payload.voiceId);
    const ssmlGender = voice ? ssmlGenderMap[voice.gender] : 'NEUTRAL';

    const requestBody = {
      input: {
        text: applyGlossary(payload.text, payload),
      },
      voice: {
        languageCode,
        name: payload.voiceId,
        ssmlGender,
      },
      audioConfig: {
        audioEncoding: encodingMap[payload.settings.format] ?? 'MP3',
        speakingRate: payload.settings.styleValues['speakingRate'] ?? payload.settings.speed,
        pitch: payload.settings.styleValues['pitch'] ?? 0,
        volumeGainDb: (payload.settings.volume - 0.75) * 10,
        sampleRateHertz: payload.settings.sampleRate,
      },
    };

    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google TTS failed (${response.status}): ${text}`);
    }

    const json = await response.json();

    return {
      audioBase64: json.audioContent,
      audioContentType: 'audio/mpeg',
      transcript: undefined,
      durationMs: undefined,
      requestId: randomUUID(),
    };
  }
}

export const createGoogleAdapter = (context: ProviderContext): ProviderAdapter => new GoogleTTSAdapter(context);
