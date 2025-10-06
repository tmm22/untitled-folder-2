import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { SessionRecord, SessionStore } from '../types';

interface SessionCollection {
  entries: Record<string, SessionRecord>;
}

export class JsonFileSessionStore implements SessionStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async readFile(): Promise<SessionCollection> {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      const data = JSON.parse(content) as SessionCollection;
      if (!data || typeof data !== 'object' || !data.entries) {
        return { entries: {} };
      }
      return data;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { entries: {} };
      }
      throw error;
    }
  }

  private async writeFile(collection: SessionCollection): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(collection), 'utf8');
  }

  private async loadEntries(): Promise<Record<string, SessionRecord>> {
    const { entries } = await this.readFile();
    const now = Date.now();
    const filtered: Record<string, SessionRecord> = {};
    for (const [id, record] of Object.entries(entries)) {
      if (record.expiresAt > now) {
        filtered[id] = record;
      }
    }
    if (Object.keys(filtered).length !== Object.keys(entries).length) {
      await this.writeFile({ entries: filtered });
    }
    return filtered;
  }

  async save(record: SessionRecord): Promise<void> {
    const entries = await this.loadEntries();
    entries[record.id] = record;
    await this.writeFile({ entries });
  }

  async find(id: string): Promise<SessionRecord | null> {
    const entries = await this.loadEntries();
    return entries[id] ?? null;
  }

  async delete(id: string): Promise<void> {
    const entries = await this.loadEntries();
    if (entries[id]) {
      delete entries[id];
      await this.writeFile({ entries });
    }
  }

  async prune(now: number): Promise<void> {
    const entries = await this.loadEntries();
    const filtered: Record<string, SessionRecord> = {};
    for (const [id, record] of Object.entries(entries)) {
      if (record.expiresAt > now) {
        filtered[id] = record;
      }
    }
    await this.writeFile({ entries: filtered });
  }
}
