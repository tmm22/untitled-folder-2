'use client';

import { cleanForNarration, isNarratableSentence } from './narrationClean';
import { MAX_KEY_POINTS, MAX_TAGS, type SummaryEnrichment } from './types';

export type { SummaryEngine } from './types';

type OnDeviceEngine = 'browser-ai' | 'extractive';

export interface OnDeviceSummaryOptions {
  title?: string;
  sentenceCount?: number;
}

export interface OnDeviceSummaryResult {
  summary: string;
  engine: OnDeviceEngine;
}

export interface OnDeviceEnrichmentResult extends SummaryEnrichment {
  engine: OnDeviceEngine;
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

interface ScoredSentence {
  sentence: string;
  index: number;
  score: number;
}

function termFrequencies(sentences: string[]): { frequencies: Map<string, number>; maxFrequency: number } {
  const frequencies = new Map<string, number>();
  for (const sentence of sentences) {
    for (const word of tokenize(sentence)) {
      frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
    }
  }
  return { frequencies, maxFrequency: Math.max(1, ...frequencies.values()) };
}

/**
 * Score each sentence by how many high-frequency document terms it carries
 * (length-normalised, with a small lead bias and a bonus for title overlap).
 * Returned in document order; callers rank with `topByScore`.
 */
function scoreSentences(sentences: string[], title?: string): ScoredSentence[] {
  const { frequencies, maxFrequency } = termFrequencies(sentences);
  const titleTokens = new Set(tokenize(title ?? ''));

  const seenTokenSets: Set<string>[] = [];
  return sentences.map((sentence, index) => {
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
}

function topByScore(scored: ScoredSentence[], count: number): ScoredSentence[] {
  return scored
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.index - b.index);
}

/**
 * Frequency-based extractive summary: scores each sentence by how many
 * high-frequency document terms it contains (length-normalised, with a small
 * lead bias and a bonus for overlap with the title), then returns the top
 * sentences in their original order. Deterministic, offline, dependency-free.
 */
export function extractiveSummary(text: string, options: OnDeviceSummaryOptions = {}): string {
  const trimmed = cleanForNarration(text).slice(0, MAX_INPUT_CHARS);
  if (trimmed.length === 0) {
    return '';
  }
  if (trimmed.length <= SHORT_TEXT_THRESHOLD) {
    return trimmed;
  }

  const sentenceCount = Math.max(1, options.sentenceCount ?? 3);
  const allSentences = splitSentences(trimmed);
  const sentences = allSentences.filter(isNarratableSentence);
  if (sentences.length === 0) {
    return allSentences.slice(0, sentenceCount).join(' ');
  }
  if (sentences.length <= sentenceCount) {
    return sentences.join(' ');
  }

  return topByScore(scoreSentences(sentences, options.title), sentenceCount)
    .map((entry) => entry.sentence)
    .join(' ');
}

function comparableForm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export interface KeyPointOptions {
  title?: string;
  count?: number;
  /** Sentences already present in this text are skipped, so key points add detail. */
  exclude?: string;
}

/**
 * Top-ranked source sentences rendered as discrete bullets. Anything already
 * covered by `exclude` (normally the summary) is skipped so the bullets extend
 * the summary rather than restating it.
 */
export function extractiveKeyPoints(text: string, options: KeyPointOptions = {}): string[] {
  const trimmed = cleanForNarration(text).slice(0, MAX_INPUT_CHARS);
  if (trimmed.length === 0) {
    return [];
  }

  const count = Math.max(1, options.count ?? MAX_KEY_POINTS);
  const sentences = splitSentences(trimmed).filter(isNarratableSentence);
  const excluded = options.exclude ? comparableForm(options.exclude) : '';
  const candidates = sentences.filter((sentence) => {
    const comparable = comparableForm(sentence);
    return comparable.length > 0 && !excluded.includes(comparable);
  });
  if (candidates.length === 0) {
    return [];
  }

  return topByScore(scoreSentences(candidates, options.title), count).map((entry) => entry.sentence);
}

const MIN_TAG_LENGTH = 4;

/**
 * Salient topic keywords for the entry: the most frequent meaningful terms,
 * with title terms promoted. Deterministic and offline.
 */
export function extractiveTags(text: string, options: { title?: string; count?: number } = {}): string[] {
  const trimmed = cleanForNarration(text).slice(0, MAX_INPUT_CHARS);
  if (trimmed.length === 0) {
    return [];
  }

  const count = Math.max(1, options.count ?? MAX_TAGS);
  const { frequencies } = termFrequencies([trimmed]);
  const titleTokens = new Set(tokenize(options.title ?? ''));

  const ranked = Array.from(frequencies.entries())
    .filter(([term]) => term.length >= MIN_TAG_LENGTH && !term.includes("'"))
    .map(([term, frequency]) => ({
      term,
      // Title terms are the article's own framing, so they outrank raw counts.
      score: frequency + (titleTokens.has(term) ? 100 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));

  const repeated = ranked.filter((entry) => entry.score > 1);
  return (repeated.length > 0 ? repeated : ranked).slice(0, count).map((entry) => entry.term);
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
            summarizer.summarize(cleanForNarration(text).slice(0, MAX_INPUT_CHARS), {
              context: options.title ? `Article title: ${options.title}` : undefined,
            }),
            BROWSER_AI_TIMEOUT_MS,
          );
          const cleaned = cleanForNarration(summary ?? '');
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

/**
 * Full on-device enrichment — summary plus key points and topic tags — so
 * callers without an OpenAI entitlement get the same shape as the server path.
 * Key points and tags are always extractive: they are cheap, deterministic, and
 * need no model, whichever engine produced the summary.
 */
export async function enrichOnDevice(
  text: string,
  options: OnDeviceSummaryOptions = {},
): Promise<OnDeviceEnrichmentResult> {
  const { summary, engine } = await summarizeOnDevice(text, options);
  return {
    summary,
    keyPoints: extractiveKeyPoints(text, { title: options.title, exclude: summary }),
    tags: extractiveTags(text, { title: options.title }),
    engine,
  };
}
