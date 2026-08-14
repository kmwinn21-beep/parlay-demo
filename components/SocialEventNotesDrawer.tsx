'use client';

import { useEffect, useState } from 'react';
import { MentionTextarea } from './MentionTextarea';
import { useUser } from '@/components/UserContext';
import { useUserOptions } from '@/lib/useUserOptions';
import {
  ThreadNoteRow, initialsFor,
  type ThreadComment, type ThreadNoteData, type ThreadNoteHandlers,
} from './ThreadNoteRow';

/**
 * Notes for one social event, shaped like the outreach tab's notes drawer: a
 * panel that reveals itself beside the cards on desktop and a bottom sheet
 * below sm, with the same threaded note rows and @mention composer.
 */

const ANIMATION_MS = 220;

interface EntityNoteRow {
  id: number;
  content: string;
  created_at: string;
  rep: string | null;
  author_user_id: number | null;
  comment_count: number;
}

interface EntityCommentRow {
  id: number;
  content: string;
  created_at: string;
  commenter_name: string;
  is_mine: boolean;
}

function toThreadNote(r: EntityNoteRow, currentUserId: number | null | undefined): ThreadNoteData {
  const name = r.rep?.trim() || 'Unknown';
  return {
    id: r.id,
    body: r.content,
    userName: name,
    userInitials: initialsFor(name),
    createdAt: r.created_at,
    isMine: currentUserId != null && r.author_user_id === currentUserId,
    commentCount: r.comment_count,
  };
}

export function SocialEventNotesDrawer({
  eventId, eventName, conferenceName, onClose, onCountChange,
}: {
  eventId: number;
  eventName: string;
  conferenceName: string;
  onClose: () => void;
  onCountChange?: (eventId: number, count: number) => void;
}) {
  const { user } = useUser();
  const userOptions = useUserOptions();
  const [notes, setNotes] = useState<ThreadNoteData[] | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [taggedUserIds, setTaggedUserIds] = useState<number[]>([]);
  const [posting, setPosting] = useState(false);

  // Reveal top-down on mount, collapse bottom-up on close — the same motion the
  // outreach drawer uses. Desktop only; below sm this is a bottom sheet driven
  // by the shared drawer-mobile-responsive slide-up.
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase('open'));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = () => {
    if (!isDesktop) { onClose(); return; }
    setPhase('closing');
    setTimeout(onClose, ANIMATION_MS);
  };

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  useEffect(() => {
    let cancelled = false;
    setNotes(null);
    fetch(`/api/notes?entity_type=social_event&entity_id=${eventId}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((rows: EntityNoteRow[]) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows.map(r => toThreadNote(r, user?.id)) : [];
        setNotes(list);
        onCountChange?.(eventId, list.length);
      })
      .catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
    // onCountChange is a parent callback; keying on it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, user?.id]);

  const handlePostNote = async () => {
    const body = noteDraft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'social_event',
          entity_id: eventId,
          content: body,
          conference_name: conferenceName,
          rep: user?.displayName || null,
          tagged_users: taggedUserIds.length > 0 ? taggedUserIds.join(',') : null,
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as EntityNoteRow;
      setNotes(prev => {
        const next = [...(prev ?? []), toThreadNote(created, user?.id)];
        onCountChange?.(eventId, next.length);
        return next;
      });
      setNoteDraft('');
      setTaggedUserIds([]);
    } catch {
      // best-effort — leave the draft text so the user can retry
    } finally {
      setPosting(false);
    }
  };

  const handlers: ThreadNoteHandlers = {
    updateNote: async (noteId, body) => {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: body }),
      });
      if (!res.ok) throw new Error();
    },
    deleteNote: async noteId => {
      const res = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    },
    loadComments: async noteId => {
      const res = await fetch(`/api/notes/${noteId}/comments`);
      if (!res.ok) throw new Error();
      const data = await res.json() as { comments: EntityCommentRow[] };
      return (data.comments ?? []).map<ThreadComment>(c => ({
        id: c.id, body: c.content, userName: c.commenter_name, createdAt: c.created_at, isMine: c.is_mine,
      }));
    },
    postComment: async (noteId, body, taggedUserIds2) => {
      const res = await fetch(`/api/notes/${noteId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: body, tagged_users: taggedUserIds2.length > 0 ? taggedUserIds2.join(',') : null }),
      });
      if (!res.ok) throw new Error();
      const c = await res.json() as EntityCommentRow;
      return { id: c.id, body: c.content, userName: c.commenter_name, createdAt: c.created_at, isMine: true };
    },
    deleteComment: async (noteId, commentId) => {
      const res = await fetch(`/api/notes/${noteId}/comments/${commentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    },
  };

  return (
    <>
      {!isDesktop && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={handleClose} />
      )}
      <div
        style={isDesktop ? {
          transformOrigin: phase === 'closing' ? 'bottom' : 'top',
          transform: phase === 'open' ? 'scaleY(1)' : 'scaleY(0.05)',
          opacity: phase === 'open' ? 1 : 0,
          transition: `transform ${ANIMATION_MS}ms ease, opacity ${ANIMATION_MS}ms ease`,
        } : undefined}
        className={isDesktop
          ? 'border border-gray-200 rounded-xl bg-white overflow-hidden sticky top-4 flex flex-col max-h-[calc(100vh-6rem)]'
          : 'drawer-mobile-responsive fixed inset-x-0 bottom-0 z-50 h-[75vh] w-full rounded-t-2xl border border-gray-200 bg-white overflow-hidden flex flex-col'}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-100 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-700 truncate">{eventName}</p>
          <button type="button" onClick={handleClose} className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0" title="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex border-b border-gray-100 flex-shrink-0">
          <span className="flex-1 py-2 text-xs font-medium text-center border-b-2 border-brand-secondary text-brand-secondary">
            Notes
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-3">
            {notes === null && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-5 h-5 border-2 border-brand-secondary border-t-transparent rounded-full" />
              </div>
            )}
            {notes !== null && notes.length === 0 && (
              <div className="text-center py-8">
                <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                <p className="text-xs text-gray-400">No notes yet. Add context for your team.</p>
              </div>
            )}
            {notes !== null && notes.length > 0 && (
              <div className="space-y-3">
                {notes.map(n => (
                  <ThreadNoteRow
                    key={n.id}
                    note={n}
                    userOptions={userOptions}
                    handlers={handlers}
                    onUpdated={updated => setNotes(prev => (prev ?? []).map(x => x.id === updated.id ? updated : x))}
                    onDeleted={noteId => setNotes(prev => {
                      const next = (prev ?? []).filter(x => x.id !== noteId);
                      onCountChange?.(eventId, next.length);
                      return next;
                    })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 p-2.5 flex flex-col gap-1.5 flex-shrink-0">
          <MentionTextarea
            value={noteDraft}
            onChange={setNoteDraft}
            onMentionAdd={id => setTaggedUserIds(prev => prev.includes(id) ? prev : [...prev, id])}
            userOptions={userOptions}
            rows={4}
            placeholder="Add a note… (type @ to mention a user)"
            className="input-field text-xs w-full py-1.5 resize-y min-h-[88px]"
          />
          <button
            type="button"
            onClick={handlePostNote}
            disabled={posting || !noteDraft.trim()}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50 self-end"
          >
            Post
          </button>
        </div>
      </div>
    </>
  );
}
