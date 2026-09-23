'use client';

import { useState } from 'react';
import { ScrollRow } from '@/components/ScrollRow';
import { KebabMenu } from '@/components/KebabMenu';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { getRepInitials, type UserOption } from '@/lib/useUserOptions';

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
export function VendorRelationshipCard({ rel, userOptions, colorMaps, onEdit, onDelete, defaultExpanded = false }: {
  rel: VendorRelationship;
  userOptions: UserOption[];
  colorMaps: Record<string, Record<string, string | null>>;
  onEdit?: () => void;
  onDelete?: () => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rep = userOptions.find(u => u.id === rel.rep_id);
  // Last edit rather than creation: the note is what the stamp is heading, and
  // the note can be rewritten.
  const stamp = formatStamp(rel.updated_at || rel.created_at);

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* Chevron on the right, matching the internal-relationship card. */}
      <button type="button" onClick={() => setExpanded(v => !v)} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800 truncate">{rel.related_company_name}</p>
            {/* Second row: what this relationship is, then what the company is. */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
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

        </div>
      )}
    </div>
  );
}
