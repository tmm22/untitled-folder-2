import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TransitTranscriptionPanel } from '@/components/transit/TransitTranscriptionPanel';

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
      await screen.findByText('Microphone recording is not supported in this browser. Use the upload option instead.'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });
  });
});
