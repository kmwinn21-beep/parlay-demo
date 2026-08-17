'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useUser } from '@/components/UserContext';
import { useUserOptions } from '@/lib/useUserOptions';
import { useConfigColors } from '@/lib/useConfigColors';
import { MeetingsTable, type Meeting } from '@/components/MeetingsTable';
import type { MeetingRow } from '../PreConferenceReview';

/**
 * The pre-conference tab renders the same card the conference Meetings tab
 * does — cardsOnly, since this modal column is far narrower than that page.
 */
function toMeeting(m: MeetingRow, outcomeOverride?: string): Meeting {
  return {
    id: m.id,
    attendee_id: m.attendee_id,
    conference_id: m.conference_id ?? 0,
    meeting_date: m.meeting_date ?? '',
    meeting_time: m.meeting_time ?? '',
    location: m.location,
    // The rep pills need the raw ids; `scheduled_by` here is already names.
    scheduled_by: m.scheduled_by_ids ?? null,
    additional_attendees: m.additional_attendees ?? null,
    outcome: outcomeOverride ?? m.outcome,
    meeting_type: m.meeting_type,
    created_at: m.created_at ?? '',
    first_name: m.first_name,
    last_name: m.last_name,
    title: m.title,
    company_id: m.company_id,
    company_name: m.company_name,
    company_wse: m.company_wse ?? null,
    conference_name: m.conference_name ?? '',
    has_notes: m.has_notes,
  };
}

export function MeetingsTab({ meetings }: { meetings: MeetingRow[] }) {
  const { user: currentUser } = useUser();
  const userOptions = useUserOptions();
  const colorMaps = useConfigColors();
  const [myMeetingsOnly, setMyMeetingsOnly] = useState(false);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  // Outcome edits are applied here rather than refetching the whole modal.
  const [outcomeOverrides, setOutcomeOverrides] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch('/api/config?category=action', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((data: { value: string }[]) => setActionOptions(Array.isArray(data) ? data.map(d => d.value) : []))
      .catch(() => {});
  }, []);

  const visibleMeetings = useMemo(
    () => (myMeetingsOnly && currentUser?.repName
      ? meetings.filter(m => (m.scheduled_by ?? '').split(',').map(n => n.trim()).includes(currentUser.repName!))
      : meetings),
    [meetings, myMeetingsOnly, currentUser],
  );

  const cardMeetings = useMemo(
    () => visibleMeetings.map(m => toMeeting(m, outcomeOverrides[m.id])),
    [visibleMeetings, outcomeOverrides],
  );

  const handleOutcomeChange = useCallback(async (meetingId: number, outcome: string) => {
    setOutcomeOverrides(prev => ({ ...prev, [meetingId]: outcome }));
    try {
      const res = await fetch('/api/meetings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: meetingId, outcome }),
      });
      if (!res.ok) throw new Error();
      toast.success('Outcome updated.');
    } catch {
      toast.error('Failed to update outcome.');
    }
  }, []);

  if (meetings.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No meetings scheduled for this conference.</p>
      </div>
    );
  }

  const conflicts = visibleMeetings.filter(m => m.hasConflict);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-gray-500">{visibleMeetings.length} meeting{visibleMeetings.length !== 1 ? 's' : ''} scheduled</p>
        {conflicts.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
            {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
          </span>
        )}
        {currentUser?.repName && (
          <button
            type="button"
            onClick={() => setMyMeetingsOnly(v => !v)}
            className={`ml-auto text-xs rounded-lg border px-2.5 py-1.5 font-semibold transition-colors ${
              myMeetingsOnly
                ? 'border-brand-secondary bg-brand-secondary/10 text-brand-secondary'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >
            My Meetings
          </button>
        )}
      </div>

      {visibleMeetings.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No meetings match this filter.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <MeetingsTable
            cardsOnly
            groupByDate
            tableName="conference_meetings"
            meetings={cardMeetings}
            actionOptions={actionOptions}
            colorMap={colorMaps.action || {}}
            userOptions={userOptions}
            onOutcomeChange={handleOutcomeChange}
          />
        </div>
      )}
    </div>
  );
}
