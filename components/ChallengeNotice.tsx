'use client';

import { useEffect, useState } from 'react';
import { onChallenge } from '@/lib/apiFetch';

/**
 * Says out loud that the app is being turned away at the edge.
 *
 * Mounted once for the whole app. Every read through lib/apiFetch announces a
 * challenge, so no screen has to know this exists.
 *
 * Why it is worth a banner: a challenged request does not fail in any way the
 * reader can see. It comes back as an empty list, and a list with nothing in
 * it is a perfectly ordinary thing for a screen to show. The complaint this
 * was built from was "no conferences show up in the Go To menu" — the person
 * had learned to read a missing dropdown as a warning sign, which is a job
 * the software should be doing.
 */
export function ChallengeNotice() {
  const [showing, setShowing] = useState(false);

  useEffect(() => onChallenge(() => setShowing(true)), []);

  // Dismissed rather than timed out: it is describing a condition, not an
  // event, and it has no way of learning that the condition has passed.
  if (!showing) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999] flex justify-center px-3 pb-3 pointer-events-none">
      <div className="pointer-events-auto flex items-start gap-3 max-w-md w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg">
        <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">Some data didn&rsquo;t load</p>
          {/* What happened, and the one thing that fixes it. No mention of
              rate limits or firewalls: the reader cannot act on either, and
              reloading is what clears the check. */}
          <p className="text-xs text-amber-800 mt-0.5">
            Your browser is being verified, so parts of this page may be empty or out of date.
            Reloading usually clears it.
          </p>
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => setShowing(false)}
              className="text-xs font-semibold text-amber-800 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
