import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ProvisionedCredentialRecord, ProvisioningStore } from '../types';

interface SerializedStore {
  credentials: ProvisionedCredentialRecord[];
}

async function readStore(path: string): Promise<SerializedStore | null> {
  try {
    const data = await readFile(path, 'utf8');
    return JSON.parse(data) as SerializedStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeStore(path: string, store: SerializedStore) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2), 'utf8');
}

export class JsonFileProvisioningStore implements ProvisioningStore {
  private readonly path: string;
  private cache: Map<string, ProvisionedCredentialRecord> = new Map();
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;

  constructor(path: string) {
    this.path = path;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = (async () => {
        const store = await readStore(this.path);
        if (store) {
          this.cache = new Map(store.credentials.map((record) => [record.id, record]));
        }
        this.loaded = true;
        this.loadingPromise = null;
      })();
    }

    await this.loadingPromise;
  }

  private async persist(): Promise<void> {
    const credentials = Array.from(this.cache.values());
    await writeStore(this.path, { credentials });
  }

  async save(record: ProvisionedCredentialRecord): Promise<void> {
    await this.ensureLoaded();
    this.cache.set(record.id, { ...record });
    await this.persist();
  }

  async findActive(userId: string, provider: string): Promise<ProvisionedCredentialRecord | null> {
    await this.ensureLoaded();
    for (const record of this.cache.values()) {
      if (record.userId === userId && record.provider === provider && record.status === 'active') {
        return { ...record };
      }
    }
    return null;
  }

  async markRevoked(credentialId: string): Promise<void> {
    await this.ensureLoaded();
    const record = this.cache.get(credentialId);
    if (!record) {
      return;
    }
    this.cache.set(credentialId, { ...record, status: 'revoked' });
    await this.persist();
  }

  async list(): Promise<ProvisionedCredentialRecord[]> {
    await this.ensureLoaded();
    return Array.from(this.cache.values()).map((record) => ({ ...record }));
  }
}
