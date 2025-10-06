import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JsonFileProvisioningStore } from '@/lib/provisioning';
import type { ProvisionedCredentialRecord } from '@/lib/provisioning';

const BASE_RECORD: ProvisionedCredentialRecord = {
  id: 'cred-1',
  userId: 'user-1',
  provider: 'openai',
  tokenHash: 'hash',
  salt: 'salt',
  scopes: [],
  planTier: 'starter',
  issuedAt: 1,
  expiresAt: 2,
  status: 'active',
};

describe('JsonFileProvisioningStore', () => {
  let tempDir: string;
  let store: JsonFileProvisioningStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'prov-store-'));
    store = new JsonFileProvisioningStore(join(tempDir, 'store.json'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists records to disk and reloads', async () => {
    await store.save(BASE_RECORD);

    const secondStore = new JsonFileProvisioningStore(join(tempDir, 'store.json'));
    const active = await secondStore.findActive('user-1', 'openai');
    expect(active?.id).toBe('cred-1');
  });

  it('marks credentials as revoked and persists change', async () => {
    await store.save(BASE_RECORD);
    await store.markRevoked('cred-1');

    const secondStore = new JsonFileProvisioningStore(join(tempDir, 'store.json'));
    const active = await secondStore.findActive('user-1', 'openai');
    expect(active).toBeNull();

    const all = await secondStore.list();
    expect(all[0]?.status).toBe('revoked');
  });
});
