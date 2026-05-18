'use client';

import { MeetingNotetaker } from '@/components/MeetingNotetaker';

interface Props {
  meetingId: number | null;
  onClose: () => void;
}

export function MeetingNotesDrawer({ meetingId, onClose }: Props) {
  if (!meetingId) return null;

  return (
    <div className="fixed inset-0 z-[500] flex bg-black/50" onClick={onClose}>
      <div className="flex h-full w-full items-stretch justify-end p-3">
        <div
          className="flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-5xl"
          onClick={e => e.stopPropagation()}
        >
          <MeetingNotetaker meetingId={meetingId} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
