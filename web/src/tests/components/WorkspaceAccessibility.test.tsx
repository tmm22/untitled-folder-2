import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { WorkspaceTabBar } from '@/components/shared/WorkspaceTabBar';

describe('workspace accessibility', () => {
  it('removes collapsed panel content from the accessibility and focus trees', () => {
    render(
      <CollapsibleSection title="Example" defaultCollapsed allowResize={false}>
        <button type="button">Hidden action</button>
      </CollapsibleSection>,
    );

    expect(screen.queryByRole('button', { name: 'Hidden action' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Example' }));
    expect(screen.getByRole('button', { name: 'Hidden action' })).toBeVisible();
  });

  it('moves focus when arrow keys activate another workspace tab', () => {
    const onTabChange = vi.fn();
    render(
      <WorkspaceTabBar
        tabs={['capture', 'transcript', 'calendar']}
        activeTab="capture"
        onTabChange={onTabChange}
      />,
    );

    const captureTab = screen.getByRole('tab', { name: 'Capture' });
    captureTab.focus();
    fireEvent.keyDown(captureTab, { key: 'ArrowRight' });

    expect(onTabChange).toHaveBeenCalledWith('transcript');
    expect(screen.getByRole('tab', { name: 'Transcript' })).toHaveFocus();
  });
});
