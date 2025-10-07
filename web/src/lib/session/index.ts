import { resolveConvexAuthConfig } from '@/lib/convexAuth';
import { InMemorySessionStore } from './storage/inMemoryStore';
import { JsonFileSessionStore } from './storage/jsonFileStore';
import { ConvexSessionStore } from './storage/convexStore';
import type { SessionStore } from './types';

let store: SessionStore | null = null;

function createStore(): SessionStore {
  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();
  if (convexUrl && auth) {
    try {
      return new ConvexSessionStore({ baseUrl: convexUrl, authToken: auth.token, authScheme: auth.scheme });
    } catch (error) {
      console.warn('Failed to initialise Convex session store:', error);
    }
  }

  const filePath = process.env.SESSION_DATA_PATH?.trim();
  if (filePath) {
    return new JsonFileSessionStore(filePath);
  }

  return new InMemorySessionStore();
}

export function getSessionStore(): SessionStore {
  if (!store) {
    store = createStore();
  }
  return store;
}
