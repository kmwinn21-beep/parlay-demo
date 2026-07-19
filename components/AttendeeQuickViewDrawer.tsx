'use client';

import { useDrawerResize } from '@/lib/useDrawerResize';

// Same iframe-embed quick view pattern used in components/AttendeeTable.tsx —
// extracted here so it can be triggered from other tables (e.g. the outreach
// tab) without duplicating the drawer chrome.
export function AttendeeQuickViewDrawer({
  attendeeId,
  onClose,
}: {
  attendeeId: number;
  onClose: () => void;
}) {
  const { panelStyle, handleResizeStart } = useDrawerResize(480);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div
        className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[90vh] sm:h-auto w-full sm:w-[480px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none z-50"
        style={panelStyle}
      >
        <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={handleResizeStart}>
          <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <a
            href={`/attendees/${attendeeId}`}
            className="text-xs text-brand-secondary hover:underline font-medium"
          >
            Go to Attendee Record →
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <iframe
          src={`/attendees/${attendeeId}?embed=true`}
          className="flex-1 w-full border-0"
          title="Quick View"
        />
      </div>
    </>
  );
}
