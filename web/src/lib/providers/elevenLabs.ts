import { randomUUID } from 'node:crypto';
import type {
  ProviderSynthesisPayload,
  ProviderSynthesisResponse,
  Voice,
} from '@/modules/tts/types';
import type { ProviderAdapter, ProviderContext } from './types';
import { mockSynthesize } from './mock';

const DEFAULT_ELEVEN_LABS_VOICES: Voice[] = [
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

const VOICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ElevenLabsVoiceLabels {
  language?: string;
  gender?: string;
  accent?: string;
  age?: string;
  description?: string;
  use_case?: string;
  [key: string]: unknown;
}

interface ElevenLabsVoiceEntry {
  voice_id: string;
  name: string;
  preview_url?: string;
  available_models?: string[];
  labels?: ElevenLabsVoiceLabels;
  category?: string;
}

interface ElevenLabsVoicesResponse {
  voices?: ElevenLabsVoiceEntry[];
}

const parseGender = (value?: string): Voice['gender'] => {
  if (!value) {
    return 'neutral';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'male') {
    return 'male';
  }

  if (normalized === 'female') {
    return 'female';
  }

  return 'neutral';
};

const normalizeLanguage = (value?: string): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 'en-US';
  }
  return trimmed;
};

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
  private cachedVoices?: { items: Voice[]; expiresAt: number };

  constructor(context: ProviderContext) {
    const managedKey = context.managedCredential?.token?.trim();
    const providedKey = context.apiKey?.trim();
    const envKey = process.env.ELEVENLABS_API_KEY?.trim();
    this.apiKey = managedKey || providedKey || envKey || undefined;
  }

  async listVoices(): Promise<Voice[]> {
    if (this.shouldUseFallback()) {
      return DEFAULT_ELEVEN_LABS_VOICES;
    }

    const cached = this.cachedVoices;
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.items;
    }

    const voices = await this.loadVoicesFromApi();
    if (voices && voices.length > 0) {
      this.cachedVoices = { items: voices, expiresAt: now + VOICE_CACHE_TTL_MS };
      return voices;
    }

    return DEFAULT_ELEVEN_LABS_VOICES;
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

  private shouldUseFallback(): boolean {
    return !this.apiKey || this.apiKey.length === 0 || process.env.MOCK_TTS === '1';
  }

  private async loadVoicesFromApi(): Promise<Voice[] | undefined> {
    if (!this.apiKey) {
      return undefined;
    }

    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': this.apiKey,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`ElevenLabs voice fetch failed (${response.status}): ${errorBody}`);
      }

      const payload = (await response.json()) as ElevenLabsVoicesResponse;
      const voices = (payload.voices ?? [])
        .map((voice) => this.transformVoice(voice))
        .filter((voice): voice is Voice => Boolean(voice));

      if (voices.length > 0) {
        return voices;
      }
    } catch (error) {
      console.error('Failed to load ElevenLabs voices from API', error);
    }

    return undefined;
  }

  private transformVoice(entry: ElevenLabsVoiceEntry): Voice | undefined {
    if (!entry.voice_id || !entry.name) {
      return undefined;
    }

    const metadata: Record<string, unknown> = {};

    if (entry.available_models && entry.available_models.length > 0) {
      metadata.availableModels = entry.available_models;
    }

    if (entry.category) {
      metadata.category = entry.category;
    }

    if (entry.labels && Object.keys(entry.labels).length > 0) {
      metadata.labels = entry.labels;
    }

    return {
      id: entry.voice_id,
      name: entry.name,
      language: normalizeLanguage(entry.labels?.language),
      gender: parseGender(entry.labels?.gender),
      provider: 'elevenLabs',
      previewUrl: entry.preview_url ?? undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  }
}

export const createElevenLabsAdapter = (context: ProviderContext): ProviderAdapter =>
  new ElevenLabsAdapter(context);
