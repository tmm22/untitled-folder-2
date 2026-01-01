import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_WORKSPACE_LAYOUT_VERSION,
  DEFAULT_WORKSPACE_LAYOUT,
  type WorkspaceLayoutSnapshot,
} from '@/modules/workspaceLayout/types';

vi.mock('@/lib/workspaceLayout/repository', () => {
  const repository = {
    load: vi.fn<[string], Promise<WorkspaceLayoutSnapshot | null>>(),
    save: vi.fn(),
    clear: vi.fn(),
  };
  (globalThis as { __workspaceLayoutRepositoryMock?: typeof repository }).__workspaceLayoutRepositoryMock = repository;
  return {
    getWorkspaceLayoutRepository: () => repository,
  };
});

import { useWorkspaceLayoutStore } from '@/modules/workspaceLayout/store';

const mockRepository = (globalThis as {
  __workspaceLayoutRepositoryMock: {
    load: ReturnType<typeof vi.fn<[string], Promise<WorkspaceLayoutSnapshot | null>>>;
    save: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
}).__workspaceLayoutRepositoryMock;

function cloneDefaultLayout(): WorkspaceLayoutSnapshot {
  return JSON.parse(JSON.stringify(DEFAULT_WORKSPACE_LAYOUT)) as WorkspaceLayoutSnapshot;
}

describe('workspace layout store', () => {
  beforeEach(() => {
    mockRepository.load.mockReset();
    mockRepository.save.mockReset();
    mockRepository.clear.mockReset();
    useWorkspaceLayoutStore.setState((state) => ({
      ...state,
      layout: cloneDefaultLayout(),
      activeTabId: DEFAULT_WORKSPACE_LAYOUT.activeTabId ?? 'capture',
      hydratedForUserId: undefined,
      pendingUserId: undefined,
      hydrationRequestId: undefined,
      isHydrating: false,
      isSaving: false,
      error: undefined,
    }));
  });

  it('hydrates the latest user even when a previous request is still pending', async () => {
    const pending = new Map<
      string,
      {
        resolve: (value: WorkspaceLayoutSnapshot | null) => void;
        reject: (reason?: unknown) => void;
      }
    >();

    mockRepository.load.mockImplementation((userId: string) => {
      return new Promise<WorkspaceLayoutSnapshot | null>((resolve, reject) => {
        pending.set(userId, { resolve, reject });
      });
    });

    const { actions } = useWorkspaceLayoutStore.getState();

    const requestA = actions.hydrate('user_a');
    expect(mockRepository.load).toHaveBeenCalledWith('user_a');

    const requestB = actions.hydrate('user_b');
    expect(mockRepository.load).toHaveBeenCalledWith('user_b');

    pending.get('user_a')?.resolve({
      version: CURRENT_WORKSPACE_LAYOUT_VERSION,
      activeTabId: 'capture',
      tabs: [
        { id: 'capture', panelIds: ['captureAudio'] },
        { id: 'transcript', panelIds: [] },
        { id: 'calendar', panelIds: [] },
        { id: 'narration', panelIds: [] },
        { id: 'history', panelIds: [] },
        { id: 'settings', panelIds: [] },
      ],
    });
    await requestA;

    let state = useWorkspaceLayoutStore.getState();
    expect(state.hydratedForUserId).not.toBe('user_a');
    expect(state.pendingUserId).toBe('user_b');
    expect(state.isHydrating).toBe(true);

    pending.get('user_b')?.resolve({
      version: CURRENT_WORKSPACE_LAYOUT_VERSION,
      activeTabId: 'narration',
      tabs: [
        { id: 'capture', panelIds: ['uploadAudio'] },
        { id: 'transcript', panelIds: [] },
        { id: 'calendar', panelIds: [] },
        { id: 'narration', panelIds: ['voiceSettings', 'scriptEditor'] },
        { id: 'history', panelIds: [] },
        { id: 'settings', panelIds: [] },
      ],
    });
    await requestB;

    state = useWorkspaceLayoutStore.getState();
    expect(state.hydratedForUserId).toBe('user_b');
    expect(state.pendingUserId).toBeUndefined();
    expect(state.isHydrating).toBe(false);

    const captureTab = state.layout.tabs.find((tab) => tab.id === 'capture');
    expect(captureTab?.panelIds).toContain('uploadAudio');
    const narrationTab = state.layout.tabs.find((tab) => tab.id === 'narration');
    expect(narrationTab?.panelIds).toContain('voiceSettings');
  });
});
