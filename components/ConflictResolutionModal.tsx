'use client';

import React, { useState } from 'react';

export interface ConflictItem {
  entityType: 'attendee' | 'company' | 'company_identity';
  entityId: number;
  entityName: string;
  field: string;
  fieldLabel: string;
  currentValue: string;
  proposedValue: string;
  /** Overrides the generic Accept / Ignore wording for this row. */
  acceptLabel?: string;
  ignoreLabel?: string;
  /** Pre-answered on open. Identity rows default to the safe answer. */
  defaultResolution?: Resolution;
  /** Extra context under the name — e.g. how many attendees ride on this. */
  detail?: string;
}


export type Resolution = 'accept' | 'ignore';

interface Props {
  conflicts: ConflictItem[];
  onResolve: (resolutions: Record<string, Resolution>) => void;
  onCancel: () => void;
}

function conflictKey(c: ConflictItem) {
  return `${c.entityType}_${c.entityId}_${c.field}`;
}

export function ConflictResolutionModal({ conflicts, onResolve, onCancel }: Props) {
  // Rows carrying a default start answered. Identity questions default to
  // "different company", so clicking straight through creates a new company
  // rather than merging two that might be unrelated — a duplicate is visible
  // and mergeable, a wrong merge is silent.
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(() => {
    const seed: Record<string, Resolution> = {};
    for (const c of conflicts) if (c.defaultResolution) seed[conflictKey(c)] = c.defaultResolution;
    return seed;
  });

  const resolve = (c: ConflictItem, r: Resolution) =>
    setResolutions(prev => ({ ...prev, [conflictKey(c)]: r }));

  const acceptAll = () => {
    const all: Record<string, Resolution> = {};
    for (const c of conflicts) all[conflictKey(c)] = 'accept';
    setResolutions(all);
  };

  const ignoreAll = () => {
    const all: Record<string, Resolution> = {};
    for (const c of conflicts) all[conflictKey(c)] = 'ignore';
    setResolutions(all);
  };

  const resolvedCount = Object.keys(resolutions).length;
  const allResolved = resolvedCount === conflicts.length;
  const identityCount = conflicts.filter(c => c.entityType === 'company_identity').length;
  const fieldCount = conflicts.length - identityCount;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="bg-white w-full sm:max-w-4xl flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl"
        style={{ maxHeight: '92vh' }}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-brand-primary font-serif">
              {identityCount > 0 && fieldCount === 0 ? 'Confirm Companies' : 'Review Before Uploading'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {identityCount > 0 && (
                <>
                  {identityCount} company name{identityCount !== 1 ? 's' : ''} in the file look{identityCount === 1 ? 's' : ''} like {identityCount === 1 ? 'an existing company' : 'existing companies'} but {identityCount === 1 ? 'isn\u2019t' : 'aren\u2019t'} an exact match. They&rsquo;ll be added as new companies unless you say otherwise.
                  {fieldCount > 0 ? ' ' : ''}
                </>
              )}
              {fieldCount > 0 && (
                <>{fieldCount} field{fieldCount !== 1 ? 's' : ''} differ from existing values. Choose which value to keep for each.</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 ml-4 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Bulk actions bar */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-4 flex-shrink-0">
          <span className="text-xs text-gray-400">{resolvedCount}/{conflicts.length} resolved</span>
          <button
            type="button"
            onClick={acceptAll}
            className="text-xs font-medium text-green-700 hover:text-green-900 px-2 py-1 rounded hover:bg-green-50 transition-colors"
          >
            Accept All
          </button>
          <button
            type="button"
            onClick={ignoreAll}
            className="text-xs font-medium text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
          >
            Ignore All
          </button>
        </div>

        {/* Desktop column headers */}
        <div className="hidden sm:grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_180px] gap-4 px-6 py-2 border-b border-gray-100 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Name / Field</p>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{identityCount > 0 && fieldCount === 0 ? 'Existing Company' : 'Current Value'}</p>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{identityCount > 0 && fieldCount === 0 ? 'Otherwise' : 'Proposed Value'}</p>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Action</p>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {conflicts.map((c, i) => {
            const key = conflictKey(c);
            const res = resolutions[key];
            return (
              <div
                key={key}
                className={`px-4 sm:px-6 py-3 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
              >
                {/* Desktop row */}
                <div className="hidden sm:grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_180px] gap-4 items-center">
                  {/* Name / Field */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.entityName}</p>
                    <p className="text-xs text-gray-400">
                      {c.entityType === 'company_identity'
                        ? (c.detail ?? 'Company match')
                        : `${c.fieldLabel} · ${c.entityType === 'attendee' ? 'Attendee' : 'Company'}`}
                    </p>
                  </div>
                  {/* Current value */}
                  <div className="min-w-0">
                    <p
                      className={`text-sm truncate ${res === 'ignore' ? 'font-semibold text-gray-900' : 'text-gray-500'}`}
                      title={c.currentValue}
                    >
                      {c.currentValue}
                    </p>
                    {res === 'ignore' && <span className="text-xs text-gray-400">{c.entityType === 'company_identity' ? '' : '← keeping'}</span>}
                  </div>
                  {/* Proposed value */}
                  <div className="min-w-0">
                    <p
                      className={`text-sm truncate ${res === 'accept' ? 'font-semibold text-gray-900' : 'text-gray-500'}`}
                      title={c.proposedValue}
                    >
                      {c.proposedValue}
                    </p>
                    {res === 'accept' && <span className="text-xs text-green-600">{c.entityType === 'company_identity' ? '' : '← using this'}</span>}
                  </div>
                  {/* Buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => resolve(c, 'accept')}
                      className={`flex-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                        res === 'accept'
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-green-300 hover:text-green-700 hover:bg-green-50'
                      }`}
                    >
                      {c.acceptLabel ?? 'Accept'}
                    </button>
                    <button
                      type="button"
                      onClick={() => resolve(c, 'ignore')}
                      className={`flex-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                        res === 'ignore'
                          ? 'bg-gray-200 text-gray-700 border-gray-300'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-100'
                      }`}
                    >
                      {c.ignoreLabel ?? 'Ignore'}
                    </button>
                  </div>
                </div>

                {/* Mobile card */}
                <div className="sm:hidden space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.entityName}</p>
                      <p className="text-xs text-gray-400">
                        {c.entityType === 'company_identity'
                          ? (c.detail ?? 'Company match')
                          : `${c.fieldLabel} · ${c.entityType === 'attendee' ? 'Attendee' : 'Company'}`}
                      </p>
                    </div>
                    {res && (
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                        res === 'accept' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {res === 'accept' ? (c.acceptLabel ?? 'Accept') : (c.ignoreLabel ?? 'Ignore')}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white border border-gray-200 rounded-lg p-2">
                      <p className="text-gray-400 mb-0.5">Current</p>
                      <p className={`break-all ${res === 'ignore' ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                        {c.currentValue}
                      </p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-2">
                      <p className="text-gray-400 mb-0.5">Proposed</p>
                      <p className={`break-all ${res === 'accept' ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                        {c.proposedValue}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => resolve(c, 'accept')}
                      className={`flex-1 text-xs font-medium py-1.5 rounded-lg border transition-colors ${
                        res === 'accept'
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-green-300 hover:text-green-700'
                      }`}
                    >
                      {c.acceptLabel ?? 'Accept Change'}
                    </button>
                    <button
                      type="button"
                      onClick={() => resolve(c, 'ignore')}
                      className={`flex-1 text-xs font-medium py-1.5 rounded-lg border transition-colors ${
                        res === 'ignore'
                          ? 'bg-gray-200 text-gray-700 border-gray-300'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-100'
                      }`}
                    >
                      {c.ignoreLabel ?? 'Ignore Change'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <p className="text-xs text-gray-400">
            {allResolved
              ? 'All conflicts resolved — ready to proceed.'
              : `${conflicts.length - resolvedCount} remaining`}
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onCancel} className="btn-secondary text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onResolve(resolutions)}
              disabled={!allResolved}
              className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Proceed with Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
