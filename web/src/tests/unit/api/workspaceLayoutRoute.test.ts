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
      version: 2,
      columns: [
        { id: 'left', panelIds: ['pipelineStatus'] },
        { id: 'right', panelIds: ['ttsControls'] },
      ],
    };
    mockRepository.load.mockResolvedValue(snapshot);

    const response = await GET(new Request('https://example.com/api/workspace-layout'));
    expect(response.status).toBe(200);
    expect(mockRepository.load).toHaveBeenCalledWith('user_2');

    const payload = (await response.json()) as { layout: { columns: Array<{ id: string; panels: string[] }> } };
    expect(payload.layout.columns[0].panels).toEqual(['pipelineStatus']);
    expect(payload.layout.columns[1].panels).toEqual(['ttsControls']);
  });

  it('rejects save requests with mismatched user ids', async () => {
    __setMockServerAuthState({ userId: 'user_3' });

    const response = await POST(
      new Request('https://example.com/api/workspace-layout', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'user_4',
          layout: {
            version: 2,
            columns: [],
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
            version: '2',
            columns: [],
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
            version: 2,
            columns: [
              { id: 'left', panels: ['pipelineStatus'] },
              { id: 'right', panels: ['ttsControls'] },
            ],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRepository.save).toHaveBeenCalledWith('user_6', {
      version: 2,
      columns: [
        { id: 'left', panelIds: ['pipelineStatus'] },
        { id: 'right', panelIds: ['ttsControls'] },
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
