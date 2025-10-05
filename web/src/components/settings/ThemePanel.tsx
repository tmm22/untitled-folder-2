'use client';

import { useEffect } from 'react';
import { usePreferenceStore, ThemePreference } from '@/modules/preferences/store';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

export function ThemePanel() {
  const { theme } = usePreferenceStore((state) => ({ theme: state.theme }));
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
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <h2 className="text-lg font-semibold text-white">Appearance</h2>
      <p className="text-sm text-slate-400">Switch between system default, light, or dark themes.</p>
      <div className="mt-3 flex gap-3">
        {THEMES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setTheme(candidate)}
            className={`rounded-md border px-3 py-2 text-sm capitalize ${
              candidate === theme
                ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {candidate}
          </button>
        ))}
      </div>
    </section>
  );
}
