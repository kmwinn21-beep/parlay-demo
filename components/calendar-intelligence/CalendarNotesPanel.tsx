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
}

const DECISION_COLORS: Record<string, string> = {
  confirmed:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  watching:         'bg-amber-50 text-amber-700 border-amber-200',
  passed:           'bg-red-50 text-red-700 border-red-200',
  pending_approval: 'bg-blue-50 text-blue-700 border-blue-200',
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
    <div className="w-7 h-7 rounded-full bg-brand-secondary flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function CalendarNotesPanel({ conferenceId, onClose }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');

  const loadNotes = () => {
    setLoading(true);
    fetch(`/api/calendar-intelligence/notes?conferenceId=${conferenceId}`)
      .then(r => r.ok ? r.json() : { notes: [] })
      .then((data: { notes: Note[] }) => setNotes(data.notes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

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

  function NoteCard({ note, isReply = false }: { note: NoteReply; isReply?: boolean }) {
    return (
      <div className={`flex gap-2.5 ${isReply ? 'ml-9' : ''}`}>
        <Avatar name={note.authorName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-semibold text-gray-900">{note.authorName}</span>
            {note.decisionState && (
              <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${DECISION_COLORS[note.decisionState] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                {note.decisionState.replace(/_/g, ' ')}
              </span>
            )}
            <span className="text-xs text-gray-400">{timeAgo(note.createdAt)}</span>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-[360px] border-l bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-gray-900 text-sm">Notes</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">No notes yet.</p>
            <p className="text-xs text-gray-300 mt-1">Add the first note below.</p>
          </div>
        ) : (
          notes.map(note => (
            <div key={note.id} className="space-y-2">
              <NoteCard note={note} />
              {/* Replies */}
              {note.replies.map(reply => (
                <NoteCard key={reply.id} note={reply} isReply />
              ))}
              {/* Reply input */}
              {replyingTo === note.id ? (
                <div className="ml-9 space-y-1.5">
                  <textarea
                    rows={2}
                    autoFocus
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
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

      {/* New note input */}
      <div className="p-4 border-t space-y-2">
        <textarea
          rows={3}
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note…"
          className="input-field text-sm w-full resize-none"
        />
        <button onClick={() => postNote(newNote)} disabled={posting || !newNote.trim()} className="btn-primary text-sm w-full disabled:opacity-50">
          {posting ? 'Posting…' : 'Post Note'}
        </button>
      </div>
    </div>
  );
}
