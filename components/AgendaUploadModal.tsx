'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: 'in_progress' | 'upcoming' | 'past';
}

type Step = 'select' | 'scanning' | 'success';

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AgendaUploadModal({ onClose, conferenceId, onUploaded }: {
  onClose: () => void;
  /**
   * Opened from inside a conference, so the picker has nothing to ask.
   *
   * Without this the modal opens on "choose a conference" when the reader is
   * already looking at one, which is a question with one right answer and no
   * reason to be asked.
   */
  conferenceId?: number;
  /**
   * The agenda changed. Given by a caller that is already showing it and wants
   * to reload rather than be navigated somewhere it already is.
   */
  onUploaded?: () => void;
}) {
  const router = useRouter();
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [loadingConfs, setLoadingConfs] = useState(true);
  const [selectedConfId, setSelectedConfId] = useState<number | null>(conferenceId ?? null);
  const [step, setStep] = useState<Step>('select');
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [mode, setMode] = useState<'file' | 'url'>('file');
  /**
   * One row per page to read, because a schedule is not always one page.
   *
   * Sites that tab a conference by day often give each day its own URL, and
   * some put each track on its own. Pasting them one at a time would not work:
   * an upload without `append` deletes the agenda first, so the second URL
   * would wipe the first. The rows are sent in order, the first replacing and
   * the rest appending, which is the one arrangement that builds rather than
   * overwrites.
   */
  const [urlInputs, setUrlInputs] = useState<string[]>(['']);
  const [urlError, setUrlError] = useState<string | null>(null);
  /** Which day labels came back, so a page that imported half is visible. */
  const [dayLabels, setDayLabels] = useState<string[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/conferences?nav=1')
      .then(r => (r.ok ? r.json() : []))
      .then((raw: Omit<Conference, 'status'>[]) => {
        const today = new Date().toISOString().slice(0, 10);
        const list: Conference[] = (Array.isArray(raw) ? raw : []).map(c => ({
          ...c,
          status: (c.start_date <= today && c.end_date >= today)
            ? 'in_progress'
            : c.start_date > today
            ? 'upcoming'
            : 'past',
        }));
        setConferences(list);
        // Only guess when nobody has said which conference this is.
        //
        // The caller's conferenceId seeds selectedConfId at mount, and this
        // effect used to overwrite it when the list arrived — so an upload
        // started from a conference's own agenda tab was parsed onto whichever
        // conference happened to be running that week. The picker is hidden on
        // that path, so there was nothing on screen to show the target being
        // changed underneath.
        if (conferenceId) return;
        const active = list.find(c => c.status === 'in_progress');
        const first = list[0];
        if (active) setSelectedConfId(active.id);
        else if (first) setSelectedConfId(first.id);
      })
      .catch(() => {})
      .finally(() => setLoadingConfs(false));
    // conferenceId is read above. It does not change for a given mount — the
    // modal is created fresh each time it opens — but leaving it out of the
    // deps is how the guard above would quietly stop working.
  }, [conferenceId]);

  const handleFile = async (file: File) => {
    if (!selectedConfId) return;
    setError(null);
    const isPdf = file.type === 'application/pdf';
    const maxBytes = isPdf ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File is too large. ${isPdf ? 'PDFs' : 'Images'} must be under ${isPdf ? '20' : '10'} MB.`);
      return;
    }
    setStep('scanning');
    try {
      const image_base64 = await fileToBase64(file);
      const media_type = file.type || 'image/jpeg';
      const res = await fetch(`/api/conferences/${selectedConfId}/agenda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64, media_type }),
      });
      const data = await res.json() as { count?: number; days?: string[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Failed to scan agenda.');
        setStep('select');
        return;
      }
      setCount(data.count ?? 0);
      setDayLabels(data.days ?? []);
      setStep('success');
      onUploaded?.();
    } catch {
      setError('Failed to upload file. Please try again.');
      setStep('select');
    }
  };

  const handleUrl = async () => {
    if (!selectedConfId) return;
    setUrlError(null);
    setError(null);

    const urls = urlInputs.map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) { setUrlError('Please enter a URL.'); return; }
    for (const u of urls) {
      try {
        const p = new URL(u);
        if (p.protocol !== 'http:' && p.protocol !== 'https:') throw new Error();
      } catch {
        setUrlError(`Not a valid http or https URL: ${u}`);
        return;
      }
    }

    setStep('scanning');
    let total = 0;
    const labels: string[] = [];
    try {
      for (let i = 0; i < urls.length; i++) {
        const res = await fetch(`/api/conferences/${selectedConfId}/agenda`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The first replaces what is there; the rest build on it. Without
          // this every URL after the first would delete the ones before it.
          body: JSON.stringify({ url: urls[i], append: i > 0 }),
        });
        const data = await res.json() as { count?: number; days?: string[]; error?: string };
        if (!res.ok) {
          // Partway through is worth saying so: some of it landed, and a bare
          // failure would have the reader assume none of it did.
          setError(i === 0
            ? (data.error ?? 'Failed to import agenda from URL.')
            : `${data.error ?? 'Failed to import'} — page ${i + 1} of ${urls.length}. The ${total} session${total !== 1 ? 's' : ''} before it were saved.`);
          setStep('select');
          return;
        }
        total += data.count ?? 0;
        for (const d of data.days ?? []) if (!labels.includes(d)) labels.push(d);
      }
      setCount(total);
      setDayLabels(labels);
      setStep('success');
      onUploaded?.();
    } catch {
      setError('Failed to connect. Please try again.');
      setStep('select');
    }
  };

  const setUrlAt = (i: number, value: string) => {
    setUrlInputs(prev => prev.map((u, n) => (n === i ? value : u)));
    setUrlError(null);
  };
  const addUrlRow = () => setUrlInputs(prev => [...prev, '']);
  const removeUrlRow = (i: number) => setUrlInputs(prev => prev.filter((_, n) => n !== i));
  const anyUrl = urlInputs.some(u => u.trim());

  const selectedConf = conferences.find(c => c.id === selectedConfId);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-brand-primary font-serif">Upload Agenda</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === 'scanning' ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="w-10 h-10 border-4 border-brand-secondary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-gray-700">Scanning agenda…</p>
              <p className="text-xs text-gray-400">This may take a moment</p>
            </div>
          ) : step === 'success' ? (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Agenda uploaded successfully</p>
                <p className="text-xs text-gray-500 mt-1">
                  {count} session{count !== 1 ? 's' : ''} added
                  {selectedConf ? ` to ${selectedConf.name}` : ''}
                </p>
                {/* A schedule that imported Monday only returns a perfectly
                    healthy count. Naming the days is what makes the gap
                    visible now rather than at the conference. */}
                {dayLabels.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {dayLabels.length} day{dayLabels.length !== 1 ? 's' : ''}: {dayLabels.join(', ')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Conference selector. Hidden when the caller already named
                  one: asking which conference while somebody is looking at it
                  is a question with a single right answer. */}
              <div className={conferenceId ? 'hidden' : 'mb-5'}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Conference
                </label>
                {loadingConfs ? (
                  <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                ) : conferences.length === 0 ? (
                  <p className="text-sm text-gray-400">No conferences found.</p>
                ) : (
                  <select
                    value={selectedConfId ?? ''}
                    onChange={e => setSelectedConfId(Number(e.target.value))}
                    className="input-field text-sm w-full"
                  >
                    {conferences.some(c => c.status === 'in_progress') && (
                      <optgroup label="In Progress">
                        {conferences.filter(c => c.status === 'in_progress').map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {conferences.some(c => c.status === 'upcoming') && (
                      <optgroup label="Upcoming">
                        {conferences.filter(c => c.status === 'upcoming')
                          .sort((a, b) => a.start_date.localeCompare(b.start_date))
                          .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                    )}
                    {conferences.some(c => c.status === 'past') && (
                      <optgroup label="Past">
                        {conferences.filter(c => c.status === 'past')
                          .sort((a, b) => b.start_date.localeCompare(a.start_date))
                          .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                )}
              </div>

              {/* Tab switcher */}
              <div className="flex border border-gray-200 rounded-xl overflow-hidden mb-4">
                <button
                  type="button"
                  onClick={() => { setMode('file'); setUrlError(null); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    mode === 'file' ? 'bg-brand-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('url'); setError(null); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    mode === 'url' ? 'bg-brand-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  From Link
                </button>
              </div>

              {/* Upload zone */}
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center gap-3 text-center">
                {mode === 'file' ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Upload a photo, screenshot, or PDF</p>
                      <p className="text-xs text-gray-400 mt-0.5">Images up to 10 MB · PDFs up to 20 MB</p>
                    </div>
                    <div className="flex gap-3 w-full mt-1">
                      <button
                        type="button"
                        disabled={!selectedConfId || loadingConfs}
                        onClick={() => cameraRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-brand-secondary hover:text-brand-secondary hover:bg-blue-50/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Take Photo
                      </button>
                      <button
                        type="button"
                        disabled={!selectedConfId || loadingConfs}
                        onClick={() => fileRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-primary text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Upload
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Paste the URL of the conference agenda page</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        If the schedule is split across day tabs, add each day&rsquo;s URL as its own page
                      </p>
                    </div>
                    <div className="w-full flex flex-col gap-2">
                      {urlInputs.map((value, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="url"
                            className="input-field w-full text-sm"
                            placeholder={i === 0 ? 'https://example.com/agenda' : 'https://example.com/agenda?day=2'}
                            value={value}
                            onChange={e => setUrlAt(i, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void handleUrl(); }}
                          />
                          {urlInputs.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeUrlRow(i)}
                              aria-label={`Remove page ${i + 1}`}
                              className="flex-shrink-0 p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {/* The one arrangement that builds rather than
                          overwrites: the first page replaces, the rest add. */}
                      <button
                        type="button"
                        onClick={addUrlRow}
                        className="self-start flex items-center gap-1.5 text-xs font-medium text-brand-secondary hover:underline"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add another page
                      </button>
                      {urlError && (
                        <p className="text-xs text-red-600 text-left">{urlError}</p>
                      )}
                      <button
                        type="button"
                        disabled={!selectedConfId || loadingConfs || !anyUrl}
                        onClick={() => void handleUrl()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-primary text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Scan Agenda
                      </button>
                    </div>
                  </>
                )}
              </div>

              {error && (
                <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step !== 'scanning' && (
          <div className="flex justify-end gap-2 px-6 pb-5">
            {step === 'success' ? (
              <>
                <button type="button" onClick={onClose} className="btn-secondary text-sm">
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`/conferences/${selectedConfId}?tab=agenda`);
                  }}
                  className="btn-primary text-sm"
                >
                  View Agenda
                </button>
              </>
            ) : (
              <button type="button" onClick={onClose} className="btn-secondary text-sm">
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,image/heic,application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
      />
    </div>
  );
}
