import { ProvisionedCredentialRecord, ProvisioningStore, UsageRecord } from '../types';

export class InMemoryProvisioningStore implements ProvisioningStore {
  private readonly records = new Map<string, ProvisionedCredentialRecord>();
  private readonly usage: UsageRecord[] = [];

  async save(record: ProvisionedCredentialRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async findActive(userId: string, provider: string): Promise<ProvisionedCredentialRecord | null> {
    for (const record of this.records.values()) {
      if (record.userId === userId && record.provider === provider && record.status === 'active') {
        return { ...record };
      }
    }
    return null;
  }

  async markRevoked(credentialId: string): Promise<void> {
    const record = this.records.get(credentialId);
    if (record) {
      this.records.set(credentialId, { ...record, status: 'revoked' });
    }
  }

  getRecord(credentialId: string): ProvisionedCredentialRecord | null {
    const record = this.records.get(credentialId);
    return record ? { ...record } : null;
  }

  listRecords(): ProvisionedCredentialRecord[] {
    return Array.from(this.records.values()).map((record) => ({ ...record }));
  }

  async list(): Promise<ProvisionedCredentialRecord[]> {
    return this.listRecords();
  }

  async recordUsage(entry: Omit<UsageRecord, 'id'> & { id?: string }): Promise<UsageRecord> {
    const record: UsageRecord = {
      id: entry.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      userId: entry.userId,
      provider: entry.provider,
      tokensUsed: entry.tokensUsed,
      costMinorUnits: entry.costMinorUnits,
      recordedAt: entry.recordedAt,
    };
    this.usage.push(record);
    return record;
  }

  async listUsage(userId: string): Promise<UsageRecord[]> {
    return this.usage.filter((row) => row.userId === userId).map((row) => ({ ...row }));
  }
}
