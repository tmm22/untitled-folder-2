import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/transit/calendar/events/route';
import { __setMockServerAuthState } from '@/tests/mocks/clerkNextjsServerMock';

const mockStore = {
  get: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
};

const mockCreateEvent = vi.fn();
const mockRefresh = vi.fn();

vi.mock('@/lib/transit/calendarTokenStore', () => ({
  getCalendarTokenStore: () => mockStore,
}));

vi.mock('@/lib/transit/googleClient', () => ({
  createCalendarEvent: (...args: unknown[]) => mockCreateEvent(...args),
  refreshAccessToken: (...args: unknown[]) => mockRefresh(...args),
}));

describe('transit calendar events route', () => {
  beforeEach(() => {
    __setMockServerAuthState({ userId: null });
    mockStore.get.mockReset();
    mockStore.save.mockReset();
    mockStore.clear.mockReset();
    mockCreateEvent.mockReset();
    mockRefresh.mockReset();
  });

  it('rejects unauthenticated requests', async () => {
    const response = await POST(
      new Request('https://example.com/api/transit/calendar/events', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test' }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('requires a title', async () => {
    __setMockServerAuthState({ userId: 'user_123' });
    const response = await POST(
      new Request('https://example.com/api/transit/calendar/events', {
        method: 'POST',
        body: JSON.stringify({ participants: ['ops@example.com'] }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toContain('Title');
  });

  it('requires calendar connection', async () => {
    __setMockServerAuthState({ userId: 'user_connected' });
    mockStore.get.mockResolvedValue(null);
    const response = await POST(
      new Request('https://example.com/api/transit/calendar/events', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Route 12 debrief',
        }),
      }),
    );
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toMatch(/not connected/i);
  });

  it('creates calendar event when connected', async () => {
    __setMockServerAuthState({ userId: 'user_123' });
    mockStore.get.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 10 * 60 * 1000,
      scope: ['calendar'],
    });
    mockCreateEvent.mockResolvedValue({ id: 'event_1', status: 'confirmed' });

    const response = await POST(
      new Request('https://example.com/api/transit/calendar/events', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Route 12 debrief',
          durationMinutes: 45,
          participants: [' ops@example.com ', '', 'manager@example.com'],
          notes: 'Follow-up on incident 32.',
        }),
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.status).toBe('scheduled');
    expect(mockCreateEvent).toHaveBeenCalled();
    expect(payload.event.id).toBe('event_1');
  });

  it('refreshes tokens when expired', async () => {
    __setMockServerAuthState({ userId: 'user_refresh' });
    mockStore.get.mockResolvedValue({
      accessToken: 'expired',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1000,
      scope: ['calendar'],
    });
    mockRefresh.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000,
      scope: ['calendar'],
    });
    mockCreateEvent.mockResolvedValue({ id: 'event_2', status: 'confirmed' });

    const response = await POST(
      new Request('https://example.com/api/transit/calendar/events', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Ops review',
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mockRefresh).toHaveBeenCalledWith('refresh');
    expect(mockStore.save).toHaveBeenCalled();
    expect(mockCreateEvent.mock.calls[0][0]).toBe('new-access');
  });
});
