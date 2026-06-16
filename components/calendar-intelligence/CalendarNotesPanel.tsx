'use client';

import { useState, useEffect } from 'react';

type Decision = string;

interface NoteReply {
  id: number;
  authorName: string;
  authorEmail: string;
  content: string;
  decisionState: Decision | null;
  createdAt: string;
}

interface Note extends NoteReply {
  replies: NoteReply[];
}

interface Props {
  conferenceId: number;
  onClose: () => void;
  variant?: 'sidebar' | 'sheet';
}

const DECISION_LABELS: Record<string, string> = {
  confirmed:         'Attend',
  attend_but_reduce: 'Attend (Reduced)',
  watching:          'On the Fence',
  passed:            "Don't Attend",
  pending_approval:  'Evaluating',
};

const DECISION_COLORS: Record<string, string> = {
  confirmed:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  attend_but_reduce: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  watching:          'bg-amber-50 text-amber-700 border-amber-200',
  passed:            'bg-red-50 text-red-700 border-red-200',
  pending_approval:  'bg-blue-50 text-blue-700 border-blue-200',
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-6 h-6 rounded-full bg-brand-secondary flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function CalendarNotesPanel({ conferenceId, onClose, variant = 'sidebar' }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  // Sheet-only: collapsible comment list + inline add form
  const [expanded, setExpanded] = useState(false);
  const [addingComment, setAddingComment] = useState(false);

  const isSheet = variant === 'sheet';

  const loadNotes = () => {
    setLoading(true);
    fetch(`/api/calendar-intelligence/notes?conferenceId=${conferenceId}`)
      .then(r => r.ok ? r.json() : { notes: [] })
      .then((data: { notes: Note[] }) => setNotes(data.notes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadNotes(); }, [conferenceId]);

  const postNote = async (content: string, parentNoteId?: number) => {
    if (!content.trim()) return;
    setPosting(true);
    try {
      await fetch('/api/calendar-intelligence/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conferenceId, content: content.trim(), parentNoteId }),
      });
      loadNotes();
      if (parentNoteId) { setReplyText(''); setReplyingTo(null); }
      else setNewNote('');
    } finally {
      setPosting(false);
    }
  };

  const totalCount = notes.length + notes.reduce((sum, n) => sum + n.replies.length, 0);

  function NoteCard({ note, isReply = false }: { note: NoteReply; isReply?: boolean }) {
    return (
      <div className={`flex gap-2 ${isReply ? 'ml-8' : ''}`}>
        <Avatar name={note.authorName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`font-semibold text-gray-900 ${isSheet ? 'text-xs' : 'text-sm'}`}>{note.authorName}</span>
            <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${note.decisionState ? (DECISION_COLORS[note.decisionState] ?? 'bg-gray-50 text-gray-600 border-gray-200') : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
              {note.decisionState ? (DECISION_LABELS[note.decisionState] ?? note.decisionState.replace(/_/g, ' ')) : 'Input Not Recorded'}
            </span>
            <span className="text-[10px] text-gray-400">{timeAgo(note.createdAt)}</span>
          </div>
          <p className={`text-gray-700 whitespace-pre-wrap ${isSheet ? 'text-xs' : 'text-sm'}`}>{note.content}</p>
        </div>
      </div>
    );
  }

  // ── Sheet variant ──────────────────────────────────────────────────────────
  if (isSheet) {
    return (
      <div className="w-full bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 text-xs">Comments</h3>
            {!loading && totalCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                {totalCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setExpanded(true); setAddingComment(true); }}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-brand-secondary border border-brand-secondary/40 hover:bg-brand-secondary hover:text-white hover:border-brand-secondary transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Comment
            </button>
            <button
              onClick={() => {
                const next = !expanded;
                setExpanded(next);
                if (!next) setAddingComment(false);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={expanded ? 'Collapse comments' : 'Expand comments'}
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Collapsible body */}
        {expanded && (
          <>
            {/* Comment list */}
            <div className="px-4 pt-3 pb-2 space-y-3">
              {loading ? (
                <div className="text-center py-4 text-gray-400 text-xs">Loading…</div>
              ) : notes.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-400 text-xs">No comments yet.</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">Add the first comment below.</p>
                </div>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="space-y-2">
                    <NoteCard note={note} />
                    {note.replies.map(reply => (
                      <NoteCard key={reply.id} note={reply} isReply />
                    ))}
                    {replyingTo === note.id ? (
                      <div className="ml-8 space-y-1.5">
                        <textarea
                          rows={2}
                          autoFocus
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="Write a reply…"
                          className="input-field text-xs w-full resize-none"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => postNote(replyText, note.id)} disabled={posting || !replyText.trim()} className="btn-primary text-xs px-2 py-1 disabled:opacity-50">Reply</button>
                          <button onClick={() => { setReplyingTo(null); setReplyText(''); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setReplyingTo(note.id); setReplyText(''); }} className="ml-8 text-xs text-gray-400 hover:text-brand-secondary">Reply</button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add comment form — only when + Comment was clicked */}
            {addingComment && (
              <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-1.5">
                <textarea
                  rows={3}
                  autoFocus={notes.length === 0}
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Add a comment…"
                  className="input-field text-xs w-full resize-none"
                />
                <button onClick={() => postNote(newNote)} disabled={posting || !newNote.trim()} className="btn-primary text-xs w-full disabled:opacity-50">
                  {posting ? 'Posting…' : 'Post Comment'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Sidebar variant (unchanged behavior) ──────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white w-[360px] border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 text-sm">Comments</h3>
          {!loading && totalCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
              {totalCount}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">No comments yet.</p>
            <p className="text-xs text-gray-300 mt-1">Add the first comment below.</p>
          </div>
        ) : (
          notes.map(note => (
            <div key={note.id} className="space-y-2">
              <NoteCard note={note} />
              {note.replies.map(reply => (
                <NoteCard key={reply.id} note={reply} isReply />
              ))}
              {replyingTo === note.id ? (
                <div className="ml-9 space-y-1.5">
                  <textarea
                    rows={2}
                    autoFocus
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Write a reply…"
                    className="input-field text-sm w-full resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => postNote(replyText, note.id)} disabled={posting || !replyText.trim()} className="btn-primary text-xs px-2 py-1 disabled:opacity-50">Reply</button>
                    <button onClick={() => { setReplyingTo(null); setReplyText(''); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setReplyingTo(note.id); setReplyText(''); }} className="ml-9 text-xs text-gray-400 hover:text-brand-secondary">Reply</button>
              )}
            </div>
          ))
        )}
      </div>

      {/* New comment input */}
      <div className="p-4 border-t space-y-2">
        <textarea
          rows={3}
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a comment…"
          className="input-field text-sm w-full resize-none"
        />
        <button onClick={() => postNote(newNote)} disabled={posting || !newNote.trim()} className="btn-primary text-sm w-full disabled:opacity-50">
          {posting ? 'Posting…' : 'Post Comment'}
        </button>
      </div>
    </div>
  );
}
