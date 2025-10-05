interface SecureFetchOptions extends RequestInit {
  signal?: AbortSignal;
}

export class SecureFetchError extends Error {
  public status?: number;
  public statusText?: string;
  public body?: unknown;

  constructor(message: string, init: Partial<SecureFetchError> = {}) {
    super(message);
    this.name = 'SecureFetchError';
    Object.assign(this, init);
  }
}

const buildHeaders = (initHeaders: HeadersInit | undefined, hasBody: boolean): HeadersInit => {
  const base: Record<string, string> = {
    'X-Requested-With': 'SecureFetch',
  };

  if (hasBody) {
    base['Content-Type'] = 'application/json';
  }

  if (!initHeaders) {
    return base;
  }

  return {
    ...base,
    ...(initHeaders as Record<string, string>),
  };
};

export async function secureFetch(input: RequestInfo, init: SecureFetchOptions = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(input, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'manual',
      referrerPolicy: 'no-referrer',
      integrity: undefined,
      ...init,
      signal: init.signal ?? controller.signal,
      headers: buildHeaders(init.headers, Boolean(init.body)),
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.clone().json();
      } catch {
        errorBody = await response.text();
      }

      throw new SecureFetchError('Request failed', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function secureFetchJson<T>(input: RequestInfo, init?: SecureFetchOptions): Promise<T> {
  const response = await secureFetch(input, init);
  return (await response.json()) as T;
}
