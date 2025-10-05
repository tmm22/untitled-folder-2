import { randomUUID } from 'node:crypto';
import type { ProviderSynthesisPayload, ProviderSynthesisResponse } from '@/modules/tts/types';

const createSilenceWav = (durationSeconds: number, sampleRate: number) => {
  const clampedDuration = Math.max(0.5, Math.min(durationSeconds, 12));
  const totalSamples = Math.round(sampleRate * clampedDuration);
  const bytesPerSample = 2; // 16-bit PCM mono
  const dataSize = totalSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // Mono channel
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // Byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // Block align
  buffer.writeUInt16LE(16, 34); // Bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Data section already zeroed by Buffer.alloc
  return buffer;
};

export const mockSynthesize = async (
  payload: ProviderSynthesisPayload,
): Promise<ProviderSynthesisResponse> => {
  const rate = payload.settings.sampleRate || 22050;
  const durationSeconds = Math.max(payload.text.length / 20 / 2, 1.2);
  const buffer = createSilenceWav(durationSeconds, rate);

  return {
    audioBase64: buffer.toString('base64'),
    audioContentType: 'audio/wav',
    transcript: undefined,
    durationMs: Math.round(durationSeconds * 1000),
    requestId: randomUUID(),
  };
};
