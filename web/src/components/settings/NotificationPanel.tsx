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
    <section className="panel">
      <h2 className="panel-title">Notifications</h2>
      <p className="panel-subtitle">Browser alerts appear when batch processing completes.</p>
      <div className="mt-4 flex flex-col gap-2">
        {OPTIONS.map((option) => {
          const isActive = notifications === option.id;
          return (
            <label
              key={option.id}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-4 transition ${
                isActive
                  ? 'border-charcoal-900 bg-charcoal-900 text-cream-50 shadow-lg'
                  : 'border-cream-300 bg-cream-100/80 text-cocoa-700 hover:bg-cream-200'
              }`}
            >
              <input
                type="radio"
                className="mt-1 accent-charcoal-900"
                name="notifications"
                checked={isActive}
                onChange={() => setNotifications(option.id)}
              />
              <div className="flex flex-col gap-1">
                <span className={`text-sm font-semibold ${isActive ? 'text-cream-50' : 'text-cocoa-800'}`}>
                  {option.label}
                </span>
                <span className={`text-xs ${isActive ? 'text-charcoal-200' : 'text-cocoa-500'}`}>
                  {option.description}
                </span>
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
}
