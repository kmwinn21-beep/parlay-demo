'use client';

import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { useUnitTypeLabel } from '@/lib/useUnitTypeLabel';

interface UploadRecord {
  id: number;
  uploadedAt: string;
  fileName: string;
  fileSize: number | null;
  rowCount: number | null;
  status: 'active' | 'archived';
  uploadMode: 'replace' | 'merge';
  uploadedByName: string | null;
  columnMapping: Record<string, string>;
  notes: string | null;
}

interface AccountRecord {
  id: number;
  companyName: string;
  website: string | null;
  domain: string | null;
  assignedRepId: number | null;
  assignedRepName: string | null;
  hqState: string | null;
  territoryId: number | null;
  territoryName: string | null;
  entityStructure: string | null;
  services: string | null;
  wse: number | null;
}

interface ColumnMapping {
  companyName?: string;
  website?: string;
  assignedRep?: string;
  hqState?: string;
  territory?: string;
  entityStructure?: string;
  services?: string;
  units?: string;
}

interface UploadResult {
  uploadId: number;
  rowCount: number;
  resolvedReps: number;
  unresolvedReps: number;
  unresolvedRepNames: string[];
  uploadMode: 'replace' | 'merge';
  mergeStats?: { added: number; updated: number; unchanged: number };
}

type UploadStep = 'idle' | 'mapping' | 'mode' | 'uploading' | 'complete';

const PAGE_SIZE = 50;
const LARGE_LIST_THRESHOLD = 500;

function getMappingFields(unitLabel: string): { key: keyof ColumnMapping; label: string; required: boolean }[] {
  return [
    { key: 'companyName', label: 'Company name', required: true },
    { key: 'website', label: 'Website', required: false },
    { key: 'assignedRep', label: 'Assigned rep', required: false },
    { key: 'hqState', label: 'HQ state', required: false },
    { key: 'territory', label: 'Territory', required: false },
    { key: 'entityStructure', label: 'Entity structure', required: false },
    { key: 'services', label: 'Services', required: false },
    { key: 'units', label: unitLabel, required: false },
  ];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function MasterAccountsTab() {
  const unitLabel = useUnitTypeLabel();
  const mappingFields = getMappingFields(unitLabel);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [totalActiveRecords, setTotalActiveRecords] = useState(0);
  const [records, setRecords] = useState<AccountRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [allRecordsCache, setAllRecordsCache] = useState<AccountRecord[] | null>(null);

  const [uploadStep, setUploadStep] = useState<UploadStep>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedPreviewRows, setParsedPreviewRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [uploadMode, setUploadMode] = useState<'replace' | 'merge'>('merge');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasActiveUpload = uploads.some(u => u.status === 'active');
  const isLargeList = totalActiveRecords >= LARGE_LIST_THRESHOLD;

  const fetchUploads = async () => {
    try {
      const res = await fetch('/api/admin/master-accounts');
      if (!res.ok) return;
      const data = await res.json() as { uploads: UploadRecord[]; activeUploadId: number | null; totalActiveRecords: number };
      setUploads(data.uploads);
      setTotalActiveRecords(data.totalActiveRecords);
    } catch {
      toast.error('Failed to load upload history');
    }
  };

  useEffect(() => { fetchUploads(); }, []);

  // Debounce the search box — 300ms, then reset to page 1.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  // Small active lists: fetch every page once into a client-side cache and
  // filter/paginate in memory. Large lists: page/search hit the server directly.
  useEffect(() => {
    if (isLargeList) { setAllRecordsCache(null); return; }
    let cancelled = false;
    (async () => {
      const pages = Math.max(1, Math.ceil(totalActiveRecords / PAGE_SIZE));
      const all: AccountRecord[] = [];
      for (let p = 1; p <= pages; p++) {
        const res = await fetch(`/api/admin/master-accounts/records?page=${p}`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { records: AccountRecord[]; total: number };
        all.push(...data.records);
      }
      if (!cancelled) setAllRecordsCache(all);
    })();
    return () => { cancelled = true; };
  }, [isLargeList, totalActiveRecords]);

  useEffect(() => {
    if (isLargeList || allRecordsCache == null) return;
    const term = debouncedSearch.trim().toLowerCase();
    const filtered = term
      ? allRecordsCache.filter(r => [r.companyName, r.domain, r.assignedRepName, r.hqState, r.territoryName, r.entityStructure, r.services].some(v => (v ?? '').toLowerCase().includes(term)))
      : allRecordsCache;
    setRecordsTotal(filtered.length);
    setRecords(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
  }, [isLargeList, allRecordsCache, debouncedSearch, page]);

  useEffect(() => {
    if (!isLargeList) return;
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const res = await fetch(`/api/admin/master-accounts/records?${params}`);
      if (!res.ok || cancelled) return;
      const data = await res.json() as { records: AccountRecord[]; total: number };
      setRecords(data.records);
      setRecordsTotal(data.total);
    })();
    return () => { cancelled = true; };
  }, [isLargeList, page, debouncedSearch]);

  // ── Upload workflow ──────────────────────────────────────────────────────

  const resetUploadState = () => {
    setUploadStep('idle');
    setSelectedFile(null);
    setParsedHeaders([]);
    setParsedPreviewRows([]);
    setColumnMapping({});
    setUploadMode('merge');
    setUploadResult(null);
    setUploadError(null);
    setShowUnresolved(false);
  };

  const handleFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      // Same options as lib/parsers.ts's server-side extractRawRows (defval/raw)
      // so header strings match 1:1 between this client preview and what the
      // server parses — the mapped values sent to the API are these header names.
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
      if (rows.length === 0) {
        toast.error('No rows found in that file');
        return;
      }
      const headers = Object.keys(rows[0]);
      const previewRows = rows.slice(0, 10).map(r => headers.map(h => String(r[h] ?? '')));
      setSelectedFile(file);
      setParsedHeaders(headers);
      setParsedPreviewRows(previewRows);
      setColumnMapping({});
      setUploadStep('mapping');
    } catch {
      toast.error('Failed to read that file — is it a valid CSV or Excel file?');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const cellFor = (row: string[], headerName?: string): string => {
    if (!headerName) return '';
    const idx = parsedHeaders.indexOf(headerName);
    return idx >= 0 ? row[idx] ?? '' : '';
  };

  const fireUpload = async () => {
    if (!selectedFile) return;
    setUploadStep('uploading');
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('columnMapping', JSON.stringify(columnMapping));
      fd.append('uploadMode', hasActiveUpload ? uploadMode : 'replace');
      const res = await fetch('/api/admin/master-accounts/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      setUploadResult(data as UploadResult);
      setUploadStep('complete');
      await fetchUploads();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleContinueFromMapping = () => {
    if (hasActiveUpload) {
      setUploadStep('mode');
    } else {
      fireUpload();
    }
  };

  const handleArchive = async (uploadId: number) => {
    const prevUploads = uploads;
    setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: 'archived' } : u));
    try {
      const res = await fetch(`/api/admin/master-accounts/uploads/${uploadId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await fetchUploads();
    } catch {
      setUploads(prevUploads);
      toast.error('Failed to archive upload');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-brand-primary font-serif">Master Accounts</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload a company/territory account list to bulk-set assigned reps. Each upload is tracked
          with a full history — replace the active list entirely, or merge in updates from a new file.
        </p>
      </div>

      {/* ── Upload workflow ── */}
      <div className="border border-gray-200 rounded-xl p-4">
        {uploadStep === 'idle' && (
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            style={{
              border: '0.5px dashed var(--border-strong, #9CA3AF)',
              borderRadius: 12, padding: '24px 16px', textAlign: 'center',
              background: isDragging ? 'var(--bg-accent, #EFF6FF)' : 'var(--surface-1, #F9FAFB)',
              cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg style={{ width: 24, height: 24, color: 'var(--text-muted, #9CA3AF)', display: 'block', margin: '0 auto 8px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 4px', color: 'var(--text-primary, #111827)' }}>
              Drop your account list here or browse
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted, #9CA3AF)', margin: 0 }}>
              CSV or Excel (.xlsx) · Company name, website, assigned rep, territory, entity structure, services, {unitLabel.toLowerCase()}, HQ state
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
          </div>
        )}

        {uploadStep === 'mapping' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Map columns — {selectedFile?.name}</p>
            </div>
            <div className="space-y-2">
              {mappingFields.map(field => (
                <div key={field.key} className="flex items-center gap-3">
                  <div style={{ width: 140, flexShrink: 0 }} className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-700">{field.label}</span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={field.required
                        ? { background: 'var(--bg-warning, #FFFBEB)', color: 'var(--text-warning, #B45309)', border: '0.5px solid var(--border-warning, #FDE68A)' }
                        : { background: 'var(--surface-1, #F9FAFB)', color: 'var(--text-muted, #9CA3AF)', border: '0.5px solid var(--border, #E5E7EB)' }}
                    >
                      {field.required ? 'Required' : 'Optional'}
                    </span>
                  </div>
                  <select
                    value={columnMapping[field.key] ?? ''}
                    onChange={e => setColumnMapping(prev => ({ ...prev, [field.key]: e.target.value || undefined }))}
                    className="input-field text-xs flex-1 py-1.5"
                  >
                    <option value="">— not mapped —</option>
                    {parsedHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Live preview — updates as mapping selects change */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Preview</p>
              {mappingFields.some(f => columnMapping[f.key]) ? (
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {mappingFields.filter(f => columnMapping[f.key]).map(f => (
                          <th key={f.key} className="px-2.5 py-1.5 text-left font-medium text-gray-500 whitespace-nowrap">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedPreviewRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          {mappingFields.filter(f => columnMapping[f.key]).map(f => (
                            <td key={f.key} className="px-2.5 py-1.5 text-gray-700 truncate max-w-[200px]">{cellFor(row, columnMapping[f.key])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Map at least one column to see a preview.</p>
              )}
            </div>

            {uploadError && (
              <p style={{ fontSize: 12, color: 'var(--text-danger, #B91C1C)' }}>{uploadError}</p>
            )}

            <div className="flex items-center gap-2">
              <button type="button" onClick={resetUploadState} className="btn-secondary text-xs px-3 py-1.5">Back</button>
              <button
                type="button"
                onClick={handleContinueFromMapping}
                disabled={!columnMapping.companyName}
                className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {uploadStep === 'mode' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-gray-700">How should this file be applied?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{
                display: 'flex', gap: 10, padding: '12px 14px', border: '0.5px solid', borderRadius: 8, cursor: 'pointer',
                borderColor: uploadMode === 'merge' ? 'var(--border-accent, #93C5FD)' : 'var(--border, #E5E7EB)',
                background: uploadMode === 'merge' ? 'var(--bg-accent, #EFF6FF)' : 'var(--surface-2, #fff)',
              }}>
                <input type="radio" value="merge" checked={uploadMode === 'merge'} onChange={() => setUploadMode('merge')} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 2px' }}>Keep and update existing list</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary, #6B7280)', margin: 0 }}>
                    New companies are added. Existing companies are updated where values differ. Companies not in this file are left unchanged.
                  </p>
                </div>
              </label>
              <label style={{
                display: 'flex', gap: 10, padding: '12px 14px', border: '0.5px solid', borderRadius: 8, cursor: 'pointer',
                borderColor: uploadMode === 'replace' ? 'var(--border-accent, #93C5FD)' : 'var(--border, #E5E7EB)',
                background: uploadMode === 'replace' ? 'var(--bg-accent, #EFF6FF)' : 'var(--surface-2, #fff)',
              }}>
                <input type="radio" value="replace" checked={uploadMode === 'replace'} onChange={() => setUploadMode('replace')} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 2px' }}>Replace entire list</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary, #6B7280)', margin: 0 }}>
                    The current list is archived and this file becomes the new active list. Prior upload history is preserved.
                  </p>
                </div>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setUploadStep('mapping')} className="btn-secondary text-xs px-3 py-1.5">Back</button>
              <button type="button" onClick={fireUpload} className="btn-primary text-xs px-3 py-1.5">Upload</button>
            </div>
          </div>
        )}

        {uploadStep === 'uploading' && (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            {uploading ? (
              <>
                <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full mx-auto mb-3" />
                <p style={{ fontSize: 13, color: 'var(--text-secondary, #6B7280)' }}>Uploading and processing your account list…</p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-danger, #B91C1C)', marginBottom: 12 }}>{uploadError}</p>
                <button type="button" onClick={() => setUploadStep('mapping')} className="btn-primary text-xs px-3 py-1.5">Try again</button>
              </>
            )}
          </div>
        )}

        {uploadStep === 'complete' && uploadResult && (
          <div className="space-y-3">
            <div style={{ background: 'var(--bg-success, #F0FDF4)', border: '0.5px solid var(--border-success, #86EFAC)', borderRadius: 8, padding: '12px 14px' }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-success, #15803D)', margin: '0 0 6px' }}>
                Upload complete — {uploadResult.rowCount.toLocaleString()} accounts processed
              </p>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-success, #15803D)' }}>
                <span>{uploadResult.resolvedReps} reps auto-assigned</span>
                {uploadResult.unresolvedReps > 0 && (
                  <span style={{ color: 'var(--text-warning, #B45309)' }}>
                    {uploadResult.unresolvedReps} rep names not matched — review below
                  </span>
                )}
                {uploadResult.mergeStats && (
                  <>
                    <span>{uploadResult.mergeStats.added} added</span>
                    <span>{uploadResult.mergeStats.updated} updated</span>
                    <span>{uploadResult.mergeStats.unchanged} unchanged</span>
                  </>
                )}
              </div>
            </div>

            {uploadResult.unresolvedRepNames.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowUnresolved(v => !v)}
                  className="text-xs font-medium text-brand-secondary hover:underline flex items-center gap-1"
                >
                  <svg className={`w-3 h-3 transition-transform ${showUnresolved ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Rep names not matched ({uploadResult.unresolvedRepNames.length})
                </button>
                {showUnresolved && (
                  <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary, #6B7280)' }}>
                    {uploadResult.unresolvedRepNames.map((name, i) => <li key={i}>{name}</li>)}
                  </ul>
                )}
              </div>
            )}

            <button type="button" onClick={resetUploadState} className="btn-secondary text-xs px-3 py-1.5">Upload another list</button>
          </div>
        )}
      </div>

      {/* ── Upload history ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upload history</p>
        {uploads.length === 0 ? (
          <p className="text-xs text-gray-400">No uploads yet.</p>
        ) : (
          uploads.map(upload => (
            <div
              key={upload.id}
              style={{
                border: '0.5px solid',
                borderColor: upload.status === 'active' ? 'var(--border-success, #86EFAC)' : 'var(--border, #E5E7EB)',
                borderRadius: 8, padding: '10px 14px',
                background: upload.status === 'active' ? 'var(--bg-success, #F0FDF4)' : 'var(--surface-1, #F9FAFB)',
                marginBottom: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary, #111827)' }}>
                      {upload.fileName}
                    </span>
                    {upload.status === 'active' ? (
                      <span style={{ fontSize: 10, fontWeight: 500, background: 'var(--bg-success, #F0FDF4)', color: 'var(--text-success, #15803D)', padding: '1px 7px', borderRadius: 20, border: '0.5px solid var(--border-success, #86EFAC)' }}>
                        Active
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 500, background: 'var(--surface-1, #F9FAFB)', color: 'var(--text-muted, #9CA3AF)', padding: '1px 7px', borderRadius: 20, border: '0.5px solid var(--border, #E5E7EB)' }}>
                        Archived
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--text-muted, #9CA3AF)', background: 'var(--surface-1, #F9FAFB)', padding: '1px 7px', borderRadius: 20, border: '0.5px solid var(--border, #E5E7EB)' }}>
                      {upload.uploadMode === 'merge' ? 'Merged' : 'Replaced'}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary, #6B7280)', margin: 0 }}>
                    {formatDateTime(upload.uploadedAt)} · {upload.rowCount?.toLocaleString() ?? 0} accounts
                    {upload.uploadedByName ? ` · by ${upload.uploadedByName}` : ''}
                  </p>
                </div>
                {upload.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => handleArchive(upload.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #9CA3AF)', fontSize: 12, padding: '2px 6px' }}
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Active records ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active accounts</p>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search company name…"
            className="input-field text-xs py-1.5 w-56"
          />
        </div>

        {recordsTotal === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', border: '0.5px solid var(--border, #E5E7EB)', borderRadius: 12 }}>
            <svg style={{ width: 32, height: 32, color: 'var(--text-muted, #9CA3AF)', display: 'block', margin: '0 auto 8px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #6B7280)', margin: '0 0 4px' }}>
              {search ? 'No accounts match your search' : 'No accounts uploaded yet'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted, #9CA3AF)', margin: 0 }}>
              {search ? 'Try a different search term.' : 'Upload a list above to get started.'}
            </p>
          </div>
        ) : (
          <>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-2.5 py-1.5 text-left font-medium text-gray-500">Company name</th>
                    <th className="px-2.5 py-1.5 text-left font-medium text-gray-500">Domain</th>
                    <th className="px-2.5 py-1.5 text-left font-medium text-gray-500">Assigned rep</th>
                    <th className="px-2.5 py-1.5 text-left font-medium text-gray-500">Territory</th>
                    <th className="px-2.5 py-1.5 text-left font-medium text-gray-500">Entity structure</th>
                    <th className="px-2.5 py-1.5 text-left font-medium text-gray-500">Services</th>
                    <th className="px-2.5 py-1.5 text-left font-medium text-gray-500">{unitLabel}</th>
                    <th className="px-2.5 py-1.5 text-left font-medium text-gray-500">HQ state</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-2.5 py-1.5 text-gray-700">{r.companyName}</td>
                      <td className="px-2.5 py-1.5 text-gray-500">{r.domain ?? '—'}</td>
                      <td className="px-2.5 py-1.5 text-gray-700">{r.assignedRepName ?? '—'}</td>
                      <td className="px-2.5 py-1.5 text-gray-500">{r.territoryName ?? '—'}</td>
                      <td className="px-2.5 py-1.5 text-gray-500">{r.entityStructure ?? '—'}</td>
                      <td className="px-2.5 py-1.5 text-gray-500 truncate max-w-[160px]">{r.services ?? '—'}</td>
                      <td className="px-2.5 py-1.5 text-gray-500">{r.wse ?? '—'}</td>
                      <td className="px-2.5 py-1.5 text-gray-500">{r.hqState ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p style={{ fontSize: 11, color: 'var(--text-muted, #9CA3AF)' }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, recordsTotal)} of {recordsTotal.toLocaleString()} accounts
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-secondary text-xs px-2.5 py-1 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage(p => (p * PAGE_SIZE < recordsTotal ? p + 1 : p))}
                  disabled={page * PAGE_SIZE >= recordsTotal}
                  className="btn-secondary text-xs px-2.5 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
