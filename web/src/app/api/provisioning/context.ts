import {
  InMemoryProvisioningStore,
  ProvisioningOrchestrator,
  InMemoryProvisioningTokenCache,
  OpenAIProvisioningProvider,
  JsonFileProvisioningStore,
  type ProvisioningStore,
} from '@/lib/provisioning';
import { ConvexProvisioningStore } from '@/lib/provisioning/storage/convexStore';
import { resolveConvexAuthConfig } from '@/lib/convexAuth';

function createStore(): ProvisioningStore {
  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();
  if (convexUrl && auth) {
    try {
      return new ConvexProvisioningStore({
        baseUrl: convexUrl,
        authToken: auth.token,
        authScheme: auth.scheme,
      });
    } catch (error) {
      console.warn('Failed to initialise Convex provisioning store:', error);
    }
  }

  const path = process.env.PROVISIONING_DATA_PATH?.trim();
  if (path) {
    return new JsonFileProvisioningStore(path);
  }

  return new InMemoryProvisioningStore();
}

let store: ProvisioningStore | null = null;
let tokenCache: InMemoryProvisioningTokenCache | null = null;
let orchestrator: ProvisioningOrchestrator | null = null;

function resolveStore(): ProvisioningStore {
  if (!store) {
    store = createStore();
  }
  return store;
}

function resolveTokenCache(): InMemoryProvisioningTokenCache {
  if (!tokenCache) {
    tokenCache = new InMemoryProvisioningTokenCache();
  }
  return tokenCache;
}

function resolveOrchestrator(): ProvisioningOrchestrator {
  if (!orchestrator) {
    orchestrator = new ProvisioningOrchestrator({
      providers: [new OpenAIProvisioningProvider()],
      store: resolveStore(),
      tokenCache: resolveTokenCache(),
    });
  }
  return orchestrator;
}

export function getProvisioningOrchestrator(): ProvisioningOrchestrator {
  return resolveOrchestrator();
}

export function getProvisioningStore() {
  return resolveStore();
}

export function getProvisioningTokenCache() {
  return resolveTokenCache();
}

export function resetProvisioningContextForTesting(): void {
  store = null;
  tokenCache = null;
  orchestrator = null;
}
