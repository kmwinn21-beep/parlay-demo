'use client';

import { useRef, useState, useCallback } from 'react';
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

  const filteredUsers = userOptions.filter(u =>
    mentionQuery.length === 0 || u.value.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const detectMention = (text: string, cursorPos: number) => {
    const beforeCursor = text.slice(0, cursorPos);
    const lastAtIdx = beforeCursor.lastIndexOf('@');
    if (lastAtIdx === -1) {
      setShowSuggestions(false);
      return;
    }
    const afterAt = beforeCursor.slice(lastAtIdx + 1);
    // Show if afterAt is non-empty, doesn't end with space, and is short enough
    if (!afterAt.endsWith(' ') && !afterAt.includes('\n') && afterAt.length <= 35) {
      setMentionQuery(afterAt);
      setMentionStartIdx(lastAtIdx);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const cursorPos = e.target.selectionStart ?? text.length;
    onChange(text);
    detectMention(text, cursorPos);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    detectMention(textarea.value, textarea.selectionStart ?? textarea.value.length);
  };

  const handleSelectUser = useCallback((user: UserOption) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart ?? value.length;
    const textBefore = value.slice(0, mentionStartIdx);
    const textAfter = value.slice(cursorPos);
    const newText = textBefore + '@' + user.value + ' ' + textAfter;
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
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
      />
      {showSuggestions && filteredUsers.length > 0 && (
        <div className="absolute z-50 left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl max-h-44 overflow-y-auto">
          <p className="px-3 py-1.5 text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100 font-semibold">
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
        </div>
      )}
    </div>
  );
}
