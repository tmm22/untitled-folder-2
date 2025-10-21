'use client';

import { useEffect } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { usePreferenceStore, ThemePreference } from '@/modules/preferences/store';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

export function ThemePanel() {
  const theme = usePreferenceStore((state) => state.theme);
  const { setTheme } = usePreferenceStore((state) => state.actions);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (theme === 'light') {
      root.classList.remove('dark');
    } else if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return (
    <CollapsibleSection title="Appearance" minHeight={200} maxHeight={600}>
      <h2 className="panel-title">Appearance</h2>
      <p className="panel-subtitle">Switch between system default, light, or dark themes.</p>
      <div className="mt-4 flex gap-3">
        {THEMES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setTheme(candidate)}
            className={`pill-button capitalize ${
              candidate === theme ? 'border-charcoal-900 bg-charcoal-900 text-cream-50 hover:bg-charcoal-800' : ''
            }`}
          >
            {candidate}
          </button>
        ))}
      </div>
    </CollapsibleSection>
  );
}
