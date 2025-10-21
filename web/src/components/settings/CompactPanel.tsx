'use client';

import { useEffect } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { usePreferenceStore, CompactPreference } from '@/modules/preferences/store';

const COMPACT_OPTIONS: Array<{ id: CompactPreference; label: string; description: string }> = [
  { id: 'off', label: 'Standard layout', description: 'Full control panel and expanded spacing.' },
  { id: 'on', label: 'Compact layout', description: 'Tighter spacing with condensed controls.' },
];

export function CompactPanel() {
  const compactMode = usePreferenceStore((state) => state.compactMode);
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
    <CollapsibleSection title="Compact layout" minHeight={220} maxHeight={680}>
      <h2 className="panel-title">Compact layout</h2>
      <p className="panel-subtitle">Match the macOS minimalist layout in the browser.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {COMPACT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setCompactMode(option.id)}
            className={`flex h-full flex-col gap-1 rounded-2xl border px-4 py-4 text-left transition ${
              option.id === compactMode
                ? 'border-charcoal-900 bg-charcoal-900 text-cream-50 shadow-lg hover:bg-charcoal-800'
                : 'border-cream-300 bg-cream-100/80 text-cocoa-700 hover:bg-cream-200'
            }`}
          >
            <span className="text-sm font-semibold">{option.label}</span>
            <span
              className={`text-xs ${
                option.id === compactMode ? 'text-charcoal-200' : 'text-cocoa-500'
              }`}
            >
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </CollapsibleSection>
  );
}
