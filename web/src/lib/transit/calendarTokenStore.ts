import { promises as fs } from 'fs';
import { dirname } from 'path';
import crypto from 'crypto';
import { fetchMutation, fetchQuery, type NextjsOptions } from 'convex/nextjs';
import { api } from '../../../convex/_generated/api';
import { buildConvexClientOptions } from '../convex/client';
import { resolveConvexAuthConfig } from '../convexAuth';

export interface CalendarTokenRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string[];
}

export interface CalendarTokenStore {
  get(userId: string): Promise<CalendarTokenRecord | null>;
  save(userId: string, record: CalendarTokenRecord): Promise<void>;
  clear(userId: string): Promise<void>;
}

type StoreKind = 'convex' | 'file' | 'memory';

let store: CalendarTokenStore | null = null;
let storeKind: StoreKind | null = null;

function getEncryptionKey(): Buffer {
  const raw = process.env.TRANSIT_CALENDAR_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('TRANSIT_CALENDAR_ENCRYPTION_KEY is not configured');
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error('TRANSIT_CALENDAR_ENCRYPTION_KEY must be base64 encoded 32 bytes');
  }
  if (key.length !== 32) {
    throw new Error('TRANSIT_CALENDAR_ENCRYPTION_KEY must decode to 32 bytes for AES-256-GCM');
  }
  return key;
}

function encryptPayload(payload: CalendarTokenRecord): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const serialized = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptPayload(encoded: string): CalendarTokenRecord {
  const key = getEncryptionKey();
  const buffer = Buffer.from(encoded, 'base64');
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed = JSON.parse(decrypted.toString('utf8')) as Partial<CalendarTokenRecord>;
  if (
    typeof parsed.accessToken !== 'string' ||
    typeof parsed.refreshToken !== 'string' ||
    typeof parsed.expiresAt !== 'number'
  ) {
    throw new Error('Invalid calendar token payload');
  }
  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt,
    scope: Array.isArray(parsed.scope) ? parsed.scope : [],
  };
}

class InMemoryTokenStore implements CalendarTokenStore {
  private readonly map = new Map<string, string>();

  async get(userId: string): Promise<CalendarTokenRecord | null> {
    const encoded = this.map.get(userId);
    if (!encoded) {
      return null;
    }
    try {
      return decryptPayload(encoded);
    } catch (error) {
      console.warn('Failed to decrypt in-memory calendar token', error);
      this.map.delete(userId);
      return null;
    }
  }

  async save(userId: string, record: CalendarTokenRecord): Promise<void> {
    this.map.set(userId, encryptPayload(record));
  }

  async clear(userId: string): Promise<void> {
    this.map.delete(userId);
  }
}

class FileTokenStore implements CalendarTokenStore {
  constructor(private readonly filePath: string) {}

  private async ensureDirectory(): Promise<void> {
    const directory = dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });
  }

  private async readAll(): Promise<Record<string, string>> {
    try {
      const contents = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(contents) as Record<string, string>;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Failed to read calendar token store; starting fresh', error);
      }
    }
    return {};
  }

  private async writeAll(payload: Record<string, string>): Promise<void> {
    await this.ensureDirectory();
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), 'utf8');
  }

  async get(userId: string): Promise<CalendarTokenRecord | null> {
    const data = await this.readAll();
    const encoded = data[userId];
    if (!encoded) {
      return null;
    }
    try {
      return decryptPayload(encoded);
    } catch (error) {
      console.warn('Failed to decrypt stored calendar token; clearing entry', error);
      delete data[userId];
      await this.writeAll(data);
      return null;
    }
  }

  async save(userId: string, record: CalendarTokenRecord): Promise<void> {
    const data = await this.readAll();
    data[userId] = encryptPayload(record);
    await this.writeAll(data);
  }

  async clear(userId: string): Promise<void> {
    const data = await this.readAll();
    if (data[userId]) {
      delete data[userId];
      await this.writeAll(data);
    }
  }
}

class ConvexCalendarTokenStore implements CalendarTokenStore {
  constructor(private readonly options: NextjsOptions) {}

  async get(userId: string): Promise<CalendarTokenRecord | null> {
    const record = await fetchQuery(
      api.transit.getCalendarToken,
      { userId },
      this.options,
    );
    if (!record) {
      return null;
    }
    try {
      return decryptPayload(record.encryptedPayload);
    } catch (error) {
      console.warn('Failed to decrypt Convex calendar token; clearing entry', error);
      await fetchMutation(
        api.transit.clearCalendarToken,
        { userId },
        this.options,
      );
      return null;
    }
  }

  async save(userId: string, record: CalendarTokenRecord): Promise<void> {
    const encryptedPayload = encryptPayload(record);
    await fetchMutation(
      api.transit.setCalendarToken,
      {
        userId,
        encryptedPayload,
        expiresAt: record.expiresAt,
        scope: record.scope,
      },
      this.options,
    );
  }

  async clear(userId: string): Promise<void> {
    await fetchMutation(
      api.transit.clearCalendarToken,
      { userId },
      this.options,
    );
  }
}

function createStore(): CalendarTokenStore {
  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();
  if (convexUrl && auth) {
    try {
      const options = buildConvexClientOptions({
        baseUrl: convexUrl,
        authToken: auth.token,
        authScheme: auth.scheme,
      });
      storeKind = 'convex';
      return new ConvexCalendarTokenStore(options);
    } catch (error) {
      console.warn('Failed to initialise Convex calendar token store; falling back to local storage:', error);
    }
  }

  const filePath = process.env.TRANSIT_CALENDAR_TOKENS_PATH?.trim();
  if (filePath) {
    storeKind = 'file';
    return new FileTokenStore(filePath);
  }
  storeKind = 'memory';
  return new InMemoryTokenStore();
}

export function getCalendarTokenStore(): CalendarTokenStore {
  if (!store) {
    store = createStore();
  }
  return store;
}

export function getCalendarTokenStoreKind(): StoreKind | null {
  return storeKind;
}

export function resetCalendarTokenStoreForTesting(): void {
  store = null;
  storeKind = null;
}
