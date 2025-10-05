'use client';

import { useEffect } from 'react';
import { usePreferenceStore, CompactPreference } from '@/modules/preferences/store';

const COMPACT_OPTIONS: Array<{ id: CompactPreference; label: string; description: string }> = [
  { id: 'off', label: 'Standard layout', description: 'Full control panel and expanded spacing.' },
  { id: 'on', label: 'Compact layout', description: 'Tighter spacing with condensed controls.' },
];

export function CompactPanel() {
  const { compactMode } = usePreferenceStore((state) => ({ compactMode: state.compactMode }));
  const { setCompactMode } = usePreferenceStore((state) => state.actions);

  useEffect(() => {
    const root = document.documentElement;
    if (compactMode === 'on') {
      root.classList.add('compact');
    } else {
      root.classList.remove('compact');
    }
  }, [compactMode]);

  return (
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <h2 className="text-lg font-semibold text-white">Compact layout</h2>
      <p className="text-sm text-slate-400">Match the macOS minimalist layout in the browser.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {COMPACT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setCompactMode(option.id)}
            className={`flex h-full flex-col gap-1 rounded-md border px-3 py-3 text-left ${
              option.id === compactMode
                ? 'border-sky-500 bg-sky-500/10 text-sky-100'
                : 'border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span className="text-sm font-semibold">{option.label}</span>
            <span className="text-xs text-slate-400">{option.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
