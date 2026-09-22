'use client';

import { useState } from 'react';
import { AgendaUploadModal } from '@/components/AgendaUploadModal';

/**
 * One way in to uploading an agenda, wherever the reader happens to be.
 *
 * There were three, and they had drifted: the agenda tab offered a tabbed
 * Upload File / From Link panel, the conference edit form offered two outlined
 * buttons with an inline URL box, and the modal offered a third arrangement of
 * the same two choices. Only the modal could take more than one link — which
 * is the thing a schedule split across day tabs actually needs — so the two
 * places somebody is most likely to start from were the two that could not do
 * the job.
 *
 * This is the door to the modal and nothing else. It holds no upload state,
 * because whatever it held would be a fourth version of the same logic.
 */
export function UploadAgendaButton({ conferenceId, onUploaded, label = 'Upload Agenda', className = '' }: {
  /** Preselects the conference, so the modal does not ask. */
  conferenceId: number;
  /** The agenda changed — reload whatever is showing it. */
  onUploaded?: () => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors ${className}`}
      >
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {label}
      </button>

      {open && (
        <AgendaUploadModal
          conferenceId={conferenceId}
          onClose={() => setOpen(false)}
          onUploaded={onUploaded}
        />
      )}
    </>
  );
}
