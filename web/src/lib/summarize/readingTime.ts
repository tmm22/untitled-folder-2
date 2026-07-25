// Mid-range adult silent-reading speed; also a reasonable proxy for how long
// the narrated audio runs, which is what the Imports panel is estimating.
const WORDS_PER_MINUTE = 220;

/**
 * Whole-minute reading estimate for a body of text. Returns 0 only for empty
 * input so the UI can omit the badge entirely; any real content reads as at
 * least one minute.
 */
export function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter((word) => word.length > 0).length;
  if (words === 0) {
    return 0;
  }
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
