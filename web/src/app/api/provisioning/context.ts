import {
  InMemoryProvisioningStore,
  ProvisioningOrchestrator,
  InMemoryProvisioningTokenCache,
  OpenAIProvisioningProvider,
  JsonFileProvisioningStore,
} from '@/lib/provisioning';
import { ConvexProvisioningStore } from '@/lib/provisioning/storage/convexStore';
import { resolveConvexAuthConfig } from '@/lib/convexAuth';

function createStore() {
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

const store = createStore();
const tokenCache = new InMemoryProvisioningTokenCache();
const orchestrator = new ProvisioningOrchestrator({
  providers: [new OpenAIProvisioningProvider()],
  store,
  tokenCache,
});

export function getProvisioningOrchestrator(): ProvisioningOrchestrator {
  return orchestrator;
}

export function getProvisioningStore() {
  return store;
}

export function getProvisioningTokenCache() {
  return tokenCache;
}
