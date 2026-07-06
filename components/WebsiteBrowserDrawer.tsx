'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDrawerResize } from '@/lib/useDrawerResize';

interface Props {
  url: string;
  onClose: () => void;
}

// How long to wait for the iframe's load event before assuming the site has
// blocked in-app embedding (e.g. via X-Frame-Options/CSP frame-ancestors).
// Cross-origin iframes give no reliable JS signal for that failure mode, so
// a timeout heuristic is the best available fallback.
const LOAD_TIMEOUT_MS = 6000;

function normalizeUrl(url: string): string {
  return url.startsWith('http') ? url : `https://${url}`;
}

function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

export function WebsiteBrowserDrawer({ url, onClose }: Props) {
  const { panelStyle, handleResizeStart } = useDrawerResize(600);
  const fullUrl = normalizeUrl(url);
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoaded(false);
    setBlocked(false);
    timeoutRef.current = setTimeout(() => setBlocked(true), LOAD_TIMEOUT_MS);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [fullUrl]);

  const handleLoad = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoaded(true);
  };

  const content = (
    <div className="fixed inset-0 z-50">
      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer panel */}
      <div
        className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[90vh] sm:h-auto w-full sm:w-[600px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none z-50"
        style={panelStyle}
      >
        <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={handleResizeStart}>
          <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-800 truncate" title={fullUrl}>{hostnameOf(fullUrl)}</h3>
            <p className="text-xs text-gray-500">Website</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in new tab"
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative flex-1 min-h-0">
          {!blocked && (
            <iframe
              src={fullUrl}
              onLoad={handleLoad}
              className="absolute inset-0 w-full h-full border-0"
              title={hostnameOf(fullUrl)}
            />
          )}

          {!loaded && !blocked && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
            </div>
          )}

          {blocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-white">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm font-medium text-gray-600">This site can&apos;t be displayed in-app.</p>
              <p className="text-xs text-gray-400 max-w-xs">Some websites block being shown inside another page for security reasons. You can open it in a new tab instead.</p>
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-sm mt-1"
              >
                Open in new tab
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
