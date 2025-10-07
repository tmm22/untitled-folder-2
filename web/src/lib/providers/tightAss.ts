import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderSynthesisPayload, ProviderSynthesisResponse, Voice } from '@/modules/tts/types';
import type { ProviderAdapter, ProviderContext } from './types';
import { mockSynthesize } from './mock';

const execFileAsync = promisify(execFile);

const isSystemSynthesisEnabled = () =>
  process.platform === 'darwin' && process.env.TTS_DISABLE_SAY !== '1';

const DEFAULT_VOICE: Voice = {
  id: 'Alex',
  name: 'Alex',
  language: 'en-US',
  gender: 'neutral',
  provider: 'tightAss',
};

const parseVoices = (stdout: string): Voice[] => {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('Voice')); // skip headers

  const voices: Voice[] = [];

  for (const line of lines) {
    const [entry] = line.split('#');
    const parts = entry
      .trim()
      .split(/\s+/)
      .filter((part) => part.length > 0);

    if (parts.length < 2) {
      continue;
    }

    const [voiceName, locale] = parts;
    voices.push({
      id: voiceName,
      name: voiceName,
      language: locale?.replace('_', '-') ?? 'en-US',
      gender: 'neutral',
      provider: 'tightAss',
    });
  }

  if (voices.length === 0) {
    return [DEFAULT_VOICE];
  }

  return voices;
};

const estimateDurationMs = (buffer: Buffer) => {
  if (buffer.length <= 44) {
    return undefined;
  }

  const dataSize = buffer.readUInt32LE(40);
  if (!Number.isFinite(dataSize) || dataSize === 0) {
    return undefined;
  }

  const sampleRate = buffer.readUInt32LE(24) || 22050;
  const bytesPerSample = buffer.readUInt16LE(32) || 2;
  const samples = dataSize / bytesPerSample;
  if (!Number.isFinite(samples) || samples <= 0) {
    return undefined;
  }

  return Math.round((samples / sampleRate) * 1000);
};

class TightAssAdapter implements ProviderAdapter {
  private voices: Voice[] | null = null;

  constructor(_context: ProviderContext) {}

  async listVoices(): Promise<Voice[]> {
    if (this.voices) {
      return this.voices;
    }

    if (!isSystemSynthesisEnabled()) {
      this.voices = [DEFAULT_VOICE];
      return this.voices;
    }

    try {
      const { stdout } = await execFileAsync('say', ['-v', '?']);
      const parsed = parseVoices(stdout);
      this.voices = parsed;
      return parsed;
    } catch (error) {
      console.error('Failed to list macOS voices', error);
      this.voices = [DEFAULT_VOICE];
      return this.voices;
    }
  }

  private async resolveVoice(voiceId?: string) {
    const voices = await this.listVoices();
    if (voiceId) {
      const match = voices.find((voice) => voice.id === voiceId);
      if (match) {
        return match;
      }
    }

    return voices[0] ?? DEFAULT_VOICE;
  }

  async synthesize(payload: ProviderSynthesisPayload): Promise<ProviderSynthesisResponse> {
    if (!isSystemSynthesisEnabled()) {
      return mockSynthesize(payload);
    }

    try {
      const voice = await this.resolveVoice(payload.voiceId);
      const requestId = randomUUID();
      const wavPath = join(tmpdir(), `tight-ass-${requestId}.wav`);
      const args: string[] = ['-o', wavPath, '--file-format=WAVE', '--data-format=LEI16@22050'];

      if (voice?.id) {
        args.unshift('-v', voice.id);
      }

      const rate = Math.max(90, Math.min(360, Math.round(175 * payload.settings.speed)));
      args.push('-r', rate.toString());
      args.push(payload.text);

      await execFileAsync('say', args);

      const audioBuffer = await fs.readFile(wavPath);
      await fs.unlink(wavPath).catch(() => {});

      const durationMs = estimateDurationMs(audioBuffer);

      return {
        audioBase64: audioBuffer.toString('base64'),
        audioContentType: 'audio/wav',
        transcript: undefined,
        durationMs,
        requestId,
      };
    } catch (error) {
      console.error('Falling back to mock synthesis for Tight Ass Mode', error);
      return mockSynthesize(payload);
    }
  }
}

export const createTightAssAdapter = (context: ProviderContext): ProviderAdapter => new TightAssAdapter(context);
