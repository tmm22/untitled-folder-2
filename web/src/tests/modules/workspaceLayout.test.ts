import { describe, beforeEach, it, expect } from 'vitest';
import { act } from '@testing-library/react';
import {
  useWorkspaceLayoutStore,
  workspaceDefaultLayout,
  type WorkspaceLayout,
} from '@/modules/workspaceLayout/store';

const cloneLayout = (layout: WorkspaceLayout): WorkspaceLayout => ({
  left: [...layout.left],
  center: [...layout.center],
  right: [...layout.right],
});

describe('workspace layout store', () => {
  beforeEach(() => {
    window.localStorage.removeItem('workspace-layout-v1');
    act(() => {
      useWorkspaceLayoutStore.setState(() => ({
        layout: cloneLayout(workspaceDefaultLayout),
        draggingPanelId: null,
      }));
    });
  });

  it('reorders a panel within the same column', () => {
    const { actions } = useWorkspaceLayoutStore.getState();
    act(() => {
      actions.movePanel('cleanupInstructions', 'left', 0);
    });
    const layout = useWorkspaceLayoutStore.getState().layout;
    expect(layout.left[0]).toBe('cleanupInstructions');
  });

  it('moves a panel across columns', () => {
    const { actions } = useWorkspaceLayoutStore.getState();
    act(() => {
      actions.movePanel('transcript', 'left', 1);
    });
    const layout = useWorkspaceLayoutStore.getState().layout;
    expect(layout.left.includes('transcript')).toBe(true);
    expect(layout.center.includes('transcript')).toBe(false);
  });

  it('resets to the default layout', () => {
    const { actions } = useWorkspaceLayoutStore.getState();
    act(() => {
      actions.movePanel('transcript', 'left', 0);
      actions.reset();
    });
    const layout = useWorkspaceLayoutStore.getState().layout;
    expect(layout).toEqual(cloneLayout(workspaceDefaultLayout));
  });
});
