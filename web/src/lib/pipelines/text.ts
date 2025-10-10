const SENTENCE_BOUNDARY_REGEX = /(?<=\S[.?!])\s+(?=[A-Z0-9])/g;

export const DEFAULT_MAX_SEGMENT_CHARACTERS = 1600;

export function normaliseWhitespace(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim());

  const compact: string[] = [];
  for (const line of lines) {
    if (!line) {
      if (compact.length > 0 && compact[compact.length - 1] !== '') {
        compact.push('');
      }
      continue;
    }
    compact.push(line);
  }

  return compact
    .reduce<string[]>((acc, line) => {
      if (line === '') {
        if (acc.length === 0 || acc[acc.length - 1] === '') {
          return acc;
        }
        acc.push('');
        return acc;
      }
      acc.push(line);
      return acc;
    }, [])
    .join('\n\n')
    .trim();
}

export function stripBulletMarkers(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]+\s*/, '').replace(/^\s*\d+\.\s*/, ''))
    .join('\n');
}

export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function splitIntoSentences(text: string): string[] {
  return text
    .split(SENTENCE_BOUNDARY_REGEX)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export interface ChunkOptions {
  strategy: 'paragraph' | 'sentence';
  maxCharacters?: number;
  joinShortSegments?: boolean;
}

export function chunkText(text: string, options: ChunkOptions): string[] {
  const maxCharacters = options.maxCharacters ?? DEFAULT_MAX_SEGMENT_CHARACTERS;
  if (!text.trim()) {
    return [];
  }

  const tokens = options.strategy === 'sentence' ? splitIntoSentences(text) : splitIntoParagraphs(text);
  if (tokens.length === 0) {
    return [text.trim()];
  }

  const segments: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim().length > 0) {
      segments.push(current.trim());
    }
    current = '';
  };

  for (const token of tokens) {
    if (!token) {
      continue;
    }

    if (token.length >= maxCharacters) {
      if (current.trim().length > 0) {
        pushCurrent();
      }
      const chunks = token.match(new RegExp(`.{1,${maxCharacters}}`, 'g')) ?? [token];
      segments.push(...chunks.map((chunk) => chunk.trim()));
      continue;
    }

    if (current.length + token.length + 1 > maxCharacters) {
      pushCurrent();
    }

    current = current ? `${current} ${token}` : token;
  }

  pushCurrent();

  if (options.joinShortSegments && segments.length > 1) {
    const joined: string[] = [];
    let buffer = '';
    for (const segment of segments) {
      if (!buffer) {
        buffer = segment;
        continue;
      }
      if ((buffer.length + segment.length + 1) <= maxCharacters / 2) {
        buffer = `${buffer}\n\n${segment}`;
      } else {
        joined.push(buffer);
        buffer = segment;
      }
    }
    if (buffer) {
      joined.push(buffer);
    }
    return joined;
  }

  return segments;
}
