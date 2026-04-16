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

  // position: absolute at top:0/left:0 is more reliably laid out on mobile
  // than position: fixed at extreme negative coordinates.
  mirror.style.position = 'absolute';
  mirror.style.top = '0';
  mirror.style.left = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.overflow = 'hidden';
  mirror.style.width = el.offsetWidth + 'px';

  mirror.textContent = el.value.slice(0, position);

  const marker = document.createElement('span');
  marker.textContent = '\u200b'; // zero-width space
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  // Force synchronous layout — required on mobile browsers
  void mirror.offsetHeight;

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

// Available viewport height accounting for mobile virtual keyboard.
function getVisibleHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

const DROPDOWN_W = 224; // w-56
const DROPDOWN_H = 220; // approx max height

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
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const filteredUsers = userOptions.filter(u =>
    mentionQuery.length === 0 || u.value.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const computeDropdownStyle = useCallback((atIdx: number) => {
    const el = textareaRef.current;
    if (!el) return;

    let caretTop: number;
    let caretLeft: number;
    let lineH: number;

    try {
      const coords = getCaretViewportCoords(el, atIdx);
      caretTop = coords.top;
      caretLeft = coords.left;
      lineH = coords.lineH;
    } catch {
      // Fallback: position at top of textarea
      const rect = el.getBoundingClientRect();
      caretTop = rect.top;
      caretLeft = rect.left;
      lineH = 20;
    }

    const vw = window.innerWidth;
    const vh = getVisibleHeight();

    const left = Math.max(8, Math.min(caretLeft, vw - DROPDOWN_W - 8));
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
      // If below and space is tight, cap so it doesn't overlap keyboard
      style.top = Math.min(caretTop + lineH + 4, vh - DROPDOWN_H - 8);
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

  const cancelBlur = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  };

  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => setShowSuggestions(false), 200);
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
          // Both onMouseDown (desktop) and onTouchStart (mobile) cancel the
          // pending blur timer so the dropdown stays open long enough to select.
          onMouseDown={e => { e.preventDefault(); cancelBlur(); handleSelectUser(u); }}
          onTouchStart={e => { e.preventDefault(); cancelBlur(); handleSelectUser(u); }}
          className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50 active:bg-violet-100 flex items-center gap-2 transition-colors"
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
        onBlur={handleBlur}
        onScroll={() => { if (showSuggestions) computeDropdownStyle(mentionStartIdx); }}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
      />
      {dropdown}
    </div>
  );
}
