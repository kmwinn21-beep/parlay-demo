'use client';

import { useEffect, useRef, useState } from 'react';
import { INLINE_EDIT_FIELD_CLASS } from '@/components/InlineEditField';

/**
 * A multiselect sized for a table cell.
 *
 * The third multiselect in the codebase, and deliberately so — the two that
 * exist cannot do this job:
 *
 *   • MultiSelectDropdown is a FORM field. It carries its own <label>, wears
 *     `input-field`, and opens its menu with `absolute`. A table cell sits
 *     inside a horizontally scrolling container, and an absolutely positioned
 *     menu is clipped by that container's overflow — the bottom rows would
 *     open a menu with nowhere to go.
 *
 *   • RepMultiSelect solves the clipping (it measures its trigger and draws the
 *     menu `position: fixed`, which is why that pattern is copied here) but its
 *     options are users: numeric ids, initials, a rep glyph. These options are
 *     plain strings from config_options.
 *
 * So: RepMultiSelect's positioning, MultiSelectDropdown's string options, and
 * InlineEditField's trigger size, which is what keeps it inside its column
 * instead of opening across its neighbours.
 */

type Pos = { top: number; left: number; width: number; above: boolean };

/** Rough menu height, used only to decide whether to open upwards. */
const MENU_H = 232; // max-h-56 ≈ 224px + border

export function InlineMultiSelect({
  options,
  selected,
  onChange,
  onCommit,
  onCancel,
  placeholder = 'Select…',
  formatLabel = (v: string) => v,
  emptyMessage = 'No options configured.',
  defaultOpen = false,
}: {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  /**
   * Called with the final selection when the menu closes — the save point.
   *
   * The values are passed rather than read back from state by the caller,
   * because a caller holding the draft in a state variable would still be
   * holding the previous render's copy at the moment this fires.
   */
  onCommit: (values: string[]) => void;
  /** Called on Escape. Discards, where closing the menu commits. */
  onCancel?: () => void;
  placeholder?: string;
  /** For options whose stored value is not what should be read on screen. */
  formatLabel?: (value: string) => string;
  emptyMessage?: string;
  /**
   * Open as soon as it mounts. These editors replace a cell the reader has
   * just clicked, so the click that opened the editor should have opened the
   * menu too — one tap to edit, not two.
   */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [pos, setPos] = useState<Pos | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /*
   * The selection, mirrored into a ref.
   *
   * The document-level listeners below are registered once; without this they
   * would commit whatever the selection was when they were registered. The ref
   * is always the current one.
   */
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const measure = (el: HTMLElement): Pos => {
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < MENU_H && rect.top > spaceBelow;
    const width = Math.max(rect.width, 180);
    return {
      top: above ? rect.top : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      above,
    };
  };

  // Measure on mount when opening straight away, since there is no click to
  // measure from.
  useEffect(() => {
    if (defaultOpen && triggerRef.current) setPos(measure(triggerRef.current));
  }, [defaultOpen]);

  // A cell can scroll out from under its own menu.
  useEffect(() => {
    if (!open) return;
    const recalc = () => { if (triggerRef.current) setPos(measure(triggerRef.current)); };
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    };
  }, [open]);

  // Clicking away saves, which is how every other inline editor in these
  // tables behaves (they save on blur).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const menu = document.querySelector('[data-inline-multiselect-menu]');
      if (containerRef.current?.contains(target)) return;
      if (menu?.contains(target)) return;
      /*
       * Except the cancel button, which is outside this component and must
       * not be made to save the edit it exists to discard. mousedown runs
       * before click, so without this the commit would land first and the
       * cancel would then close an already-saved cell.
       */
      if (target instanceof Element && target.closest('[data-inline-edit-cancel]')) return;
      setOpen(false);
      setPos(null);
      onCommitRef.current(selectedRef.current);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setPos(null); onCancelRef.current?.(); }
      if (e.key === 'Enter') { setOpen(false); setPos(null); onCommitRef.current(selectedRef.current); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const toggleTrigger = () => {
    if (open) {
      setOpen(false);
      setPos(null);
      onCommit(selected);
      return;
    }
    if (triggerRef.current) setPos(measure(triggerRef.current));
    setOpen(true);
  };

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleTrigger}
        className={`${INLINE_EDIT_FIELD_CLASS} text-left flex items-center justify-between gap-1`}
        autoFocus
      >
        <span className={`truncate ${selected.length === 0 ? 'text-gray-400' : 'text-gray-800'}`}>
          {selected.length === 0 ? placeholder : selected.map(formatLabel).join(', ')}
        </span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && pos && (
        <div
          data-inline-multiselect-menu
          style={{
            position: 'fixed',
            top: pos.above ? undefined : pos.top,
            bottom: pos.above ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
          }}
          className="bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">{emptyMessage}</div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-b border-gray-100"
              >
                — Clear —
              </button>
              {options.map(option => {
                const checked = selected.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggle(option)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${checked ? 'bg-brand-secondary border-brand-secondary' : 'border-gray-300'}`}>
                      {checked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{formatLabel(option)}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
