const ARTICLE_SELECTORS = ['article', 'main', '[role="main"]', 'section'];

interface ExtractedContent {
  title?: string;
  content?: string;
}

const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

const isMeaningful = (text: string) => {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 120 && /[a-zA-Z]/.test(cleaned);
};

const decodeEntities = (text: string) =>
  Object.entries(ENTITY_MAP).reduce((acc, [entity, char]) => acc.replace(new RegExp(entity, 'g'), char), text);

const normaliseWhitespace = (text: string) => text.replace(/\s+/g, ' ').replace(/\n{2,}/g, '\n\n').trim();

const stripTags = (html: string) =>
  normaliseWhitespace(
    decodeEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, '</$1>\n\n')
        .replace(/<[^>]+>/g, ' '),
    ),
  );

const extractBySelector = (html: string, selector: string): string | null => {
  const tagMatch = selector.match(/^[a-z0-9-]+/i);
  if (!tagMatch) {
    return null;
  }
  const tag = tagMatch[0];
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'gi');
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    matches.push(match[1]);
  }

  const best = matches
    .map(stripTags)
    .filter(isMeaningful)
    .sort((a, b) => b.length - a.length)[0];

  return best ?? null;
};

export function extractArticle(html: string): ExtractedContent {
  const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const fallbackTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ?? fallbackTitle?.[1]?.trim();

  for (const selector of ARTICLE_SELECTORS) {
    const content = extractBySelector(html, selector);
    if (content) {
      return { title, content };
    }
  }

  const paragraphs = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => stripTags(match[1]))
    .filter(isMeaningful)
    .slice(0, 40);

  if (paragraphs.length > 0) {
    return {
      title,
      content: normaliseWhitespace(paragraphs.join('\n\n')),
    };
  }

  return {
    title,
    content: stripTags(html).slice(0, 15000),
  };
}

