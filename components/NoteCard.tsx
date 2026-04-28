'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { useUser } from '@/components/UserContext';
import { MentionTextarea } from '@/components/MentionTextarea';
import { useUserOptions, getRepInitials } from '@/lib/useUserOptions';
import type { EntityNote } from '@/components/NotesSection';

interface Comment {
  id: number;
  content: string;
  created_at: string;
  user_id: number;
  commenter_name: string;
  tagged_users: string | null;
  is_mine: boolean;
  reactions: { likes: number; dislikes: number; myReaction: string | null };
}

interface NoteReactions {
  likes: number;
  dislikes: number;
  my_reaction: string | null;
}

function formatDateTime(dt: string) {
  const d = new Date(dt.endsWith('Z') || dt.includes('+') ? dt : dt + 'Z');
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function isLongContent(content: string) {
  return content.length > 300 || content.split('\n').length > 4;
}

function ReactionBar({
  likes,
  dislikes,
  myReaction,
  disabled,
  onReact,
  size = 'sm',
}: {
  likes: number;
  dislikes: number;
  myReaction: string | null;
  disabled?: boolean;
  onReact: (type: 'like' | 'dislike') => void;
  size?: 'sm' | 'xs';
}) {
  const btnBase = size === 'sm'
    ? 'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40'
    : 'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors disabled:opacity-40';

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onReact('like')}
        className={`${btnBase} ${myReaction === 'like' ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
        title="Like"
      >
        <svg className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-3 h-3'} fill={myReaction === 'like' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
        </svg>
        {likes > 0 && <span>{likes}</span>}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onReact('dislike')}
        className={`${btnBase} ${myReaction === 'dislike' ? 'bg-red-100 text-red-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
        title="Dislike"
      >
        <svg className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-3 h-3'} fill={myReaction === 'dislike' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
        </svg>
        {dislikes > 0 && <span>{dislikes}</span>}
      </button>
    </div>
  );
}

export function NoteCard({
  note,
  onDelete,
  onPin,
  pinnedNoteIds,
  showPinnedIndicator,
  entityType,
  conferences,
}: {
  note: EntityNote;
  onDelete: (id: number) => void;
  onPin?: (noteId: number) => void;
  pinnedNoteIds?: Set<number>;
  showPinnedIndicator?: boolean;
  entityType: 'attendee' | 'company' | 'conference';
  conferences?: Array<{ id: number; name: string }>;
}) {
  const { user } = useUser();
  const colorMaps = useConfigColors();
  const userOptionsWithIds = useUserOptions();

  // Content expansion
  const [expanded, setExpanded] = useState(false);
  const long = isLongContent(note.content);

  // Reactions state (loaded lazily with comments)
  const [noteReactions, setNoteReactions] = useState<NoteReactions>({
    likes: 0, dislikes: 0, my_reaction: null,
  });
  const [reactingNote, setReactingNote] = useState(false);

  // Comments state
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [letsTalk, setLetsTalk] = useState(Boolean(note.lets_talk));
  const [commentCount, setCommentCount] = useState(note.comment_count ?? 0);

  // New comment form
  const [commentText, setCommentText] = useState('');
  const [commentTaggedIds, setCommentTaggedIds] = useState<number[]>([]);
  const [submittingComment, setSubmittingComment] = useState(false);

  // Let's Talk
  const [triggeringLetsTalk, setTriggeringLetsTalk] = useState(false);

  // Sync from parent when note prop changes
  useEffect(() => {
    setLetsTalk(Boolean(note.lets_talk));
    setCommentCount(note.comment_count ?? 0);
  }, [note.lets_talk, note.comment_count]);

  const loadComments = useCallback(async () => {
    if (commentsLoaded) return;
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/notes/${note.id}/comments`);
      if (!res.ok) throw new Error();
      const data = await res.json() as {
        comments: Comment[];
        note_reactions: NoteReactions;
        lets_talk: boolean;
      };
      setComments(data.comments);
      setNoteReactions(data.note_reactions);
      setLetsTalk(data.lets_talk);
      setCommentCount(data.comments.length);
      setCommentsLoaded(true);
    } catch {
      toast.error('Failed to load comments.');
    } finally {
      setCommentsLoading(false);
    }
  }, [note.id, commentsLoaded]);

  const toggleComments = () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && !commentsLoaded) loadComments();
  };

  const handleNoteReact = async (type: 'like' | 'dislike') => {
    if (reactingNote) return;
    // Load reactions first if not loaded
    if (!commentsLoaded) await loadComments();
    setReactingNote(true);
    try {
      const res = await fetch(`/api/notes/${note.id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction_type: type }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { likes: number; dislikes: number; my_reaction: string | null };
      setNoteReactions({ likes: data.likes, dislikes: data.dislikes, my_reaction: data.my_reaction });
    } catch {
      toast.error('Failed to react.');
    } finally {
      setReactingNote(false);
    }
  };

  const handleCommentReact = async (commentId: number, type: 'like' | 'dislike') => {
    try {
      const res = await fetch(`/api/notes/${note.id}/comments/${commentId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction_type: type }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { likes: number; dislikes: number; my_reaction: string | null };
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, reactions: { likes: data.likes, dislikes: data.dislikes, myReaction: data.my_reaction } }
          : c
      ));
    } catch {
      toast.error('Failed to react.');
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const taggedUsersStr = commentTaggedIds.length > 0 ? commentTaggedIds.join(',') : undefined;
      const res = await fetch(`/api/notes/${note.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim(), tagged_users: taggedUsersStr }),
      });
      const data = await res.json() as Comment & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to post comment.');
        return;
      }
      setComments(prev => [...prev, data]);
      setCommentCount(prev => prev + 1);
      setCommentText('');
      setCommentTaggedIds([]);
    } catch {
      toast.error('Failed to post comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('Delete this comment?')) return;
    try {
      const res = await fetch(`/api/notes/${note.id}/comments/${commentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setComments(prev => prev.filter(c => c.id !== commentId));
      setCommentCount(prev => Math.max(0, prev - 1));
    } catch {
      toast.error('Failed to delete comment.');
    }
  };

  const handleLetsTalk = async () => {
    if (!confirm('Trigger "Let\'s Talk"? This will notify tagged users and commenters, and disable further commenting.')) return;
    setTriggeringLetsTalk(true);
    try {
      const res = await fetch(`/api/notes/${note.id}/lets-talk`, { method: 'POST' });
      const data = await res.json() as { error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Failed.'); return; }
      setLetsTalk(true);
      toast.success('Let\'s Talk triggered — commenters notified.');
    } catch {
      toast.error('Failed to trigger Let\'s Talk.');
    } finally {
      setTriggeringLetsTalk(false);
    }
  };

  // Resolve tagged users
  const taggedIds = note.tagged_users
    ? note.tagged_users.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0)
    : [];
  const taggedNames = taggedIds
    .map(id => userOptionsWithIds.find(u => u.id === id)?.value)
    .filter(Boolean) as string[];

  const repInitials = (() => {
    if (!note.rep) return null;
    if (note.rep.includes('@')) {
      const u = note.rep.split('@')[0];
      return ((u[0] || '') + (u[1] || '')).toUpperCase() || null;
    }
    return note.rep.split(/\s+/).filter(Boolean).map(p => p.charAt(0).toUpperCase()).join('') || null;
  })();

  return (
    <div className={`rounded-xl border p-4 hover:shadow-sm transition-all ${letsTalk ? 'border-amber-300 bg-amber-50/30' : 'border-gray-100 hover:border-gray-200'}`}>
      {/* Meta row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(note.created_at)}</span>
          {note.conference_name && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs font-medium border border-blue-100 whitespace-nowrap">
              {note.conference_name}
            </span>
          )}
          {note.attendee_name && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200 whitespace-nowrap">
              {note.attendee_name}
            </span>
          )}
          {note.company_name && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-medium border border-teal-200 whitespace-nowrap">
              {note.company_name}
            </span>
          )}
          {taggedNames.map(name => (
            <span key={name} className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-xs font-medium border border-violet-200 whitespace-nowrap" title={`@${name}`}>
              @{getRepInitials(name)}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {repInitials && (
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold flex-shrink-0 ${getPreset(colorMaps.user?.[note.rep ?? '']).badgeClass}`}
              title={note.rep || undefined}
            >
              {repInitials}
            </span>
          )}
          {showPinnedIndicator && pinnedNoteIds?.has(note.id) && (
            <span className="text-brand-highlight flex-shrink-0" title="Pinned">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
              </svg>
            </span>
          )}
          {onPin && (entityType === 'attendee' || entityType === 'company') && (
            <button
              type="button"
              onClick={() => onPin(note.id)}
              className={`transition-colors flex-shrink-0 ${pinnedNoteIds?.has(note.id) ? 'text-brand-highlight' : 'text-gray-300 hover:text-brand-highlight'}`}
              title={pinnedNoteIds?.has(note.id) ? 'Already pinned' : 'Pin note'}
              disabled={pinnedNoteIds?.has(note.id)}
            >
              <svg className="w-4 h-4" fill={pinnedNoteIds?.has(note.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={pinnedNoteIds?.has(note.id) ? 0 : 2}>
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Note body */}
      <p className={`text-sm text-gray-800 leading-relaxed break-words ${!expanded && long ? 'line-clamp-4' : ''}`}>
        {note.content}
      </p>
      {long && (
        <button type="button" onClick={() => setExpanded(v => !v)} className="mt-2 text-xs text-brand-secondary hover:underline font-medium">
          {expanded ? 'Show Less' : 'Show Full Note'}
        </button>
      )}

      {/* Let's Talk banner */}
      {letsTalk && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          Let&apos;s Talk requested — commenting closed
        </div>
      )}

      {/* Bottom action bar */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50">
        {/* Left: reactions + let's talk */}
        <div className="flex items-center gap-1">
          <ReactionBar
            likes={noteReactions.likes}
            dislikes={noteReactions.dislikes}
            myReaction={noteReactions.my_reaction}
            disabled={reactingNote}
            onReact={handleNoteReact}
          />
          {!letsTalk && (
            <button
              type="button"
              disabled={triggeringLetsTalk}
              onClick={handleLetsTalk}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-gray-400 hover:bg-amber-50 hover:text-amber-700 transition-colors disabled:opacity-40"
              title="Let's Talk — notify tagged users & commenters and close commenting"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
          )}
        </div>

        {/* Right: comment count + toggle + delete */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleComments}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-brand-secondary transition-colors font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {commentCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 bg-brand-secondary text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                {commentCount}
              </span>
            )}
            <svg className={`w-3 h-3 transition-transform duration-150 ${commentsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onDelete(note.id)}
            className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
            title="Delete note"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Comments section */}
      {commentsOpen && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
          {commentsLoading && (
            <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
              <div className="w-3 h-3 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent" />
              Loading comments…
            </div>
          )}

          {!commentsLoading && comments.map(comment => (
            <div key={comment.id} className="pl-3 border-l-2 border-gray-100">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700">{comment.commenter_name}</span>
                    <span className="text-[10px] text-gray-400">{formatDateTime(comment.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed break-words">{comment.content}</p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <ReactionBar
                      likes={comment.reactions.likes}
                      dislikes={comment.reactions.dislikes}
                      myReaction={comment.reactions.myReaction}
                      onReact={type => handleCommentReact(comment.id, type)}
                      size="xs"
                    />
                  </div>
                </div>
                {comment.is_mine && (
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(comment.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                    title="Delete comment"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}

          {!commentsLoading && commentsLoaded && comments.length === 0 && !letsTalk && (
            <p className="text-xs text-gray-400 py-1">No comments yet.</p>
          )}

          {/* New comment input */}
          {!letsTalk && (
            <div className="pt-1">
              <MentionTextarea
                value={commentText}
                onChange={setCommentText}
                onMentionAdd={id => setCommentTaggedIds(prev => prev.includes(id) ? prev : [...prev, id])}
                userOptions={userOptionsWithIds}
                className="input-field resize-none w-full text-sm"
                placeholder="Add a comment… (@ to mention)"
                rows={2}
              />
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={handleSubmitComment}
                  disabled={submittingComment || !commentText.trim()}
                  className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40"
                >
                  {submittingComment ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
