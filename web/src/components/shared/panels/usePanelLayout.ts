import { useCallback, useEffect, useMemo, useState } from 'react';

export type PanelId = string;
export type ColumnId = string;

export interface PanelLayoutState {
  columns: Record<ColumnId, PanelId[]>;
  collapsed: Record<PanelId, boolean | undefined>;
  heights: Record<PanelId, number | undefined>;
}

export interface UsePanelLayoutOptions {
  storageKey: string;
  defaultState: PanelLayoutState;
  panelOrder: PanelId[];
}

const noopLayout: PanelLayoutState = {
  columns: {},
  collapsed: {},
  heights: {},
};

const DATA_VERSION = 1;

interface StoredLayout {
  version: number;
  state: PanelLayoutState;
}

function normaliseLayout(
  incoming: PanelLayoutState | undefined,
  fallback: PanelLayoutState,
  panelOrder: PanelId[],
): PanelLayoutState {
  const result: PanelLayoutState = {
    columns: {},
    collapsed: {},
    heights: {},
  };

  const validPanelIds = new Set(panelOrder);
  const placedPanels = new Set<PanelId>();
  const fallbackColumns = fallback.columns ?? {};
  const incomingColumns = incoming?.columns ?? {};
  const allColumnKeys = Array.from(
    new Set<ColumnId>([...Object.keys(fallbackColumns), ...Object.keys(incomingColumns)]),
  );

  for (const columnKey of allColumnKeys) {
    result.columns[columnKey] = [];
  }

  for (const columnKey of allColumnKeys) {
    const targetList = result.columns[columnKey]!;
    const sourceList = incomingColumns[columnKey] ?? [];
    for (const panelId of sourceList) {
      if (!validPanelIds.has(panelId) || placedPanels.has(panelId)) {
        continue;
      }
      targetList.push(panelId);
      placedPanels.add(panelId);
    }
  }

  for (const [columnKey, fallbackList] of Object.entries(fallbackColumns)) {
    const targetList = result.columns[columnKey] ?? (result.columns[columnKey] = []);
    for (const panelId of fallbackList) {
      if (!validPanelIds.has(panelId) || placedPanels.has(panelId)) {
        continue;
      }
      targetList.push(panelId);
      placedPanels.add(panelId);
    }
  }

  const remainingPanels = panelOrder.filter((panelId) => !placedPanels.has(panelId));
  if (remainingPanels.length > 0) {
    const firstColumnKey =
      Object.keys(result.columns)[0] ??
      Object.keys(fallbackColumns)[0] ??
      Object.keys(incomingColumns)[0] ??
      'default';
    const targetList = result.columns[firstColumnKey] ?? (result.columns[firstColumnKey] = []);
    targetList.push(...remainingPanels);
  }

  const candidateCollapsed = { ...(fallback.collapsed ?? {}), ...(incoming?.collapsed ?? {}) };
  for (const [panelId, collapsed] of Object.entries(candidateCollapsed)) {
    if (!validPanelIds.has(panelId)) {
      continue;
    }
    if (typeof collapsed === 'boolean') {
      result.collapsed[panelId] = collapsed;
    }
  }

  const candidateHeights = { ...(fallback.heights ?? {}), ...(incoming?.heights ?? {}) };
  for (const [panelId, height] of Object.entries(candidateHeights)) {
    if (!validPanelIds.has(panelId)) {
      continue;
    }
    if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
      result.heights[panelId] = height;
    }
  }

  return result;
}

export function repositionPanel(
  columns: PanelLayoutState['columns'],
  panelId: PanelId,
  targetColumn: ColumnId,
  targetIndex: number,
): PanelLayoutState['columns'] {
  const nextColumns: PanelLayoutState['columns'] = {};
  for (const [columnKey, panelIds] of Object.entries(columns)) {
    nextColumns[columnKey] = panelIds.filter((candidate) => candidate !== panelId);
  }
  const column = nextColumns[targetColumn] ?? (nextColumns[targetColumn] = []);
  const clampedIndex = Math.max(0, Math.min(targetIndex, column.length));
  column.splice(clampedIndex, 0, panelId);
  return nextColumns;
}

export function usePanelLayout(options: UsePanelLayoutOptions) {
  const { storageKey, defaultState, panelOrder } = options;
  const stablePanelOrder = useMemo(() => [...panelOrder], [panelOrder]);

  const [state, setState] = useState<PanelLayoutState>(() =>
    normaliseLayout(undefined, defaultState, stablePanelOrder),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setState(normaliseLayout(undefined, defaultState, stablePanelOrder));
        setHydrated(true);
        return;
      }
      const decoded = JSON.parse(raw) as StoredLayout | PanelLayoutState;
      const candidateState =
        'version' in decoded && decoded.version === DATA_VERSION ? decoded.state : decoded;
      setState(normaliseLayout(candidateState, defaultState, stablePanelOrder));
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Failed to restore panel layout from localStorage', error);
      }
      setState(normaliseLayout(undefined, defaultState, stablePanelOrder));
    } finally {
      setHydrated(true);
    }
  }, [defaultState, stablePanelOrder, storageKey]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') {
      return;
    }
    try {
      const payload: StoredLayout = {
        version: DATA_VERSION,
        state,
      };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Unable to persist panel layout', error);
      }
    }
  }, [hydrated, state, storageKey]);

  const movePanel = useCallback(
    (panelId: PanelId, targetColumn: ColumnId, targetIndex: number) => {
      setState((previous) => {
        if (!panelId) {
          return previous;
        }
        const nextColumns = repositionPanel(previous.columns, panelId, targetColumn, targetIndex);
        return {
          ...previous,
          columns: nextColumns,
        };
      });
    },
    [],
  );

  const toggleCollapse = useCallback((panelId: PanelId) => {
    setState((previous) => ({
      ...previous,
      collapsed: {
        ...previous.collapsed,
        [panelId]: !previous.collapsed?.[panelId],
      },
    }));
  }, []);

  const setCollapsed = useCallback((panelId: PanelId, collapsed: boolean | undefined) => {
    setState((previous) => ({
      ...previous,
      collapsed: {
        ...previous.collapsed,
        [panelId]: collapsed,
      },
    }));
  }, []);

  const setPanelHeight = useCallback((panelId: PanelId, height: number | undefined) => {
    setState((previous) => {
      const nextHeights = { ...previous.heights };
      if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
        nextHeights[panelId] = height;
      } else {
        delete nextHeights[panelId];
      }
      return {
        ...previous,
        heights: nextHeights,
      };
    });
  }, []);

  const resetLayout = useCallback(() => {
    setState(normaliseLayout(undefined, defaultState, stablePanelOrder));
  }, [defaultState, stablePanelOrder]);

  return {
    state,
    hydrated,
    actions: {
      movePanel,
      toggleCollapse,
      setCollapsed,
      setPanelHeight,
      resetLayout,
    },
  };
}

export type UsePanelLayoutReturn = ReturnType<typeof usePanelLayout>;

export const __test__normaliseLayout = normaliseLayout;
