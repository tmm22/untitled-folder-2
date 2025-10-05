'use client';

import { create } from 'zustand';
import {
  createVault,
  deleteProviderKey,
  getProviderKey,
  getRawMasterKey,
  hasVault,
  isUnlocked,
  listStoredProviders,
  lockVault,
  destroyVault,
  saveProviderKey,
  unlockVault,
} from '@/lib/crypto/LocalVault';
import { clearSession, ensureSession, getSessionHeaders } from '@/lib/crypto/sessionClient';
import type { ProviderType } from '@/modules/tts/types';

interface CredentialsState {
  hasVault: boolean;
  isUnlocked: boolean;
  storedProviders: ProviderType[];
  status: 'idle' | 'loading';
  error?: string;
  actions: {
    initialize: () => Promise<void>;
    createVault: (passphrase: string) => Promise<void>;
    unlock: (passphrase: string) => Promise<void>;
    lock: () => void;
    saveKey: (provider: ProviderType, apiKey: string) => Promise<void>;
    deleteKey: (provider: ProviderType) => Promise<void>;
    refreshProviders: () => Promise<void>;
    getAuthHeaders: (provider: ProviderType) => Promise<Record<string, string>>;
    resetVault: () => Promise<void>;
  };
}

const isBrowser = () => typeof window !== 'undefined' && typeof window.crypto !== 'undefined' && 'indexedDB' in window;

export const useCredentialStore = create<CredentialsState>((set, get) => ({
  hasVault: false,
  isUnlocked: false,
  storedProviders: [],
  status: 'loading',
  error: undefined,
  actions: {
    initialize: async () => {
      if (!isBrowser()) {
        return;
      }

      try {
        set({ status: 'loading', error: undefined });
        const exists = await hasVault();
        set({ hasVault: exists, status: 'idle' });
        if (exists && isUnlocked()) {
          const providers = await listStoredProviders();
          set({ isUnlocked: true, storedProviders: providers });
        }
      } catch (error) {
        console.error('Failed to initialize credentials', error);
        set({ status: 'idle', error: 'Unable to initialise vault' });
      }
    },
    createVault: async (passphrase) => {
      if (!isBrowser()) {
        throw new Error('Vault creation requires the browser');
      }

      try {
        set({ status: 'loading', error: undefined });
        await createVault(passphrase);
        const providers = await listStoredProviders();
        const rawKey = getRawMasterKey();
        if (rawKey) {
          await ensureSession(rawKey);
        }
        set({ hasVault: true, isUnlocked: true, storedProviders: providers, status: 'idle' });
      } catch (error) {
        console.error('Failed to create vault', error);
        set({ status: 'idle', error: error instanceof Error ? error.message : 'Unable to create vault' });
        throw error;
      }
    },
    unlock: async (passphrase) => {
      if (!isBrowser()) {
        throw new Error('Vault unlock requires the browser');
      }

      try {
        set({ status: 'loading', error: undefined });
        await unlockVault(passphrase);
        const providers = await listStoredProviders();
        const rawKey = getRawMasterKey();
        if (rawKey) {
          await ensureSession(rawKey);
        }
        set({ isUnlocked: true, storedProviders: providers, status: 'idle' });
      } catch (error) {
        console.error('Failed to unlock vault', error);
        set({ status: 'idle', error: error instanceof Error ? error.message : 'Unable to unlock vault' });
        throw error;
      }
    },
    lock: () => {
      lockVault();
      clearSession();
      set({ isUnlocked: false, storedProviders: [] });
    },
    saveKey: async (provider, apiKey) => {
      if (!isBrowser()) {
        throw new Error('Key management requires the browser');
      }

      try {
        await saveProviderKey(provider, apiKey);
        const providers = await listStoredProviders();
        set({ storedProviders: providers, error: undefined });
      } catch (error) {
        console.error('Failed to save provider key', error);
        set({ error: error instanceof Error ? error.message : 'Unable to save API key' });
        throw error;
      }
    },
    deleteKey: async (provider) => {
      try {
        await deleteProviderKey(provider);
        const providers = await listStoredProviders();
        set({ storedProviders: providers, error: undefined });
      } catch (error) {
        console.error('Failed to delete provider key', error);
        set({ error: error instanceof Error ? error.message : 'Unable to delete API key' });
        throw error;
      }
    },
    refreshProviders: async () => {
      const providers = await listStoredProviders();
      set({ storedProviders: providers });
    },
    resetVault: async () => {
      if (!isBrowser()) {
        throw new Error('Vault reset requires the browser');
      }

      try {
        set({ status: 'loading', error: undefined });
        await destroyVault();
        clearSession();
        set({ hasVault: false, isUnlocked: false, storedProviders: [], status: 'idle' });
      } catch (error) {
        console.error('Failed to reset vault', error);
        set({ status: 'idle', error: error instanceof Error ? error.message : 'Unable to reset vault' });
        throw error;
      }
    },
    getAuthHeaders: async (provider) => {
      if (!isBrowser()) {
        return {};
      }

      try {
        const rawKey = getRawMasterKey();
        if (!rawKey) {
          return {};
        }
        await ensureSession(rawKey);
        const apiKey = await getProviderKey(provider);
        if (!apiKey) {
          return {};
        }
        return getSessionHeaders(apiKey);
      } catch (error) {
        console.error('Failed to prepare auth headers', error);
        return {};
      }
    },
  },
}));
