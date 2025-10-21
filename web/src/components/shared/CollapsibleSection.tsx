'use client';

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

type CollapsibleSectionProps = {
  id?: string;
  title?: string;
  children: ReactNode;
  className?: string;
  defaultCollapsed?: boolean;
  minHeight?: number;
  maxHeight?: number;
  allowResize?: boolean;
  collapsibleId?: string;
  actions?: ReactNode;
  variant?: 'panel' | 'plain';
};

const DEFAULT_MIN_HEIGHT = 140;
const DEFAULT_MAX_HEIGHT = 840;

export function CollapsibleSection({
  id,
  title,
  children,
  className,
  defaultCollapsed = false,
  minHeight = DEFAULT_MIN_HEIGHT,
  maxHeight = DEFAULT_MAX_HEIGHT,
  allowResize = true,
  collapsibleId,
  actions,
  variant = 'panel',
}: CollapsibleSectionProps) {
  const generatedId = useId();
  const contentId = collapsibleId ?? `${generatedId}-content`;
  const [isCollapsed, setCollapsed] = useState(defaultCollapsed);
  const [height, setHeight] = useState<number | undefined>();
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clampHeight = useCallback(
    (value: number) => {
      return Math.min(maxHeight, Math.max(minHeight, value));
    },
    [maxHeight, minHeight],
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => !previous);
  }, []);

  const resetSize = useCallback(() => {
    setHeight(undefined);
  }, []);

  const startResize = useCallback(
    (clientY: number) => {
      const currentHeight =
        height ?? containerRef.current?.offsetHeight ?? Math.max(minHeight, Math.floor((maxHeight + minHeight) / 2));
      resizeStateRef.current = { startY: clientY, startHeight: currentHeight };
      setHeight(clampHeight(currentHeight));
    },
    [clampHeight, height, maxHeight, minHeight],
  );

  const continueResize = useCallback(
    (clientY: number) => {
      if (!resizeStateRef.current) {
        return;
      }
      const delta = clientY - resizeStateRef.current.startY;
      const nextHeight = clampHeight(resizeStateRef.current.startHeight + delta);
      setHeight(nextHeight);
    },
    [clampHeight],
  );

  const stopResize = useCallback(() => {
    resizeStateRef.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isCollapsed || !allowResize) {
        return;
      }
      event.preventDefault();
      startResize(event.clientY);

      const handleMove = (moveEvent: PointerEvent) => {
        continueResize(moveEvent.clientY);
      };

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        stopResize();
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp, { once: true });
    },
    [allowResize, continueResize, isCollapsed, startResize, stopResize],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isCollapsed || !allowResize) {
        return;
      }
      const key = event.key;
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(key)) {
        return;
      }
      event.preventDefault();
      const baseHeight =
        height ?? containerRef.current?.offsetHeight ?? Math.max(minHeight, Math.floor((maxHeight + minHeight) / 2));
      const step = 32;
      if (key === 'ArrowUp' || key === 'PageUp') {
        setHeight(clampHeight(baseHeight - step));
      } else if (key === 'ArrowDown' || key === 'PageDown') {
        setHeight(clampHeight(baseHeight + step));
      } else if (key === 'Home') {
        setHeight(clampHeight(minHeight));
      } else if (key === 'End') {
        setHeight(clampHeight(maxHeight));
      }
    },
    [allowResize, clampHeight, height, isCollapsed, maxHeight, minHeight],
  );

  const contentStyles: CSSProperties = useMemo(() => {
    if (isCollapsed) {
      return {
        height: 0,
        opacity: 0,
        overflow: 'hidden',
      };
    }
    if (typeof height === 'number') {
      return {
        height,
      };
    }
    return {};
  }, [height, isCollapsed]);

  const sectionClasses = useMemo(() => {
    const classes = ['collapsible-panel'];
    if (variant === 'panel') {
      classes.unshift('panel');
    } else {
      classes.push('collapsible-panel--plain');
    }
    if (className) {
      classes.push(className);
    }
    if (isCollapsed) {
      classes.push('collapsible-panel--collapsed');
    }
    return classes.join(' ');
  }, [className, isCollapsed, variant]);

  const toggleLabel = useMemo(() => {
    if (title) {
      return `${isCollapsed ? 'Expand' : 'Collapse'} ${title}`;
    }
    return isCollapsed ? 'Expand panel' : 'Collapse panel';
  }, [isCollapsed, title]);

  return (
    <section id={id} className={sectionClasses} data-collapsed={isCollapsed ? 'true' : 'false'}>
      <div className="collapsible-panel__controls">
        <button
          type="button"
          className="collapsible-panel__toggle"
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
          onClick={toggleCollapsed}
        >
          <span aria-hidden className="collapsible-panel__chevron">
            {isCollapsed ? '▸' : '▾'}
          </span>
          <span className="collapsible-panel__label">{title ?? 'Panel'}</span>
        </button>
        <div className="collapsible-panel__spacer" />
        {actions}
        {allowResize ? (
          <button
            type="button"
            className="collapsible-panel__reset"
            onClick={resetSize}
            disabled={height === undefined || isCollapsed}
          >
            Reset size
          </button>
        ) : null}
      </div>
      <div id={contentId} className="collapsible-panel__content" ref={containerRef} style={contentStyles}>
        <div className="collapsible-panel__content-inner">{children}</div>
      </div>
      {allowResize && !isCollapsed ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          tabIndex={0}
          className="collapsible-panel__resize-handle"
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          aria-controls={contentId}
          aria-label={title ? `${title} resize handle` : 'Resize panel'}
        >
          <span className="collapsible-panel__resize-grip" aria-hidden />
        </div>
      ) : (
        <div className="collapsible-panel__resize-placeholder" aria-hidden />
      )}
    </section>
  );
}
