'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';

interface ReviewModalSlot {
  isOpen: boolean;
  isMinimized: boolean;
  conferenceId: number | null;
  conferenceName: string;
}

interface PreConferenceSlot extends ReviewModalSlot {
  targetsReadOnly: boolean;
}

const EMPTY_SLOT: ReviewModalSlot = { isOpen: false, isMinimized: false, conferenceId: null, conferenceName: '' };
const EMPTY_PRE_SLOT: PreConferenceSlot = { ...EMPTY_SLOT, targetsReadOnly: false };

interface ConferenceReviewModalsContextValue {
  preConference: PreConferenceSlot;
  openPreConference: (conferenceId: number, conferenceName: string, targetsReadOnly?: boolean) => void;
  minimizePreConference: () => void;
  expandPreConference: () => void;
  closePreConference: () => void;

  postConference: ReviewModalSlot;
  openPostConference: (conferenceId: number, conferenceName: string) => void;
  minimizePostConference: () => void;
  expandPostConference: () => void;
  closePostConference: () => void;

  effectiveness: ReviewModalSlot;
  openEffectiveness: (conferenceId: number, conferenceName: string) => void;
  minimizeEffectiveness: () => void;
  expandEffectiveness: () => void;
  closeEffectiveness: () => void;
}

const ConferenceReviewModalsContext = createContext<ConferenceReviewModalsContextValue>({
  preConference: EMPTY_PRE_SLOT,
  openPreConference: () => {},
  minimizePreConference: () => {},
  expandPreConference: () => {},
  closePreConference: () => {},
  postConference: EMPTY_SLOT,
  openPostConference: () => {},
  minimizePostConference: () => {},
  expandPostConference: () => {},
  closePostConference: () => {},
  effectiveness: EMPTY_SLOT,
  openEffectiveness: () => {},
  minimizeEffectiveness: () => {},
  expandEffectiveness: () => {},
  closeEffectiveness: () => {},
});

export function ConferenceReviewModalsProvider({ children }: { children: ReactNode }) {
  const [preConference, setPreConference] = useState<PreConferenceSlot>(EMPTY_PRE_SLOT);
  const [postConference, setPostConference] = useState<ReviewModalSlot>(EMPTY_SLOT);
  const [effectiveness, setEffectiveness] = useState<ReviewModalSlot>(EMPTY_SLOT);

  const openPreConference = (conferenceId: number, conferenceName: string, targetsReadOnly = false) => {
    setPreConference(prev => {
      if (prev.isOpen && prev.isMinimized && prev.conferenceId === conferenceId) {
        return { ...prev, isMinimized: false };
      }
      return { isOpen: true, isMinimized: false, conferenceId, conferenceName, targetsReadOnly };
    });
  };
  const minimizePreConference = () => setPreConference(prev => (prev.isOpen ? { ...prev, isMinimized: true } : prev));
  const expandPreConference = () => setPreConference(prev => ({ ...prev, isMinimized: false }));
  const closePreConference = () => setPreConference(EMPTY_PRE_SLOT);

  const openPostConference = (conferenceId: number, conferenceName: string) => {
    setPostConference(prev => {
      if (prev.isOpen && prev.isMinimized && prev.conferenceId === conferenceId) {
        return { ...prev, isMinimized: false };
      }
      return { isOpen: true, isMinimized: false, conferenceId, conferenceName };
    });
  };
  const minimizePostConference = () => setPostConference(prev => (prev.isOpen ? { ...prev, isMinimized: true } : prev));
  const expandPostConference = () => setPostConference(prev => ({ ...prev, isMinimized: false }));
  const closePostConference = () => setPostConference(EMPTY_SLOT);

  const openEffectiveness = (conferenceId: number, conferenceName: string) => {
    setEffectiveness(prev => {
      if (prev.isOpen && prev.isMinimized && prev.conferenceId === conferenceId) {
        return { ...prev, isMinimized: false };
      }
      return { isOpen: true, isMinimized: false, conferenceId, conferenceName };
    });
  };
  const minimizeEffectiveness = () => setEffectiveness(prev => (prev.isOpen ? { ...prev, isMinimized: true } : prev));
  const expandEffectiveness = () => setEffectiveness(prev => ({ ...prev, isMinimized: false }));
  const closeEffectiveness = () => setEffectiveness(EMPTY_SLOT);

  return (
    <ConferenceReviewModalsContext.Provider value={{
      preConference, openPreConference, minimizePreConference, expandPreConference, closePreConference,
      postConference, openPostConference, minimizePostConference, expandPostConference, closePostConference,
      effectiveness, openEffectiveness, minimizeEffectiveness, expandEffectiveness, closeEffectiveness,
    }}>
      {children}
    </ConferenceReviewModalsContext.Provider>
  );
}

export function useConferenceReviewModals() {
  return useContext(ConferenceReviewModalsContext);
}
