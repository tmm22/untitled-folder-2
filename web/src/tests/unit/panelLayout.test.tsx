import { describe, expect, it } from 'vitest';
import {
  __test__normaliseLayout,
  repositionPanel,
  type PanelLayoutState,
} from '@/components/shared/panels/usePanelLayout';

const PANEL_ORDER = ['alpha', 'bravo', 'charlie', 'delta'] as const;

const DEFAULT_STATE: PanelLayoutState = {
  columns: {
    primary: ['alpha', 'bravo'],
    secondary: ['charlie'],
    tertiary: ['delta'],
  },
  collapsed: {},
  heights: {},
};

describe('repositionPanel', () => {
  it('moves a panel into the requested column and position', () => {
    const nextColumns = repositionPanel(DEFAULT_STATE.columns, 'bravo', 'secondary', 0);
    expect(nextColumns.secondary[0]).toBe('bravo');
    expect(nextColumns.primary).not.toContain('bravo');
  });

  it('appends to the target column when index exceeds bounds', () => {
    const nextColumns = repositionPanel(DEFAULT_STATE.columns, 'alpha', 'secondary', 99);
    expect(nextColumns.secondary[nextColumns.secondary.length - 1]).toBe('alpha');
  });
});

describe('normaliseLayout', () => {
  it('merges stored layout with new panels from the default state', () => {
    const storedState: PanelLayoutState = {
      columns: {
        primary: ['bravo'],
        secondary: [],
      },
      collapsed: { bravo: true },
      heights: {},
    };

    const normalised = __test__normaliseLayout(storedState, DEFAULT_STATE, Array.from(PANEL_ORDER));

    expect(normalised.columns.primary).toContain('bravo');
    expect(normalised.columns.primary).toContain('alpha');
    expect(normalised.columns.tertiary).toContain('delta');
  });

  it('filters invalid collapsed and height values', () => {
    const storedState: PanelLayoutState = {
      columns: DEFAULT_STATE.columns,
      collapsed: { alpha: 'yes' as unknown as boolean },
      heights: { alpha: -10 },
    };

    const normalised = __test__normaliseLayout(storedState, DEFAULT_STATE, Array.from(PANEL_ORDER));

    expect(normalised.collapsed.alpha).toBeUndefined();
    expect(normalised.heights.alpha).toBeUndefined();
  });
});
