'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The two count pills a company row carries: how many attendees it has here,
 * and how many conferences it has been to.
 *
 * Lifted out of CompanyTable so the dashboard's companies drawer shows the
 * same pills rather than plain numbers beside an icon. They were the same
 * thing drawn twice, and only one of the two was a pill.
 */

type TooltipPos = { top: number; left: number; width: number; above: boolean };

function calcTooltipPos(el: HTMLElement, maxW = 260): TooltipPos {
  const rect = el.getBoundingClientRect();
  const w = Math.min(maxW, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
  const above = rect.top > 180;
  return { top: above ? rect.top - 8 : rect.bottom + 8, left, width: w, above };
}

/**
 * Whether the device actually hovers. On a touchscreen a tap fires mouseenter,
 * so a hover panel opens over whatever the tap was for — the pill's own drawer,
 * usually. Checked at runtime rather than by breakpoint, because a narrow
 * window on a laptop still hovers.
 *
 * A pill with nothing else to do on tap opens its panel on tap instead, so
 * suppressing hover here never costs a phone the information.
 */
function useHasHover(): boolean {
  const [hover, setHover] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover)');
    setHover(mq.matches);
    const onChange = () => setHover(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return hover;
}

export function conferenceBadgeClass(count: number) {
  if (count >= 4) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700';
  if (count === 3) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700';
  if (count === 2) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700';
  return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600';
}

/** Dismiss a tapped-open panel on the next touch elsewhere. */
function useDismissOnOutside(open: boolean, ref: React.RefObject<HTMLElement>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => { if (!ref.current?.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, ref, close]);
}

/**
 * `summary` is `Name|Title` records joined by `~~~` — the shape the companies
 * query returns. `disableTooltip` forces the panel off where the caller knows
 * it is in the way; touch devices are handled without being asked.
 */
export function AttendeeTooltip({ count, summary, onClick, disableTooltip = false }: {
  count: number; summary?: string; onClick?: () => void; disableTooltip?: boolean;
}) {
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const hasHover = useHasHover();
  const attendees = (summary || '').split('~~~').map(s => s.trim()).filter(Boolean).map(s => {
    const [name, title] = s.split('|');
    return { name: name?.trim() || '', title: title?.trim() || '' };
  });
  const tapToOpen = !hasHover && !disableTooltip && !onClick;
  useDismissOnOutside(!!pos, ref, () => setPos(null));
  if (count === 0) return <span className="badge-gray">{count}</span>;
  return (
    <div ref={ref} className="relative inline-block"
      onMouseEnter={() => { if (!disableTooltip && hasHover && ref.current) setPos(calcTooltipPos(ref.current)); }}
      onMouseLeave={() => { if (hasHover) setPos(null); }}
      onClick={tapToOpen ? () => setPos(p => (p ? null : ref.current ? calcTooltipPos(ref.current) : null)) : undefined}>
      {onClick ? (
        <button type="button" onClick={onClick} className="badge-gray hover:ring-2 hover:ring-brand-secondary/40 transition-shadow" title="View attendees">{count}</button>
      ) : (
        <span className="badge-gray cursor-default">{count}</span>
      )}
      {pos && attendees.length > 0 && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5">
            <p className="font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">Attendees</p>
            <ul className="space-y-1">
              {attendees.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0 mt-1" />
                  <span><span className="font-medium">{a.name}</span>{a.title && <span className="text-gray-300"> · {a.title}</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConferenceTooltip({ count, names }: { count: number; names?: string }) {
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const hasHover = useHasHover();
  const confList = (names || '').split(',').map(s => s.trim()).filter(Boolean);
  useDismissOnOutside(!!pos, ref, () => setPos(null));
  if (count === 0) return <span className={conferenceBadgeClass(0)}>{count}</span>;
  return (
    <div ref={ref} className="relative inline-block"
      onMouseEnter={() => { if (hasHover && ref.current) setPos(calcTooltipPos(ref.current)); }}
      onMouseLeave={() => { if (hasHover) setPos(null); }}
      // Nothing else claims this pill's tap, so on a phone it is what opens
      // the list — the hover gate would otherwise make the count unreadable
      // on the device the card was designed for.
      onClick={hasHover ? undefined : () => setPos(p => (p ? null : ref.current ? calcTooltipPos(ref.current) : null))}>
      <span className={`${conferenceBadgeClass(count)} ${hasHover ? 'cursor-default' : 'cursor-pointer'}`}>{count}</span>
      {pos && confList.length > 0 && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5">
            <p className="font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">Conferences Attended</p>
            <ul className="space-y-1">
              {confList.map((name, i) => (
                <li key={i} className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />{name}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
