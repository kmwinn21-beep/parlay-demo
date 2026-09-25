'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VendorRelationshipCard, type VendorRelationship } from '@/components/VendorRelationshipCard';
import type { UserOption } from '@/lib/useUserOptions';
import type { EdgeTone } from '@/lib/relationshipPicker';

export interface Spoke {
  /**
   * The relationship's own row id.
   *
   * Not the company's. Two relationships with the same company are two
   * spokes, and keying on the company collapsed them into one React key —
   * which rendered a duplicate card, lost the pointer capture mid-drag, and
   * left the hub's count saying eight beside six visible cards.
   */
  id: number;
  rel: VendorRelationship;
  tone: EdgeTone;
  /** Units and attendees for the company at the far end. */
  footnote: string;
}

export interface Hub {
  id: number;
  name: string;
  types: string[];
  subtitle: string;
}

const CARD_W = 268;
const HUB_W = 224;
const HUB_H = 96;
/** Enough for a collapsed card; expanded ones simply overlap, which is fine. */
const CARD_H = 96;
const HANDLE_H = 18;

export const TONE_COLOR: Record<EdgeTone, string> = {
  current: '#2563eb',
  pilot: '#f59e0b',
  former: '#9ca3af',
  competitor: '#dc2626',
};

interface Pos { x: number; y: number }

/**
 * A hub and its relationships, on a canvas the reader can rearrange.
 *
 * The spokes are the same card the company record shows — collapsed to a name
 * and a status, expanding to the notes, the thread and the Update button. A
 * second card built for this view would have drifted from that one inside a
 * month, and the reader would have had to learn two.
 *
 * Everything is draggable, hub included, because an ellipse stops being enough
 * the moment a company has a dozen relationships and the names are the point.
 * Dragging is by the grip along the top of each card rather than the card
 * itself: the card has buttons in it, and a drag that starts on Update is
 * either a drag that does not work or a button that does not.
 */
export function MapCanvas({ hub, spokes, userOptions, colorMaps, onUpdated }: {
  hub: Hub;
  spokes: Spoke[];
  userOptions: UserOption[];
  colorMaps: Record<string, Record<string, string | null>>;
  onUpdated?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [moved, setMoved] = useState<Record<number, Record<number, Pos>>>({});
  const [hubMoved, setHubMoved] = useState<Record<number, Pos>>({});
  /** null = nothing, 'hub' = the centre, otherwise a spoke's relationship id. */
  const [dragging, setDragging] = useState<number | 'hub' | null>(null);
  const dragOffset = useRef<Pos>({ x: 0, y: 0 });
  /** False for one frame after the hub changes, so the cards fly outward. */
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Start every card at the centre, then let the transition carry it out.
  // useLayoutEffect so the collapsed state paints before the frame that moves
  // them — with useEffect the browser can coalesce the two and show nothing.
  useLayoutEffect(() => {
    setSettled(false);
    const t = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(t);
  }, [hub.id]);

  const hubHome = useMemo(
    () => ({ x: size.w / 2 - HUB_W / 2, y: size.h / 2 - HUB_H / 2 }),
    [size.w, size.h],
  );
  const hubPos = hubMoved[hub.id] ?? hubHome;
  const centre = { x: hubPos.x + HUB_W / 2, y: hubPos.y + HUB_H / 2 };

  /**
   * Where a card sits before anybody moves it.
   *
   * An ellipse around the hub's current position, so moving the hub takes its
   * unmoved spokes with it rather than leaving them orbiting empty space.
   */
  const layout = useMemo(() => {
    const rx = Math.max(150, size.w / 2 - CARD_W / 2 - 16);
    const ry = Math.max(110, size.h / 2 - CARD_H / 2 - 16);
    const n = Math.max(1, spokes.length);
    const out = new Map<number, Pos>();
    spokes.forEach((s, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      out.set(s.id, {
        x: Math.max(0, Math.min(size.w - CARD_W, centre.x + Math.cos(angle) * rx - CARD_W / 2)),
        y: Math.max(0, Math.min(size.h - CARD_H, centre.y + Math.sin(angle) * ry - CARD_H / 2)),
      });
    });
    return out;
  }, [spokes, size.w, size.h, centre.x, centre.y]);

  const posOf = useCallback((id: number): Pos => {
    const home = layout.get(id) ?? { x: centre.x, y: centre.y };
    const placed = moved[hub.id]?.[id] ?? home;
    // Before the first frame every card sits under the hub, so the transition
    // reads as them coming out of it.
    return settled ? placed : { x: centre.x - CARD_W / 2, y: centre.y - CARD_H / 2 };
  }, [moved, hub.id, layout, settled, centre.x, centre.y]);

  /**
   * Drag on the window rather than the container.
   *
   * setPointerCapture on the card is enough until the card re-renders
   * mid-drag, which drops the capture and strands the pointer — which is how
   * a card could be dragged in one part of the canvas and not another.
   */
  const startDrag = (e: React.PointerEvent, id: number | 'hub') => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const p = id === 'hub' ? hubPos : posOf(id);
    dragOffset.current = { x: e.clientX - box.left - p.x, y: e.clientY - box.top - p.y };
    setDragging(id);
    e.preventDefault();
  };

  useEffect(() => {
    if (dragging === null) return;
    const onMove = (e: PointerEvent) => {
      const box = boxRef.current?.getBoundingClientRect();
      if (!box) return;
      const w = dragging === 'hub' ? HUB_W : CARD_W;
      const h = dragging === 'hub' ? HUB_H : CARD_H;
      // Clamped inside the canvas, which does not scroll — a card dragged past
      // the edge would be unreachable.
      const x = Math.max(0, Math.min(box.width - w, e.clientX - box.left - dragOffset.current.x));
      const y = Math.max(0, Math.min(box.height - h, e.clientY - box.top - dragOffset.current.y));
      if (dragging === 'hub') setHubMoved(prev => ({ ...prev, [hub.id]: { x, y } }));
      else setMoved(prev => ({ ...prev, [hub.id]: { ...(prev[hub.id] ?? {}), [dragging]: { x, y } } }));
    };
    const stop = () => setDragging(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, hub.id]);

  // No transition on the card being dragged, or it lags behind the pointer.
  const ease = (id: number | 'hub') =>
    dragging === id ? undefined : 'left 400ms cubic-bezier(0.22,1,0.36,1), top 400ms cubic-bezier(0.22,1,0.36,1), opacity 250ms ease';

  const Grip = ({ onPointerDown, label }: { onPointerDown: (e: React.PointerEvent) => void; label: string }) => (
    <div
      onPointerDown={onPointerDown}
      title={label}
      className="h-[18px] flex items-center justify-center rounded-t-lg bg-gray-100 hover:bg-gray-200 cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
    >
      <svg className="w-5 h-2.5 text-gray-400" viewBox="0 0 20 10" fill="currentColor" aria-hidden="true">
        <circle cx="6" cy="4" r="1" /><circle cx="10" cy="4" r="1" /><circle cx="14" cy="4" r="1" />
        <circle cx="6" cy="7" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="14" cy="7" r="1" />
      </svg>
    </div>
  );

  return (
    <div
      ref={boxRef}
      className="relative flex-1 min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      <svg className="absolute inset-0 pointer-events-none" width={size.w} height={size.h}>
        {spokes.map(s => {
          const p = posOf(s.id);
          return (
            <line
              key={s.id}
              x1={centre.x} y1={centre.y}
              x2={p.x + CARD_W / 2} y2={p.y + CARD_H / 2}
              stroke={TONE_COLOR[s.tone]}
              strokeWidth={1.5}
              strokeDasharray={s.rel.stale ? '4 4' : undefined}
              opacity={settled ? (s.rel.stale ? 0.5 : 0.8) : 0}
              style={{ transition: 'opacity 300ms ease' }}
            />
          );
        })}
      </svg>

      {/* Hub */}
      <div
        className="absolute rounded-lg border-2 border-brand-primary bg-white shadow-sm overflow-hidden"
        style={{ left: hubPos.x, top: hubPos.y, width: HUB_W, transition: ease('hub'), zIndex: 5 }}
      >
        <Grip onPointerDown={e => startDrag(e, 'hub')} label="Drag to move the hub" />
        <div className="px-3 py-2">
          <p className="text-sm font-bold text-brand-primary truncate">{hub.name}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {hub.types.map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-gray-600">{t}</span>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">{hub.subtitle}</p>
        </div>
      </div>

      {/* Spokes — one per relationship, keyed by its row id. */}
      {spokes.map(s => {
        const p = posOf(s.id);
        return (
          <div
            key={s.id}
            className="absolute rounded-lg shadow-sm bg-white"
            style={{
              left: p.x, top: p.y, width: CARD_W,
              transition: ease(s.id),
              opacity: settled ? 1 : 0,
              zIndex: dragging === s.id ? 20 : 10,
            }}
          >
            <Grip onPointerDown={e => startDrag(e, s.id)} label="Drag to rearrange" />
            <VendorRelationshipCard
              rel={s.rel}
              userOptions={userOptions}
              colorMaps={colorMaps}
              onUpdated={onUpdated}
            />
            <p className="px-3 pb-1.5 -mt-1 text-[10px] text-gray-400 truncate">{s.footnote}</p>
          </div>
        );
      })}

      {spokes.length === 0 && (
        <p className="absolute inset-x-0 bottom-6 text-center text-xs text-gray-400">
          No relationships recorded for this company.
        </p>
      )}
    </div>
  );
}
