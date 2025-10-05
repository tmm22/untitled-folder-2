import { afterEach, describe, expect, test, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import Home from '@/app/page';

vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'inter-font' }),
}));

describe('Home page render', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders without crashing', async () => {
    render(<Home />);
  });
});
