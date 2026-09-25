'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EdgeTone } from '@/lib/relationshipPicker';

export interface SpokeCard {
  id: number;
  name: string;
  /** The relationship read from the hub's side, e.g. "Current vendor". */
  statusLabel: string;
  /** Which legend colour the edge takes. */
  tone: EdgeTone;
  units: number | null;
  attendeeCount: number;
  relationshipCount: number;
  stale: boolean;
}

export interface HubCard {
  id: number;
  name: string;
  types: string[];
  subtitle: string;
}

const CARD_W = 200;
const CARD_H = 84;
const HUB_W = 216;
const HUB_H = 92;

export const TONE_COLOR: Record<EdgeTone, string> = {
  current: '#2563eb',
  pilot: '#f59e0b',
  former: '#9ca3af',
  competitor: '#dc2626',
};

/**
 * A hub and its spokes, on a canvas the reader can rearrange.
 *
 * Laid out on an ellipse to start with, which is the only arrangement that
 * needs no input and reads as deliberate. It stops being enough quickly: a
 * company with a dozen relationships puts cards on top of each other whatever
 * ring they start on, and the names are the whole point of the picture. So
 * every card can be dragged, and where it is put is remembered for as long as
 * the modal is open.
 *
 * Positions are kept per hub. Moving cards around Yardi and then looking at
 * PointClickCare should not inherit Yardi's arrangement, and coming back to
 * Yardi should find it as it was left.
 */
export function MapCanvas({ hub, spokes, onSelectSpoke }: {
  hub: HubCard;
  spokes: SpokeCard[];
  onSelectSpoke?: (id: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  // Per hub, so each company keeps its own arrangement for the session.
  const [moved, setMoved] = useState<Record<number, Record<number, { x: number; y: number }>>>({});
  const [dragging, setDragging] = useState<number | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hubPos = useMemo(
    () => ({ x: size.w / 2 - HUB_W / 2, y: size.h / 2 - HUB_H / 2 }),
    [size.w, size.h],
  );

  /**
   * Where a card sits before anybody moves it.
   *
   * An ellipse rather than a circle because the canvas is wider than it is
   * tall, and a circle inscribed in it wastes the sides. Starting at the top
   * and going clockwise keeps the order stable as cards are filtered in and
   * out — an angle derived from the index would reshuffle every card whenever
   * one was removed.
   */
  const layout = useMemo(() => {
    const rx = Math.max(160, size.w / 2 - CARD_W / 2 - 24);
    const ry = Math.max(120, size.h / 2 - CARD_H / 2 - 24);
    const n = Math.max(1, spokes.length);
    const out = new Map<number, { x: number; y: number }>();
    spokes.forEach((s, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      out.set(s.id, {
        x: size.w / 2 + Math.cos(angle) * rx - CARD_W / 2,
        y: size.h / 2 + Math.sin(angle) * ry - CARD_H / 2,
      });
    });
    return out;
  }, [spokes, size.w, size.h]);

  const posOf = useCallback((id: number) =>
    moved[hub.id]?.[id] ?? layout.get(id) ?? { x: 0, y: 0 },
  [moved, hub.id, layout]);

  const onPointerDown = (e: React.PointerEvent, id: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const p = posOf(id);
    dragOffset.current = { x: e.clientX - box.left - p.x, y: e.clientY - box.top - p.y };
    setDragging(id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging === null) return;
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    // Clamped to the canvas: a card dragged past the edge would be
    // unreachable, since the container does not scroll.
    const x = Math.max(0, Math.min(box.width - CARD_W, e.clientX - box.left - dragOffset.current.x));
    const y = Math.max(0, Math.min(box.height - CARD_H, e.clientY - box.top - dragOffset.current.y));
    setMoved(prev => ({ ...prev, [hub.id]: { ...(prev[hub.id] ?? {}), [dragging]: { x, y } } }));
  };

  const endDrag = () => setDragging(null);

  const centre = { x: hubPos.x + HUB_W / 2, y: hubPos.y + HUB_H / 2 };

  return (
    <div
      ref={boxRef}
      className="relative flex-1 min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-white select-none"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Edges under the cards, and non-interactive so a line never swallows a
          drag that was meant for the card on top of it. */}
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
              // Dashed for a relationship nobody has confirmed lately, the
              // same signal the card carries on the company record.
              strokeDasharray={s.stale ? '4 4' : undefined}
              opacity={s.stale ? 0.5 : 0.8}
            />
          );
        })}
      </svg>

      {/* Hub */}
      <div
        className="absolute rounded-xl border-2 border-brand-primary bg-white shadow-sm px-3 py-2"
        style={{ left: hubPos.x, top: hubPos.y, width: HUB_W, minHeight: HUB_H }}
      >
        <p className="text-sm font-bold text-brand-primary truncate">{hub.name}</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {hub.types.map(t => (
            <span key={t} className="px-1.5 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-gray-600">{t}</span>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-1">{hub.subtitle}</p>
      </div>

      {/* Spokes */}
      {spokes.map(s => {
        const p = posOf(s.id);
        return (
          <div
            key={s.id}
            onPointerDown={e => onPointerDown(e, s.id)}
            onDoubleClick={() => onSelectSpoke?.(s.id)}
            title="Drag to rearrange · double-click to centre on this company"
            className={`absolute rounded-xl border bg-white px-3 py-2 shadow-sm ${
              dragging === s.id ? 'cursor-grabbing border-brand-secondary shadow-md z-10' : 'cursor-grab border-gray-200'
            }`}
            style={{ left: p.x, top: p.y, width: CARD_W, minHeight: CARD_H, touchAction: 'none' }}
          >
            <p className="text-xs font-semibold text-gray-800 truncate">{s.name}</p>
            <span
              className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border"
              style={{
                color: TONE_COLOR[s.tone],
                borderColor: TONE_COLOR[s.tone],
                backgroundColor: `${TONE_COLOR[s.tone]}1F`,
              }}
            >
              {s.statusLabel}
            </span>
            <p className="text-[10px] text-gray-500 mt-1 truncate">
              {s.units != null && <>{s.units.toLocaleString()} units · </>}
              {s.attendeeCount > 0
                ? `${s.attendeeCount} attendee${s.attendeeCount === 1 ? '' : 's'}`
                : 'not at this show'}
              {' · '}{s.relationshipCount} relationship{s.relationshipCount === 1 ? '' : 's'}
            </p>
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
