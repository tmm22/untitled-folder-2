import { beforeEach, describe, expect, test } from 'vitest';
import { usePreferenceStore } from '@/modules/preferences/store';

describe('preferences store', () => {
  beforeEach(() => {
    usePreferenceStore.setState({
      theme: 'system',
      compactMode: 'off',
      notifications: 'disabled',
      actions: usePreferenceStore.getState().actions,
    });
  });

  test('updates theme preference', () => {
    usePreferenceStore.getState().actions.setTheme('dark');
    expect(usePreferenceStore.getState().theme).toBe('dark');
  });

  test('updates compact mode', () => {
    usePreferenceStore.getState().actions.setCompactMode('on');
    expect(usePreferenceStore.getState().compactMode).toBe('on');
  });

  test('updates notifications', () => {
    usePreferenceStore.getState().actions.setNotifications('enabled');
    expect(usePreferenceStore.getState().notifications).toBe('enabled');
  });
});
