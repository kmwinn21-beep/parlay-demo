'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The conference floor plan, big enough to read.
 *
 * A floor plan is looked at on the show floor, on a phone, one booth number
 * at a time — so zooming is the feature, not a nicety. Pinch where a finger
 * is, double-tap to jump in, drag to move around, and buttons for the people
 * on a laptop with no touchpad gestures.
 *
 * The transform is kept here rather than handed to a library: the whole thing
 * is a scale and an offset, and the two gestures that set them are short
 * enough to read in one sitting.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const STEP = 0.5;

interface Point { x: number; y: number }

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function FloorPlanViewer({ url, name, onClose }: {
  url: string;
  name?: string | null;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const boxRef = useRef<HTMLDivElement>(null);

  /** A PDF has its own viewer built into the browser; an image is ours to draw. */
  const isPdf = /\.pdf($|\?)/i.test(url);

  /*
   * Live gesture state.
   *
   * In refs, not state: a pinch fires dozens of events a second and each one
   * needs the previous distance, which a re-render would not have settled in
   * time to give it.
   */
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{ dist: number; scale: number; mid: Point } | null>(null);
  const panStart = useRef<{ p: Point; offset: Point } | null>(null);

  const reset = useCallback(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale(s => clampScale(s + STEP));
      if (e.key === '-') setScale(s => clampScale(s - STEP));
      if (e.key === '0') reset();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, reset]);

  /**
   * Zoom about a point, so what is under the fingers stays under them.
   *
   * Scaling about the centre instead is the thing that makes a plan unusable
   * on a phone: you pinch a booth in the corner and it slides off the screen.
   */
  const zoomAbout = useCallback((nextScale: number, about: Point) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) { setScale(clampScale(nextScale)); return; }
    const cx = about.x - box.left - box.width / 2;
    const cy = about.y - box.top - box.height / 2;
    setScale(prev => {
      const next = clampScale(nextScale);
      const ratio = next / prev;
      setOffset(o => (next === MIN_SCALE
        ? { x: 0, y: 0 }
        : { x: cx - (cx - o.x) * ratio, y: cy - (cy - o.y) * ratio }));
      return next;
    });
  }, []);

  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const onPointerDown = (e: React.PointerEvent) => {
    /* Capture keeps a drag alive when the finger leaves the image, but it
       throws if the pointer is already gone — and an exception here would
       abandon the gesture before it was recorded below. Capture is the
       nicety; tracking the pointer is the job. */
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointers.current.values());
    if (pts.length === 2) {
      pinchStart.current = { dist: dist(pts[0], pts[1]), scale, mid: mid(pts[0], pts[1]) };
      panStart.current = null;
    } else if (pts.length === 1 && scale > MIN_SCALE) {
      // Only when zoomed in: at rest a drag should do nothing, so a stray
      // swipe cannot leave the plan parked off-centre.
      panStart.current = { p: pts[0], offset };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointers.current.values());

    if (pts.length === 2 && pinchStart.current) {
      const d = dist(pts[0], pts[1]);
      if (pinchStart.current.dist > 0) {
        zoomAbout(pinchStart.current.scale * (d / pinchStart.current.dist), mid(pts[0], pts[1]));
      }
      return;
    }
    if (pts.length === 1 && panStart.current) {
      setOffset({
        x: panStart.current.offset.x + (pts[0].x - panStart.current.p.x),
        y: panStart.current.offset.y + (pts[0].y - panStart.current.p.y),
      });
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;
  };

  // Trackpad and mouse wheel, held to the same "zoom where the cursor is" rule.
  const onWheel = (e: React.WheelEvent) => {
    if (isPdf) return;
    e.preventDefault();
    zoomAbout(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), { x: e.clientX, y: e.clientY });
  };

  const lastTap = useRef(0);
  const onDoubleish = (e: React.PointerEvent) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // In to a readable size, or all the way back out. A plan is either
      // being scanned or being read, and a double tap is how you switch.
      zoomAbout(scale > 1.2 ? MIN_SCALE : 2.5, { x: e.clientX, y: e.clientY });
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  const zoomButton = (delta: number) => () => {
    const box = boxRef.current?.getBoundingClientRect();
    zoomAbout(scale + delta, box
      ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      : { x: 0, y: 0 });
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col bg-black/90">
      {/* The bar is above the plan rather than floating over it: on a phone
          anything floating sits exactly where a thumb wants to drag. */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-black/60 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">Floor Plan</p>
          {name && <p className="text-xs text-white/60 truncate">{name}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isPdf && (
            <>
              <button type="button" onClick={zoomButton(-STEP)} disabled={scale <= MIN_SCALE}
                aria-label="Zoom out"
                className="w-9 h-9 rounded-lg bg-white/10 text-white text-lg leading-none disabled:opacity-30 active:bg-white/20">
                &minus;
              </button>
              {/* Reads as a control and as a readout: it says where you are and
                  puts you back at the start. */}
              <button type="button" onClick={reset}
                className="px-2.5 h-9 rounded-lg bg-white/10 text-white text-xs font-semibold tabular-nums active:bg-white/20">
                {Math.round(scale * 100)}%
              </button>
              <button type="button" onClick={zoomButton(STEP)} disabled={scale >= MAX_SCALE}
                aria-label="Zoom in"
                className="w-9 h-9 rounded-lg bg-white/10 text-white text-lg leading-none disabled:opacity-30 active:bg-white/20">
                +
              </button>
            </>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer"
            aria-label="Open the floor plan in a new tab"
            className="w-9 h-9 rounded-lg bg-white/10 text-white flex items-center justify-center active:bg-white/20">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <button type="button" onClick={onClose} aria-label="Close the floor plan"
            className="w-9 h-9 rounded-lg bg-white/10 text-white flex items-center justify-center active:bg-white/20">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {isPdf ? (
        /* A PDF already has a viewer with its own zoom. Drawing our own on top
           of it would be two sets of controls disagreeing about the scale. */
        <iframe src={url} title={name ?? 'Floor plan'} className="flex-1 w-full bg-white" />
      ) : (
        <div
          ref={boxRef}
          onPointerDown={e => { onPointerDown(e); onDoubleish(e); }}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={onWheel}
          // touch-action none, or the browser takes the pinch for itself and
          // zooms the whole page instead of the plan.
          className="flex-1 overflow-hidden flex items-center justify-center select-none"
          style={{ touchAction: 'none', cursor: scale > MIN_SCALE ? 'grab' : 'default' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={name ?? 'Conference floor plan'}
            draggable={false}
            className="max-w-full max-h-full object-contain"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              // No transition while a gesture is running, or the plan lags the
              // fingers moving it.
              transition: pointers.current.size > 0 ? undefined : 'transform 120ms ease-out',
            }}
          />
        </div>
      )}

      <p className="sm:hidden text-center text-[11px] text-white/40 py-1.5 flex-shrink-0">
        Pinch or double-tap to zoom · drag to move
      </p>
    </div>,
    document.body,
  );
}
