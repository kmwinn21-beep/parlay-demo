'use client';

import { useState } from 'react';
import Link from 'next/link';
import AttendeesTooltip from './AttendeesTooltip';

interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  internal_attendees: string[];
  attendee_count: number;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AwaitingUploadModal({ conferences }: { conferences: Conference[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        title="Upcoming Awaiting List Upload"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center justify-center w-9 h-9 md:w-auto md:h-auto md:gap-2 md:px-3 md:py-1.5 rounded-full md:rounded-full border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors text-amber-600"
      >
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z" />
        </svg>
        <span className="hidden md:inline text-xs font-medium text-amber-700">Conferences Awaiting Upload</span>
        {conferences.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 md:static md:inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-amber-500 rounded-full">
            {conferences.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-20 md:pb-4">
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl border border-brand-highlight w-full max-w-lg max-h-[70vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-lg font-semibold text-brand-primary font-serif flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z" />
                </svg>
                Upcoming Conferences Awaiting List Upload
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto px-6 py-4 flex-1">
              {conferences.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">All upcoming conferences have attendee lists uploaded.</p>
              ) : (
                <div className="space-y-3">
                  {conferences.map((conf) => {
                    const today = new Date().toISOString().slice(0, 10);
                    const isActive = conf.start_date <= today && conf.end_date >= today;
                    return (
                      <Link
                        key={conf.id}
                        href={`/conferences/${conf.id}`}
                        onClick={() => setOpen(false)}
                        className="flex p-4 rounded-xl border hover:shadow-md transition-all hover:border-brand-secondary group"
                        style={{ borderColor: isActive ? '#1B76BC' : undefined }}
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {isActive && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-secondary mb-2">
                                  <span className="w-2 h-2 rounded-full bg-brand-secondary animate-pulse" />
                                  In Progress
                                </span>
                              )}
                              <p className="font-semibold text-gray-800 group-hover:text-brand-secondary transition-colors leading-tight">{conf.name}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                {formatDate(conf.start_date)}
                                {conf.end_date && conf.end_date !== conf.start_date ? ` – ${formatDate(conf.end_date)}` : ''}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">{conf.location}</p>
                            </div>
                            {conf.internal_attendees.length > 0 && (
                              <AttendeesTooltip attendees={conf.internal_attendees} align="right" />
                            )}
                          </div>
                          <div className="mt-3">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z" />
                              </svg>
                              Awaiting Upload
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center flex-shrink-0">
                          <svg className="w-4 h-4 text-gray-300 group-hover:text-brand-secondary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
