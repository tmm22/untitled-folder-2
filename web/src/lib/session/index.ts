import { resolveConvexAuthConfig } from '@/lib/convexAuth';
import { InMemorySessionStore } from './storage/inMemoryStore';
import { JsonFileSessionStore } from './storage/jsonFileStore';
import { ConvexSessionStore } from './storage/convexStore';
import type { SessionStore } from './types';

export type SessionStoreKind = 'convex' | 'json-file' | 'memory';

let store: SessionStore | null = null;
let storeKind: SessionStoreKind | null = null;

interface CreateStoreOptions {
  preferConvex?: boolean;
}

function createStore(options: CreateStoreOptions = {}): SessionStore {
  const { preferConvex = true } = options;
  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();

  if (preferConvex && convexUrl && auth) {
    try {
      const convexStore = new ConvexSessionStore({
        baseUrl: convexUrl,
        authToken: auth.token,
        authScheme: auth.scheme,
      });
      storeKind = 'convex';
      return convexStore;
    } catch (error) {
      console.warn('Failed to initialise Convex session store:', error);
    }
  }

  const filePath = process.env.SESSION_DATA_PATH?.trim();
  if (filePath) {
    storeKind = 'json-file';
    return new JsonFileSessionStore(filePath);
  }

  storeKind = 'memory';
  return new InMemorySessionStore();
}

export function getSessionStore(): SessionStore {
  if (!store) {
    store = createStore();
  }
  return store;
}

function describeReason(reason: unknown): string {
  if (!reason) {
    return 'unknown error';
  }
  if (reason instanceof Error) {
    return reason.message;
  }
  try {
    return String(reason);
  } catch {
    return 'unknown error';
  }
}

export function promoteSessionFallbackStore(reason?: unknown): SessionStore | null {
  if (storeKind !== 'convex') {
    return null;
  }
  const fallback = createStore({ preferConvex: false });
  store = fallback;
  const fallbackKind = storeKind ?? 'memory';
  console.warn(`Falling back to ${fallbackKind} session store after Convex failure:`, describeReason(reason));
  return fallback;
}

export function getSessionStoreKind(): SessionStoreKind | null {
  return storeKind;
}

export function resetSessionStoreForTesting(): void {
  store = null;
  storeKind = null;
}
