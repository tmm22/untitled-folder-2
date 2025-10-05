import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mockSynthesize } from '@/lib/providers/mock';
import type { ProviderSynthesisPayload } from '@/modules/tts/types';

describe('Tight Ass provider (system synthesis disabled)', () => {
  beforeEach(() => {
    process.env.TTS_DISABLE_SAY = '1';
  });

  afterEach(() => {
    delete process.env.TTS_DISABLE_SAY;
  });

  test('returns default voice when system synthesis is disabled', async () => {
    const { createTightAssAdapter } = await import('@/lib/providers/tightAss');
    const adapter = createTightAssAdapter({ provider: 'tightAss' });

    const voices = await adapter.listVoices();
    expect(voices).toHaveLength(1);
    expect(voices[0]?.id).toBe('Alex');
  });

  test('falls back to mock synthesis when system synthesis is disabled', async () => {
    const payload: ProviderSynthesisPayload = {
      text: 'Local synthesis test',
      voiceId: 'Alex',
      settings: {
        speed: 1,
        pitch: 1,
        volume: 0.75,
        format: 'wav',
        sampleRate: 22050,
        styleValues: {},
      },
    };

    const expected = await mockSynthesize(payload);

    const { createTightAssAdapter } = await import('@/lib/providers/tightAss');
    const adapter = createTightAssAdapter({ provider: 'tightAss' });
    const response = await adapter.synthesize(payload);

    expect(response.audioContentType).toBe(expected.audioContentType);
    expect(response.audioBase64).toBe(expected.audioBase64);
  });
});

