import {
  InMemoryProvisioningStore,
  ProvisioningOrchestrator,
  InMemoryProvisioningTokenCache,
  OpenAIProvisioningProvider,
  JsonFileProvisioningStore,
} from '@/lib/provisioning';
import { ConvexProvisioningStore } from '@/lib/provisioning/storage/convexStore';

function createStore() {
  const convexUrl = process.env.CONVEX_URL?.trim();
  const convexAdminKey = process.env.CONVEX_ADMIN_KEY?.trim();
  if (convexUrl && convexAdminKey) {
    try {
      return new ConvexProvisioningStore({ baseUrl: convexUrl, adminKey: convexAdminKey });
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
