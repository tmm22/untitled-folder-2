export interface ResilientRepositoryOptions<T extends object> {
  primary: T;
  /** Fallback store, or a factory that is only invoked on first failover. */
  fallback: T | (() => T);
  /** Label used in log lines, e.g. "account". */
  label: string;
  /** Returns true when the error looks like a Convex transport failure. */
  isTransportError: (error: unknown) => boolean;
  /** How long to serve from the fallback before probing the primary again. */
  retryAfterMs?: number;
  onFallback?: () => void;
  onRecovered?: () => void;
}

const DEFAULT_RETRY_AFTER_MS = 30_000;

/**
 * Wrap a repository so Convex transport failures degrade to a fallback store
 * temporarily instead of permanently. After `retryAfterMs`, the next call
 * probes the primary again so a Convex blip does not silently zero out data
 * for the lifetime of the process.
 */
export function createResilientRepository<T extends object>(options: ResilientRepositoryOptions<T>): T {
  const { primary, label, isTransportError } = options;
  const retryAfterMs = options.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;

  let fallbackUntil = 0;
  let fallbackInstance: T | null = typeof options.fallback === 'function' ? null : options.fallback;

  const resolveFallback = (): T => {
    if (!fallbackInstance) {
      fallbackInstance = (options.fallback as () => T)();
    }
    return fallbackInstance;
  };

  const callMethod = async (methodName: PropertyKey, args: unknown[]): Promise<unknown> => {
    const now = Date.now();
    const useFallback = now < fallbackUntil;

    if (!useFallback) {
      try {
        const result = await (primary as Record<PropertyKey, any>)[methodName](...args);
        if (fallbackUntil !== 0) {
          fallbackUntil = 0;
          console.info(`[${label}] Convex repository recovered; primary store active again.`);
          options.onRecovered?.();
        }
        return result;
      } catch (error) {
        if (!isTransportError(error)) {
          throw error;
        }
        fallbackUntil = Date.now() + retryAfterMs;
        console.error(
          `[${label}] Convex unavailable; serving from fallback store for ${Math.round(retryAfterMs / 1000)}s:`,
          error,
        );
        options.onFallback?.();
      }
    }

    return (resolveFallback() as Record<PropertyKey, any>)[methodName](...args);
  };

  return new Proxy(primary, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      return (...args: unknown[]) => callMethod(property, args);
    },
  }) as T;
}

/** Shared matcher for wrapped Convex repository errors. */
export function isConvexTransportError(error: unknown, messagePattern: RegExp): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (messagePattern.test(error.message)) {
    return true;
  }
  if (error.name === 'TypeError') {
    return true;
  }
  if (/fetch failed/i.test(error.message)) {
    return true;
  }
  const withCause = error as { cause?: unknown };
  if (withCause.cause) {
    return isConvexTransportError(withCause.cause, messagePattern);
  }
  return false;
}
