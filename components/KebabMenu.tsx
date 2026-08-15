'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface KebabMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  /** Renders the row in the active/selected treatment. */
  active?: boolean;
  /** Small count bubble on the right of the row. */
  badge?: number;
}

const MENU_WIDTH = 176;

/**
 * A kebab button whose menu renders in a portal, so a card header or a
 * scrolling container can't clip it. Positions against the button and flips
 * above when the space below is tight.
 */
export function KebabMenu({ items, title = 'Actions', className = '' }: {
  items: KebabMenuItem[];
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const position = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const height = items.length * 37 + 8;
    const flip = window.innerHeight - r.bottom - 8 < height && r.top - 8 > height;
    setPos({
      top: flip ? r.top - 4 - height : r.bottom + 4,
      left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
  }, [items.length]);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    position();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onScroll = () => position();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, position]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`p-1.5 rounded-lg transition-colors ${open ? 'bg-gray-100 text-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
      >
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
        </svg>
      </button>
      {open && mounted && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH }}
          className="z-[10000] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden py-1"
        >
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.title}
              onClick={() => { setOpen(false); item.onClick(); }}
              className={`w-full text-left px-3 py-2 text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                item.active ? 'text-brand-secondary bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="bg-brand-secondary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
