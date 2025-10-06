import { ProvisioningTokenCache } from './types';

interface CacheEntry {
  token: string;
  expiresAt: number;
}

export class InMemoryProvisioningTokenCache implements ProvisioningTokenCache {
  private readonly map = new Map<string, CacheEntry>();

  async store(credentialId: string, token: string, expiresAt: number): Promise<void> {
    this.map.set(credentialId, { token, expiresAt });
  }

  resolve(credentialId: string): string | null {
    const entry = this.map.get(credentialId);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.map.delete(credentialId);
      return null;
    }
    return entry.token;
  }

  async delete(credentialId: string): Promise<void> {
    this.map.delete(credentialId);
  }
}

export const globalProvisioningTokenCache = new InMemoryProvisioningTokenCache();
