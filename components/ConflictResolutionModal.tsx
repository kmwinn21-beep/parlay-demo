'use client';

import React, { useState } from 'react';
import {
  captionFor, isChosen, acceptColumn,
  type ConflictColumn,
} from '@/lib/conflictRows';

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
  /**
   * Which column the accept answer points at. Defaults to 'proposed'.
   *
   * A field row asks which of two values to keep, and accepting means taking
   * the proposed one. An identity row asks whether two names are the same
   * company, and answering yes means using the EXISTING one — the left column.
   * Without this the row highlighted whichever column the reader did not
   * choose, and said the opposite of the button they had just pressed.
   */
  acceptShows?: ConflictColumn;
  /**
   * What each answer does, in the row's own terms, shown under the column that
   * answer points at. The generic wording ("using this" / "keeping") only makes
   * sense when the two columns hold two candidate values; a row whose columns
   * are an existing record and an action has to say what the action is.
   */
  acceptCaption?: string;
  ignoreCaption?: string;
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
  // "new company", so clicking straight through creates a new company rather
  // than merging two that might be unrelated — a duplicate is visible and
  // mergeable, a wrong merge is silent.
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(() => {
    const seed: Record<string, Resolution> = {};
    for (const c of conflicts) if (c.defaultResolution) seed[conflictKey(c)] = c.defaultResolution;
    return seed;
  });
  // Merging every name at once is the one answer here that cannot be taken
  // back, so it asks first. See the identity section below.
  const [confirmMergeAll, setConfirmMergeAll] = useState(false);

  const resolve = (c: ConflictItem, r: Resolution) =>
    setResolutions(prev => ({ ...prev, [conflictKey(c)]: r }));

  /**
   * Answer a group of rows at once.
   *
   * Scoped to the rows passed in rather than to everything on screen: the two
   * kinds of question have different stakes, and a single "Accept All" spanning
   * both meant one click could merge every fuzzy company match in the file.
   */
  const setAll = (rows: ConflictItem[], r: Resolution) =>
    setResolutions(prev => {
      const next = { ...prev };
      for (const c of rows) next[conflictKey(c)] = r;
      return next;
    });

  const identityRows = conflicts.filter(c => c.entityType === 'company_identity');
  const fieldRows = conflicts.filter(c => c.entityType !== 'company_identity');

  const resolvedCount = Object.keys(resolutions).length;
  const remaining = conflicts.length - resolvedCount;
  const allResolved = remaining === 0;
  const identityCount = identityRows.length;
  const fieldCount = fieldRows.length;

  const summary = [
    identityCount > 0 ? `${identityCount} company name${identityCount !== 1 ? 's' : ''} to confirm` : null,
    fieldCount > 0 ? `${fieldCount} field${fieldCount !== 1 ? 's' : ''} differ from existing values` : null,
  ].filter(Boolean).join(' · ');

  const GRID = 'grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_180px]';

  /** One row, laid out by which column its accept answer points at. */
  const renderRow = (c: ConflictItem, i: number) => {
    const key = conflictKey(c);
    const res = resolutions[key];
    const chosen = (col: ConflictColumn) => isChosen(c, res, col);
    const caption = (col: ConflictColumn) => captionFor(c, col);
    // Green marks the affirmative answer whichever side it falls on.
    const captionTone = (col: ConflictColumn) =>
      acceptColumn(c) === col ? 'text-green-600' : 'text-gray-400';
    const valueClass = (col: ConflictColumn) =>
      chosen(col) ? 'font-semibold text-gray-900' : 'text-gray-500';

    const subtitle = c.entityType === 'company_identity'
      ? (c.detail ?? 'Company match')
      : `${c.fieldLabel} · ${c.entityType === 'attendee' ? 'Attendee' : 'Company'}`;

    return (
      <div
        key={key}
        className={`px-4 sm:px-6 py-3 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
      >
        {/* Desktop row */}
        <div className={`hidden sm:grid ${GRID} gap-4 items-center`}>
          {/* Name / Field */}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{c.entityName}</p>
            <p className="text-xs text-gray-400">{subtitle}</p>
          </div>
          {/* Current value */}
          <div className="min-w-0">
            <p className={`text-sm truncate ${valueClass('current')}`} title={c.currentValue}>
              {c.currentValue}
            </p>
            {chosen('current') && (
              <span className={`text-xs ${captionTone('current')}`}>{caption('current')}</span>
            )}
          </div>
          {/* Proposed value */}
          <div className="min-w-0">
            <p className={`text-sm truncate ${valueClass('proposed')}`} title={c.proposedValue}>
              {c.proposedValue}
            </p>
            {chosen('proposed') && (
              <span className={`text-xs ${captionTone('proposed')}`}>{caption('proposed')}</span>
            )}
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
              <p className="text-xs text-gray-400">{subtitle}</p>
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
              <p className="text-gray-400 mb-0.5">
                {c.entityType === 'company_identity' ? 'Existing company' : 'Current'}
              </p>
              <p className={`break-all ${chosen('current') ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                {c.currentValue}
              </p>
              {chosen('current') && (
                <p className={`mt-0.5 ${captionTone('current')}`}>{caption('current')}</p>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2">
              <p className="text-gray-400 mb-0.5">
                {c.entityType === 'company_identity' ? 'Otherwise' : 'Proposed'}
              </p>
              <p className={`break-all ${chosen('proposed') ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                {c.proposedValue}
              </p>
              {chosen('proposed') && (
                <p className={`mt-0.5 ${captionTone('proposed')}`}>{caption('proposed')}</p>
              )}
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
  };

  /**
   * A section's heading, description, bulk controls and column labels.
   *
   * The labels belong to the section rather than the modal because the two
   * kinds of row put different things in the same columns. Headed at the modal
   * level, a file with both kinds — the ordinary case — labelled the identity
   * rows with field-row wording, so "Proposed Value" read as "what is about to
   * happen" over a column that is only used if you answer no.
   */
  const sectionHead = (
    title: string,
    description: React.ReactNode,
    columns: [string, string, string],
    actions: React.ReactNode,
  ) => (
    <div className="px-4 sm:px-6 pt-4 pb-2 bg-gray-50 border-b border-gray-100">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-brand-primary">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-lg">{description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      </div>
      <div className={`hidden sm:grid ${GRID} gap-4 mt-3`}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{columns[0]}</p>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{columns[1]}</p>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{columns[2]}</p>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Action</p>
      </div>
    </div>
  );

  const bulkButton = (label: string, onClick: () => void, tone: 'green' | 'gray') => (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
        tone === 'green'
          ? 'text-green-700 hover:text-green-900 hover:bg-green-50'
          : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

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
            <p className="text-sm text-gray-500 mt-0.5">{summary}</p>
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

        {/* Sections */}
        <div className="flex-1 overflow-y-auto">
          {identityCount > 0 && (
            <div>
              {sectionHead(
                'Company matches',
                <>
                  These names look like existing companies but aren&rsquo;t exact matches.
                  Unanswered names are added as new companies. Each answer is remembered, so
                  these names won&rsquo;t be asked about again.
                </>,
                ['Name in file', 'Existing Company', 'Otherwise'],
                confirmMergeAll ? (
                  <>
                    <span className="text-xs text-gray-600">
                      Treat all {identityCount} as the same company as their closest match?
                    </span>
                    {bulkButton('Yes, merge all', () => {
                      setAll(identityRows, 'accept');
                      setConfirmMergeAll(false);
                    }, 'green')}
                    {bulkButton('Cancel', () => setConfirmMergeAll(false), 'gray')}
                  </>
                ) : (
                  <>
                    {/* Merging is the only answer in this modal that cannot be
                        undone from anywhere in the app, so it asks first. Adding
                        new companies is reversible by merging them later. */}
                    {bulkButton('All same company', () => setConfirmMergeAll(true), 'green')}
                    {bulkButton('All new companies', () => setAll(identityRows, 'ignore'), 'gray')}
                  </>
                ),
              )}
              <div className="divide-y divide-gray-100">{identityRows.map(renderRow)}</div>
            </div>
          )}

          {fieldCount > 0 && (
            <div>
              {sectionHead(
                'Field differences',
                'These values differ from what is already stored. Choose which one to keep.',
                ['Name / Field', 'Current Value', 'Proposed Value'],
                <>
                  {bulkButton('Accept All', () => setAll(fieldRows, 'accept'), 'green')}
                  {bulkButton('Ignore All', () => setAll(fieldRows, 'ignore'), 'gray')}
                </>,
              )}
              <div className="divide-y divide-gray-100">{fieldRows.map(renderRow)}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <p className="text-xs text-gray-400">
            {allResolved
              ? `All ${conflicts.length} resolved — ready to proceed.`
              : `${resolvedCount}/${conflicts.length} resolved · ${remaining} remaining`}
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
