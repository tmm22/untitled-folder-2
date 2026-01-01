'use client';

import { useCallback, type KeyboardEvent } from 'react';
import { TAB_LABELS, type WorkspaceTabId } from '@/modules/workspaceLayout/types';

interface WorkspaceTabBarProps {
  tabs: WorkspaceTabId[];
  activeTab: WorkspaceTabId;
  onTabChange: (tabId: WorkspaceTabId) => void;
  disabled?: boolean;
}

export function WorkspaceTabBar({ tabs, activeTab, onTabChange, disabled = false }: WorkspaceTabBarProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      if (disabled) return;

      let nextIndex: number | null = null;

      switch (event.key) {
        case 'ArrowLeft':
          nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
          break;
        case 'ArrowRight':
          nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      onTabChange(tabs[nextIndex]);
    },
    [disabled, onTabChange, tabs],
  );

  return (
    <div
      role="tablist"
      aria-label="Workspace sections"
      className="workspace-tab-bar flex items-center gap-1 overflow-x-auto rounded-2xl border border-cream-300/70 bg-cream-100/80 p-1.5 shadow-sm"
    >
      {tabs.map((tabId, index) => {
        const isActive = tabId === activeTab;
        return (
          <button
            key={tabId}
            role="tab"
            type="button"
            id={`workspace-tab-${tabId}`}
            aria-selected={isActive}
            aria-controls={`workspace-tabpanel-${tabId}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => !disabled && onTabChange(tabId)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            disabled={disabled}
            className={`workspace-tab whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60 ${
              isActive
                ? 'workspace-tab--active bg-charcoal-900 text-cream-50 shadow-sm'
                : 'text-cocoa-600 hover:bg-cream-200/70 hover:text-charcoal-900'
            } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {TAB_LABELS[tabId]}
          </button>
        );
      })}
    </div>
  );
}
