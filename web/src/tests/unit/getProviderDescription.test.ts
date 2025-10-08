import { describe, expect, it } from 'vitest';
import { getProviderDescription } from '@/modules/tts/getProviderDescription';
import type { Voice } from '@/modules/tts/types';

const createVoice = (overrides: Partial<Voice> = {}): Voice => ({
  id: 'test-voice',
  name: 'Test Voice',
  language: 'en-US',
  gender: 'neutral',
  provider: 'tightAss',
  metadata: {},
  ...overrides,
});

describe('getProviderDescription', () => {
  it('returns registry description for non Tight Ass providers', () => {
    expect(getProviderDescription('openAI')).toBe(
      'Neural voices with multiple expressive styles and formats.',
    );
  });

  it('describes the selected Tight Ass voice with engine details', () => {
    const voice = createVoice({
      name: 'Samantha',
      language: 'en-US',
      metadata: {
        voiceURI: 'com.apple.ttsbundle.siri_Samantha_en-US_compact',
      },
    });

    const description = getProviderDescription('tightAss', { selectedVoice: voice });

    expect(description).toContain('Samantha (en-US)');
    expect(description).toContain('macOS voice library');
  });

  it('uses fallback voices when no selection is present', () => {
    const fallbackVoice = createVoice({
      id: 'Microsoft Server Speech Text to Speech Voice (fr-CA, Noelle)',
      name: 'Noelle',
      language: 'fr-CA',
      metadata: {
        voiceURI: 'Microsoft Server Speech Text to Speech Voice (fr-CA, Noelle)',
      },
    });

    const description = getProviderDescription('tightAss', { fallbackVoices: [fallbackVoice] });

    expect(description).toContain('Noelle (fr-CA)');
    expect(description).toContain('Microsoft speech engine');
  });

  it('falls back to the generic browser speech copy when no voice data is available', () => {
    expect(getProviderDescription('tightAss')).toBe(
      'Offline synthesis using your browser speech engine.',
    );
  });
});
