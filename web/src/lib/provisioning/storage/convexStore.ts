import type {
  ProvisionedCredentialRecord,
  ProvisioningStore,
  UsageRecord,
} from '../types';

interface ConvexProvisioningStoreOptions {
  baseUrl: string;
  authToken: string;
  authScheme?: string;
  fetchImpl?: typeof fetch;
}

interface ConvexResponse<T> {
  result: T;
}

function buildHeaders(token: string, scheme: string, initHeaders?: HeadersInit): HeadersInit {
  return {
    Authorization: `${scheme} ${token}`,
    'Content-Type': 'application/json',
    ...initHeaders,
  };
}

export class ConvexProvisioningStore implements ProvisioningStore {
  private readonly baseUrl: string;
  private readonly authToken: string;
  private readonly authScheme: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConvexProvisioningStoreOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.authToken = options.authToken;
    this.authScheme = options.authScheme ?? 'Bearer';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/provisioning/${path}`, {
      method: 'POST',
      headers: buildHeaders(this.authToken, this.authScheme),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Convex provisioning request failed (${response.status}): ${errorBody}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = (await response.json().catch(() => ({}))) as ConvexResponse<T> | T;
    if (payload && typeof payload === 'object' && 'result' in payload) {
      return (payload as ConvexResponse<T>).result;
    }
    return payload as T;
  }

  async save(record: ProvisionedCredentialRecord): Promise<void> {
    await this.request('saveCredential', { record });
  }

  async findActive(userId: string, provider: string): Promise<ProvisionedCredentialRecord | null> {
    const result = await this.request<{ credential: ProvisionedCredentialRecord | null }>('findActiveCredential', {
      userId,
      provider,
    });
    return result.credential;
  }

  async markRevoked(credentialId: string): Promise<void> {
    await this.request('markCredentialRevoked', { credentialId });
  }

  async list(): Promise<ProvisionedCredentialRecord[]> {
    const result = await this.request<{ credentials: ProvisionedCredentialRecord[] }>('listCredentials');
    return result.credentials;
  }

  async recordUsage(entry: Omit<UsageRecord, 'id'> & { id?: string }): Promise<UsageRecord> {
    const result = await this.request<{ usage: UsageRecord }>('recordUsage', { entry });
    return result.usage;
  }

  async listUsage(userId: string): Promise<UsageRecord[]> {
    const result = await this.request<{ usage: UsageRecord[] }>('listUsage', { userId });
    return result.usage;
  }
}
