'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

interface ConferenceNotesModalProps {
  notes: string;
  /** Persist the new value; '' means the notes were deleted. */
  onSave: (notes: string) => Promise<void>;
  onClose: () => void;
}

/**
 * The conference's free-form Notes field, read first and edited in place. It
 * only ever opens for a conference that already has notes, so there is no
 * empty state to design for — just view, edit, save, delete.
 */
export default function ConferenceNotesModal({ notes, onSave, onClose }: ConferenceNotesModalProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const commit = async (value: string, successMessage: string) => {
    setBusy(true);
    try {
      await onSave(value);
      toast.success(successMessage);
      onClose();
    } catch {
      toast.error('Failed to save the notes.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="modal-sheet-mobile bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <h3 className="text-base font-semibold text-brand-primary font-serif">Conference Notes</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {editing ? (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={6}
              autoFocus
              className="input-field resize-none w-full"
              placeholder="Any additional notes about this conference..."
            />
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{notes}</p>
          )}

          {confirmingDelete && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <p className="text-sm text-red-900">Delete these notes? This can&apos;t be undone.</p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => commit('', 'Notes deleted')}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {busy ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            disabled={busy || confirmingDelete}
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>

          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setDraft(notes); setEditing(false); }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !draft.trim()}
                  onClick={() => commit(draft.trim(), 'Notes saved')}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-brand-secondary text-white hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || confirmingDelete}
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-brand-secondary text-white hover:opacity-90 disabled:opacity-60"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
