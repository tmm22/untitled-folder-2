'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAccountStore } from '@/modules/account/store';

const statusColors: Record<string, string> = {
  active: 'bg-emerald-900/30 text-emerald-200 border-emerald-700/60',
  trial: 'bg-sky-900/30 text-sky-200 border-sky-700/60',
  past_due: 'bg-amber-900/30 text-amber-200 border-amber-700/60',
  canceled: 'bg-rose-900/30 text-rose-200 border-rose-700/60',
  free: 'bg-slate-900/40 text-slate-300 border-slate-700/60',
};

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function PremiumDashboard() {
  const planTier = useAccountStore((state) => state.planTier);
  const billingStatus = useAccountStore((state) => state.billingStatus);
  const usageSummary = useAccountStore((state) => state.usageSummary);
  const hasProvisioningAccess = useAccountStore((state) => state.hasProvisioningAccess);
  const applyRemoteAccount = useAccountStore((state) => state.actions.applyRemoteAccount);
  const userId = useAccountStore((state) => state.userId);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isProcessing, setProcessing] = useState(false);

  const statusClass = useMemo(() => statusColors[billingStatus] ?? statusColors.free, [billingStatus]);
  const usagePercent = useMemo(() => {
    if (!usageSummary || usageSummary.monthlyAllowance === 0) {
      return 0;
    }
    return Math.min(100, Math.round((usageSummary.monthTokensUsed / usageSummary.monthlyAllowance) * 100));
  }, [usageSummary]);

  const handleStartTrial = useCallback(async () => {
    setProcessing(true);
    setActionMessage(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-account-id': userId } : {}),
        },
      });
      if (!response.ok) {
        throw new Error('Unable to start trial');
      }
      const payload = await response.json();
      if (payload.account) {
        applyRemoteAccount(payload.account);
      }
      setActionMessage(payload.message ?? 'Trial activated.');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Unable to start trial');
    } finally {
      setProcessing(false);
    }
  }, [applyRemoteAccount]);

  const handleOpenPortal = useCallback(async () => {
    setProcessing(true);
    setActionMessage(null);
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-account-id': userId } : {}),
        },
      });
      if (!response.ok) {
        throw new Error('Unable to open billing portal');
      }
      const payload = await response.json();
      if (payload.account) {
        applyRemoteAccount(payload.account);
      }
      if (payload.portalUrl) {
        setActionMessage(`Open billing portal: ${payload.portalUrl}`);
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Unable to open billing portal');
    } finally {
      setProcessing(false);
    }
  }, [applyRemoteAccount]);

  return (
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Premium workspace</h2>
          <p className="text-sm text-slate-400">
            Managed API provisioning keeps the app running even when you do not supply your own keys.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${statusClass}`}>
          {billingStatus.replace('_', ' ')} · {planTier}
        </span>
      </header>

      {hasProvisioningAccess ? (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-slate-800/60 bg-slate-900/40 p-3 text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-400">Monthly usage</p>
            <p className="mt-1 text-2xl font-semibold">{formatNumber(usageSummary?.monthTokensUsed ?? 0)} tokens</p>
            <p className="text-xs text-slate-400">Allowance {formatNumber(usageSummary?.monthlyAllowance ?? 0)}</p>
            <div className="mt-3 h-2 rounded-full bg-slate-800">
              <div
                className="h-2 rounded-full bg-sky-500"
                style={{ width: `${usagePercent}%` }}
                aria-hidden
              />
            </div>
          </div>
          <div className="rounded-md border border-slate-800/60 bg-slate-900/40 p-3 text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-400">Auto provisioning</p>
            <p className="mt-1 text-base">Enabled for OpenAI</p>
            <p className="text-xs text-slate-400">More providers coming soon.</p>
          </div>
          <div className="rounded-md border border-slate-800/60 bg-slate-900/40 p-3 text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-400">Manage plan</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md bg-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200"
                onClick={handleOpenPortal}
                disabled={isProcessing}
              >
                View billing portal
              </button>
              <button
                type="button"
                className="rounded-md border border-rose-500/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-200"
                disabled
              >
                Cancel plan
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-base text-slate-200">Upgrade to unlock managed provider access and higher token limits.</p>
            <p className="text-sm text-slate-400">Perfect for users who do not want to juggle API keys.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-60"
              onClick={handleStartTrial}
              disabled={isProcessing}
            >
              Start free trial
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
            >
              Compare plans
            </button>
          </div>
        </div>
      )}
      {actionMessage && <p className="mt-4 text-sm text-sky-300">{actionMessage}</p>}
    </section>
  );
}
