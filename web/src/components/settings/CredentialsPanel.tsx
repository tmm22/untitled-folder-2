'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { providerRegistry } from '@/modules/tts/providerRegistry';
import { getProviderDescription } from '@/modules/tts/getProviderDescription';
import { useCredentialStore } from '@/modules/credentials/store';
import type { ProviderType } from '@/modules/tts/types';
import { useAccountStore } from '@/modules/account/store';

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
  const hasProvisioningAccess = useAccountStore((state) => state.hasProvisioningAccess);
  const planTier = useAccountStore((state) => state.planTier);
  const billingStatus = useAccountStore((state) => state.billingStatus);

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
      <CollapsibleSection title="Secure credential vault" className="text-sm text-cocoa-600" minHeight={260} maxHeight={720}>
        Initialising secure storage…
      </CollapsibleSection>
    );
  }

  if (hasVault === false) {
    return (
      <CollapsibleSection title="Create secure credential vault" minHeight={320} maxHeight={820}>
        <h2 className="panel-title">Create secure credential vault</h2>
        <p className="panel-subtitle">
          Store provider API keys locally with AES-GCM encryption. The passphrase never leaves your device and is required
          every time you reopen the workspace.
        </p>
        <form className="mt-5 flex flex-col gap-4" onSubmit={handleCreateVault}>
          <label className="flex flex-col gap-2">
            <span className="field-label">Passphrase</span>
            <input
              type="password"
              className="field-input"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="field-label">Confirm passphrase</span>
            <input
              type="password"
              className="field-input"
              value={confirmPassphrase}
              onChange={(event) => setConfirmPassphrase(event.target.value)}
              minLength={8}
              required
            />
          </label>
          <button
            type="submit"
            className="cta-button md:w-max"
          >
            Create vault
          </button>
          {feedback && <p className="text-sm text-cocoa-600">{feedback}</p>}
        </form>
      </CollapsibleSection>
    );
  }

  if (!isUnlocked) {
    return (
      <CollapsibleSection title="Unlock credential vault" minHeight={280} maxHeight={800}>
        <h2 className="panel-title">Unlock credential vault</h2>
        <form className="mt-5 flex flex-col gap-4" onSubmit={handleUnlock}>
          <label className="flex flex-col gap-2">
            <span className="field-label">Passphrase</span>
            <input
              type="password"
              className="field-input"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              required
            />
          </label>
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
            <button
              type="submit"
              className="cta-button"
            >
              Unlock
            </button>
            <button
              type="button"
              className="pill-button border-rose-300 text-rose-700 hover:bg-rose-100"
              onClick={() => void handleResetVault()}
            >
              Reset vault
            </button>
            {feedback && <span className="text-sm text-rose-600">{feedback}</span>}
          </div>
        </form>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Provider credentials" minHeight={360} maxHeight={960}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="panel-title">Provider credentials</h2>
          <p className="panel-subtitle">Keys are encrypted locally and decrypted per request only.</p>
          {hasProvisioningAccess && (
            <div className="mt-3 rounded-2xl border border-emerald-300 bg-emerald-50/90 px-4 py-3 text-xs font-semibold text-emerald-700">
              Managed provisioning is active ({planTier} · {billingStatus}). Keys are optional for eligible providers.
            </div>
          )}
        </div>
        <button
          type="button"
          className="pill-button border-charcoal-300 text-cocoa-700 hover:bg-cream-200"
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
        className="mt-4 pill-button border-rose-300 text-rose-700 hover:bg-rose-100"
        onClick={() => void handleResetVault()}
      >
        Reset vault
      </button>

      <div className="mt-6 space-y-4">
        {providers.map((provider) => {
          const hasKey = storedProviders.includes(provider.id);
          return (
            <div
              key={provider.id}
              className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 transition ${
                hasKey
                  ? 'border-charcoal-900 bg-charcoal-900 text-cream-50 shadow-lg'
                  : 'border-cream-300 bg-cream-100/80 text-cocoa-800'
              }`}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className={`text-sm font-semibold ${hasKey ? 'text-cream-50' : 'text-cocoa-900'}`}>
                    {provider.displayName}
                  </h3>
                  <p className={`text-xs ${hasKey ? 'text-charcoal-200' : 'text-cocoa-500'}`}>
                    {getProviderDescription(provider.id)}
                  </p>
                </div>
                <span className={`text-xs ${hasKey ? 'text-charcoal-200' : 'text-cocoa-500'}`}>
                  {hasKey ? 'Stored: ' + mask('********') : 'No key saved'}
                </span>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  type="password"
                  placeholder={hasKey ? 'Update API key…' : 'Enter API key…'}
                  className={`field-input flex-1 ${hasKey ? 'border-charcoal-700 bg-charcoal-800/80 text-cream-50 placeholder:text-charcoal-400' : ''}`}
                  value={pendingKeys[provider.id] ?? ''}
                  onChange={(event) =>
                    setPendingKeys((prev) => ({ ...prev, [provider.id]: event.target.value }))
                  }
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`action-button ${hasKey ? 'action-button--accent' : ''}`}
                    onClick={() => void handleSaveKey(provider.id)}
                  >
                    Save
                  </button>
                  {hasKey && (
                    <button
                      type="button"
                      className="pill-button border-rose-300 text-rose-700 hover:bg-rose-100"
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

      {feedback && <p className="mt-5 text-sm text-cocoa-600">{feedback}</p>}
    </CollapsibleSection>
  );
}
