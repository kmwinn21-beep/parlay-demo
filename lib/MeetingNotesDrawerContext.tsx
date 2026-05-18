'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';

interface MeetingNotesDrawerContextValue {
  meetingId: number | null;
  openMeetingNotes: (id: number) => void;
  closeMeetingNotes: () => void;
}

const MeetingNotesDrawerContext = createContext<MeetingNotesDrawerContextValue>({
  meetingId: null,
  openMeetingNotes: () => {},
  closeMeetingNotes: () => {},
});

export function MeetingNotesDrawerProvider({ children }: { children: ReactNode }) {
  const [meetingId, setMeetingId] = useState<number | null>(null);

  return (
    <MeetingNotesDrawerContext.Provider value={{
      meetingId,
      openMeetingNotes: (id) => setMeetingId(id),
      closeMeetingNotes: () => setMeetingId(null),
    }}>
      {children}
    </MeetingNotesDrawerContext.Provider>
  );
}

export function useMeetingNotesDrawer() {
  return useContext(MeetingNotesDrawerContext);
}
