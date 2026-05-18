'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { MeetingNotetaker } from '@/components/MeetingNotetaker';

interface Props {
  meetingId: number | null;
  onClose: () => void;
}

export function MeetingNotesDrawer({ meetingId, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [meetingLabel, setMeetingLabel] = useState('Meeting Notes');
  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);

  const handleClose = useCallback(() => {
    if (isAnalysisRunning) {
      toast('Analysis is running in the background. You\'ll receive a notification when it\'s complete.', { icon: '⏳', duration: 6000 });
    }
    onClose();
  }, [isAnalysisRunning, onClose]);

  useEffect(() => { setMounted(true); }, []);

  // Reset minimize state when a new meeting is opened
  useEffect(() => {
    if (meetingId) setMinimized(false);
  }, [meetingId]);

  if (!mounted || !meetingId) return null;

  return createPortal(
    <>
      {/* Overlay — click minimizes, not closes */}
      <div
        className={`fixed inset-0 z-[499] bg-black/50 transition-opacity duration-200 ${minimized ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        onClick={() => setMinimized(true)}
      />

      {/* Modal panel — always mounted to preserve recording state */}
      <div
        className={`fixed inset-0 z-[500] flex items-center justify-center p-3 pointer-events-none transition-all duration-200 ${minimized ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
        style={{ visibility: minimized ? 'hidden' : 'visible' }}
      >
        <div
          className="pointer-events-auto flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-5xl h-full"
          onClick={e => e.stopPropagation()}
        >
          <MeetingNotetaker
            meetingId={meetingId}
            onClose={handleClose}
            onRecordingStateChange={setIsRecording}
            onMeetingLoaded={setMeetingLabel}
            onAnalysisStateChange={setIsAnalysisRunning}
          />
        </div>
      </div>

      {/* Minimized pill bar — no close button */}
      {minimized && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-3 bg-brand-accent/20 border border-brand-accent text-brand-primary rounded-full shadow-xl px-5 py-3 cursor-pointer hover:shadow-2xl transition-shadow select-none"
          onClick={() => setMinimized(false)}
        >
          {isRecording && (
            <span className="flex items-center gap-1.5 text-xs text-red-500 font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              REC
            </span>
          )}
          <span className="text-sm font-medium max-w-xs truncate">{meetingLabel}</span>
          <svg className="w-4 h-4 flex-shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </div>
      )}
    </>,
    document.body
  );
}
