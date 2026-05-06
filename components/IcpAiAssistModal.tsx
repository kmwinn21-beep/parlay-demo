'use client';

import { useState, useRef, useEffect } from 'react';

export interface AiItem {
  title: string;
  description: string;
}

interface Props {
  onClose: () => void;
  onResult: (painPoints: AiItem[], triggerEvents: AiItem[]) => void;
}

const MAX_LINKS = 5;
const MAX_FILES = 5;

export function IcpAiAssistModal({ onClose, onResult }: Props) {
  const [links, setLinks] = useState<string[]>(['']);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ remaining: number; limit: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/admin/icp-ai-assist')
      .then(r => r.json())
      .then((d: { remaining: number; limit: number }) => setUsage(d))
      .catch(() => {});
  }, []);

  const addLink = () => {
    if (links.length < MAX_LINKS) setLinks(prev => [...prev, '']);
  };

  const updateLink = (i: number, val: string) => {
    setLinks(prev => prev.map((l, idx) => idx === i ? val : l));
  };

  const removeLink = (i: number) => {
    setLinks(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles(prev => {
      const combined = [...prev, ...selected];
      return combined.slice(0, MAX_FILES);
    });
    e.target.value = '';
  };

  const removeFile = (i: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async () => {
    setError(null);
    const validLinks = links.filter(l => l.trim());
    if (validLinks.length === 0 && files.length === 0) {
      setError('Please add at least one link or upload a document.');
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      validLinks.forEach(l => fd.append('links', l.trim()));
      files.forEach(f => fd.append('files', f));

      const res = await fetch('/api/admin/icp-ai-assist', { method: 'POST', body: fd });
      const data = await res.json() as {
        painPoints?: AiItem[];
        triggerEvents?: AiItem[];
        remaining?: number;
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? 'Analysis failed. Please try again.');
        return;
      }

      if (data.remaining !== undefined) {
        setUsage(prev => prev ? { ...prev, remaining: data.remaining! } : null);
      }

      onResult(data.painPoints ?? [], data.triggerEvents ?? []);
      onClose();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const atLimit = usage?.remaining === 0;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L12.4 7.2L18 8.1L14 12L15 17.6L10 15L5 17.6L6 12L2 8.1L7.6 7.2L10 2Z" fill="#34D399" stroke="#059669" strokeWidth="1" strokeLinejoin="round" />
              </svg>
              <h2 className="text-base font-bold text-gray-900">Analyze with Parlay AI</h2>
            </div>
            <p className="text-sm text-gray-500">Add links or upload documents to generate pain points and trigger events.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-5">

          {/* Links */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Links</label>
              {links.length < MAX_LINKS && (
                <button type="button" onClick={addLink}
                  className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Link
                </button>
              )}
            </div>
            <div className="space-y-2">
              {links.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={link}
                    onChange={e => updateLink(i, e.target.value)}
                    placeholder="https://example.com"
                    className="input-field text-sm flex-1"
                  />
                  {links.length > 1 && (
                    <button type="button" onClick={() => removeLink(i)} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Add your website, product pages, or any public URLs (up to {MAX_LINKS}).</p>
          </div>

          {/* Documents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Documents</label>
              <span className="text-xs text-gray-400">{files.length}/{MAX_FILES}</span>
            </div>

            {files.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="flex-1 truncate text-gray-700">{f.name}</span>
                    <span className="text-gray-400 text-xs flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {files.length < MAX_FILES && (
              <>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-lg py-3 px-4 text-sm text-gray-500 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/30 transition-colors flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Upload documents
                </button>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileChange} className="hidden" />
              </>
            )}
            <p className="text-xs text-gray-400 mt-1.5">Upload case studies, pitch decks, marketing materials, or product one-pagers (PDF or image, up to {MAX_FILES}).</p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-400">
            {usage ? (
              atLimit
                ? <span className="text-amber-600 font-medium">Monthly limit reached. Resets on the 1st.</span>
                : <span><span className="font-medium text-gray-600">{usage.remaining}</span> of {usage.limit} analyses remaining this month</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || atLimit}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Analyzing…
                </>
              ) : 'Analyze'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
