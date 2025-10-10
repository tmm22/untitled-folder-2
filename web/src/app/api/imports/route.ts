import { NextResponse } from 'next/server';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { extractArticle } from '@/lib/imports/readability';
import { parseRedditThread } from '@/lib/imports/reddit';

interface ImportRequestBody {
  url?: string;
}

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const MAX_CONTENT_LENGTH_BYTES = 1_000_000; // ~1MB
const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function getAllowedHostSuffixes(): string[] {
  return (process.env.IMPORTS_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isDnsValidationDisabled(): boolean {
  return process.env.IMPORTS_DISABLE_DNS_CHECK === '1';
}

const SUMMARY_SUPPORTED = Boolean(process.env.OPENAI_API_KEY);

function isPrivateIPv4(address: string): boolean {
  const octets = address.split('.').map((value) => Number.parseInt(value, 10));
  if (octets.length !== 4 || octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
}

async function assertHostnameAllowed(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw NextResponse.json({ error: 'Host is not allowed' }, { status: 403 });
  }

  const allowedHostSuffixes = getAllowedHostSuffixes();
  if (allowedHostSuffixes.length > 0) {
    const isAllowed = allowedHostSuffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );
    if (!isAllowed) {
      throw NextResponse.json({ error: 'Host is not on the allowlist' }, { status: 403 });
    }
  }

  if (isDnsValidationDisabled()) {
    return;
  }

  try {
    const lookupResults = await dnsLookup(hostname, { all: true });
    const unsafe = lookupResults.some((record) => {
      const address = record.address;
      const type = isIP(address);
      if (type === 4) {
        return isPrivateIPv4(address);
      }
      if (type === 6) {
        return isPrivateIPv6(address);
      }
      return true;
    });

    if (unsafe) {
      throw NextResponse.json({ error: 'Resolved address is not permitted' }, { status: 403 });
    }
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error('DNS resolution failed for import URL', error);
    throw NextResponse.json({ error: 'Unable to resolve host' }, { status: 400 });
  }
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > MAX_CONTENT_LENGTH_BYTES) {
      throw NextResponse.json({ error: 'Content too large' }, { status: 413 });
    }
    return text;
  }

  const decoder = new TextDecoder();
  let total = 0;
  let result = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      total += value.byteLength;
      if (total > MAX_CONTENT_LENGTH_BYTES) {
        throw NextResponse.json({ error: 'Content too large' }, { status: 413 });
      }
      result += decoder.decode(value, { stream: true });
    }
  }

  result += decoder.decode();
  return result;
}

async function fetchContent(url: string): Promise<string> {
  const parsed = new URL(url);
  await assertHostnameAllowed(parsed);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TextToSpeechApp/1.0 (+https://example.com)',
      Accept: 'text/html,application/json',
    },
    redirect: 'manual',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch content (${response.status})`);
  }

  if (response.status >= 300 && response.status < 400) {
    throw NextResponse.json({ error: 'Redirects are not allowed for imports' }, { status: 400 });
  }

  return await readLimited(response);
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
  await assertHostnameAllowed(url);
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
    if (error instanceof Response) {
      return error;
    }
    console.error('Import failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 500 });
  }
}
