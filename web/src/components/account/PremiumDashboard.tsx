'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAccountStore } from '@/modules/account/store';

const statusColors: Record<string, string> = {
  active: 'border-emerald-300 bg-emerald-50/90 text-emerald-700',
  trial: 'border-accent-400 bg-accent-200/80 text-charcoal-900',
  past_due: 'border-amber-300 bg-amber-50 text-amber-700',
  canceled: 'border-rose-300 bg-rose-50 text-rose-700',
  free: 'border-cream-300 bg-cream-100/80 text-cocoa-700',
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
        },
        credentials: 'include',
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
        },
        credentials: 'include',
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
    <section className="panel">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="panel-title">Premium workspace</h2>
          <p className="panel-subtitle">
            Managed API provisioning keeps the app running even when you do not supply your own keys.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusClass}`}>
          {billingStatus.replace('_', ' ')} · {planTier}
        </span>
      </header>

      {hasProvisioningAccess ? (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-cream-300 bg-cream-50/90 p-4 shadow-inner text-cocoa-800">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cocoa-500">Monthly usage</p>
            <p className="mt-2 text-2xl font-semibold text-charcoal-900">
              {formatNumber(usageSummary?.monthTokensUsed ?? 0)} tokens
            </p>
            <p className="text-xs text-cocoa-600">
              Allowance {formatNumber(usageSummary?.monthlyAllowance ?? 0)}
            </p>
            <div className="mt-4 h-2 rounded-full bg-cream-200">
              <div
                className="h-2 rounded-full bg-charcoal-900"
                style={{ width: `${usagePercent}%` }}
                aria-hidden
              />
            </div>
          </div>
          <div className="rounded-2xl border border-cream-300 bg-cream-50/90 p-4 shadow-inner text-cocoa-800">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cocoa-500">Auto provisioning</p>
            <p className="mt-2 text-base text-charcoal-900">Enabled for OpenAI</p>
            <p className="text-xs text-cocoa-600">More providers coming soon.</p>
          </div>
          <div className="rounded-2xl border border-cream-300 bg-cream-50/90 p-4 shadow-inner text-cocoa-800">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cocoa-500">Manage plan</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="action-button action-button--accent text-xs uppercase tracking-wide"
                onClick={handleOpenPortal}
                disabled={isProcessing}
              >
                View billing portal
              </button>
              <button
                type="button"
                className="pill-button border-rose-300 text-rose-700 uppercase tracking-wide"
                disabled
              >
                Cancel plan
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="text-cocoa-700">
            <p className="text-base font-semibold text-charcoal-900">
              Upgrade to unlock managed provider access and higher token limits.
            </p>
            <p className="text-sm text-cocoa-600">Perfect for users who do not want to juggle API keys.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="cta-button px-5 py-2 text-sm"
              onClick={handleStartTrial}
              disabled={isProcessing}
            >
              Start free trial
            </button>
            <button
              type="button"
              className="pill-button border-charcoal-300 text-cocoa-700"
            >
              Compare plans
            </button>
          </div>
        </div>
      )}
      {actionMessage && <p className="mt-5 text-sm text-cocoa-600">{actionMessage}</p>}
    </section>
  );
}
