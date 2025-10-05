import { NextResponse } from 'next/server';
import { extractArticle } from '@/lib/imports/readability';
import { parseRedditThread } from '@/lib/imports/reddit';

interface ImportRequestBody {
  url?: string;
}

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

const SUMMARY_SUPPORTED = Boolean(process.env.OPENAI_API_KEY);

async function fetchContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TextToSpeechApp/1.0 (+https://example.com)',
      Accept: 'text/html,application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch content (${response.status})`);
  }

  return await response.text();
}

async function summarise(content: string): Promise<string | undefined> {
  if (!SUMMARY_SUPPORTED) {
    return undefined;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Summarise the following text in 3 bullet points.' },
          { role: 'user', content: content.slice(0, 4000) },
        ],
        max_tokens: 180,
      }),
    });

    if (!response.ok) {
      return undefined;
    }

    const json = await response.json();
    const summary = json.choices?.[0]?.message?.content;
    if (typeof summary === 'string') {
      return summary.trim();
    }
    return undefined;
  } catch (error) {
    console.error('Summary failed', error);
    return undefined;
  }
}

function isRedditUrl(url: URL): boolean {
  return /reddit\.com\/r\//i.test(url.hostname + url.pathname);
}

async function handleReddit(url: URL) {
  const jsonUrl = url.origin + url.pathname + '.json' + url.search;
  const response = await fetch(jsonUrl, {
    headers: {
      'User-Agent': 'TextToSpeechApp/1.0 (+https://example.com)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit response ${response.status}`);
  }

  const json = (await response.json()) as any;
  const parsed = parseRedditThread(json);

  if (!parsed) {
    throw new Error('Unable to parse Reddit thread');
  }

  return parsed;
}

export async function POST(request: Request) {
  let body: ImportRequestBody;
  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
  }

  try {
    const { title, content } = isRedditUrl(parsedUrl)
      ? await handleReddit(parsedUrl)
      : extractArticle(await fetchContent(parsedUrl.href));

    if (!content) {
      return NextResponse.json({ error: 'No readable content found' }, { status: 422 });
    }

    const summary = await summarise(content);

    return NextResponse.json({
      title,
      content,
      summary,
    });
  } catch (error) {
    console.error('Import failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 500 });
  }
}
