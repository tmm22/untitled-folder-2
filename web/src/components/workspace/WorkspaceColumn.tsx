'use client';

import { Fragment, memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useWorkspaceDrag } from '@/modules/workspaceLayout/dragContext';
import { workspacePanelLabels, type WorkspaceColumnId, type WorkspacePanelId } from '@/modules/workspaceLayout/store';

const COLUMN_LABELS: Record<WorkspaceColumnId, string> = {
  left: 'Workspace left column',
  center: 'Workspace center column',
  right: 'Workspace right column',
};

interface WorkspaceColumnProps {
  columnId: WorkspaceColumnId;
  panelIds: WorkspacePanelId[];
  renderPanel: (panelId: WorkspacePanelId) => ReactNode;
  containerId?: string;
  className?: string;
}

export const WorkspaceColumn = memo(function WorkspaceColumn({
  columnId,
  panelIds,
  renderPanel,
  containerId,
  className,
}: WorkspaceColumnProps) {
  const { dragState, registerColumn, registerPanel, finalizeDrag } = useWorkspaceDrag();

  const columnRef = useMemo(() => registerColumn(columnId), [registerColumn, columnId]);

  const filteredOrder = useMemo(() => {
    if (!dragState.active || !dragState.panelId) {
      return panelIds;
    }
    if (dragState.mode === 'keyboard' && dragState.targetColumnId === columnId && dragState.panelId) {
      // remove active panel; keyboard logic re-inserts at target
      return panelIds.filter((panelId) => panelId !== dragState.panelId);
    }
    return panelIds.filter((panelId) => panelId !== dragState.panelId);
  }, [dragState.active, dragState.mode, dragState.panelId, dragState.targetColumnId, columnId, panelIds]);

  const filteredIndexMap = useMemo(() => {
    const map = new Map<WorkspacePanelId, number>();
    filteredOrder.forEach((panelId, index) => map.set(panelId, index));
    return map;
  }, [filteredOrder]);

  const targetIndex =
    dragState.active && dragState.targetColumnId === columnId ? dragState.targetIndex ?? null : null;

  return (
    <section
      id={containerId}
      ref={columnRef}
      aria-label={COLUMN_LABELS[columnId]}
      className={`flex flex-col gap-4 ${className ?? ''}`}
      data-workspace-column={columnId}
    >
      <WorkspaceGapIndicator
        columnId={columnId}
        index={0}
        dragging={dragState.active}
        active={targetIndex === 0}
        finalizeDrag={finalizeDrag}
      />
      {panelIds.map((panelId) => {
        const filteredIndex = filteredIndexMap.get(panelId);
        const isDragged = dragState.active && dragState.panelId === panelId;
        const overlayActive = filteredIndex !== undefined && targetIndex === filteredIndex;
        const dropBeforeIndex =
          filteredIndex ??
          (dragState.active && dragState.panelId === panelId && dragState.targetColumnId === columnId
            ? dragState.targetIndex ?? filteredOrder.length
            : filteredOrder.length);
        const dropAfterIndex = filteredIndex !== undefined ? filteredIndex + 1 : filteredOrder.length;
        const gapAfterActive = dropAfterIndex === targetIndex;

        return (
          <Fragment key={panelId}>
            <WorkspacePanelSlot
              columnId={columnId}
              panelId={panelId}
              registerPanel={registerPanel}
              overlayActive={overlayActive}
              isDragged={isDragged}
              panelIndex={filteredIndex ?? filteredOrder.length}
              dropIndex={dropBeforeIndex}
              finalizeDrag={finalizeDrag}
            >
              {renderPanel(panelId)}
            </WorkspacePanelSlot>
            <WorkspaceGapIndicator
              columnId={columnId}
              index={dropAfterIndex}
              dragging={dragState.active}
              active={gapAfterActive}
              finalizeDrag={finalizeDrag}
            />
          </Fragment>
        );
      })}
    </section>
  );
});

interface WorkspacePanelSlotProps {
  panelId: WorkspacePanelId;
  columnId: WorkspaceColumnId;
  registerPanel: ReturnType<typeof useWorkspaceDrag>['registerPanel'];
  overlayActive: boolean;
  isDragged: boolean;
  panelIndex: number;
  dropIndex: number;
  finalizeDrag: ReturnType<typeof useWorkspaceDrag>['finalizeDrag'];
  children: ReactNode;
}

function WorkspacePanelSlot({
  panelId,
  columnId,
  registerPanel,
  overlayActive,
  isDragged,
  panelIndex,
  dropIndex,
  finalizeDrag,
  children,
}: WorkspacePanelSlotProps) {
  const { dragState, beginPointerDrag, beginKeyboardDrag, handleKeyboardKey, cancelDrag } = useWorkspaceDrag();
  const panelRef = useMemo(() => registerPanel(columnId, panelId), [registerPanel, columnId, panelId]);
  const dragging = dragState.active;
  const isPointerDrag =
    dragging &&
    dragState.mode === 'pointer' &&
    dragState.panelId === panelId &&
    dragState.pointer &&
    dragState.pointerOffset &&
    dragState.previewSize;
  const pointerStyle = isPointerDrag
    ? {
        position: 'fixed' as const,
        left: `${dragState.pointer!.x - dragState.pointerOffset!.x}px`,
        top: `${dragState.pointer!.y - dragState.pointerOffset!.y}px`,
        width: `${dragState.previewSize!.width}px`,
        height: `${dragState.previewSize!.height}px`,
        zIndex: 1000,
        pointerEvents: 'none' as const,
      }
    : undefined;
  const placeholderStyle = isPointerDrag
    ? {
        height: `${dragState.previewSize!.height}px`,
      }
    : undefined;

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const host = (event.currentTarget.parentElement?.parentElement as HTMLElement) ?? event.currentTarget;
    const rect = host.getBoundingClientRect();
    beginPointerDrag({
      panelId,
      columnId,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      previewSize: { width: rect.width, height: rect.height },
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      if (handleKeyboardKey(event, columnId, panelIndex)) {
        return;
      }
      cancelDrag();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (!dragging) {
        event.preventDefault();
        beginKeyboardDrag({ panelId, columnId });
        return;
      }
    }

    if (dragging && handleKeyboardKey(event, columnId, panelIndex)) {
      return;
    }
  };

  return (
    <>
      {placeholderStyle ? <div aria-hidden style={placeholderStyle} /> : null}
      <div
        ref={panelRef}
        className="relative"
        data-workspace-panel={panelId}
        data-workspace-column={columnId}
        style={pointerStyle}
      >
        <div
          className={`absolute inset-0 rounded-2xl border-2 border-dashed border-accent-500 bg-accent-100/60 transition-opacity ${
            overlayActive ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden
          onPointerUp={(event) => {
            if (dragState.active && dragState.mode === 'pointer') {
              event.preventDefault();
              finalizeDrag(columnId, dropIndex);
            }
          }}
        />
        <div className={`relative transition-opacity ${isDragged ? 'opacity-40' : 'opacity-100'}`}>
          <button
            type="button"
            className={`absolute right-4 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-charcoal-200 bg-white/90 text-charcoal-600 shadow transition hover:bg-charcoal-100 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 ${
              dragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            aria-label={`Move ${workspacePanelLabels[panelId]}`}
            aria-grabbed={dragging && isDragged}
            onPointerDown={handlePointerDown}
            onKeyDown={handleKeyDown}
          >
            <span aria-hidden className="text-lg leading-none">
              ⋮⋮
            </span>
          </button>
          <div className="pointer-events-auto">{children}</div>
        </div>
      </div>
    </>
  );
}

interface WorkspaceGapIndicatorProps {
  columnId: WorkspaceColumnId;
  index: number;
  active: boolean;
  dragging: boolean;
  finalizeDrag: ReturnType<typeof useWorkspaceDrag>['finalizeDrag'];
}

function WorkspaceGapIndicator({ columnId, index, active, dragging, finalizeDrag }: WorkspaceGapIndicatorProps) {
  return (
    <div className="flex items-center justify-center py-1">
      <div
        className={`h-2 w-full max-w-[360px] rounded-full border-2 border-dashed border-accent-500 bg-accent-100/70 transition ${
          active ? 'scale-100 opacity-100' : dragging ? 'scale-90 opacity-30' : 'scale-75 opacity-0'
        }`}
        aria-hidden
        onPointerUp={(event) => {
          event.preventDefault();
          finalizeDrag(columnId, index);
        }}
      />
    </div>
  );
}
