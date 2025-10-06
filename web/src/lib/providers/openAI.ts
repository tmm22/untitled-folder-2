import { randomUUID } from 'node:crypto';
import type {
  ProviderSynthesisPayload,
  ProviderSynthesisResponse,
  Voice,
} from '@/modules/tts/types';
import type { ProviderAdapter, ProviderContext } from './types';
import { mockSynthesize } from './mock';

const DEFAULT_OPENAI_VOICES: Voice[] = [
  { id: 'alloy', name: 'Alloy', language: 'en-US', gender: 'neutral', provider: 'openAI' },
  { id: 'amber', name: 'Amber', language: 'en-US', gender: 'female', provider: 'openAI' },
  { id: 'cobalt', name: 'Cobalt', language: 'en-US', gender: 'male', provider: 'openAI' },
  { id: 'nova', name: 'Nova', language: 'en-US', gender: 'female', provider: 'openAI' },
  { id: 'onyx', name: 'Onyx', language: 'en-US', gender: 'male', provider: 'openAI' },
  { id: 'verse', name: 'Verse', language: 'en-US', gender: 'neutral', provider: 'openAI' },
];

const VOICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface OpenAIVoice {
  voice_id: string;
  display_name: string;
  gender?: string;
  language?: string;
  preview_url?: string;
  description?: string;
  settings?: Record<string, unknown>;
}

interface OpenAIVoiceResponse {
  voices?: OpenAIVoice[];
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

const parseLanguage = (value?: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    return 'en-US';
  }
  return normalized;
};

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
  private cachedVoices?: { items: Voice[]; expiresAt: number };

  constructor(context: ProviderContext) {
    const managedKey = context.managedCredential?.token?.trim();
    const providedKey = context.apiKey?.trim();
    const envKey = process.env.OPENAI_API_KEY?.trim();
    this.apiKey = managedKey || providedKey || envKey || undefined;
  }

  async listVoices(): Promise<Voice[]> {
    if (this.shouldUseFallback()) {
      return DEFAULT_OPENAI_VOICES;
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

    return DEFAULT_OPENAI_VOICES;
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

  private shouldUseFallback() {
    return !this.apiKey || this.apiKey.length === 0 || process.env.MOCK_TTS === '1';
  }

  private async loadVoicesFromApi(): Promise<Voice[] | undefined> {
    if (!this.apiKey) {
      return undefined;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/audio/voices', {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`OpenAI voice fetch failed (${response.status}): ${errorBody}`);
      }

      const payload = (await response.json()) as OpenAIVoiceResponse;
      const voices = (payload.voices ?? [])
        .map((voice) => this.transformVoice(voice))
        .filter((voice): voice is Voice => Boolean(voice));

      if (voices.length > 0) {
        return voices;
      }
    } catch (error) {
      console.error('Failed to load OpenAI voices from API', error);
    }

    return undefined;
  }

  private transformVoice(voice: OpenAIVoice): Voice | undefined {
    if (!voice.voice_id || !voice.display_name) {
      return undefined;
    }

    const metadata: Record<string, unknown> = {};

    if (voice.description) {
      metadata.description = voice.description;
    }

    if (voice.settings && Object.keys(voice.settings).length > 0) {
      metadata.settings = voice.settings;
    }

    return {
      id: voice.voice_id,
      name: voice.display_name,
      language: parseLanguage(voice.language),
      gender: parseGender(voice.gender),
      provider: 'openAI',
      previewUrl: voice.preview_url,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  }
}

export const createOpenAIAdapter = (context: ProviderContext): ProviderAdapter => new OpenAIAdapter(context);
