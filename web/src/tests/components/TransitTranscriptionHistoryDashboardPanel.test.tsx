import { describe, beforeEach, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransitTranscriptionHistoryDashboardPanel } from '@/components/transit/TransitTranscriptionHistoryDashboardPanel';

const mockHistoryActions = {
  hydrate: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
  record: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
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

describe('TransitTranscriptionHistoryDashboardPanel', () => {
  beforeEach(() => {
    mockHistoryActions.hydrate.mockClear();
    mockHistoryActions.clear.mockClear();
    mockHistoryActions.record.mockClear();
    mockHistoryActions.remove.mockClear();
  });

  it('renders placeholder when there are no transcripts', () => {
    render(<TransitTranscriptionHistoryDashboardPanel />);

    expect(
      screen.getByText(/Once you transcribe audio in the Transit workspace/i),
    ).toBeInTheDocument();
  });
});
