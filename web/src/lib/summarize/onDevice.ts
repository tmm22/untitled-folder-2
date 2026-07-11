'use client';

export type SummaryEngine = 'openai' | 'browser-ai' | 'extractive';

export interface OnDeviceSummaryOptions {
  title?: string;
  sentenceCount?: number;
}

export interface OnDeviceSummaryResult {
  summary: string;
  engine: Extract<SummaryEngine, 'browser-ai' | 'extractive'>;
}

const MAX_INPUT_CHARS = 20_000;
const SHORT_TEXT_THRESHOLD = 320;
const LEAD_SENTENCE_BONUS = 0.15;
const TITLE_OVERLAP_BONUS = 0.3;
const DUPLICATE_SIMILARITY_THRESHOLD = 0.7;
const DUPLICATE_PENALTY = 0.1;
const BROWSER_AI_TIMEOUT_MS = 15_000;

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'between', 'both', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'i', 'if', 'in',
  'into', 'is', 'it', 'its', 'just', 'me', 'more', 'most', 'my', 'no', 'nor', 'not', 'now', 'of',
  'off', 'on', 'once', 'only', 'or', 'other', 'our', 'out', 'over', 'own', 'said', 'same', 'she',
  'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'would', 'you', 'your',
]);

function splitSentences(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    return Array.from(segmenter.segment(text), (segment) => segment.segment.trim()).filter(
      (sentence) => sentence.length > 0,
    );
  }
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Frequency-based extractive summary: scores each sentence by how many
 * high-frequency document terms it contains (length-normalised, with a small
 * lead bias and a bonus for overlap with the title), then returns the top
 * sentences in their original order. Deterministic, offline, dependency-free.
 */
export function extractiveSummary(text: string, options: OnDeviceSummaryOptions = {}): string {
  const trimmed = text.trim().slice(0, MAX_INPUT_CHARS);
  if (trimmed.length === 0) {
    return '';
  }
  if (trimmed.length <= SHORT_TEXT_THRESHOLD) {
    return trimmed;
  }

  const sentenceCount = Math.max(1, options.sentenceCount ?? 3);
  const sentences = splitSentences(trimmed);
  if (sentences.length <= sentenceCount) {
    return sentences.join(' ');
  }

  const frequencies = new Map<string, number>();
  for (const sentence of sentences) {
    for (const word of tokenize(sentence)) {
      frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
    }
  }
  const maxFrequency = Math.max(1, ...frequencies.values());
  const titleTokens = new Set(tokenize(options.title ?? ''));

  const seenTokenSets: Set<string>[] = [];
  const scored = sentences.map((sentence, index) => {
    const tokens = tokenize(sentence);
    if (tokens.length === 0) {
      return { sentence, index, score: 0 };
    }
    let score = 0;
    let titleOverlap = 0;
    for (const token of tokens) {
      score += (frequencies.get(token) ?? 0) / maxFrequency;
      if (titleTokens.has(token)) {
        titleOverlap += 1;
      }
    }
    score /= Math.sqrt(tokens.length);

    // Boilerplate defence: near-duplicates of earlier sentences (repeated
    // nav text, templated blocks) would otherwise dominate term frequency.
    const tokenSet = new Set(tokens);
    const isRepetition = seenTokenSets.some((seen) => {
      let shared = 0;
      for (const token of tokenSet) {
        if (seen.has(token)) shared += 1;
      }
      const union = seen.size + tokenSet.size - shared;
      return union > 0 && shared / union >= DUPLICATE_SIMILARITY_THRESHOLD;
    });
    seenTokenSets.push(tokenSet);
    if (isRepetition) {
      score *= DUPLICATE_PENALTY;
    }

    if (index < 3) {
      score += LEAD_SENTENCE_BONUS;
    }
    if (titleOverlap > 0) {
      score += TITLE_OVERLAP_BONUS * Math.min(1, titleOverlap / titleTokens.size);
    }
    return { sentence, index, score };
  });

  return scored
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, sentenceCount)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence)
    .join(' ');
}

interface BrowserSummarizer {
  summarize(text: string, options?: { context?: string }): Promise<string>;
  destroy?(): void;
}

interface BrowserSummarizerConstructor {
  availability(): Promise<string>;
  create(options?: Record<string, unknown>): Promise<BrowserSummarizer>;
}

function getBrowserSummarizer(): BrowserSummarizerConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const candidate = (window as { Summarizer?: unknown }).Summarizer;
  if (
    candidate &&
    typeof (candidate as BrowserSummarizerConstructor).availability === 'function' &&
    typeof (candidate as BrowserSummarizerConstructor).create === 'function'
  ) {
    return candidate as BrowserSummarizerConstructor;
  }
  return null;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Browser summarizer timed out')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Summarize entirely on the user's device — no account or API key required.
 * Uses the browser's built-in AI summarizer when one is already available
 * (never triggers a model download), and falls back to the deterministic
 * extractive summary otherwise.
 */
export async function summarizeOnDevice(
  text: string,
  options: OnDeviceSummaryOptions = {},
): Promise<OnDeviceSummaryResult> {
  const browserSummarizer = getBrowserSummarizer();
  if (browserSummarizer) {
    try {
      const availability = await browserSummarizer.availability();
      if (availability === 'available') {
        const summarizer = await browserSummarizer.create({
          type: 'tldr',
          format: 'plain-text',
          length: 'medium',
        });
        try {
          const summary = await withTimeout(
            summarizer.summarize(text.slice(0, MAX_INPUT_CHARS), {
              context: options.title ? `Article title: ${options.title}` : undefined,
            }),
            BROWSER_AI_TIMEOUT_MS,
          );
          const cleaned = summary?.trim();
          if (cleaned) {
            return { summary: cleaned, engine: 'browser-ai' };
          }
        } finally {
          summarizer.destroy?.();
        }
      }
    } catch (error) {
      console.warn('Browser summarizer unavailable, falling back to extractive summary', error);
    }
  }

  return { summary: extractiveSummary(text, options), engine: 'extractive' };
}
