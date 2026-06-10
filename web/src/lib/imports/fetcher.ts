import { NextResponse } from 'next/server';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
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

interface LimitedResponse {
  status: number;
  ok: boolean;
  headers: IncomingMessage['headers'];
  body: string;
}

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const MAX_CONTENT_LENGTH_BYTES = 1_000_000;
const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; TextToSpeechApp/1.0; +https://example.com)';
const REQUEST_TIMEOUT_MS = 15_000;

function getAllowedHostSuffixes(): string[] {
  return (process.env.IMPORTS_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isDnsValidationDisabled(): boolean {
  // The kill-switch exists for tests only; never honor it in production.
  return process.env.IMPORTS_DISABLE_DNS_CHECK === '1' && process.env.NODE_ENV !== 'production';
}

function isPrivateIPv4(address: string): boolean {
  const octets = address.split('.').map((value) => Number.parseInt(value, 10));
  if (octets.length !== 4 || octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  // CGNAT range (100.64.0.0/10) — used by cloud metadata/internal services.
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
  // Benchmarking range (198.18.0.0/15).
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80') || normalized.startsWith('fec0')) return true;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — validate the embedded IPv4.
  const mappedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedMatch?.[1]) {
    return isPrivateIPv4(mappedMatch[1]);
  }
  return false;
}

function isPrivateAddress(address: string): boolean {
  const type = isIP(address);
  if (type === 4) {
    return isPrivateIPv4(address);
  }
  if (type === 6) {
    return isPrivateIPv6(address);
  }
  return true;
}

function assertHostnamePolicy(url: URL): void {
  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw NextResponse.json({ error: 'Host is not allowed' }, { status: 403 });
  }

  // Literal IPs in URLs are validated directly (DNS never runs for them).
  if (isIP(hostname) !== 0 && !isDnsValidationDisabled() && isPrivateAddress(hostname)) {
    throw NextResponse.json({ error: 'Resolved address is not permitted' }, { status: 403 });
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
}

/**
 * Resolve a hostname and validate every record against the private-range
 * policy. Returns the address to connect to. Because the connection then uses
 * this pinned address (not a second resolution), DNS-rebinding between the
 * check and the fetch is not possible.
 */
async function resolvePinnedAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  if (isIP(hostname) !== 0) {
    return { address: hostname, family: isIP(hostname) as 4 | 6 };
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dnsLookup(hostname, { all: true });
  } catch (error) {
    console.error('DNS resolution failed for import URL', error);
    throw NextResponse.json({ error: 'Unable to resolve host' }, { status: 400 });
  }

  if (records.length === 0) {
    throw NextResponse.json({ error: 'Unable to resolve host' }, { status: 400 });
  }

  if (!isDnsValidationDisabled() && records.some((record) => isPrivateAddress(record.address))) {
    throw NextResponse.json({ error: 'Resolved address is not permitted' }, { status: 403 });
  }

  const preferred = records.find((record) => record.family === 4) ?? records[0]!;
  return { address: preferred.address, family: preferred.family === 6 ? 6 : 4 };
}

/**
 * HTTP(S) GET that connects to a pre-validated, pinned IP address while
 * preserving TLS SNI/Host semantics for the original hostname. The response
 * body is streamed with a hard size cap.
 */
async function requestPinned(
  url: URL,
  headers: Record<string, string>,
): Promise<LimitedResponse> {
  const { address, family } = await resolvePinnedAddress(url.hostname);
  const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return await new Promise<LimitedResponse>((resolve, reject) => {
    const req = requestFn(
      {
        protocol: url.protocol,
        host: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers,
        timeout: REQUEST_TIMEOUT_MS,
        // Pin the connection to the validated address. `servername`/Host stay
        // on the hostname so TLS and virtual hosting behave normally.
        lookup: (_hostname, options, callback) => {
          if (options && typeof options === 'object' && 'all' in options && options.all) {
            callback(null, [{ address, family }]);
            return;
          }
          callback(null, address, family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let settled = false;

        response.on('data', (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > MAX_CONTENT_LENGTH_BYTES) {
            settled = true;
            response.destroy();
            reject(NextResponse.json({ error: 'Content too large' }, { status: 413 }));
            return;
          }
          chunks.push(chunk);
        });

        response.on('end', () => {
          if (settled) {
            return;
          }
          resolve({
            status: response.statusCode ?? 0,
            ok: (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });

        response.on('error', (error) => {
          if (!settled) {
            reject(error);
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('Import request timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

type ImportTransport = (url: URL, headers: Record<string, string>) => Promise<LimitedResponse>;

let importTransportOverride: ImportTransport | null = null;

function performRequest(url: URL, headers: Record<string, string>): Promise<LimitedResponse> {
  return (importTransportOverride ?? requestPinned)(url, headers);
}

function assertBodyWithinLimit(body: string): void {
  if (new TextEncoder().encode(body).length > MAX_CONTENT_LENGTH_BYTES) {
    throw NextResponse.json({ error: 'Content too large' }, { status: 413 });
  }
}

async function fetchWithRedirects(url: URL, options: FetchRedirectOptions = {}): Promise<LimitedResponse> {
  const { remaining = 3, accept = 'text/html,application/json', userAgent = DEFAULT_USER_AGENT } = options;

  const response = await performRequest(url, {
    'User-Agent': userAgent,
    Accept: accept,
  });
  assertBodyWithinLimit(response.body);

  if (response.status >= 300 && response.status < 400) {
    if (remaining === 0) {
      throw NextResponse.json({ error: 'Too many redirects during import' }, { status: 400 });
    }

    const location = response.headers.location;
    if (!location) {
      throw NextResponse.json({ error: 'Redirect missing location header' }, { status: 400 });
    }

    const nextUrl = new URL(location, url);
    if (!ALLOWED_PROTOCOLS.includes(nextUrl.protocol)) {
      throw NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
    }
    assertHostnamePolicy(nextUrl);
    return fetchWithRedirects(nextUrl, { remaining: remaining - 1, accept, userAgent });
  }

  return response;
}

async function fetchContent(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    throw NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
  }
  assertHostnamePolicy(parsed);

  const response = await fetchWithRedirects(parsed);

  if (!response.ok) {
    throw new Error(`Failed to fetch content (${response.status})`);
  }

  return response.body;
}

function isRedditUrl(url: URL): boolean {
  return /reddit\.com\/r\//i.test(url.hostname + url.pathname);
}

async function handleReddit(url: URL): Promise<ReadableContent> {
  assertHostnamePolicy(url);
  const searchWithRaw = url.search ? `${url.search}&raw_json=1` : '?raw_json=1';
  const jsonUrl = url.origin + url.pathname + '.json' + searchWithRaw;
  const response = await fetchWithRedirects(new URL(jsonUrl), {
    accept: 'application/json',
    userAgent: DEFAULT_USER_AGENT,
  });

  if (!response.ok) {
    throw new Error(`Reddit response ${response.status}`);
  }

  const json = JSON.parse(response.body) as any;
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

export const __test = {
  setTransport(transport: ImportTransport | null) {
    importTransportOverride = transport;
  },
};

export type { LimitedResponse as ImportTransportResponse };
