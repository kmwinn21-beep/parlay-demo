'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MobileAttendeeCard } from '@/components/MobileAttendeeCard';
import type { AttendeeSearchRow } from '@/components/AttendeeSearchSelect';
import { SearchableSelect } from '@/components/SearchableSelect';
import type { UserOption } from '@/lib/useUserOptions';

/**
 * "Add this person?" — the attendee rendered as the card they appear as in the
 * list they're about to join, so the decision is made on the same information
 * the list will show. Without the assigned-rep pill or the row actions: neither
 * is what's being decided here.
 */
export function ConfirmAddAttendeeDialog({
  attendee, conferenceName, conferences, conferenceId, onConferenceChange,
  onConfirm, onCancel, submitting, userOptions, colorMaps,
}: {
  attendee: AttendeeSearchRow;
  /** Named in the prose when the conference is already settled. */
  conferenceName?: string;
  /** Offered in the dialog when it isn't — the Attendees page picks it here. */
  conferences?: { id: number; name: string }[];
  conferenceId?: number | null;
  onConferenceChange?: (id: number | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
  submitting?: boolean;
  userOptions: UserOption[];
  colorMaps: Record<string, Record<string, string | null>>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onCancel]);

  const needsConference = !!conferences;
  const blocked = submitting || (needsConference && !conferenceId);

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90] bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-[91] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-brand-primary">Add this attendee?</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {conferenceName
                ? `They'll be added to ${conferenceName}.`
                : 'They already exist — this adds them to the conference below.'}
            </p>
          </div>

          <div className="p-2 bg-gray-50/50">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <MobileAttendeeCard
                attendee={attendee}
                showPhotos
                selected={false}
                onOpenAttendee={() => {}}
                onOpenCompany={() => {}}
                userOptions={userOptions}
                colorMaps={colorMaps}
                hideAssignedRep
              />
            </div>
          </div>

          {conferences && (
            <div className="px-4 pt-1 pb-3">
              <label className="label text-xs">Conference *</label>
              <SearchableSelect
                options={conferences}
                value={conferences.find(c => c.id === conferenceId) ?? null}
                onChange={c => onConferenceChange?.(c?.id ?? null)}
                getLabel={c => c.name}
                placeholder="Select a conference…"
              />
            </div>
          )}

          <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
            <button type="button" onClick={onConfirm} disabled={blocked} className="btn-primary text-sm disabled:opacity-50">
              {submitting ? 'Adding…' : 'Add Attendee'}
            </button>
            <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
