'use client';

import { FormEvent, useEffect, useState } from 'react';
import { providerRegistry } from '@/modules/tts/providerRegistry';
import { useCredentialStore } from '@/modules/credentials/store';
import type { ProviderType } from '@/modules/tts/types';

const providers = providerRegistry.all();

const mask = (value: string) => (value ? '•'.repeat(Math.min(value.length, 32)) : '—');

export function CredentialsPanel() {
  const hasVault = useCredentialStore((state) => state.hasVault);
  const isUnlocked = useCredentialStore((state) => state.isUnlocked);
  const storedProviders = useCredentialStore((state) => state.storedProviders);
  const status = useCredentialStore((state) => state.status);
  const error = useCredentialStore((state) => state.error);

  const actions = useCredentialStore((state) => state.actions);
  const { createVault, unlock, lock, saveKey, deleteKey, resetVault } = actions;

  useEffect(() => {
    void useCredentialStore.getState().actions.initialize();
  }, []);

  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [pendingKeys, setPendingKeys] = useState<Record<ProviderType, string>>({} as Record<ProviderType, string>);
  const [feedback, setFeedback] = useState<string | undefined>(undefined);

  useEffect(() => {
    setFeedback(error);
  }, [error]);

  const handleCreateVault = async (event: FormEvent) => {
    event.preventDefault();
    if (passphrase.length < 8) {
      setFeedback('Passphrase must be at least 8 characters.');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setFeedback('Passphrases do not match.');
      return;
    }

    try {
      await createVault(passphrase);
      setPassphrase('');
      setConfirmPassphrase('');
      setFeedback('Vault created and unlocked.');
    } catch {}
  };

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!passphrase) {
      setFeedback('Enter your passphrase.');
      return;
    }
    try {
      await unlock(passphrase);
      setPassphrase('');
      setFeedback('Vault unlocked.');
    } catch {}
  };

  const handleSaveKey = async (provider: ProviderType) => {
    const input = pendingKeys[provider];
    if (!input || input.trim().length < 10) {
      setFeedback('Enter a valid API key before saving.');
      return;
    }
    try {
      await saveKey(provider, input.trim());
      setPendingKeys((prev) => ({ ...prev, [provider]: '' }));
      setFeedback(`${providerRegistry.get(provider).displayName} key saved.`);
    } catch {}
  };

  const handleDeleteKey = async (provider: ProviderType) => {
    await deleteKey(provider);
    setFeedback(`${providerRegistry.get(provider).displayName} key removed.`);
  };

  const handleResetVault = async () => {
    if (typeof window !== 'undefined' && !window.confirm('This will remove all stored keys and vault data. Continue?')) {
      return;
    }

    try {
      await resetVault();
      setPassphrase('');
      setConfirmPassphrase('');
      setPendingKeys({} as Record<ProviderType, string>);
      setFeedback('Vault reset. Create a new passphrase to get started again.');
    } catch {}
  };

  if (status === 'loading') {
    return (
      <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-300">
        Initialising secure storage…
      </section>
    );
  }

  if (hasVault === false) {
    return (
      <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
        <h2 className="text-lg font-semibold text-white">Create secure credential vault</h2>
        <p className="mt-2 text-sm text-slate-400">
          Store provider API keys locally with AES-GCM encryption. The passphrase never leaves your device and is required
          every time you reopen the workspace.
        </p>
        <form className="mt-4 flex flex-col gap-3" onSubmit={handleCreateVault}>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Passphrase
            <input
              type="password"
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Confirm passphrase
            <input
              type="password"
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
              value={confirmPassphrase}
              onChange={(event) => setConfirmPassphrase(event.target.value)}
              minLength={8}
              required
            />
          </label>
          <button
            type="submit"
            className="mt-2 inline-flex w-max items-center justify-center rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Create vault
          </button>
          {feedback && <p className="text-sm text-amber-300">{feedback}</p>}
        </form>
      </section>
    );
  }

  if (!isUnlocked) {
    return (
      <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
        <h2 className="text-lg font-semibold text-white">Unlock credential vault</h2>
        <form className="mt-4 flex flex-col gap-3" onSubmit={handleUnlock}>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Passphrase
            <input
              type="password"
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              required
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white"
            >
              Unlock
            </button>
            <button
              type="button"
              className="rounded-md border border-rose-500/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-200"
              onClick={() => void handleResetVault()}
            >
              Reset vault
            </button>
            {feedback && <span className="text-sm text-rose-300">{feedback}</span>}
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Provider credentials</h2>
          <p className="mt-1 text-sm text-slate-400">Keys are encrypted locally and decrypted per request only.</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-300"
          onClick={() => {
            lock();
            setFeedback('Vault locked.');
          }}
        >
          Lock vault
        </button>
      </div>

      <button
        type="button"
        className="mt-3 rounded-md border border-rose-500/60 px-3 py-1 text-xs uppercase tracking-wide text-rose-200 hover:bg-rose-500/10"
        onClick={() => void handleResetVault()}
      >
        Reset vault
      </button>

      <div className="mt-4 space-y-4">
        {providers.map((provider) => {
          const hasKey = storedProviders.includes(provider.id);
          return (
            <div
              key={provider.id}
              className="flex flex-col gap-2 rounded-md border border-slate-800/80 bg-slate-900/40 p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{provider.displayName}</h3>
                  <p className="text-xs text-slate-500">{provider.description}</p>
                </div>
                <span className="text-xs text-slate-400">{hasKey ? 'Stored: ' + mask('********') : 'No key saved'}</span>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  type="password"
                  placeholder={hasKey ? 'Update API key…' : 'Enter API key…'}
                  className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
                  value={pendingKeys[provider.id] ?? ''}
                  onChange={(event) =>
                    setPendingKeys((prev) => ({ ...prev, [provider.id]: event.target.value }))
                  }
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white"
                    onClick={() => void handleSaveKey(provider.id)}
                  >
                    Save
                  </button>
                  {hasKey && (
                    <button
                      type="button"
                      className="rounded-md border border-rose-500/60 px-3 py-2 text-sm text-rose-300"
                      onClick={() => void handleDeleteKey(provider.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {feedback && <p className="mt-4 text-sm text-emerald-300">{feedback}</p>}
    </section>
  );
}
