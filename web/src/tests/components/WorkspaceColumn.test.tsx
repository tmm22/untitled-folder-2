'use client';

import { describe, beforeEach, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { WorkspaceDragProvider } from '@/modules/workspaceLayout/dragContext';
import { WorkspaceColumn } from '@/components/workspace/WorkspaceColumn';
import {
  useWorkspaceLayoutStore,
  workspaceDefaultLayout,
  type WorkspaceColumnId,
  type WorkspacePanelId,
} from '@/modules/workspaceLayout/store';

const PANEL_HEIGHT = 160;
const COLUMN_WIDTH = 320;

const columnOrder: WorkspaceColumnId[] = ['left', 'center', 'right'];

function setRect(element: Element | null, rect: Partial<DOMRect>) {
  if (!element) {
    return;
  }
  const fullRect: DOMRect = {
    x: rect.x ?? rect.left ?? 0,
    y: rect.y ?? rect.top ?? 0,
    width: rect.width ?? COLUMN_WIDTH,
    height: rect.height ?? PANEL_HEIGHT,
    top: rect.top ?? rect.y ?? 0,
    left: rect.left ?? rect.x ?? 0,
    right: rect.right ?? (rect.left ?? rect.x ?? 0) + (rect.width ?? COLUMN_WIDTH),
    bottom: rect.bottom ?? (rect.top ?? rect.y ?? 0) + (rect.height ?? PANEL_HEIGHT),
    toJSON: () => '',
  };

  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(fullRect);
}

function TestWorkspace() {
  const layout = useWorkspaceLayoutStore((state) => state.layout);
  const renderPanel = (panelId: WorkspacePanelId) => (
    <div className="rounded-xl border border-charcoal-200 bg-white p-4 text-sm font-medium text-charcoal-900">
      Panel: {panelId}
    </div>
  );

  return (
    <WorkspaceDragProvider>
      <div className="grid grid-cols-3 gap-6">
        {columnOrder.map((columnId) => (
          <WorkspaceColumn
            key={columnId}
            columnId={columnId}
            panelIds={layout[columnId]}
            renderPanel={renderPanel}
          />
        ))}
      </div>
    </WorkspaceDragProvider>
  );
}

describe('Workspace drag-and-drop', () => {
  beforeEach(() => {
    const defaultLayout = workspaceDefaultLayout;
    useWorkspaceLayoutStore.setState((state) => ({
      layout: {
        left: [...defaultLayout.left],
        center: [...defaultLayout.center],
        right: [...defaultLayout.right],
      },
      draggingPanelId: null,
      actions: state.actions,
    }));
  });

  const ensurePointerEventSupport = () => {
    if (typeof PointerEvent === 'undefined') {
      const globalWithPointer = globalThis as typeof globalThis & { PointerEvent?: typeof PointerEvent };
      globalWithPointer.PointerEvent = class MockPointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, props: MouseEventInit & { pointerId?: number }) {
          super(type, props);
          this.pointerId = props.pointerId ?? 1;
        }
      };
    }
  };

  it('reorders panels across columns when dragged with the pointer', () => {
    ensurePointerEventSupport();
    render(<TestWorkspace />);

    const leftColumn = document.querySelector('[data-workspace-column="left"]');
    const centerColumn = document.querySelector('[data-workspace-column="center"]');
    const capturePanel = document.querySelector('[data-workspace-panel="capture"]');
    const cleanupPanel = document.querySelector('[data-workspace-panel="cleanupInstructions"]');
    const transcriptPanel = document.querySelector('[data-workspace-panel="transcript"]');
    const summaryPanel = document.querySelector('[data-workspace-panel="summary"]');

    setRect(leftColumn, { left: 0, top: 0, width: COLUMN_WIDTH, height: 1000 });
    setRect(centerColumn, { left: 400, top: 0, width: COLUMN_WIDTH, height: 1000 });
    setRect(capturePanel, { left: 0, top: 120, width: COLUMN_WIDTH, height: PANEL_HEIGHT });
    setRect(cleanupPanel, { left: 0, top: 320, width: COLUMN_WIDTH, height: PANEL_HEIGHT });
    setRect(transcriptPanel, { left: 400, top: 120, width: COLUMN_WIDTH, height: PANEL_HEIGHT });
    setRect(summaryPanel, { left: 400, top: 320, width: COLUMN_WIDTH, height: PANEL_HEIGHT });

    const handle = screen.getByRole('button', { name: /move capture audio/i });
    act(() => {
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 40, clientY: 160, buttons: 1 });
    });
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 520, clientY: 160, buttons: 1 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 520, clientY: 160, buttons: 0 }));
    });

    const layout = useWorkspaceLayoutStore.getState().layout;
    expect(layout.left).not.toContain('capture');
    expect(layout.center[0]).toBe('capture');
  });

  it('moves panel downward within the same column with keyboard interaction', () => {
    render(<TestWorkspace />);

    const handle = screen.getByRole('button', { name: /move cleanup instructions/i });
    handle.focus();

    act(() => {
      fireEvent.keyDown(handle, { key: 'Enter' });
    });
    act(() => {
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
    });
    act(() => {
      fireEvent.keyDown(handle, { key: 'Enter' });
    });

    const layout = useWorkspaceLayoutStore.getState().layout;
    expect(layout.left.slice(0, 3)).toEqual(['capture', 'importEntries', 'cleanupInstructions']);
  });
});
