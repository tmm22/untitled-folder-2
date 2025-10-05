import { describe, expect, test } from 'vitest';
import { mockSynthesize } from '@/lib/providers/mock';
import type { ProviderSynthesisPayload } from '@/modules/tts/types';

const basePayload: ProviderSynthesisPayload = {
  text: 'Testing the browser-safe mock speech generator.',
  voiceId: 'demo-voice',
  settings: {
    speed: 1,
    pitch: 1,
    volume: 0.75,
    format: 'mp3',
    sampleRate: 22050,
    styleValues: {},
  },
};

describe('mockSynthesize', () => {
  test('produces audible waveform data', async () => {
    const result = await mockSynthesize(basePayload);
    const buffer = Buffer.from(result.audioBase64, 'base64');

    expect(buffer.byteLength).toBeGreaterThan(44);

    const sampleCount = Math.floor((buffer.length - 44) / 2);
    const samples = new Int16Array(buffer.buffer, buffer.byteOffset + 44, sampleCount);
    let maxAmplitude = 0;

    for (let index = 0; index < samples.length; index += 1) {
      const amplitude = Math.abs(samples[index]);
      if (amplitude > maxAmplitude) {
        maxAmplitude = amplitude;
      }
    }

    expect(maxAmplitude).toBeGreaterThan(250); // Silent buffers would remain near zero.
  });
});

