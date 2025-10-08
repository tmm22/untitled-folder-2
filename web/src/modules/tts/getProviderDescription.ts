import { providerRegistry } from './providerRegistry';
import type { ProviderType, Voice } from './types';

interface DescriptionContext {
  selectedVoice?: Voice;
  fallbackVoices?: Voice[];
}

const summariseVoice = (voice: Voice): string => {
  const name = voice.name?.trim() || 'selected voice';
  const language = voice.language?.trim();

  if (language && !name.toLowerCase().includes(language.toLowerCase())) {
    return `${name} (${language})`;
  }

  return name;
};

const describeVoiceEngine = (voice: Voice): string => {
  const metadataFields = [
    typeof voice.metadata?.voiceURI === 'string' ? voice.metadata.voiceURI : '',
    typeof voice.id === 'string' ? voice.id : '',
    typeof voice.metadata?.name === 'string' ? voice.metadata.name : '',
    typeof voice.name === 'string' ? voice.name : '',
  ];

  const fingerprint = metadataFields.join(' ').toLowerCase();

  if (fingerprint.includes('com.apple') || fingerprint.includes('apple')) {
    return 'macOS voice library';
  }
  if (fingerprint.includes('microsoft')) {
    return 'Microsoft speech engine';
  }
  if (fingerprint.includes('google')) {
    return 'Google speech engine';
  }
  if (fingerprint.includes('samsung')) {
    return 'Samsung speech engine';
  }
  if (fingerprint.includes('android')) {
    return 'Android system voice';
  }
  if (fingerprint.includes('espeak')) {
    return 'eSpeak engine';
  }
  if (fingerprint.includes('mozilla') || fingerprint.includes('firefox')) {
    return 'Mozilla speech engine';
  }
  if (voice.metadata?.localService === false) {
    return 'cloud speech service';
  }
  if (voice.metadata?.localService === true) {
    return 'local speech engine';
  }
  return 'browser speech engine';
};

const getTightAssDescription = (context: DescriptionContext): string => {
  const voice = context.selectedVoice ?? context.fallbackVoices?.[0];
  if (!voice) {
    return 'Offline synthesis using your browser speech engine.';
  }

  const voiceSummary = summariseVoice(voice);
  const engineSummary = describeVoiceEngine(voice);

  return `Offline synthesis using ${voiceSummary} from your ${engineSummary}.`;
};

export const getProviderDescription = (
  providerId: ProviderType,
  context: DescriptionContext = {},
): string => {
  if (providerId === 'tightAss') {
    return getTightAssDescription(context);
  }

  return providerRegistry.get(providerId).description;
};
