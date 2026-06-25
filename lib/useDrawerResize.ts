'use client';
import { useState, useEffect } from 'react';

/**
 * Adds left-edge drag-to-resize behaviour to a right-side (or any) drawer panel.
 * Dragging the left edge leftward increases width; rightward decreases it.
 * Returns undefined panelStyle on mobile (< 640px) so CSS classes retain control.
 * State is local — resets to defaultWidth whenever the component remounts.
 */
export function useDrawerResize(
  defaultWidth: number,
  minWidth = 320,
  maxWidth = 960,
) {
  const [panelWidth, setPanelWidth] = useState(defaultWidth);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    setIsDesktop(mq.matches);
    const fn = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX; // left = positive = wider
      setPanelWidth(Math.max(minWidth, Math.min(maxWidth, startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return {
    // Only apply inline width on desktop; CSS classes control mobile layout
    panelStyle: isDesktop ? ({ width: panelWidth } as React.CSSProperties) : undefined,
    handleResizeStart,
  };
}
