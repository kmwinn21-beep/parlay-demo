'use client';

import { useState, useEffect, useRef } from 'react';
import { useHideBottomNav } from './BottomNavContext';
import { childrenOf, clashingName } from '@/lib/parentChildSelection';

interface ParentChildItem {
  id: number;
  label: string;
  sublabel?: string;
  /** Richer identification for the option — the caller's own card markup.
   *  Shown instead of label/sublabel, which read identically when two records
   *  share a name. */
  detail?: React.ReactNode;
}

interface SearchResult {
  id: number;
  name: string;
  subtitle: string | null;
}

interface ParentChildModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (parentId: number, childIds: number[]) => Promise<void>;
  items: ParentChildItem[];
}

export function ParentChildModal({
  isOpen,
  onClose,
  onSubmit,
  items,
}: ParentChildModalProps) {
  useHideBottomNav(isOpen);
  const [parentId, setParentId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The ids added from here, for the search to skip.
   *
   * A ref beside the state rather than the state itself: putting `created` in
   * the search effect's deps would re-run the search — and reopen the result
   * list the reader has just chosen from — every time a company is added.
   */
  const createdIdsRef = useRef<number[]>([]);
  /**
   * The "Other (not in list)" panel, and whatever it has created.
   *
   * A company that is not in Parlay yet is the common case for a parent: the
   * child is at the conference, the holding company it belongs to was never
   * coming and nobody has had a reason to type it in. Sending the reader to
   * the companies page to add it and then back here to link it is three
   * screens for one fact.
   *
   * `created` is a list rather than one record so a reader who adds the wrong
   * name, adds the right one and switches between them still has both on
   * screen — they exist now either way, and silently dropping the first from
   * the list would read as it not having been saved.
   */
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherName, setOtherName] = useState('');
  const [created, setCreated] = useState<SearchResult[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setParentId(null);
      setSearchQuery('');
      setSearchResults([]);
      setOtherOpen(false);
      setOtherName('');
      setCreated([]);
      createdIdsRef.current = [];
      setCreateError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        // Already on screen above, either as a selected company or as one added
        // from here — listing it twice would be two radios for one company.
        const shown = new Set([...items.map((i) => i.id), ...createdIdsRef.current]);
        const filtered = (data.companies as SearchResult[]).filter((c) => !shown.has(c.id));
        setSearchResults(filtered);
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, items]);

  if (!isOpen) return null;

  const childItems = childrenOf(items, parentId);

  /**
   * A relationship needs two companies.
   *
   * With one company selected, naming IT as the parent leaves nothing to be
   * its child — the route rejects that, and a button that posts a request it
   * knows will 400 is a button that reports a server error for a choice the
   * reader could see was empty.
   */
  const canSubmit = parentId != null && childItems.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const childIds = childItems.map((i) => i.id);
    setIsLoading(true);
    try {
      await onSubmit(parentId!, childIds);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * A company that already has this name, wherever it is on screen.
   *
   * A warning rather than a block. Two records genuinely sharing a name is why
   * the options here carry a detail card at all — see ParentChildItem.detail —
   * so refusing to add a second would be the modal deciding something it
   * cannot know. It points at the match; the reader decides.
   */
  const nameClash = clashingName(otherName, [
    ...items.map((i) => i.label),
    ...searchResults.map((r) => r.name),
    ...created.map((c) => c.name),
  ]);

  const handleCreateOther = async () => {
    const name = otherName.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to add the company');
      const company: SearchResult = {
        id: Number(data.id),
        name: String(data.name ?? name),
        subtitle: data.company_type ? String(data.company_type) : null,
      };
      setCreated((prev) => [...prev, company]);
      createdIdsRef.current = [...createdIdsRef.current, company.id];
      // Gone from the results it was not in: the reader searched for this name
      // and found nothing, and the row is now above.
      setSearchResults((prev) => prev.filter((r) => r.id !== company.id));
      // Selected straight away, which is the whole point of adding it here:
      // the reader came to make a relationship, not to fill in a form.
      setParentId(company.id);
      setOtherOpen(false);
      setOtherName('');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to add the company');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl border border-brand-highlight max-w-md w-full mx-4 flex flex-col max-h-[90vh]">
        {/* Fixed header */}
        <div className="flex-shrink-0 p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-brand-primary font-serif">Create Parent/Child Relationship</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-5">
            Select the parent company. The remaining companies will become children. Their contacts and conferences will stay on the child record, while meetings, notes, and follow-ups will roll up to the parent.
          </p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          <div className="space-y-3 mb-4">
            <p className="text-sm font-medium text-gray-700">Select the parent company:</p>
            {items.map((item) => (
              <label
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  parentId === item.id
                    ? 'border-brand-secondary bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="parent"
                  value={item.id}
                  checked={parentId === item.id}
                  onChange={() => setParentId(item.id)}
                  className="mt-0.5 accent-brand-secondary"
                />
                {item.detail ?? (
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.label}</p>
                    {item.sublabel && (
                      <p className="text-xs text-gray-500">{item.sublabel}</p>
                    )}
                  </div>
                )}
              </label>
            ))}
          </div>

          {/* Global company search */}
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">or search all companies</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {isSearching && (
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-secondary animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  // Deselect if current parent was from search and query changes
                  if (parentId && !items.find((i) => i.id === parentId)) {
                    setParentId(null);
                  }
                }}
                placeholder="Search by company name..."
                className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary bg-white"
              />
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2 mt-2">
                {searchResults.map((result) => (
                  <label
                    key={result.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      parentId === result.id
                        ? 'border-brand-secondary bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="parent"
                      value={result.id}
                      checked={parentId === result.id}
                      onChange={() => setParentId(result.id)}
                      className="mt-0.5 accent-brand-secondary"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{result.name}</p>
                      {result.subtitle && (
                        <p className="text-xs text-gray-500">{result.subtitle}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
              <p className="text-sm text-gray-400 mt-2 text-center py-2">No companies found</p>
            )}

            {/* Companies added from here, selectable like any other option. */}
            {created.map((company) => (
              <label
                key={company.id}
                className={`flex items-start gap-3 p-3 mt-2 rounded-lg border-2 cursor-pointer transition-all ${
                  parentId === company.id
                    ? 'border-brand-secondary bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="parent"
                  value={company.id}
                  checked={parentId === company.id}
                  onChange={() => setParentId(company.id)}
                  className="mt-0.5 accent-brand-secondary"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">{company.name}</p>
                  <p className="text-xs text-green-700">Added to Parlay</p>
                </div>
              </label>
            ))}

            {/* The company that is not in Parlay yet.
                Under the search rather than beside it: it is the answer to
                having searched and not found, and offering it first would
                invite a duplicate of a company that is already there. */}
            {!otherOpen ? (
              <button
                type="button"
                onClick={() => { setOtherOpen(true); setOtherName(searchQuery.trim()); setCreateError(null); }}
                className="mt-2 w-full flex items-center gap-2 p-3 rounded-lg border-2 border-dashed border-gray-300 text-left text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Other (not in list)
              </button>
            ) : (
              <div className="mt-2 p-3 rounded-lg border-2 border-gray-200 space-y-2">
                <p className="text-xs font-semibold text-gray-700">Add a company that isn&rsquo;t in Parlay yet</p>
                <input
                  type="text"
                  value={otherName}
                  autoFocus
                  onChange={(e) => { setOtherName(e.target.value); setCreateError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreateOther(); } }}
                  placeholder="Company name"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary bg-white"
                />
                {/* Pointed out, not prevented: two companies really can share
                    a name, and only the reader knows whether these are two. */}
                {nameClash && (
                  <p className="text-xs text-amber-700">
                    &ldquo;{nameClash}&rdquo; is already listed above. Add this only if it is a different company.
                  </p>
                )}
                {createError && <p className="text-xs text-red-600">{createError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setOtherOpen(false); setOtherName(''); setCreateError(null); }}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={isCreating}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateOther}
                    disabled={!otherName.trim() || isCreating}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-secondary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? 'Adding…' : 'Add company'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {parentId && childItems.length > 0 && (
            <div className="mb-5 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs font-semibold text-blue-800 mb-1.5">Child companies (will be linked to parent):</p>
              <ul className="space-y-1">
                {childItems.map((item) => (
                  <li key={item.id} className="text-xs text-blue-700 flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The one-selection dead end, said out loud. With a single company
              selected and that company named as the parent there is nothing
              left to be its child, and a greyed-out button with no reason
              beside it reads as the modal being broken. */}
          {parentId && childItems.length === 0 && (
            <div className="mb-5 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs text-amber-800">
                A company cannot be its own parent. Search for the parent company above, or add it
                with <strong>Other (not in list)</strong>.
              </p>
            </div>
          )}

          {parentId && childItems.length > 0 && (
            <div className="mb-5 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-xs text-yellow-800">
                <strong>Note:</strong> Contacts and conferences will remain on the child company records. Only meetings, notes, and follow-ups from children will be visible on the parent record.
              </p>
            </div>
          )}
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 p-6 pt-4">
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1" disabled={isLoading}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isLoading}
              title={parentId && childItems.length === 0
                ? 'Pick a different parent — the only company selected cannot be its own child'
                : undefined}
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : 'Create Relationship'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
