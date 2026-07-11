import { normaliseWhitespace, stripBulletMarkers } from '@/lib/pipelines/text';

// Line-level boilerplate that web extraction leaves behind and that should
// never be read aloud: promos, social chrome, credits, and media stubs.
const BOILERPLATE_LINE_PATTERNS: RegExp[] = [
  /^advertisement$/i,
  /^sponsored( content)?$/i,
  /^(sign up|subscribe)( (now|today|here))?( for| to)?\b.*$/i,
  /^(join|get) our newsletter\b.*$/i,
  /^newsletter$/i,
  /^share (this|on)\b.*$/i,
  /^follow us\b.*$/i,
  /^(read|see|learn) more\b.*$/i,
  /^related( articles| stories| posts)?:?\s*$/i,
  /^click here\b.*$/i,
  /^skip to (content|main)\b.*$/i,
  /^(accept|manage)( all)? cookies\b.*$/i,
  /^we use cookies\b.*$/i,
  /^(photo|image|picture|photograph|credit|source|illustration)s?( credit)?:\s.*$/i,
  /^getty images$/i,
  /^(copyright|©).*$/i,
  /^all rights reserved\.?$/i,
  /^\d+\s*(min|minute)s?\s*read$/i,
  /^(published|updated|posted)(\s*(on|at|:)?)\s.*$/i,
  /^[Bb]y\s+[A-Z][\w.'-]*(\s+[A-Z][\w.'-]*){0,3}$/,
  /^(watch|listen|play video|view gallery)\b.*:?$/i,
  /^(loading|please wait)(\.{3}|…)?$/i,
  /^(comments?|leave a (comment|reply))\b.*$/i,
  /^(tags?|topics?|categories):\s.*$/i,
];

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\([^)]*\)/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((?:[^)]*)\)/g;
const MARKDOWN_REF_LINK_PATTERN = /\[([^\]]+)\]\[[^\]]*\]/g;
const CITATION_PATTERN = /\[(?:\d{1,3}|[a-z]|citation needed|note \d+)\]/gi;
const HEADING_PATTERN = /^#{1,6}\s+/gm;
const EMPHASIS_PATTERN = /(\*{1,3}|_{1,3}|~{2}|`{1,3})([^*_~`]*?)\1/g;
const UNSPEAKABLE_SYMBOLS = /[|•·◦▪■●▶►«»‹›→←↑↓✓✔✕✖★☆♦♠♣♥#*_~^<>{}\\]/g;
const TRADEMARK_SYMBOLS = /[©®™]/g;

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
};

function decodeCommonEntities(text: string): string {
  return text.replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? ' ');
}

function isBoilerplateLine(line: string): boolean {
  return BOILERPLATE_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Strip everything that reads badly out loud — markdown syntax, URLs,
 * citation markers, promo/boilerplate lines, and symbol noise — while
 * preserving the sentences themselves. Safe to run on already-clean prose.
 */
export function cleanForNarration(text: string): string {
  if (!text) {
    return '';
  }

  let cleaned = decodeCommonEntities(text)
    .replace(MARKDOWN_IMAGE_PATTERN, ' ')
    .replace(MARKDOWN_LINK_PATTERN, '$1')
    .replace(MARKDOWN_REF_LINK_PATTERN, '$1')
    .replace(HEADING_PATTERN, '')
    .replace(EMPHASIS_PATTERN, '$2')
    .replace(URL_PATTERN, ' ')
    .replace(EMAIL_PATTERN, ' ')
    .replace(CITATION_PATTERN, ' ');

  cleaned = stripBulletMarkers(cleaned);

  cleaned = cleaned
    .split('\n')
    .filter((line) => !isBoilerplateLine(line.trim()))
    .join('\n');

  cleaned = cleaned
    .replace(TRADEMARK_SYMBOLS, ' ')
    .replace(UNSPEAKABLE_SYMBOLS, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\[\s*\]/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/([.!?]){2,}/g, (match) => (match.includes('…') || match === '...' ? '…' : match[0]))
    .replace(/[ \t]{2,}/g, ' ');

  return normaliseWhitespace(cleaned);
}

/**
 * True when a sentence is worth including in a spoken summary: long enough to
 * carry meaning and not extraction boilerplate.
 */
export function isNarratableSentence(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (trimmed.length < 12) {
    return false;
  }
  if (isBoilerplateLine(trimmed)) {
    return false;
  }
  const words = trimmed.split(/\s+/);
  if (words.length < 4) {
    return false;
  }
  const letters = trimmed.replace(/[^\p{L}]/gu, '').length;
  return letters / trimmed.length >= 0.5;
}
