'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { buildCrmPrompt, type CrmPromptInput } from '@/lib/crmPrompt';

/**
 * The finished CRM batch, in a box the rep can edit before taking it to their
 * CRM's agent. Copy takes whatever is in the box, edits included.
 */
export function CrmPromptDrawer({
  conferenceId,
  onClose,
}: {
  conferenceId: number;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ meetings: 0, tasks: 0, notes: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/conferences/${conferenceId}/crm-prompt`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: CrmPromptInput) => {
        if (cancelled) return;
        setCounts({
          meetings: data.meetings?.length ?? 0,
          tasks: data.tasks?.length ?? 0,
          notes: data.notes?.length ?? 0,
        });
        setText(buildCrmPrompt(data));
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to build the prompt.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conferenceId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Prompt copied.');
    } catch {
      toast.error('Could not reach the clipboard.');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[69] bg-black/40" onClick={onClose} />
      <div className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[90vh] sm:h-auto w-full sm:w-[620px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none z-[70]">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-800">CRM Prompt</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading
                ? 'Gathering your conference activity…'
                : `${counts.meetings} meeting${counts.meetings === 1 ? '' : 's'} · ${counts.tasks} task${counts.tasks === 1 ? '' : 's'} · ${counts.notes} note${counts.notes === 1 ? '' : 's'}. Edit anything below, then copy it into your CRM agent.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent" />
            </div>
          ) : (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              spellCheck={false}
              className="w-full h-full resize-none rounded-lg border border-gray-200 p-3 text-xs leading-relaxed font-mono text-gray-800 focus:outline-none focus:border-brand-secondary"
            />
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={loading || !text}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-brand-secondary text-white hover:opacity-90 disabled:opacity-60"
          >
            Copy
          </button>
        </div>
      </div>
    </>
  );
}
