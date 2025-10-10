import { NextResponse } from 'next/server';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { extractArticle } from '@/lib/imports/readability';
import { parseRedditThread } from '@/lib/imports/reddit';

interface FetchRedirectOptions {
  remaining?: number;
  accept?: string;
  userAgent?: string;
}

export interface ReadableContent {
  title?: string;
  content?: string;
}

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const MAX_CONTENT_LENGTH_BYTES = 1_000_000;
const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; TextToSpeechApp/1.0; +https://example.com)';

function getAllowedHostSuffixes(): string[] {
  return (process.env.IMPORTS_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isDnsValidationDisabled(): boolean {
  return process.env.IMPORTS_DISABLE_DNS_CHECK === '1';
}

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

async function fetchWithRedirects(url: URL, options: FetchRedirectOptions = {}): Promise<Response> {
  const { remaining = 3, accept = 'text/html,application/json', userAgent = DEFAULT_USER_AGENT } = options;

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': userAgent,
      Accept: accept,
    },
    redirect: 'manual',
  });

  if (response.status >= 300 && response.status < 400) {
    if (remaining === 0) {
      throw NextResponse.json({ error: 'Too many redirects during import' }, { status: 400 });
    }

    const location = response.headers.get('location');
    if (!location) {
      throw NextResponse.json({ error: 'Redirect missing location header' }, { status: 400 });
    }

    const nextUrl = new URL(location, url);
    await assertHostnameAllowed(nextUrl);
    return fetchWithRedirects(nextUrl, { remaining: remaining - 1, accept, userAgent });
  }

  return response;
}

async function fetchContent(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    throw NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
  }
  await assertHostnameAllowed(parsed);

  const response = await fetchWithRedirects(parsed);

  if (!response.ok) {
    throw new Error(`Failed to fetch content (${response.status})`);
  }

  return await readLimited(response);
}

function isRedditUrl(url: URL): boolean {
  return /reddit\.com\/r\//i.test(url.hostname + url.pathname);
}

async function handleReddit(url: URL): Promise<ReadableContent> {
  await assertHostnameAllowed(url);
  const searchWithRaw = url.search ? `${url.search}&raw_json=1` : '?raw_json=1';
  const jsonUrl = url.origin + url.pathname + '.json' + searchWithRaw;
  const response = await fetchWithRedirects(new URL(jsonUrl), {
    accept: 'application/json',
    userAgent: DEFAULT_USER_AGENT,
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

export async function fetchReadableContent(rawUrl: string): Promise<ReadableContent> {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    throw NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (isRedditUrl(parsed)) {
    return handleReddit(parsed);
  }

  const html = await fetchContent(parsed.href);
  return extractArticle(html);
}
