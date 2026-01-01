import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, POST, DELETE } from '@/app/api/workspace-layout/route';
import type { WorkspaceLayoutSnapshot } from '@/modules/workspaceLayout/types';
import { __setMockServerAuthState } from '@/tests/mocks/clerkNextjsServerMock';

type MockKind = 'convex' | 'noop';

const mockRepository = {
  load: vi.fn<[string], Promise<WorkspaceLayoutSnapshot | null>>(),
  save: vi.fn<[string, WorkspaceLayoutSnapshot], Promise<void>>(),
  clear: vi.fn<[string], Promise<void>>(),
};

let mockKind: MockKind = 'convex';

vi.mock('@/app/api/workspace-layout/context', () => ({
  getWorkspaceLayoutRepository: () => mockRepository,
  getWorkspaceLayoutRepositoryKind: () => mockKind,
}));

describe('workspace layout route', () => {
  beforeEach(() => {
    mockKind = 'convex';
    __setMockServerAuthState({ userId: null });
    mockRepository.load.mockReset();
    mockRepository.save.mockReset();
    mockRepository.clear.mockReset();
  });

  it('rejects unauthenticated requests', async () => {
    const response = await GET(new Request('https://example.com/api/workspace-layout'));
    expect(response.status).toBe(401);
  });

  it('returns 503 when Convex repository is unavailable', async () => {
    mockKind = 'noop';
    __setMockServerAuthState({ userId: 'user_1' });

    const response = await GET(new Request('https://example.com/api/workspace-layout'));
    expect(response.status).toBe(503);
    expect(mockRepository.load).not.toHaveBeenCalled();
  });

  it('loads workspace layout for authenticated users', async () => {
    __setMockServerAuthState({ userId: 'user_2' });
    const snapshot: WorkspaceLayoutSnapshot = {
      version: 3,
      activeTabId: 'capture',
      tabs: [
        { id: 'capture', panelIds: ['captureAudio', 'uploadAudio'] },
        { id: 'narration', panelIds: ['voiceSettings', 'scriptEditor'] },
      ],
    };
    mockRepository.load.mockResolvedValue(snapshot);

    const response = await GET(new Request('https://example.com/api/workspace-layout'));
    expect(response.status).toBe(200);
    expect(mockRepository.load).toHaveBeenCalledWith('user_2');

    const payload = (await response.json()) as { layout: { tabs: Array<{ id: string; panels: string[] }>; activeTabId?: string } };
    expect(payload.layout.tabs[0].panels).toEqual(['captureAudio', 'uploadAudio']);
    expect(payload.layout.tabs[1].panels).toEqual(['voiceSettings', 'scriptEditor']);
    expect(payload.layout.activeTabId).toBe('capture');
  });

  it('rejects save requests with mismatched user ids', async () => {
    __setMockServerAuthState({ userId: 'user_3' });

    const response = await POST(
      new Request('https://example.com/api/workspace-layout', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'user_4',
          layout: {
            version: 3,
            tabs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('rejects invalid layout payloads', async () => {
    __setMockServerAuthState({ userId: 'user_5' });

    const response = await POST(
      new Request('https://example.com/api/workspace-layout', {
        method: 'POST',
        body: JSON.stringify({
          layout: {
            version: '3',
            tabs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('saves workspace layout payloads for authenticated users', async () => {
    __setMockServerAuthState({ userId: 'user_6' });
    mockRepository.save.mockResolvedValue();

    const response = await POST(
      new Request('https://example.com/api/workspace-layout', {
        method: 'POST',
        body: JSON.stringify({
          layout: {
            version: 3,
            activeTabId: 'capture',
            tabs: [
              { id: 'capture', panels: ['captureAudio'] },
              { id: 'narration', panels: ['voiceSettings'] },
            ],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRepository.save).toHaveBeenCalledWith('user_6', {
      version: 3,
      activeTabId: 'capture',
      tabs: [
        { id: 'capture', panelIds: ['captureAudio'] },
        { id: 'narration', panelIds: ['voiceSettings'] },
      ],
    });
  });

  it('clears workspace layout when requested by owner', async () => {
    __setMockServerAuthState({ userId: 'user_7' });
    mockRepository.clear.mockResolvedValue();

    const response = await DELETE(new Request('https://example.com/api/workspace-layout', { method: 'DELETE' }));

    expect(response.status).toBe(200);
    expect(mockRepository.clear).toHaveBeenCalledWith('user_7');
  });
});
