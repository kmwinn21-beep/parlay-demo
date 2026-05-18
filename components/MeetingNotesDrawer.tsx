'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MeetingNotetaker } from '@/components/MeetingNotetaker';

interface Props {
  meetingId: number | null;
  onClose: () => void;
}

export function MeetingNotesDrawer({ meetingId, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!meetingId || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 p-3"
      onClick={onClose}
    >
      <div
        className="flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-5xl h-full"
        onClick={e => e.stopPropagation()}
      >
        <MeetingNotetaker meetingId={meetingId} onClose={onClose} />
      </div>
    </div>,
    document.body
  );
}
