'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface AgendaItem {
  id: number;
  start_time: string | null;
  end_time: string | null;
  session_type: string | null;
  title: string;
  description: string | null;
  location: string | null;
}

interface AgendaDay {
  day_label: string;
  items: AgendaItem[];
}

interface Props {
  conferenceId: number;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const SESSION_TYPE_COLORS: Record<string, string> = {
  keynote: 'bg-purple-100 text-purple-700',
  workshop: 'bg-blue-100 text-blue-700',
  panel: 'bg-amber-100 text-amber-700',
  break: 'bg-gray-100 text-gray-500',
  networking: 'bg-green-100 text-green-700',
  reception: 'bg-pink-100 text-pink-700',
  lunch: 'bg-orange-100 text-orange-700',
  breakfast: 'bg-orange-100 text-orange-700',
  dinner: 'bg-rose-100 text-rose-700',
};

function sessionTypeBadgeClass(type: string | null): string {
  if (!type) return '';
  const key = type.toLowerCase();
  for (const [pattern, cls] of Object.entries(SESSION_TYPE_COLORS)) {
    if (key.includes(pattern)) return cls;
  }
  return 'bg-gray-100 text-gray-600';
}

export function AgendaTab({ conferenceId }: Props) {
  const [days, setDays] = useState<AgendaDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAgenda = useCallback(async () => {
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/agenda`);
      if (!res.ok) throw new Error('Failed to load agenda');
      const data = await res.json() as { days: AgendaDay[] };
      setDays(data.days ?? []);
      setExpandedDays(new Set((data.days ?? []).map(d => d.day_label)));
    } catch {
      setError('Could not load agenda.');
    } finally {
      setLoading(false);
    }
  }, [conferenceId]);

  useEffect(() => { void fetchAgenda(); }, [fetchAgenda]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setScanning(true);
    try {
      const image_base64 = await fileToBase64(file);
      const media_type = file.type || 'image/jpeg';
      const res = await fetch(`/api/conferences/${conferenceId}/agenda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64, media_type }),
      });
      const data = await res.json() as { count?: number; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Failed to scan agenda');
        return;
      }
      await fetchAgenda();
    } catch {
      setError('Failed to scan image. Please try again.');
    } finally {
      setScanning(false);
    }
  }, [conferenceId, fetchAgenda]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const handleClear = useCallback(async () => {
    setConfirmClear(false);
    try {
      await fetch(`/api/conferences/${conferenceId}/agenda`, { method: 'DELETE' });
      setDays([]);
      setExpandedDays(new Set());
    } catch {
      setError('Failed to clear agenda.');
    }
  }, [conferenceId]);

  const toggleDay = useCallback((label: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[rgb(var(--foreground-muted))]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
        Loading agenda…
      </div>
    );
  }

  const hasAgenda = days.length > 0;

  return (
    <div className="space-y-4">
      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,image/heic"
        className="hidden"
        onChange={handleInputChange}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-600">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {scanning && (
        <div className="flex items-center gap-3 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-raised))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[rgb(var(--brand))] border-t-transparent" />
          Scanning agenda image with AI…
        </div>
      )}

      {!hasAgenda && !scanning ? (
        /* ── Empty state ─────────────────────────────────────────────────── */
        <div className="flex flex-col items-center justify-center gap-6 rounded-xl border-2 border-dashed border-[rgb(var(--border))] px-8 py-16 text-center">
          <div className="rounded-full bg-[rgb(var(--surface-raised))] p-4">
            <svg className="h-8 w-8 text-[rgb(var(--foreground-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <div>
            <p className="text-base font-medium text-[rgb(var(--foreground))]">No agenda yet</p>
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              Upload a photo or screenshot of the conference agenda and AI will parse it automatically.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => cameraRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-raised))] transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Take Photo
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--brand))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Image
            </button>
          </div>
        </div>
      ) : hasAgenda ? (
        /* ── Loaded agenda ───────────────────────────────────────────────── */
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              {days.length} day{days.length !== 1 ? 's' : ''} · {days.reduce((n, d) => n + d.items.length, 0)} sessions
            </p>
            <div className="flex items-center gap-2">
              {!scanning && (
                <>
                  <button
                    onClick={() => cameraRef.current?.click()}
                    title="Re-scan with camera"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface-raised))] transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Re-scan
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    title="Upload image"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface-raised))] transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload
                  </button>
                  {confirmClear ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[rgb(var(--foreground-muted))]">Clear all?</span>
                      <button
                        onClick={() => void handleClear()}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmClear(false)}
                        className="rounded px-2 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface-raised))] transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmClear(true)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Day sections */}
          {days.map(day => {
            const isExpanded = expandedDays.has(day.day_label);
            return (
              <div
                key={day.day_label}
                className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] overflow-hidden"
              >
                {/* Day header */}
                <button
                  onClick={() => toggleDay(day.day_label)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[rgb(var(--surface-raised))] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-[rgb(var(--foreground-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {isExpanded
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      }
                    </svg>
                    <span className="text-sm font-semibold text-[rgb(var(--foreground))]">{day.day_label}</span>
                  </div>
                  <span className="text-xs text-[rgb(var(--foreground-muted))]">
                    {day.items.length} session{day.items.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {/* Items */}
                {isExpanded && (
                  <div className="divide-y divide-[rgb(var(--border))] border-t border-[rgb(var(--border))]">
                    {day.items.map(item => (
                      <div key={item.id} className="flex gap-3 px-4 py-3">
                        {/* Time column */}
                        <div className="w-28 shrink-0 pt-0.5">
                          {(item.start_time || item.end_time) && (
                            <p className="text-xs tabular-nums text-[rgb(var(--foreground-muted))] leading-relaxed">
                              {item.start_time ?? ''}
                              {item.start_time && item.end_time ? <><br />–&nbsp;{item.end_time}</> : item.end_time ?? ''}
                            </p>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-start gap-2 mb-0.5">
                            {item.session_type && (
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${sessionTypeBadgeClass(item.session_type)}`}>
                                {item.session_type}
                              </span>
                            )}
                            <p className="text-sm font-medium text-[rgb(var(--foreground))] leading-snug">{item.title}</p>
                          </div>
                          {item.description && (
                            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))] leading-relaxed">{item.description}</p>
                          )}
                          {item.location && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
                              <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              {item.location}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
