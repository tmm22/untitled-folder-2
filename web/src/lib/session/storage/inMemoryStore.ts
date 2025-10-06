import type { SessionRecord, SessionStore } from '../types';

export class InMemorySessionStore implements SessionStore {
  private readonly records = new Map<string, SessionRecord>();

  async save(record: SessionRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async find(id: string): Promise<SessionRecord | null> {
    const record = this.records.get(id);
    if (!record) {
      return null;
    }
    if (record.expiresAt < Date.now()) {
      this.records.delete(id);
      return null;
    }
    return record;
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  async prune(now: number): Promise<void> {
    for (const [id, record] of this.records.entries()) {
      if (record.expiresAt < now) {
        this.records.delete(id);
      }
    }
  }
}
