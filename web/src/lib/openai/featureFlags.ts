export function isResponsesApiEnabled(): boolean {
  const value = process.env.OPENAI_USE_RESPONSES_API?.trim().toLowerCase();
  if (!value) {
    return true;
  }
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function isRealtimeTransitEnabled(): boolean {
  const value = process.env.OPENAI_USE_REALTIME_TRANSIT?.trim().toLowerCase();
  if (!value) {
    return false;
  }
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function isRealtimeTTSEnabled(): boolean {
  const value = process.env.OPENAI_USE_REALTIME_TTS?.trim().toLowerCase();
  if (!value) {
    return false;
  }
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}
