'use client';

import { useState } from 'react';
import { ScrollRow } from '@/components/ScrollRow';
import { KebabMenu } from '@/components/KebabMenu';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { getRepInitials, type UserOption } from '@/lib/useUserOptions';
import { confirmationLabel, freshnessOf } from '@/lib/relationshipStaleness';

/**
 * One vendor / other relationship, as a card.
 *
 * This is the only place a vendor relationship is drawn. The company record's
 * section, both pre-conference relationship views and the relationship map
 * drawer all render this component — the drawer by way of
 * CompanyRelationshipColumns, which renders it too. It lived inside
 * VendorRelationshipsSection until the card grew a life of its own; importing a
 * card out of a 540-line section was a standing invitation to copy it instead.
 */

export interface VendorRelationship {
  id: number;
  related_company_id: number;
  related_company_name: string;
  related_company_type: string | null;
  rep_id: number | null;
  relationship_status: string[];
  strength: string | null;
  vendor_type: string[];
  notes: string;
  created_at?: string | null;
  updated_at?: string | null;
  /** When a person last confirmed the status — not when the row was written. */
  status_as_of?: string | null;
  /** Somebody flagged this outright, whatever the dates say. */
  stale?: boolean;
  /** Newest first. Absent on surfaces that load without the thread. */
  updates?: RelationshipUpdate[];
}

/** One entry in the thread, as the API returns it. */
export interface RelationshipUpdate {
  id: number;
  body: string;
  status_before: string[];
  status_after: string[];
  marked_stale: boolean;
  author_name: string;
  created_at: string;
}

/* ─── Card ────────────────────────────────────────────────────────────────── */

/**
 * When the note was last written. Stored as UTC without a zone marker, so the
 * Z is added before parsing — otherwise it reads as local and the stamp drifts
 * by the offset.
 */
function formatStamp(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const d = new Date(value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`);
  // A shape this doesn't parse still gets shown rather than silently dropping
  // the stamp — a raw timestamp reads better than no timestamp at all.
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

/**
 * The marker on a relationship nobody has stood behind lately.
 *
 * Outlined and dashed rather than filled: the status pills beside it are
 * statements of fact and this is the absence of one, so it should not read
 * with the same weight as them.
 */
function StalePill() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border border-dashed border-gray-400 text-gray-500 bg-white whitespace-nowrap">
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.5 2.5a1 1 0 001.414-1.414L11 9.586V6z" clipRule="evenodd" />
      </svg>
      Stale
    </span>
  );
}

function StatusPill({ value, colorMaps }: { value: string; colorMaps: Record<string, Record<string, string | null>> }) {
  // Full-strength text and border with a wash of the same colour behind, from
  // whatever hex the option carries in admin settings.
  const hex = getPreset(colorMaps.other_relationship_status?.[value]).hex;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap"
      style={{ color: hex, borderColor: hex, backgroundColor: `${hex}1F` }}
    >
      {value}
    </span>
  );
}

/**
 * Exported so the pre-conference review can show the same card rather than
 * building a second one that drifts. Omitting onEdit/onDelete drops the actions
 * menu, which is what a read-only surface wants.
 */
export function VendorRelationshipCard({ rel, userOptions, colorMaps, onEdit, onDelete, onUpdate, defaultExpanded = false }: {
  rel: VendorRelationship;
  userOptions: UserOption[];
  colorMaps: Record<string, Record<string, string | null>>;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Opens the update form. Omitted on read-only surfaces, like the actions. */
  onUpdate?: () => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rep = userOptions.find(u => u.id === rel.rep_id);
  // Last edit rather than creation: the note is what the stamp is heading, and
  // the note can be rewritten.
  const stamp = formatStamp(rel.updated_at || rel.created_at);
  const freshness = freshnessOf(rel);
  const isStale = freshness === 'stale';

  return (
    // Stale cards are drained rather than recoloured. The six status colours
    // already carry meaning and a seventh grey would compete with Former
    // Vendor's; washing the whole card out says "do not rely on this" without
    // claiming anything about what the relationship is.
    <div className={`rounded-lg border overflow-hidden transition-colors ${
      isStale ? 'border-gray-200 border-dashed bg-gray-50/70' : 'border-gray-200'
    }`}>
      {/* Chevron on the right, matching the internal-relationship card. */}
      <button type="button" onClick={() => setExpanded(v => !v)} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors">
        <div className="flex items-start gap-2">
          <div className={`min-w-0 flex-1 ${isStale ? 'opacity-60' : ''}`}>
            <p className="text-sm font-semibold text-gray-800 truncate">{rel.related_company_name}</p>
            {/* Second row: what this relationship is, then what the company is. */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {isStale && <StalePill />}
              {rel.relationship_status.map(s => <StatusPill key={s} value={s} colorMaps={colorMaps} />)}
              {rel.related_company_type && (
                <span className={`${getBadgeClass(rel.related_company_type, colorMaps.company_type || {})} whitespace-nowrap`}>
                  {rel.related_company_type}
                </span>
              )}
            </div>
          </div>
          <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 mt-0.5 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            {/* flex-1 min-w-0: ScrollRow's scroller is w-0 flex-1 inside, so
                without a width to claim here it collapses to just a chevron. */}
            <ScrollRow className="flex-1 min-w-0" gapClass="gap-1.5">
              {rel.strength && (
                <span className={`${getBadgeClass(rel.strength, colorMaps.rep_relationship_type || {})} flex-shrink-0 whitespace-nowrap`}>
                  {rel.strength}
                </span>
              )}
              {rel.vendor_type.map(v => (
                <span key={v} className={`${getBadgeClass(v, colorMaps.vendor_type || {})} flex-shrink-0 whitespace-nowrap`}>{v}</span>
              ))}
              {!rel.strength && rel.vendor_type.length === 0 && (
                <span className="text-xs text-gray-400 flex-shrink-0">No strength or vendor type set</span>
              )}
            </ScrollRow>
            {rep && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${getPreset(colorMaps.user?.[rep.value]).badgeClass}`}>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                  <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                </svg>
                {getRepInitials(rep.value)}
              </span>
            )}
            {/* Sits at the end of this row so it lands directly under the
                header's chevron, rather than floating at the foot of the card. */}
            {(onEdit || onDelete) && (
              <div className="flex-shrink-0">
                <KebabMenu
                  title="Relationship actions"
                  items={[
                    ...(onEdit ? [{ label: 'Edit', onClick: onEdit }] : []),
                    ...(onDelete ? [{ label: 'Delete', onClick: onDelete }] : []),
                  ]}
                />
              </div>
            )}
          </div>

          {rel.notes && (
            <div>
              {stamp && (
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{stamp}</p>
              )}
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{rel.notes}</p>
            </div>
          )}

          <RelationshipThread updates={rel.updates ?? []} />

          {/* The confirmation line and the way to move it, on one row.
              Separated from the notes above by a rule because it is about the
              record rather than about the relationship. */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
            <span className={`text-[11px] ${
              freshness === 'fresh' ? 'text-gray-400' : 'text-gray-500 font-medium'
            }`}>
              {confirmationLabel(rel)}
            </span>
            {onUpdate && (
              <button
                type="button"
                onClick={onUpdate}
                className="flex-shrink-0 inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-800 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Update
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

/**
 * What has been said about this relationship since it was written down.
 *
 * Newest first, and never edited — the thread is a record of what was believed
 * when, which is the thing that makes "when did they switch vendors" a
 * question with an answer. Collapsed past the first two, because a
 * well-maintained relationship accumulates these and the card is a card.
 */
function RelationshipThread({ updates }: { updates: RelationshipUpdate[] }) {
  const [showAll, setShowAll] = useState(false);
  if (updates.length === 0) return null;
  const shown = showAll ? updates : updates.slice(0, 2);

  return (
    <div className="space-y-2">
      {shown.map(u => (
        <div key={u.id} className="border-l-2 border-gray-200 pl-2">
          <p className="text-[10px] text-gray-400">
            <span className="font-semibold text-gray-500">{u.author_name || 'Unknown'}</span>
            {u.created_at && <> · {formatStamp(u.created_at)}</>}
          </p>
          {/* The transition, when there was one. This line is the reason the
              thread is a table and not an ever-growing notes field. */}
          {u.status_after.length > 0 && (
            <p className="text-[10px] text-gray-500 mt-0.5">
              {u.status_before.length > 0 ? `${u.status_before.join(', ')} → ` : ''}
              <span className="font-semibold">{u.status_after.join(', ')}</span>
            </p>
          )}
          {u.marked_stale && (
            <p className="text-[10px] font-semibold text-gray-500 mt-0.5">Flagged as possibly out of date</p>
          )}
          <p className="text-xs text-gray-600 whitespace-pre-wrap mt-0.5">{u.body}</p>
        </div>
      ))}
      {updates.length > 2 && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="text-[11px] font-semibold text-brand-secondary hover:underline"
        >
          {showAll ? 'Show less' : `Show ${updates.length - 2} earlier update${updates.length - 2 === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}
