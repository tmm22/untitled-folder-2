'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useWorkspaceLayoutStore, type WorkspaceColumnId, type WorkspacePanelId } from './store';

type ColumnSnapshot = {
  columnId: WorkspaceColumnId;
  rect: DOMRect;
  panels: Array<{ panelId: WorkspacePanelId; rect: DOMRect }>;
};

type DragMode = 'pointer' | 'keyboard' | null;

interface DragState {
  active: boolean;
  mode: DragMode;
  panelId: WorkspacePanelId | null;
  originColumnId: WorkspaceColumnId | null;
  pointerId: number | null;
  pointer: { x: number; y: number } | null;
  pointerOffset: { x: number; y: number } | null;
  previewSize: { width: number; height: number } | null;
  targetColumnId: WorkspaceColumnId | null;
  targetIndex: number | null;
}

const initialDragState: DragState = {
  active: false,
  mode: null,
  panelId: null,
  originColumnId: null,
  pointerId: null,
  pointer: null,
  pointerOffset: null,
  previewSize: null,
  targetColumnId: null,
  targetIndex: null,
};

interface WorkspaceDragController {
  dragState: DragState;
  registerColumn: (columnId: WorkspaceColumnId) => (element: HTMLDivElement | null) => void;
  registerPanel: (columnId: WorkspaceColumnId, panelId: WorkspacePanelId) => (element: HTMLDivElement | null) => void;
  beginPointerDrag: (args: {
    panelId: WorkspacePanelId;
    columnId: WorkspaceColumnId;
    pointerId: number;
    clientX: number;
    clientY: number;
    previewSize: { width: number; height: number };
  }) => void;
  beginKeyboardDrag: (args: { panelId: WorkspacePanelId; columnId: WorkspaceColumnId }) => void;
  handleKeyboardKey: (event: React.KeyboardEvent<HTMLElement>, columnId: WorkspaceColumnId, panelIndex: number) => boolean;
  cancelDrag: () => void;
  finalizeDrag: (columnId: WorkspaceColumnId, index: number) => void;
}

const WorkspaceDragContext = createContext<WorkspaceDragController | null>(null);

const COLUMN_SEQUENCE: WorkspaceColumnId[] = ['left', 'center', 'right'];
const HORIZONTAL_TOLERANCE = 200;

export function WorkspaceDragProvider({ children }: { children: ReactNode }) {
  const [dragState, setDragState] = useState<DragState>(initialDragState);
  const columnRegistry = useRef(new Map<WorkspaceColumnId, HTMLDivElement>());
  const panelRegistry = useRef(new Map<WorkspaceColumnId, Map<WorkspacePanelId, HTMLDivElement>>());
  const snapshotRef: MutableRefObject<ColumnSnapshot[]> = useRef([]);

  const registerColumn = useCallback(
    (columnId: WorkspaceColumnId) => (element: HTMLDivElement | null) => {
      if (element) {
        columnRegistry.current.set(columnId, element);
      } else {
        columnRegistry.current.delete(columnId);
      }
    },
    [],
  );

  const registerPanel = useCallback(
    (columnId: WorkspaceColumnId, panelId: WorkspacePanelId) => (element: HTMLDivElement | null) => {
      let panels = panelRegistry.current.get(columnId);
      if (!panels) {
        panels = new Map();
        panelRegistry.current.set(columnId, panels);
      }
      if (element) {
        panels.set(panelId, element);
      } else {
        panels.delete(panelId);
      }
    },
    [],
  );

  const captureSnapshot = useCallback(
    (activePanelId: WorkspacePanelId | null) => {
      const snapshot: ColumnSnapshot[] = [];
      columnRegistry.current.forEach((columnElement, columnId) => {
        const panelsMap = panelRegistry.current.get(columnId) ?? new Map();
        const panels = Array.from(panelsMap.entries()).map(([panelId, element]) => ({
          panelId,
          rect: element.getBoundingClientRect(),
        }));
        snapshot.push({
          columnId,
          rect: columnElement.getBoundingClientRect(),
          panels,
        });
      });
      snapshotRef.current = snapshot;
    },
    [],
  );

  const computeTarget = useCallback((pointer: { x: number; y: number }, activePanelId: WorkspacePanelId | null) => {
    if (!activePanelId) {
      return { columnId: null, index: null };
    }
    const snapshot = snapshotRef.current;
    if (snapshot.length === 0) {
      return { columnId: null, index: null };
    }

    let bestColumn: ColumnSnapshot | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    snapshot.forEach((column) => {
      const { rect } = column;
      const inside = pointer.x >= rect.left && pointer.x <= rect.right;
      const distance = inside
        ? 0
        : Math.min(Math.abs(pointer.x - rect.left), Math.abs(pointer.x - rect.right));
      if (distance <= HORIZONTAL_TOLERANCE && distance < bestDistance) {
        bestColumn = column;
        bestDistance = distance;
      }
    });

    if (!bestColumn) {
      return { columnId: null, index: null };
    }

    const column: ColumnSnapshot = bestColumn;
    const panels = column.panels.filter((panel) => panel.panelId !== activePanelId);
    if (panels.length === 0) {
      return { columnId: column.columnId, index: 0 };
    }

    let index = panels.length;
    for (let i = 0; i < panels.length; i += 1) {
      const rect = panels[i].rect;
      const midpoint = rect.top + rect.height / 2;
      if (pointer.y < midpoint) {
        index = i;
        break;
      }
    }
    return { columnId: column.columnId, index };
  }, []);

  const endDrag = useCallback(() => {
    setDragState(initialDragState);
    document.body.classList.remove('workspace-drag-active');
    document.body.style.userSelect = '';
  }, []);

  const cancelDrag = useCallback(() => {
    endDrag();
  }, [endDrag]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('workspace-drag-active');
      document.body.style.userSelect = '';
    };
  }, []);

  const finalizeDrag = useCallback(
    (columnId: WorkspaceColumnId, index: number) => {
      setDragState((previous) => {
        if (!previous.active || !previous.panelId) {
          return previous;
        }
        const { movePanel } = useWorkspaceLayoutStore.getState().actions;
        movePanel(previous.panelId, columnId, index);
        return previous;
      });
      endDrag();
    },
    [endDrag],
  );

  const beginPointerDrag = useCallback(
    ({
      panelId,
      columnId,
      pointerId,
      clientX,
      clientY,
      previewSize,
    }: {
      panelId: WorkspacePanelId;
      columnId: WorkspaceColumnId;
      pointerId: number;
      clientX: number;
      clientY: number;
      previewSize: { width: number; height: number };
    }) => {
      captureSnapshot(panelId);
      const pointer = { x: clientX, y: clientY };
      let currentTarget = computeTarget(pointer, panelId);
      const columnSnapshot = snapshotRef.current.find((column) => column.columnId === columnId);
      const panelRect = columnSnapshot?.panels.find((panel) => panel.panelId === panelId)?.rect ?? null;
      const pointerOffset = panelRect
        ? { x: pointer.x - panelRect.left, y: pointer.y - panelRect.top }
        : { x: previewSize.width / 2, y: previewSize.height / 2 };
      setDragState({
        active: true,
        mode: 'pointer',
        panelId,
        originColumnId: columnId,
        pointerId,
        pointer,
        pointerOffset,
        previewSize,
        targetColumnId: currentTarget.columnId,
        targetIndex: currentTarget.index,
      });
      document.body.classList.add('workspace-drag-active');
      document.body.style.userSelect = 'none';

      const handleMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) {
          return;
        }
        const nextPointer = { x: event.clientX, y: event.clientY };
        currentTarget = computeTarget(nextPointer, panelId);
        setDragState((previous) =>
          previous.active && previous.panelId === panelId
            ? {
                ...previous,
                pointer: nextPointer,
                targetColumnId: currentTarget.columnId,
                targetIndex: currentTarget.index,
              }
            : previous,
        );
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', commitDrag);
        window.removeEventListener('pointercancel', handleCancel);
      };

      const commitDrag = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) {
          return;
        }
        event.preventDefault();
        cleanup();
        if (currentTarget.columnId && currentTarget.index !== null) {
          finalizeDrag(currentTarget.columnId, currentTarget.index);
        } else {
          cancelDrag();
        }
      };

      const handleCancel = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) {
          return;
        }
        cleanup();
        endDrag();
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', commitDrag);
      window.addEventListener('pointercancel', handleCancel);
    },
    [captureSnapshot, computeTarget, finalizeDrag, cancelDrag, endDrag],
  );

  const beginKeyboardDrag = useCallback(
    ({ panelId, columnId }: { panelId: WorkspacePanelId; columnId: WorkspaceColumnId }) => {
      captureSnapshot(panelId);
      const originSnapshot = snapshotRef.current.find((column) => column.columnId === columnId);
      const panels = originSnapshot?.panels ?? [];
      const filteredPanels = panels.filter((panel) => panel.panelId !== panelId);
      const originIndex = panels.findIndex((panel) => panel.panelId === panelId);
      const initialIndex = originIndex >= 0 ? Math.min(filteredPanels.length, originIndex) : filteredPanels.length;
      setDragState({
        active: true,
        mode: 'keyboard',
        panelId,
        originColumnId: columnId,
        pointerId: null,
        pointer: null,
        previewSize: originSnapshot?.panels.find((panel) => panel.panelId === panelId)?.rect
          ? {
              width: originSnapshot.panels.find((panel) => panel.panelId === panelId)!.rect.width,
              height: originSnapshot.panels.find((panel) => panel.panelId === panelId)!.rect.height,
            }
          : null,
        pointerOffset: null,
        targetColumnId: columnId,
        targetIndex: initialIndex,
      });
    },
    [captureSnapshot],
  );

  const commitKeyboardDrag = useCallback(() => {
    setDragState((previous) => {
      if (!previous.active || previous.mode !== 'keyboard' || !previous.panelId) {
        return previous;
      }
      if (previous.targetColumnId && previous.targetIndex !== null) {
        const { movePanel } = useWorkspaceLayoutStore.getState().actions;
        movePanel(previous.panelId, previous.targetColumnId, previous.targetIndex);
      }
      return previous;
    });
    endDrag();
  }, [endDrag]);

  const handleKeyboardKey = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, columnId: WorkspaceColumnId, panelIndex: number) => {
      if (!dragState.active) {
        return false;
      }
      if (dragState.mode === 'keyboard' && dragState.panelId) {
        const currentColumn = dragState.targetColumnId ?? dragState.originColumnId ?? columnId;
        const snapshot = snapshotRef.current.find((column) => column.columnId === currentColumn);
        const panels = snapshot?.panels ?? [];
        const filteredPanels = panels.filter((panel) => panel.panelId !== dragState.panelId);
        const maxIndex = filteredPanels.length;

        if (event.key === 'Escape') {
          event.preventDefault();
          cancelDrag();
          return true;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          commitKeyboardDrag();
          return true;
        }

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          setDragState((previous) => {
            if (!previous.active || previous.mode !== 'keyboard') {
              return previous;
            }
            let nextColumn = previous.targetColumnId ?? previous.originColumnId ?? columnId;
            let nextIndex = previous.targetIndex ?? panelIndex;

            if (event.key === 'ArrowUp') {
              nextIndex = Math.max(0, nextIndex - 1);
            } else if (event.key === 'ArrowDown') {
              nextIndex = Math.min(maxIndex, nextIndex + 1);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              const direction = event.key === 'ArrowLeft' ? -1 : 1;
              const columnPosition = COLUMN_SEQUENCE.indexOf(nextColumn);
              const nextPosition = Math.min(
                COLUMN_SEQUENCE.length - 1,
                Math.max(0, columnPosition + direction),
              );
              nextColumn = COLUMN_SEQUENCE[nextPosition];
              const targetSnapshot = snapshotRef.current.find((column) => column.columnId === nextColumn);
              const targetPanels = targetSnapshot?.panels ?? [];
              const targetFiltered = targetPanels.filter((panel) => panel.panelId !== dragState.panelId);
              nextIndex = Math.min(targetFiltered.length, nextIndex);
            }

            return { ...previous, targetColumnId: nextColumn, targetIndex: nextIndex };
          });
          return true;
        }
      }
      return false;
    },
    [cancelDrag, commitKeyboardDrag, dragState],
  );

  const contextValue = useMemo<WorkspaceDragController>(
    () => ({
      dragState,
      registerColumn,
      registerPanel,
      beginPointerDrag,
      beginKeyboardDrag,
      handleKeyboardKey,
      cancelDrag,
      finalizeDrag,
    }),
    [beginKeyboardDrag, beginPointerDrag, cancelDrag, dragState, finalizeDrag, handleKeyboardKey, registerColumn, registerPanel],
  );

  return <WorkspaceDragContext.Provider value={contextValue}>{children}</WorkspaceDragContext.Provider>;
}

export function useWorkspaceDrag() {
  const context = useContext(WorkspaceDragContext);
  if (!context) {
    throw new Error('useWorkspaceDrag must be used within a WorkspaceDragProvider');
  }

  return context;
}
