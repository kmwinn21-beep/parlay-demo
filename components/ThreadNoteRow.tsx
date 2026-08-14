'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { MentionTextarea } from './MentionTextarea';
import { type UserOption } from '@/lib/useUserOptions';

/**
 * One note in a threaded notes list: author line, inline edit, delete, and a
 * "Comments (n)" toggle with its own composer. Presentation only — the caller
 * supplies the handlers, so the outreach drawer (outreach_notes) and the social
 * event drawer (entity_notes) render identically over different endpoints.
 */

export interface ThreadNoteData {
  id: number;
  body: string;
  userName: string;
  userInitials: string;
  createdAt: string;
  isMine?: boolean;
  commentCount?: number;
  /** Outreach-only decorations; omitted elsewhere. */
  activityDotClass?: string | null;
  activityLabel?: string | null;
  attendeeName?: string | null;
}

export interface ThreadComment {
  id: number;
  body: string;
  userName: string;
  createdAt: string;
  isMine: boolean;
}

export interface ThreadNoteHandlers {
  updateNote: (noteId: number, body: string) => Promise<void>;
  deleteNote: (noteId: number) => Promise<void>;
  loadComments: (noteId: number) => Promise<ThreadComment[]>;
  postComment: (noteId: number, body: string, taggedUserIds: number[]) => Promise<ThreadComment>;
  deleteComment: (noteId: number, commentId: number) => Promise<void>;
}

export function relativeTime(iso: string): string {
  const d = new Date(iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Initials from a display name, e.g. "Kevin Winn" -> "KW". */
export function initialsFor(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function ThreadNoteRow({ note, userOptions, handlers, onUpdated, onDeleted }: {
  note: ThreadNoteData;
  userOptions: UserOption[];
  handlers: ThreadNoteHandlers;
  onUpdated: (note: ThreadNoteData) => void;
  onDeleted: (noteId: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<ThreadComment[] | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentTaggedIds, setCommentTaggedIds] = useState<number[]>([]);
  const [postingComment, setPostingComment] = useState(false);
  const [commentCount, setCommentCount] = useState(note.commentCount ?? 0);

  const toggleComments = () => {
    setCommentsOpen(v => !v);
    if (comments === null && !loadingComments) {
      setLoadingComments(true);
      handlers.loadComments(note.id)
        .then(rows => { setComments(rows); setCommentCount(rows.length); })
        .catch(() => setComments([]))
        .finally(() => setLoadingComments(false));
    }
  };

  const handlePostComment = async () => {
    const body = commentDraft.trim();
    if (!body || postingComment) return;
    setPostingComment(true);
    try {
      const created = await handlers.postComment(note.id, body, commentTaggedIds);
      setComments(prev => [...(prev ?? []), created]);
      setCommentCount(c => c + 1);
      setCommentDraft('');
      setCommentTaggedIds([]);
    } catch {
      // best-effort — leave the draft so the user can retry
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('Delete this comment? This cannot be undone.')) return;
    try {
      await handlers.deleteComment(note.id, commentId);
      setComments(prev => (prev ?? []).filter(c => c.id !== commentId));
      setCommentCount(c => Math.max(0, c - 1));
    } catch {
      toast.error('Failed to delete comment');
    }
  };

  const handleSaveEdit = async () => {
    const body = editBody.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      await handlers.updateNote(note.id, body);
      onUpdated({ ...note, body });
      setEditing(false);
    } catch {
      toast.error('Failed to update note');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await handlers.deleteNote(note.id);
      onDeleted(note.id);
    } catch {
      toast.error('Failed to delete note');
      setDeleting(false);
    }
  };

  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-full bg-brand-secondary text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
        {note.userInitials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-medium text-gray-700">
            {note.userName} <span className="font-normal text-gray-300">· {relativeTime(note.createdAt)}</span>
          </p>
          {note.isMine && !editing && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button type="button" onClick={() => { setEditBody(note.body); setEditing(true); }} title="Edit note" className="text-gray-300 hover:text-brand-secondary transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
              <button type="button" onClick={handleDelete} disabled={deleting} title="Delete note" className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          )}
        </div>
        {note.activityLabel && (
          <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${note.activityDotClass ?? 'bg-gray-300'}`} />
            <span className="font-medium">{note.activityLabel}</span>
          </p>
        )}
        {note.attendeeName && (
          <p className="text-[11px] text-gray-400">
            {note.userName} → {note.attendeeName}
          </p>
        )}
        {editing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <textarea
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              rows={3}
              className="input-field text-xs w-full py-1.5 resize-y"
              autoFocus
            />
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setEditing(false)} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleSaveEdit} disabled={saving || !editBody.trim()} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-600 mt-0.5 break-words">{note.body}</p>
        )}

        <button
          type="button"
          onClick={toggleComments}
          className="mt-1.5 text-[11px] font-medium text-gray-400 hover:text-brand-secondary transition-colors"
        >
          Comments{commentCount > 0 ? ` (${commentCount})` : ''}
        </button>

        {commentsOpen && (
          <div className="mt-2 border-t border-gray-100 pt-2 space-y-2">
            {loadingComments && (
              <div className="flex items-center justify-center py-3">
                <div className="animate-spin w-4 h-4 border-2 border-brand-secondary border-t-transparent rounded-full" />
              </div>
            )}
            {!loadingComments && comments && comments.length > 0 && (
              <div className="max-h-60 overflow-y-auto scrollbar-thin pr-1.5 space-y-2">
                {comments.map(c => (
                  <div key={c.id} className="pl-2.5 border-l-2 border-gray-100">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] font-medium text-gray-700">
                        {c.userName} <span className="font-normal text-gray-300">· {relativeTime(c.createdAt)}</span>
                      </p>
                      {c.isMine && (
                        <button type="button" onClick={() => handleDeleteComment(c.id)} title="Delete comment" className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 break-words">{c.body}</p>
                  </div>
                ))}
              </div>
            )}
            {!loadingComments && comments && comments.length === 0 && (
              <p className="text-[11px] text-gray-400">No comments yet.</p>
            )}
            <div className="pt-0.5">
              <MentionTextarea
                value={commentDraft}
                onChange={setCommentDraft}
                onMentionAdd={id => setCommentTaggedIds(prev => prev.includes(id) ? prev : [...prev, id])}
                userOptions={userOptions}
                rows={2}
                placeholder="Add a comment… (type @ to mention a user)"
                className="input-field text-xs w-full py-1.5 resize-y"
              />
              <div className="flex justify-end mt-1">
                <button type="button" onClick={handlePostComment} disabled={postingComment || !commentDraft.trim()} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                  {postingComment ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
