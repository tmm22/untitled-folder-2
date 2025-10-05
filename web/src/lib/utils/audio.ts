export function extensionFromContentType(contentType?: string): string {
  if (!contentType) return 'mp3';
  const lowered = contentType.toLowerCase();
  if (lowered.includes('mpeg')) return 'mp3';
  if (lowered.includes('wav') || lowered.includes('wave')) return 'wav';
  if (lowered.includes('aac')) return 'aac';
  if (lowered.includes('flac')) return 'flac';
  if (lowered.includes('ogg')) return 'ogg';
  return 'mp3';
}
