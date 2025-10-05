import { randomUUID } from 'node:crypto';
import type { ProviderSynthesisPayload, ProviderSynthesisResponse } from '@/modules/tts/types';

interface SegmentGeneratorOptions {
  duration: number;
  sampleRate: number;
  rng: () => number;
  basePitch: number;
  emphasis: number;
}

interface SegmentProfile {
  char: string;
  baseDuration: number;
  generator: (options: SegmentGeneratorOptions) => Float32Array;
}

interface PreparedSegment {
  char: string;
  duration: number;
  generator: (options: SegmentGeneratorOptions) => Float32Array;
}

const writeWaveHeader = (buffer: Buffer, sampleRate: number, dataSize: number) => {
  const bytesPerSample = 2; // 16-bit PCM mono

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
};

const vowelProfiles: Record<string, { f1: number; f2: number; f3: number }> = {
  a: { f1: 750, f2: 1100, f3: 2450 },
  e: { f1: 500, f2: 1950, f3: 2450 },
  i: { f1: 340, f2: 2300, f3: 3000 },
  o: { f1: 480, f2: 900, f3: 2400 },
  u: { f1: 370, f2: 800, f3: 2200 },
};

const consonantProfiles: Record<string, { noise: number; bandwidth: number }> = {
  f: { noise: 0.65, bandwidth: 0.55 },
  s: { noise: 0.75, bandwidth: 0.75 },
  h: { noise: 0.5, bandwidth: 0.4 },
  t: { noise: 0.7, bandwidth: 0.3 },
  k: { noise: 0.7, bandwidth: 0.4 },
  p: { noise: 0.65, bandwidth: 0.25 },
  b: { noise: 0.55, bandwidth: 0.25 },
  d: { noise: 0.55, bandwidth: 0.3 },
  g: { noise: 0.6, bandwidth: 0.4 },
  m: { noise: 0.35, bandwidth: 0.2 },
  n: { noise: 0.35, bandwidth: 0.2 },
  l: { noise: 0.3, bandwidth: 0.2 },
  r: { noise: 0.4, bandwidth: 0.3 },
};

const mulberry32 = (seed: number) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

const synthesizeVowel = (
  character: string,
  duration: number,
  sampleRate: number,
  rng: () => number,
  basePitch: number,
  emphasis: number,
) => {
  const profile = vowelProfiles[character] ?? vowelProfiles.a;
  const sampleCount = Math.max(1, Math.round(duration * sampleRate));
  const data = new Float32Array(sampleCount);
  const vibratoRate = 5 + rng() * 2.2;
  const vibratoDepth = 0.25 + rng() * 0.15;

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const progress = index / sampleCount;
    const envelope = Math.sin(Math.min(Math.PI, progress * Math.PI)) ** 1.8;

    const glide = 1 + Math.sin(progress * Math.PI * 2) * 0.12 * emphasis;
    const vibrato = Math.sin(time * Math.PI * vibratoRate) * vibratoDepth * 0.02;
    const fundamental = Math.sin(2 * Math.PI * (basePitch * glide) * (time + vibrato));
    const f1 = Math.sin(2 * Math.PI * profile.f1 * (time + vibrato * 0.4)) * 0.45;
    const f2 = Math.sin(2 * Math.PI * profile.f2 * time) * 0.32;
    const f3 = Math.sin(2 * Math.PI * profile.f3 * time) * 0.18;

    data[index] = (fundamental * 0.6 + f1 + f2 + f3) * envelope;
  }

  return data;
};

const synthesizeConsonant = (
  character: string,
  duration: number,
  sampleRate: number,
  rng: () => number,
  basePitch: number,
) => {
  const profile = consonantProfiles[character] ?? { noise: 0.45, bandwidth: 0.35 };
  const sampleCount = Math.max(1, Math.round(duration * sampleRate));
  const data = new Float32Array(sampleCount);
  let previous = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, index / (sampleRate * 0.015)) * Math.max(0, 1 - index / sampleCount);
    const tone = Math.sin(2 * Math.PI * basePitch * time) * 0.25;

    const noiseSource = rng() * 2 - 1;
    previous += profile.bandwidth * (noiseSource - previous);
    const noise = previous * profile.noise;

    data[index] = (tone + noise) * envelope;
  }

  return data;
};

const synthesizeGap = (duration: number, sampleRate: number) => {
  const sampleCount = Math.max(1, Math.round(duration * sampleRate));
  return new Float32Array(sampleCount); // Silence
};

const normalizeBuffer = (buffer: Float32Array) => {
  let peak = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const value = Math.abs(buffer[index]);
    if (value > peak) {
      peak = value;
    }
  }

  if (peak === 0) {
    return buffer;
  }

  const target = 0.94;
  const scale = target / peak;

  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] *= scale;
  }

  return buffer;
};

const createMockSpeechWav = (text: string, durationSeconds: number, sampleRate: number) => {
  const sanitized = text
    .replace(/[^a-zA-Z0-9.,!?"'\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase() ||
    'mock speech ready';

  const baseSegments = Array.from(sanitized).map<SegmentProfile>((character) => {
    if (character === ' ') {
      return {
        char: character,
        baseDuration: 0.06,
        generator: ({ duration, sampleRate }) => synthesizeGap(duration, sampleRate),
      };
    }

    if (/\d/.test(character)) {
      return {
        char: character,
        baseDuration: 0.12,
        generator: ({ duration, sampleRate, basePitch }) => {
          const sampleCount = Math.max(1, Math.round(duration * sampleRate));
          const data = new Float32Array(sampleCount);
          for (let index = 0; index < sampleCount; index += 1) {
            const time = index / sampleRate;
            const envelope = Math.sin(Math.min(Math.PI, (index / sampleCount) * Math.PI));
            const tone = Math.sin(2 * Math.PI * basePitch * 1.6 * time) * 0.55;
            const overtone = Math.sin(2 * Math.PI * basePitch * 2.1 * time) * 0.25;
            data[index] = (tone + overtone) * envelope;
          }
          return data;
        },
      };
    }

    if (vowelProfiles[character]) {
      return {
        char: character,
        baseDuration: 0.18,
        generator: ({ duration, sampleRate, rng, basePitch, emphasis }) =>
          synthesizeVowel(character, duration, sampleRate, rng, basePitch, emphasis),
      };
    }

    return {
      char: character,
      baseDuration: 0.1,
      generator: ({ duration, sampleRate, rng, basePitch }) =>
        synthesizeConsonant(character, duration, sampleRate, rng, basePitch),
    };
  });

  const clampedDuration = Math.max(0.5, Math.min(durationSeconds, 12));
  const nominalDuration = baseSegments.reduce((total, segment) => total + segment.baseDuration, 0);
  const durationScale = Math.max(0.65, Math.min(1.35, clampedDuration / nominalDuration || 1));

  const preparedSegments = baseSegments.map<PreparedSegment>((segment) => ({
    char: segment.char,
    duration: segment.baseDuration * durationScale,
    generator: segment.generator,
  }));

  const totalSamples = preparedSegments.reduce(
    (total, segment) => total + Math.max(1, Math.round(segment.duration * sampleRate)),
    0,
  );

  const waveform = new Float32Array(totalSamples);
  let writeIndex = 0;
  const emphasisStep = Math.min(0.35, sanitized.length > 0 ? 0.45 / sanitized.length : 0);

  preparedSegments.forEach((segment, index) => {
    const charCode = segment.char.charCodeAt(0) || 32;
    const rng = mulberry32(charCode * 3_657_791 + index * 97);
    const basePitch = 165 + ((index % 5) - 2) * 9 + (sanitized.length > 0 ? (index / sanitized.length) * 18 : 0);
    const emphasis = 0.85 + index * emphasisStep;
    const segmentDuration = segment.duration;
    const samples = segment.generator({
      duration: segmentDuration,
      sampleRate,
      rng,
      basePitch,
      emphasis,
    });

    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      if (writeIndex >= waveform.length) {
        break;
      }
      const value = samples[sampleIndex];
      waveform[writeIndex] = (waveform[writeIndex] ?? 0) + value;
      writeIndex += 1;
    }
  });

  normalizeBuffer(waveform);

  const bytesPerSample = 2;
  const dataSize = waveform.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  writeWaveHeader(buffer, sampleRate, dataSize);

  for (let index = 0; index < waveform.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, waveform[index]));
    const pcmValue = Math.round(clamped * 0x7fff * 0.9);
    buffer.writeInt16LE(pcmValue, 44 + index * bytesPerSample);
  }

  return buffer;
};

export const mockSynthesize = async (
  payload: ProviderSynthesisPayload,
): Promise<ProviderSynthesisResponse> => {
  const rate = payload.settings.sampleRate || 22050;
  const durationSeconds = Math.max(payload.text.length / 20 / 2, 1.2);
  const buffer = createMockSpeechWav(payload.text, durationSeconds, rate);

  return {
    audioBase64: buffer.toString('base64'),
    audioContentType: 'audio/wav',
    transcript: undefined,
    durationMs: Math.round(durationSeconds * 1000),
    requestId: randomUUID(),
  };
};
