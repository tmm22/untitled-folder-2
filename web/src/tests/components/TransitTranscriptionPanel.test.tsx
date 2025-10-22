import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TransitTranscriptionPanel } from '@/components/transit/TransitTranscriptionPanel';

const mockHistoryActions = {
  hydrate: vi.fn(async () => {}),
  record: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
};

vi.mock('@/modules/transitTranscription/historyStore', () => ({
  useTransitTranscriptionHistoryStore: (selector: (state: unknown) => unknown) =>
    selector({
      records: [],
      hydrated: true,
      error: undefined,
      actions: mockHistoryActions,
    }),
}));

describe('TransitTranscriptionPanel', () => {
  const originalFetch = global.fetch;
  const originalMediaRecorder = (globalThis as typeof globalThis & { MediaRecorder?: unknown }).MediaRecorder;
  const originalNavigator = global.navigator;

  beforeEach(() => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ connected: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as typeof fetch;

    delete (globalThis as typeof globalThis & { MediaRecorder?: unknown }).MediaRecorder;
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: { mediaDevices: undefined },
    });

    mockHistoryActions.hydrate.mockClear();
    mockHistoryActions.record.mockClear();
    mockHistoryActions.remove.mockClear();
    mockHistoryActions.clear.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
    (globalThis as typeof globalThis & { MediaRecorder?: unknown }).MediaRecorder = originalMediaRecorder;
    vi.restoreAllMocks();
  });

  it('renders without entering a render loop and shows fallback messaging', async () => {
    render(<TransitTranscriptionPanel />);

    expect(
      await screen.findByText('Recording is not supported in this browser. Upload audio files instead.'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Move Capture audio' })).toBeInTheDocument();
    expect(document.querySelector('[data-workspace-column="left"]')).not.toBeNull();
  });
});
