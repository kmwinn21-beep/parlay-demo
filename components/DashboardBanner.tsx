'use client';
import { useState, useEffect, useRef } from 'react';

interface Props {
  initialTitle: string;
  isAdmin: boolean;
}

export function DashboardBanner({ initialTitle, isAdmin }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(title);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, title]);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === title) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'dashboard_title', value: trimmed }),
      });
      if (res.ok) setTitle(trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  return (
    <>
      <div className="relative inline-block">
        <h1 className="text-3xl font-bold font-serif mb-2">{title}</h1>
        {isAdmin && (
          <button
            onClick={() => setEditing(true)}
            className="absolute -bottom-1 -right-5 p-0.5 text-white/25 hover:text-white/55 transition-colors"
            title="Edit banner title"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Banner Title</p>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary mb-4"
              placeholder="Enter banner title…"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !draft.trim()}
                className="btn-primary text-sm"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
