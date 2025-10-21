'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  useWorkspaceLayoutStore,
  type WorkspaceColumnId,
  type WorkspacePanelId,
  workspacePanelLabels,
} from '@/modules/workspaceLayout/store';

const DATA_FORMAT = 'application/x-workspace-panel';

const getPanelIdFromEvent = (event: DragEvent | React.DragEvent): WorkspacePanelId | null => {
  const primary = event.dataTransfer?.getData(DATA_FORMAT);
  const fallback = event.dataTransfer?.getData('text/plain');
  const value = (primary || fallback) as WorkspacePanelId | undefined;
  if (!value) {
    return null;
  }
  const isKnown = workspacePanelLabels[value] !== undefined;
  return isKnown ? value : null;
};

interface WorkspaceColumnProps {
  columnId: WorkspaceColumnId;
  panelIds: WorkspacePanelId[];
  renderPanel: (panelId: WorkspacePanelId) => ReactNode;
  containerId?: string;
  className?: string;
}

export function WorkspaceColumn({ columnId, panelIds, renderPanel, containerId, className }: WorkspaceColumnProps) {
  const movePanel = useWorkspaceLayoutStore((state) => state.actions.movePanel);
  const draggingPanelId = useWorkspaceLayoutStore((state) => state.draggingPanelId);
  const stopDragging = useWorkspaceLayoutStore((state) => state.actions.stopDragging);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const panelId = getPanelIdFromEvent(event.nativeEvent);
      if (!panelId) {
        setDropIndex(null);
        return;
      }
      const target = dropIndex ?? panelIds.length;
      movePanel(panelId, columnId, target);
      setDropIndex(null);
      stopDragging();
    },
    [columnId, dropIndex, movePanel, panelIds.length, stopDragging],
  );

  const handleDragOverColumn = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!draggingPanelId) {
        return;
      }
      event.preventDefault();
      if (panelIds.length === 0) {
        setDropIndex(0);
      } else if (event.target === event.currentTarget) {
        setDropIndex(panelIds.length);
      }
    },
    [draggingPanelId, panelIds.length],
  );

  const handleDragLeaveColumn = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropIndex(null);
    }
  }, []);

  const contents = useMemo(() => {
    const nodes: ReactNode[] = [];
    panelIds.forEach((panelId, index) => {
      if (dropIndex === index) {
        nodes.push(<WorkspaceDropIndicator key={`indicator-${columnId}-${index}`} />);
      }
      nodes.push(
        <WorkspaceDraggablePanel
          key={panelId}
          panelId={panelId}
          index={index}
          columnId={columnId}
          label={workspacePanelLabels[panelId]}
          onHoverPosition={setDropIndex}
          onHoverClear={() => setDropIndex(null)}
        >
          {renderPanel(panelId)}
        </WorkspaceDraggablePanel>,
      );
    });

    if (dropIndex === panelIds.length) {
      nodes.push(<WorkspaceDropIndicator key={`indicator-${columnId}-end`} />);
    }

    return nodes;
  }, [columnId, dropIndex, panelIds, renderPanel]);

  return (
    <div
      id={containerId}
      className={`flex flex-col gap-6 ${className ?? ''}`}
      data-workspace-column={columnId}
      onDrop={handleDrop}
      onDragOver={handleDragOverColumn}
      onDragLeave={handleDragLeaveColumn}
    >
      {contents}
    </div>
  );
}

interface WorkspaceDraggablePanelProps {
  panelId: WorkspacePanelId;
  columnId: WorkspaceColumnId;
  index: number;
  children: ReactNode;
  label: string;
  onHoverPosition: (index: number) => void;
  onHoverClear: () => void;
}

function WorkspaceDraggablePanel({
  panelId,
  columnId,
  index,
  children,
  label,
  onHoverPosition,
  onHoverClear,
}: WorkspaceDraggablePanelProps) {
  const startDragging = useWorkspaceLayoutStore((state) => state.actions.startDragging);
  const stopDragging = useWorkspaceLayoutStore((state) => state.actions.stopDragging);
  const draggingPanelId = useWorkspaceLayoutStore((state) => state.draggingPanelId);
  const [isDraggable, setIsDraggable] = useState(false);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isDraggable) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(DATA_FORMAT, panelId);
      event.dataTransfer.setData('text/plain', panelId);
      startDragging(panelId);
      event.dataTransfer.setDragImage(event.currentTarget, 20, 20);
    },
    [isDraggable, panelId, startDragging],
  );

  const handleDragEnd = useCallback(() => {
    stopDragging();
    setIsDraggable(false);
    onHoverClear();
  }, [onHoverClear, stopDragging]);

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!draggingPanelId) {
        return;
      }
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const offset = event.clientY - bounds.top;
      const shouldInsertBefore = offset < bounds.height / 2;
      onHoverPosition(shouldInsertBefore ? index : index + 1);
    },
    [draggingPanelId, index, onHoverPosition],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        onHoverClear();
      }
    },
    [onHoverClear],
  );

  const handlePointerDown = useCallback(() => {
    setIsDraggable(true);
  }, []);

  const handlePointerUp = useCallback(() => {
    setIsDraggable(false);
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (!draggingPanelId) {
      setIsDraggable(false);
    }
  }, [draggingPanelId]);

  const isDragging = draggingPanelId === panelId;

  return (
    <div
      className={`relative ${isDragging ? 'opacity-60' : ''}`}
      draggable={isDraggable}
      data-workspace-panel={panelId}
      data-workspace-column={columnId}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <button
        type="button"
        className={`absolute right-4 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-charcoal-200 bg-white/90 text-charcoal-600 shadow transition hover:bg-charcoal-100 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onBlur={handlePointerUp}
      >
        <span aria-hidden className="text-lg leading-none">⋮⋮</span>
        <span className="sr-only">Drag {label}</span>
      </button>
      <div className="pointer-events-auto">{children}</div>
    </div>
  );
}

function WorkspaceDropIndicator() {
  return <div className="h-3 rounded-full border-2 border-dashed border-accent-400 bg-accent-100/40" />;
}
