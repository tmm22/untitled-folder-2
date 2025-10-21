import {
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { PanelId } from './usePanelLayout';

export const PANEL_DRAG_DATA_TYPE = 'application/x-transit-panel';

interface InteractivePanelProps {
  id: PanelId;
  title: string;
  description?: string;
  htmlId?: string;
  className?: string;
  bodyClassName?: string;
  collapsed: boolean;
  height?: number;
  allowResize?: boolean;
  allowCollapse?: boolean;
  headerAccessory?: ReactNode;
  headerMode?: 'standard' | 'minimal';
  surfaceVariant?: 'default' | 'bare';
  children: ReactNode;
  onToggleCollapse: () => void;
  onResize: (height?: number) => void;
  onDragStart: (panelId: PanelId, event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  isDragging?: boolean;
}

export function InteractivePanel({
  id,
  title,
  description,
  htmlId,
  className,
  bodyClassName,
  collapsed,
  height,
  allowResize = true,
  allowCollapse = true,
  headerAccessory,
  headerMode = 'standard',
  surfaceVariant = 'default',
  children,
  onToggleCollapse,
  onResize,
  onDragStart,
  onDragEnd,
  isDragging = false,
}: InteractivePanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const combinedClassName = useMemo(() => {
    const baseSurfaceClasses =
      surfaceVariant === 'default'
        ? 'relative rounded-2xl border border-charcoal-200/70 bg-white/80 p-4 shadow-sm shadow-charcoal-200/60 transition'
        : 'relative transition';
    const classes = [
      baseSurfaceClasses,
      'focus-within:ring-2 focus-within:ring-accent-300/60',
      isDragging ? 'ring-2 ring-accent-400 shadow-accent-300/60' : '',
      className ?? '',
    ];
    return classes.filter(Boolean).join(' ');
  }, [className, isDragging, surfaceVariant]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!allowResize || collapsed) {
        return;
      }
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = height ?? contentRef.current?.offsetHeight ?? 0;
      const onPointerMove = (moveEvent: PointerEvent) => {
        const nextHeight = Math.max(160, startHeight + (moveEvent.clientY - startY));
        onResize(nextHeight);
      };
      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [allowResize, collapsed, height, onResize],
  );

  const handleResetSize = useCallback(() => {
    onResize(undefined);
  }, [onResize]);

  const contentStyle = useMemo<CSSProperties>(() => {
    if (collapsed) {
      return { display: 'none' };
    }
    if (typeof height === 'number' && Number.isFinite(height)) {
      return { height, overflowY: 'auto' };
    }
    return {};
  }, [collapsed, height]);

  const dragHandle = (
    <button
      type="button"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-charcoal-300 text-sm font-semibold uppercase tracking-[0.15em] text-charcoal-500 transition hover:border-accent-400 hover:text-accent-600"
      draggable
      aria-label={`Move ${title}`}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(PANEL_DRAG_DATA_TYPE, id);
        event.dataTransfer.setData('text/plain', id);
        onDragStart(id, event);
      }}
      onDragEnd={onDragEnd}
    >
      ::
    </button>
  );

  const controlButtons = (
    <>
      {allowResize && !collapsed ? (
        <button
          type="button"
          className="rounded-full border border-charcoal-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal-600 transition hover:bg-charcoal-100/70"
          onClick={handleResetSize}
        >
          Reset
        </button>
      ) : null}
      {allowCollapse ? (
        <button
          type="button"
          className="rounded-full border border-charcoal-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal-900 transition hover:bg-charcoal-900 hover:text-cream-50"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-controls={`${id}-panel-content`}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      ) : null}
    </>
  );

  const bodyClass = useMemo(() => {
    const defaults = headerMode === 'standard' ? 'flex flex-col gap-4' : '';
    return [defaults, bodyClassName ?? ''].filter(Boolean).join(' ');
  }, [bodyClassName, headerMode]);

  return (
    <section className={combinedClassName} data-panel-id={id} aria-label={title} id={htmlId}>
      {headerMode === 'standard' ? (
        <header className="mb-3 flex flex-wrap items-center gap-3">
          {dragHandle}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="text-sm font-semibold text-charcoal-900">{title}</h3>
            {description ? <p className="text-xs text-charcoal-500">{description}</p> : null}
          </div>
          {headerAccessory}
          <div className="ml-auto flex items-center gap-2">{controlButtons}</div>
        </header>
      ) : (
        <div className="pointer-events-none absolute -right-3 -top-3 z-10 flex items-center gap-2">
          <div className="pointer-events-auto">{dragHandle}</div>
          <div className="pointer-events-auto flex items-center gap-2">{controlButtons}</div>
        </div>
      )}
      <div
        id={`${id}-panel-content`}
        ref={contentRef}
        className={bodyClass}
        style={contentStyle}
      >
        {children}
      </div>
      {allowResize && !collapsed ? (
        <div
          className="mt-3 h-3 w-full cursor-row-resize rounded-full border border-dashed border-charcoal-200 bg-transparent transition hover:border-accent-400"
          onPointerDown={handleResizePointerDown}
          role="presentation"
          aria-hidden="true"
        />
      ) : null}
    </section>
  );
}
