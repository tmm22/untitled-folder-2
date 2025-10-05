'use client';

import { useEffect } from 'react';
import { usePreferenceStore, NotificationPreference } from '@/modules/preferences/store';

const OPTIONS: Array<{ id: NotificationPreference; label: string; description: string }> = [
  { id: 'disabled', label: 'Disabled', description: 'Status updates remain in-app only.' },
  { id: 'enabled', label: 'Enabled', description: 'Receive browser notifications when batches finish.' },
];

export function NotificationPanel() {
  const notifications = usePreferenceStore((state) => state.notifications);
  const { setNotifications } = usePreferenceStore((state) => state.actions);

  useEffect(() => {
    if (notifications === 'enabled' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        void Notification.requestPermission();
      }
    }
  }, [notifications]);

  return (
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <h2 className="text-lg font-semibold text-white">Notifications</h2>
      <p className="text-sm text-slate-400">Browser alerts appear when batch processing completes.</p>
      <div className="mt-3 flex flex-col gap-2">
        {OPTIONS.map((option) => (
          <label key={option.id} className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <input
              type="radio"
              className="mt-1"
              name="notifications"
              checked={notifications === option.id}
              onChange={() => setNotifications(option.id)}
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-100">{option.label}</span>
              <span className="text-xs text-slate-400">{option.description}</span>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}
