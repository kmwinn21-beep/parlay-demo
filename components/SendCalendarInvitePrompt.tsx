'use client';

interface Props {
  attendeeName: string;
  onDismiss: () => void;
  onGoogle: () => void;
  onOutlook: () => void;
}

export function SendCalendarInvitePrompt({ attendeeName, onDismiss, onGoogle, onOutlook }: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={onDismiss}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-brand-highlight max-w-sm w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-800">Meeting scheduled!</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Would you like to send a calendar invite to <span className="font-medium text-gray-700">{attendeeName}</span>?
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onGoogle}
            className="btn-secondary text-sm flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Send via Google Calendar
          </button>
          <button
            type="button"
            onClick={onOutlook}
            className="btn-secondary text-sm flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#0A2767" d="M2 6.5A1.5 1.5 0 013.5 5h11A1.5 1.5 0 0116 6.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 012 17.5v-11z" />
              <path fill="#28A8EA" d="M14.5 5H21a1 1 0 011 1v12a1 1 0 01-1 1h-6.5V5z" />
              <path fill="#0078D4" d="M14.5 5H21a1 1 0 011 1v1.5h-7.5V5z" />
              <circle cx="9" cy="11.5" r="3" fill="#fff" />
              <path fill="#0A2767" d="M9 9a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm0 4a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
            </svg>
            Send via Outlook
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors mt-1"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
