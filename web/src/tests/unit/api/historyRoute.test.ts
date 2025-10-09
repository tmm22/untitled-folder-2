import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { GET, POST, DELETE } from '@/app/api/history/route';
import type { HistoryEntryPayload } from '@/lib/history/types';
import { __setMockServerAuthState } from '@/tests/mocks/clerkNextjsServerMock';

const mockRepository = {
  list: vi.fn<[], Promise<HistoryEntryPayload[]>>(),
  record: vi.fn<[HistoryEntryPayload], Promise<void>>(),
  remove: vi.fn<[string, string], Promise<void>>(),
  clear: vi.fn<[string], Promise<void>>(),
};

vi.mock('@/app/api/history/context', () => ({
  getHistoryRepository: () => mockRepository,
}));

describe('history route', () => {
  beforeEach(() => {
    __setMockServerAuthState({ userId: null });
    mockRepository.list.mockReset();
    mockRepository.record.mockReset();
    mockRepository.remove.mockReset();
    mockRepository.clear.mockReset();
  });

  it('rejects unauthenticated requests', async () => {
    const response = await GET(new Request('https://example.com/api/history'));
    expect(response.status).toBe(401);
  });

  it('returns remote entries for authenticated users', async () => {
    __setMockServerAuthState({ userId: 'user_1' });
    mockRepository.list.mockResolvedValue([
      {
        id: 'entry-1',
        userId: 'user_1',
        provider: 'openAI',
        voiceId: 'alloy',
        text: 'Sample',
        createdAt: new Date().toISOString(),
        durationMs: 1200,
      },
    ]);

    const response = await GET(new Request('https://example.com/api/history'));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.entries).toHaveLength(1);
    expect(mockRepository.list).toHaveBeenCalledWith('user_1', 100);
  });

  it('records entries and associates with identity', async () => {
    __setMockServerAuthState({ userId: 'user_2' });

    const now = new Date().toISOString();
    const response = await POST(
      new Request('https://example.com/api/history', {
        method: 'POST',
        body: JSON.stringify({
          entry: {
            id: 'sample',
            provider: 'openAI',
            voiceId: 'alloy',
            text: 'Text',
            createdAt: now,
            durationMs: 100,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRepository.record).toHaveBeenCalledWith({
      id: 'sample',
      userId: 'user_2',
      provider: 'openAI',
      voiceId: 'alloy',
      text: 'Text',
      createdAt: now,
      durationMs: 100,
      transcript: undefined,
    });
  });

  it('removes individual entries when id is provided', async () => {
    __setMockServerAuthState({ userId: 'user_3' });

    const response = await DELETE(new Request('https://example.com/api/history?id=entry-3', { method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect(mockRepository.remove).toHaveBeenCalledWith('user_3', 'entry-3');
    expect(mockRepository.clear).not.toHaveBeenCalled();
  });

  it('clears entries when no id is provided', async () => {
    __setMockServerAuthState({ userId: 'user_4' });

    const response = await DELETE(new Request('https://example.com/api/history', { method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect(mockRepository.clear).toHaveBeenCalledWith('user_4');
    expect(mockRepository.remove).not.toHaveBeenCalled();
  });
});

