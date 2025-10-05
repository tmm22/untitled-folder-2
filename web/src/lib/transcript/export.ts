interface TranscriptCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

const SENTENCE_REGEX = /[^.!?\n]+[.!?]?/g;

function splitSentences(text: string): string[] {
  const matches = text.match(SENTENCE_REGEX);
  if (matches && matches.length > 0) {
    return matches.map((sentence) => sentence.trim()).filter(Boolean);
  }
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildCues(text: string, durationMs?: number): TranscriptCue[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return [];
  }

  const totalMs = durationMs && durationMs > 0 ? durationMs : sentences.length * 4000;
  const slice = totalMs / Math.max(1, sentences.length);

  let current = 0;
  return sentences.map((sentence, index) => {
    const startMs = Math.round(current);
    const endMs = index === sentences.length - 1 ? totalMs : Math.round(current + slice);
    current += slice;
    return {
      index: index + 1,
      startMs,
      endMs,
      text: sentence,
    };
  });
}

const pad = (value: number, length: number) => value.toString().padStart(length, '0');

function formatTimestampMs(ms: number, decimalSeparator = ','): string {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const milliseconds = totalMs % 1000;

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}${decimalSeparator}${pad(milliseconds, 3)}`;
}

export function buildSrt(text: string, durationMs?: number): string {
  const cues = buildCues(text, durationMs);
  return cues
    .map((cue) =>
      [
        cue.index,
        `${formatTimestampMs(cue.startMs, ',')} --> ${formatTimestampMs(cue.endMs, ',')}`,
        cue.text,
      ].join('\n'),
    )
    .join('\n\n');
}

export function buildVtt(text: string, durationMs?: number): string {
  const cues = buildCues(text, durationMs);
  const body = cues
    .map(
      (cue) =>
        `${formatTimestampMs(cue.startMs, '.')} --> ${formatTimestampMs(cue.endMs, '.')}` + `\n${cue.text}`,
    )
    .join('\n\n');
  return `WEBVTT\n\n${body}`.trim();
}
