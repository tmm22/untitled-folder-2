function parseFlag(rawValue: string | undefined, defaultValue: boolean): boolean {
  const value = rawValue?.trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function isResponsesApiEnabled(): boolean {
  return parseFlag(process.env.OPENAI_USE_RESPONSES_API, true);
}

export function isRealtimeTransitEnabled(): boolean {
  return parseFlag(process.env.OPENAI_USE_REALTIME_TRANSIT, false);
}

export function isRealtimeTTSEnabled(): boolean {
  return parseFlag(process.env.OPENAI_USE_REALTIME_TTS, false);
}
