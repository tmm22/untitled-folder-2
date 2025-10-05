'use client';

import { get, set } from 'idb-keyval';
import { decodeBase64, decodeToString, encodeBase64, encodeString } from '@/lib/utils/base64';
import type { ProviderType } from '@/modules/tts/types';

const META_KEY = 'tts_vault_meta';
const DATA_KEY = 'tts_vault_data';
const ITERATIONS = 250_000;
const VERSION = 1;

interface VaultMeta {
  version: number;
  salt: string; // base64
  createdAt: string;
  iterations: number;
}

interface VaultRecord {
  provider: ProviderType;
  ciphertext: string; // base64
  nonce: string; // base64, 12 bytes
  createdAt: string;
}

type VaultData = Record<ProviderType, VaultRecord>;

interface UnlockedContext {
  aesKey: CryptoKey;
  rawKey: ArrayBuffer;
}

let unlockedContext: UnlockedContext | null = null;

const textEncoder = new TextEncoder();

function isBrowser() {
  return (
    typeof window !== 'undefined' &&
    typeof window.crypto !== 'undefined' &&
    'indexedDB' in window
  );
}

async function deriveKey(passphrase: string, saltBytes: Uint8Array): Promise<UnlockedContext> {
  if (!isBrowser()) {
    throw new Error('LocalVault is only available in the browser');
  }

  const material = await window.crypto.subtle.importKey(
    'raw',
    encodeString(passphrase),
    'PBKDF2',
    false,
    ['deriveKey', 'deriveBits'],
  );

  const params = {
    name: 'PBKDF2',
    salt: saltBytes,
    iterations: ITERATIONS,
    hash: 'SHA-256',
  } as const;

  const aesKey = await window.crypto.subtle.deriveKey(
    params,
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  const rawKey = await window.crypto.subtle.deriveBits(params, material, 256);
  return { aesKey, rawKey };
}

async function getMeta(): Promise<VaultMeta | undefined> {
  return (await get<VaultMeta>(META_KEY)) ?? undefined;
}

async function getData(): Promise<VaultData> {
  return (await get<VaultData>(DATA_KEY)) ?? ({} as VaultData);
}

export async function hasVault(): Promise<boolean> {
  return Boolean(await getMeta());
}

export function isUnlocked(): boolean {
  return unlockedContext !== null;
}

export async function createVault(passphrase: string): Promise<void> {
  if (!isBrowser()) {
    throw new Error('Vault creation requires a browser environment');
  }

  if (await hasVault()) {
    throw new Error('Vault already exists');
  }

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const context = await deriveKey(passphrase, salt);
  unlockedContext = context;

  const meta: VaultMeta = {
    version: VERSION,
    salt: encodeBase64(salt),
    createdAt: new Date().toISOString(),
    iterations: ITERATIONS,
  };

  await set(META_KEY, meta);
  await set(DATA_KEY, {} as VaultData);
}

export async function unlockVault(passphrase: string): Promise<void> {
  if (!isBrowser()) {
    throw new Error('Vault unlock requires a browser environment');
  }

  const meta = await getMeta();
  if (!meta) {
    throw new Error('Vault has not been created yet');
  }

  const context = await deriveKey(passphrase, decodeBase64(meta.salt));
  // Attempt to decrypt one record (if exists) to validate passphrase
  const data = await getData();
  const providers = Object.keys(data) as ProviderType[];
  if (providers.length > 0) {
    const record = data[providers[0]!];
    await decryptRecord(record, context.aesKey); // throws if invalid
  }

  unlockedContext = context;
}

export function lockVault(): void {
  unlockedContext = null;
}

async function encryptValue(value: string, aesKey: CryptoKey) {
  const nonce = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    encodeString(value),
  );
  return {
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(new Uint8Array(ciphertextBuffer)),
  };
}

async function decryptRecord(record: VaultRecord, aesKey: CryptoKey): Promise<string> {
  const nonce = decodeBase64(record.nonce);
  const ciphertext = decodeBase64(record.ciphertext);
  const plaintextBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    ciphertext,
  );
  return decodeToString(new Uint8Array(plaintextBuffer));
}

export async function listStoredProviders(): Promise<ProviderType[]> {
  const data = await getData();
  return Object.keys(data) as ProviderType[];
}

export async function saveProviderKey(provider: ProviderType, apiKey: string): Promise<void> {
  if (!unlockedContext) {
    throw new Error('Vault is locked');
  }

  const payload = await encryptValue(apiKey, unlockedContext.aesKey);
  const data = await getData();
  const record: VaultRecord = {
    provider,
    ciphertext: payload.ciphertext,
    nonce: payload.nonce,
    createdAt: new Date().toISOString(),
  };

  const nextData: VaultData = { ...data, [provider]: record };
  await set(DATA_KEY, nextData);
}

export async function deleteProviderKey(provider: ProviderType): Promise<void> {
  const data = await getData();
  if (!(provider in data)) {
    return;
  }

  const { [provider]: _, ...rest } = data;
  await set(DATA_KEY, rest as VaultData);
}

export async function getProviderKey(provider: ProviderType): Promise<string | undefined> {
  if (!unlockedContext) {
    throw new Error('Vault is locked');
  }

  const data = await getData();
  const record = data[provider];
  if (!record) {
    return undefined;
  }

  return decryptRecord(record, unlockedContext.aesKey);
}

export function getRawMasterKey(): ArrayBuffer | null {
  return unlockedContext?.rawKey ?? null;
}

