import type { HistoryEntry } from '@/modules/history/store';
import type { ProviderType } from '@/modules/tts/types';
import { providerRegistry } from '@/modules/tts/providerRegistry';
import type { PipelineQueueSpec, PipelineVoicePreference } from '@/lib/pipelines/types';

const DEFAULT_HISTORY_LIMIT = 50;

function mostFrequentVoice(entries: HistoryEntry[]): string | undefined {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.voiceId) {
      continue;
    }
    counts.set(entry.voiceId, (counts.get(entry.voiceId) ?? 0) + 1);
  }
  let bestVoice: string | undefined;
  let bestCount = 0;
  for (const [voiceId, count] of counts.entries()) {
    if (count > bestCount) {
      bestVoice = voiceId;
      bestCount = count;
    }
  }
  return bestVoice;
}

function resolveDefaultVoice(provider: ProviderType): string | undefined {
  try {
    const descriptor = providerRegistry.get(provider);
    return descriptor.defaultVoiceId;
  } catch {
    return undefined;
  }
}

export function resolveVoiceForQueue(
  queue: PipelineQueueSpec,
  historyEntries: HistoryEntry[],
): string | undefined {
  return resolveVoice(queue.provider, queue.voicePreference, queue.voiceId, historyEntries);
}

export function resolveVoice(
  provider: ProviderType,
  preference: PipelineVoicePreference,
  explicitVoiceId: string | undefined,
  historyEntries: HistoryEntry[],
): string | undefined {
  if (preference === 'custom') {
    return explicitVoiceId?.trim() || resolveDefaultVoice(provider);
  }
  if (preference === 'default') {
    return resolveDefaultVoice(provider);
  }
  const recentHistory = historyEntries
    .filter((entry) => entry.provider === provider && entry.voiceId)
    .slice(0, DEFAULT_HISTORY_LIMIT);
  const recommended = mostFrequentVoice(recentHistory);
  return recommended ?? resolveDefaultVoice(provider);
}
