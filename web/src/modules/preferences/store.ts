'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';
export type CompactPreference = 'off' | 'on';
export type NotificationPreference = 'enabled' | 'disabled';

interface PreferenceState {
  theme: ThemePreference;
  compactMode: CompactPreference;
  notifications: NotificationPreference;
  actions: {
    setTheme: (theme: ThemePreference) => void;
    setCompactMode: (mode: CompactPreference) => void;
    setNotifications: (value: NotificationPreference) => void;
  };
}

export const usePreferenceStore = create<PreferenceState>()(
  persist(
    (set) => ({
      theme: 'system',
      compactMode: 'off',
      notifications: 'disabled',
      actions: {
        setTheme: (theme) => set({ theme }),
        setCompactMode: (mode) => set({ compactMode: mode }),
        setNotifications: (value) => set({ notifications: value }),
      },
    }),
    { name: 'tts-preferences-v1' },
  ),
);
