'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [modalWidth, setModalWidth] = useState(960);
  const isResizingRef = useRef(false);

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

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    const startX = e.clientX;
    const startWidth = modalWidth;
    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.max(680, Math.min(startWidth + (ev.clientX - startX), window.innerWidth - 24));
      setModalWidth(newWidth);
    };
    const onMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [modalWidth]);

  const handleLeftResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = modalWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX; // drag left = wider
      setModalWidth(Math.max(400, Math.min(1200, startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [modalWidth]);

  // Drives the rise on open: the panel starts below the edge and is released
  // a frame later, so the browser has something to animate from.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!mounted || !meetingId) { setEntered(false); return; }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [mounted, meetingId]);

  if (!mounted || !meetingId) return null;

  return createPortal(
    <>
      {/* Mobile-only slide-up entrance — can't reuse the shared
          .drawer-mobile-responsive class since its sm+ variant slides in
          from the right, which would fight this drawer's centered desktop
          modal (unlike other drawers, this one isn't a right-edge panel
          on desktop). */}
      <style>{`
        /* Mobile bottom sheet geometry. The panel is deliberately overshot
           past the bottom edge (bottom: -2.5rem plus matching padding) so no
           backdrop or rounded corner can peek out beneath it — iOS reports a
           layout viewport that disagrees with the visible one as the URL bar
           collapses, which is what left the gap before. dvh is declared after
           the vh fallback so older browsers keep the vh value. */
        .meeting-notes-mobile-sheet {
          bottom: -2.5rem;
          height: calc(94vh + 2.5rem);
          height: calc(94dvh + 2.5rem);
          padding-bottom: 2.5rem;
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
        }
        @media (min-width: 640px) {
          .meeting-notes-mobile-sheet {
            position: static;
            bottom: auto;
            height: 100%;
            padding-bottom: 0;
          }
        }
      `}</style>

      {/* Overlay — click minimizes, not closes */}
      <div
        className={`fixed inset-0 z-[499] bg-black/50 transition-opacity duration-200 ${minimized ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        onClick={() => setMinimized(true)}
      />

      {/* Modal panel — always mounted to preserve recording state.
          Mobile: full-bleed bottom sheet sliding up, rounded top corners
          only, sized past the bottom edge so nothing shows behind it (see
          .meeting-notes-mobile-sheet above). Desktop (sm+): unchanged
          centered, resizable modal. */}
      <div
        className={`fixed inset-0 z-[500] pointer-events-none transition-transform duration-200 ease-out sm:flex sm:items-end sm:justify-center sm:px-3 sm:pt-3 ${
          minimized || !entered ? 'translate-y-full' : 'translate-y-0'
        }`}
      >
        <div
          className="meeting-notes-mobile-sheet pointer-events-auto flex flex-col bg-white shadow-2xl overflow-hidden relative fixed left-0 right-0 w-full rounded-t-2xl sm:static sm:h-full sm:rounded-b-none sm:rounded-t-2xl"
          style={{ width: window.innerWidth >= 640 ? Math.min(modalWidth, window.innerWidth - 24) : undefined }}
          onClick={e => e.stopPropagation()}
        >
          {/* Left-edge resize handle */}
          <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={handleLeftResizeMouseDown}>
            <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
          </div>
          <MeetingNotetaker
            meetingId={meetingId}
            onClose={handleClose}
            onRecordingStateChange={setIsRecording}
            onMeetingLoaded={setMeetingLabel}
            onAnalysisStateChange={setIsAnalysisRunning}
          />
          {/* Right-edge resize handle */}
          <div
            className="hidden sm:block absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-10 hover:bg-brand-secondary/30 transition-colors rounded-r-xl"
            onMouseDown={handleResizeMouseDown}
          />
        </div>
      </div>

      {/* The bar it collapses into — the messaging bar's shape, riding the
          bottom edge so the panel appears to fold down into it. Kept mounted
          so the two movements can cross. */}
      <div
        className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-[500] transition-transform duration-200 ease-out ${
          minimized ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
      >
        <div
          className="flex items-center gap-2.5 bg-white border border-b-0 border-gray-200 text-gray-800 rounded-t-xl shadow-lg pl-4 pr-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors select-none"
          onClick={() => setMinimized(false)}
        >
          {isRecording && (
            <span className="flex items-center gap-1.5 text-xs text-red-500 font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              REC
            </span>
          )}
          <span className="text-sm font-semibold max-w-xs truncate">{meetingLabel}</span>
          <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </div>
      </div>
    </>,
    document.body
  );
}
