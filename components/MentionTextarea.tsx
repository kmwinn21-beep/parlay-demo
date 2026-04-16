'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { type UserOption, getRepInitials } from '@/lib/useUserOptions';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onMentionAdd: (configId: number, name: string) => void;
  userOptions: UserOption[];
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
}

// Compute the pixel position of `position` inside `el` in viewport coordinates.
// Uses a hidden mirror div that replicates the textarea's text layout.
function getCaretViewportCoords(el: HTMLTextAreaElement, position: number): { top: number; left: number; lineH: number } {
  const cs = window.getComputedStyle(el);
  const mirror = document.createElement('div');

  for (const p of [
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
    'lineHeight', 'wordSpacing', 'textIndent', 'boxSizing',
  ]) {
    (mirror.style as unknown as Record<string, string>)[p] = cs.getPropertyValue(p);
  }

  mirror.style.position = 'fixed';
  mirror.style.top = '-9999px';
  mirror.style.left = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.overflow = 'hidden';
  mirror.style.width = el.offsetWidth + 'px';

  // Text before the caret position
  mirror.textContent = el.value.slice(0, position);

  // Zero-width marker span to measure the caret location
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);

  const elRect = el.getBoundingClientRect();
  const relTop = markerRect.top - mirrorRect.top;
  const relLeft = markerRect.left - mirrorRect.left;
  const lineH = parseFloat(cs.lineHeight) || 20;

  return {
    top: elRect.top + relTop - el.scrollTop,
    left: elRect.left + relLeft,
    lineH,
  };
}

const DROPDOWN_W = 224;  // w-56
const DROPDOWN_H = 220;  // approximate max height (header + up to ~6 rows)

export function MentionTextarea({
  value,
  onChange,
  onMentionAdd,
  userOptions,
  placeholder = 'Enter note... (type @ to mention a user)',
  rows = 5,
  className = '',
  autoFocus = false,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIdx, setMentionStartIdx] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const filteredUsers = userOptions.filter(u =>
    mentionQuery.length === 0 || u.value.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const computeDropdownStyle = useCallback((atIdx: number) => {
    const el = textareaRef.current;
    if (!el) return;

    const { top: caretTop, left: caretLeft, lineH } = getCaretViewportCoords(el, atIdx);

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Clamp left so the dropdown doesn't fall off the right edge
    const left = Math.max(8, Math.min(caretLeft, vw - DROPDOWN_W - 8));

    // Prefer above; fall back to below if insufficient space above
    const spaceAbove = caretTop;
    const above = spaceAbove >= DROPDOWN_H;

    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 9999,
      left,
      width: DROPDOWN_W,
    };

    if (above) {
      style.bottom = vh - caretTop + 4;
    } else {
      style.top = caretTop + lineH + 4;
    }

    setDropdownStyle(style);
  }, []);

  const detectMention = useCallback((text: string, cursorPos: number) => {
    const beforeCursor = text.slice(0, cursorPos);
    const lastAtIdx = beforeCursor.lastIndexOf('@');
    if (lastAtIdx === -1) { setShowSuggestions(false); return; }
    const afterAt = beforeCursor.slice(lastAtIdx + 1);
    if (!afterAt.endsWith(' ') && !afterAt.includes('\n') && afterAt.length <= 35) {
      setMentionQuery(afterAt);
      setMentionStartIdx(lastAtIdx);
      setShowSuggestions(true);
      computeDropdownStyle(lastAtIdx);
    } else {
      setShowSuggestions(false);
    }
  }, [computeDropdownStyle]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const cursorPos = e.target.selectionStart ?? text.length;
    onChange(text);
    detectMention(text, cursorPos);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    detectMention(ta.value, ta.selectionStart ?? ta.value.length);
  };

  const handleSelectUser = useCallback((user: UserOption) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart ?? value.length;
    const newText = value.slice(0, mentionStartIdx) + '@' + user.value + ' ' + value.slice(cursorPos);
    onChange(newText);
    onMentionAdd(user.id, user.value);
    setShowSuggestions(false);
    setTimeout(() => {
      const newPos = mentionStartIdx + 1 + user.value.length + 1;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    }, 0);
  }, [value, mentionStartIdx, onChange, onMentionAdd]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && e.key === 'Escape') {
      e.preventDefault();
      setShowSuggestions(false);
    }
  };

  const dropdown = showSuggestions && filteredUsers.length > 0 && mounted ? createPortal(
    <div
      style={dropdownStyle}
      className="bg-white border border-gray-200 rounded-lg shadow-xl max-h-44 overflow-y-auto"
    >
      <p className="px-3 py-1.5 text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100 font-semibold sticky top-0 bg-white">
        Tag a user
      </p>
      {filteredUsers.map(u => (
        <button
          key={u.id}
          type="button"
          onMouseDown={e => { e.preventDefault(); handleSelectUser(u); }}
          className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50 flex items-center gap-2 transition-colors"
        >
          <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            {getRepInitials(u.value)}
          </span>
          {u.value}
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        className={className}
        value={value}
        onChange={handleChange}
        onKeyUp={handleKeyUp}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        onScroll={() => { if (showSuggestions) computeDropdownStyle(mentionStartIdx); }}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
      />
      {dropdown}
    </div>
  );
}
