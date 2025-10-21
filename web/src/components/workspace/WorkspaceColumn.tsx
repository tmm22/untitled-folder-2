'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  useWorkspaceLayoutStore,
  type WorkspaceColumnId,
  type WorkspacePanelId,
  workspacePanelLabels,
} from '@/modules/workspaceLayout/store';

const DATA_FORMAT = 'application/x-workspace-panel';

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
  const columnRef = useRef<HTMLDivElement | null>(null);

  const handleDropAtIndex = useCallback(
    (index: number) => (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const activePanelId = draggingPanelId;
      if (!activePanelId) {
        return;
      }
      movePanel(activePanelId, columnId, index);
      setDropIndex(null);
      stopDragging();
    },
    [columnId, draggingPanelId, movePanel, stopDragging],
  );

  const handleDragOverIndex = useCallback(
    (index: number) => (event: React.DragEvent<HTMLDivElement>) => {
      if (!draggingPanelId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dropIndex !== index) {
        setDropIndex(index);
      }
    },
    [draggingPanelId, dropIndex],
  );

  useEffect(() => {
    if (!draggingPanelId) {
      setDropIndex(null);
    }
  }, [draggingPanelId]);

  const handleColumnDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropIndex(null);
    }
  }, []);

  const dragging = Boolean(draggingPanelId);

  const content = useMemo(() => {
    const nodes: ReactNode[] = [];

    nodes.push(
      <WorkspaceGapDropZone
        key={`zone-${columnId}-0`}
        dragging={dragging}
        active={dropIndex === 0}
        onDragOver={handleDragOverIndex(0)}
        onDrop={handleDropAtIndex(0)}
      />,
    );

    panelIds.forEach((panelId, index) => {
      const slotIndex = index + 1;
      nodes.push(
        <WorkspacePanelSlot
          key={`panel-${panelId}`}
          panelId={panelId}
          columnId={columnId}
          label={workspacePanelLabels[panelId]}
          isDragging={draggingPanelId === panelId}
          dragging={dragging}
          overlayActive={dropIndex === index}
          onOverlayDragOver={handleDragOverIndex(index)}
          onOverlayDrop={handleDropAtIndex(index)}
        >
          {renderPanel(panelId)}
        </WorkspacePanelSlot>,
      );
      nodes.push(
        <WorkspaceGapDropZone
          key={`zone-${columnId}-${slotIndex}`}
          dragging={dragging}
          active={dropIndex === slotIndex}
          onDragOver={handleDragOverIndex(slotIndex)}
          onDrop={handleDropAtIndex(slotIndex)}
        />,
      );
    });

    return nodes;
  }, [columnId, dragging, draggingPanelId, dropIndex, handleDragOverIndex, handleDropAtIndex, panelIds, renderPanel]);

  return (
    <div
      id={containerId}
      ref={columnRef}
      className={`flex flex-col gap-4 ${className ?? ''}`}
      data-workspace-column={columnId}
      onDragLeave={handleColumnDragLeave}
    >
      {content}
    </div>
  );
}

interface WorkspacePanelSlotProps {
  panelId: WorkspacePanelId;
  columnId: WorkspaceColumnId;
  children: ReactNode;
  label: string;
  isDragging: boolean;
  dragging: boolean;
  overlayActive: boolean;
  onOverlayDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onOverlayDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}

function WorkspacePanelSlot({
  panelId,
  columnId,
  children,
  label,
  isDragging,
  dragging,
  overlayActive,
  onOverlayDragOver,
  onOverlayDrop,
}: WorkspacePanelSlotProps) {
  return (
    <div className="relative">
      <WorkspacePanelOverlay
        active={overlayActive}
        enabled={dragging && !isDragging}
        onDragOver={onOverlayDragOver}
        onDrop={onOverlayDrop}
      />
      <WorkspaceDraggablePanel panelId={panelId} columnId={columnId} label={label} isDragging={isDragging}>
        {children}
      </WorkspaceDraggablePanel>
    </div>
  );
}

interface WorkspaceDraggablePanelProps {
  panelId: WorkspacePanelId;
  columnId: WorkspaceColumnId;
  children: ReactNode;
  label: string;
  isDragging: boolean;
}

function WorkspaceDraggablePanel({ panelId, columnId, children, label, isDragging }: WorkspaceDraggablePanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startDragging = useWorkspaceLayoutStore((state) => state.actions.startDragging);
  const stopDragging = useWorkspaceLayoutStore((state) => state.actions.stopDragging);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(DATA_FORMAT, panelId);
      event.dataTransfer.setData('text/plain', panelId);
      const node = containerRef.current;
      if (node) {
        const rect = node.getBoundingClientRect();
        event.dataTransfer.setDragImage(node, rect.width / 2, Math.min(48, rect.height / 2));
      }
      startDragging(panelId);
    },
    [panelId, startDragging],
  );

  const handleDragEnd = useCallback(() => {
    stopDragging();
  }, [stopDragging]);

  return (
    <div
      ref={containerRef}
      className={`relative transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
      data-workspace-panel={panelId}
      data-workspace-column={columnId}
    >
      <button
        type="button"
        draggable
        className={`absolute right-4 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-charcoal-200 bg-white/90 text-charcoal-600 shadow transition hover:bg-charcoal-100 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <span aria-hidden className="text-lg leading-none">⋮⋮</span>
        <span className="sr-only">Drag {label}</span>
      </button>
      <div className="pointer-events-auto">{children}</div>
    </div>
  );
}

interface WorkspacePanelOverlayProps {
  active: boolean;
  enabled: boolean;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}

function WorkspacePanelOverlay({ active, enabled, onDragOver, onDrop }: WorkspacePanelOverlayProps) {
  return (
    <div
      className={`absolute inset-0 rounded-2xl ${enabled ? 'pointer-events-auto' : 'pointer-events-none'}`}
      onDragOver={enabled ? onDragOver : undefined}
      onDragEnter={enabled ? onDragOver : undefined}
      onDrop={enabled ? onDrop : undefined}
    >
      <div
        className={`absolute inset-0 rounded-2xl border-2 border-dashed border-accent-500 bg-accent-100/60 transition-opacity ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}

interface WorkspaceGapDropZoneProps {
  active: boolean;
  dragging: boolean;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}

function WorkspaceGapDropZone({ active, dragging, onDragOver, onDrop }: WorkspaceGapDropZoneProps) {
  return (
    <div
      className={`flex items-center justify-center py-1 ${dragging ? 'pointer-events-auto' : 'pointer-events-none'}`}
      onDragOver={dragging ? onDragOver : undefined}
      onDragEnter={dragging ? onDragOver : undefined}
      onDrop={dragging ? onDrop : undefined}
    >
      <div
        className={`h-2 w-full max-w-[360px] rounded-full border-2 border-dashed border-accent-500 bg-accent-100/70 transition ${
          active ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
        }`}
      />
    </div>
  );
}
