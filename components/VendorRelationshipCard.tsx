'use client';

import { useState, type ReactNode } from 'react';
import { ScrollRow } from '@/components/ScrollRow';
import { KebabMenu } from '@/components/KebabMenu';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { getRepInitials, type UserOption } from '@/lib/useUserOptions';
import { confirmationLabel, freshnessOf } from '@/lib/relationshipStaleness';
// The shape the API returns, declared once. A second copy here is how the
// card and the route drift apart a field at a time.
import type { RelationshipUpdate } from '@/lib/relationshipThread';
export type { RelationshipUpdate };
import { RelationshipUpdateForm, type SavedUpdate } from '@/components/RelationshipUpdateForm';

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
  /** 'inbound' means the other company logged this, read from this side. */
  direction?: 'outbound' | 'inbound';
  /** Where the row lives, so an inbound card can link back to it. */
  logged_on_company_id?: number;
  /** The status as written, when reading it from here changed the words. */
  as_written?: string[] | null;
  /** The other company logged the same pair; these are their words for it. */
  counterpart?: { id: number; statuses: string[] } | null;
  /** The two ends do not agree once both are read from this side. */
  conflict?: boolean;
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

function StatusPill({ value, colorMaps, sizeClass = 'text-xs' }: {
  value: string;
  colorMaps: Record<string, Record<string, string | null>>;
  sizeClass?: string;
}) {
  // Full-strength text and border with a wash of the same colour behind, from
  // whatever hex the option carries in admin settings.
  const hex = getPreset(colorMaps.other_relationship_status?.[value]).hex;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full ${sizeClass} font-semibold border whitespace-nowrap`}
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
export function VendorRelationshipCard({ rel, userOptions, colorMaps, onEdit, onDelete, onUpdated, readOnly = false, defaultExpanded = false, titleBadges, title, typeBadges, statuses, bodyMaxHeight, highlight }: {
  rel: VendorRelationship;
  userOptions: UserOption[];
  colorMaps: Record<string, Record<string, string | null>>;
  onEdit?: () => void;
  onDelete?: () => void;
  /**
   * The thread changed — reload whatever is showing it.
   *
   * Optional, and the Update button shows without it. A surface that cannot
   * reload should still be able to record what somebody just heard; it simply
   * shows the new entry the next time it loads.
   */
  onUpdated?: () => void;
  /** Suppresses the Update button. Nothing sets it today. */
  readOnly?: boolean;
  defaultExpanded?: boolean;
  /**
   * Badges beside the company name, at the top of the header.
   *
   * The competitive grid's signal badges, which say why the card is in the cell
   * it is in. Passed in rather than derived here: the card has no idea it is in
   * a grid, and the signals are computed once for the whole view.
   *
   * Beside the NAME rather than in the badge row below it. In a 232px column
   * that row is already carrying a status and a type, and three more worded
   * pills pushed both off the end of a scroller — the signals are the reason
   * the card is on screen, so they sit where the eye lands first.
   */
  titleBadges?: ReactNode;
  /**
   * Paint the card's border and fill in this colour.
   *
   * The grid's hover: the account under two competitors lights up in both
   * cells at once, in the colour of the signal that connects them. Null leaves
   * the card alone, which is every other surface and every card the grid is not
   * pointing at.
   */
  highlight?: string | null;
  /**
   * ── Reading the card from the other end ──
   *
   * title, typeBadges and statuses go together and are supplied together.
   *
   * The card describes the OTHER end of the relationship, which is right on a
   * company record: you are on Abshire's page, the card says Abbott, Abbott's
   * type, and what Abbott is to Abshire. In the competitive grid the column
   * heading already says Abbott, so the card's subject has to be the ACCOUNT —
   * and once it is, EVERY field that describes a subject has to move with it.
   *
   * Getting that half-right is worse than not doing it: a card headed "Annefurt
   * LLC" showing Abbott's type and Abbott's status reads as a set of claims
   * about Annefurt, all of them false. So these three are one decision, not
   * three optional overrides, and a caller that passes one passes all three.
   *
   * What does NOT move: the thread, the Update button, the edit ownership and
   * the inbound handling. Those belong to the row, and the row belongs to the
   * page it was logged on.
   */
  title?: string;
  /** The subject's company types, one badge each. */
  typeBadges?: string[];
  /** The statuses as the subject reads them — the counterpart wording. */
  statuses?: string[];
  /**
   * Cap the EXPANDED BODY at this many pixels and scroll it, when set.
   *
   * The number is the caller's, not the card's: only the surface knows how much
   * vertical room one open card may take from the ones around it. Unset
   * everywhere but the competitive grid, where an open card would otherwise
   * push every other band down the page — see GRID_BODY_MAX_HEIGHT for why that
   * is capped rather than moved into a rail.
   *
   * The header is deliberately outside the capped region. It is a sibling above
   * this body, so scrolling the body cannot move it — which is what keeps the
   * grid's connectors, anchored on the header, from drifting as somebody reads
   * a thread.
   */
  bodyMaxHeight?: number;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // The form's open state lives here rather than in each surface. Unlike edit
  // and delete, updating needs nothing from the caller — so asking every
  // surface to wire it up is how it ends up wired on one of them.
  const [updating, setUpdating] = useState(false);
  /**
   * What was saved from this card since it loaded.
   *
   * The pre-conference views and the relationship map load their data once at
   * the top of the page and cannot refetch a single relationship, so without
   * this an update on those surfaces would appear to do nothing at all. The
   * server is still the source of truth on the next load; this only carries
   * the card from the save to that point.
   */
  const [saved, setSaved] = useState<SavedUpdate | null>(null);

  // Everything below reads through this rather than the prop, so the card is
  // the same whether the surface reloaded or not.
  const shown: VendorRelationship = saved
    ? {
        ...rel,
        stale: saved.stale,
        status_as_of: saved.status_as_of || rel.status_as_of,
        relationship_status: saved.relationship_status ?? rel.relationship_status,
        updates: [saved.update, ...(rel.updates ?? [])],
      }
    : rel;
  const rep = userOptions.find(u => u.id === shown.rep_id);
  // Last edit rather than creation: the note is what the stamp is heading, and
  // the note can be rewritten.
  const stamp = formatStamp(shown.updated_at || shown.created_at);
  const freshness = freshnessOf(shown);
  const isStale = freshness === 'stale';
  // The other company logged this one. The row belongs to their record — their
  // rep, their thread, the page that can edit it — so this side reads it and
  // links back rather than offering controls that would write to a record the
  // reader is not looking at.
  const inbound = shown.direction === 'inbound';
  const heading = title ?? shown.related_company_name;
  // The status as the heading's subject reads it. saved.relationship_status
  // still wins on the account-side card underneath, so a caller supplying
  // statuses gets a stale pill until the surface reloads — which is the same
  // trade every override here makes and is noted at the props.
  const shownStatuses = statuses ?? shown.relationship_status;
  // One badge per type. The column stores them comma-separated, which rendered
  // as a single badge reading "Vendor,Competitor".
  const shownTypes = typeBadges
    ?? (shown.related_company_type ? [shown.related_company_type] : []);

  /**
   * The header's badge row: wrapping, or a single paged line.
   *
   * Wrapping everywhere it already wrapped. In a grid cell there is no width to
   * wrap into — four columns inside a modal leave about 260px — and a badge row
   * that wraps to three lines makes every card in the row taller. So where the
   * grid passes signal pills the row becomes one scrolling line with chevrons
   * and a fade at whichever edge is cut off, which is what says "there is more"
   * rather than letting a half-pill read as the end of the list.
   *
   * Keyed off titleBadges rather than a flag of its own: the compact card and
   * the signal badges always go together, and a second prop would let a caller
   * ask for one without the other and get a row that pages for no reason.
   */
  const badgeRow = (children: ReactNode) => (titleBadges
    ? <ScrollRow className="mt-1" gapClass="gap-1.5" step={90} fade>{children}</ScrollRow>
    : <div className="flex items-center gap-1.5 mt-1 flex-wrap">{children}</div>);

  // A grid cell is 232px wide. The record pages have room for the default size
  // and keep it; only the surface that asked for the compact card gets this.
  const compact = titleBadges != null;
  const badgeSize = compact ? 'text-[10px]' : 'text-xs';

  return (
    // Stale cards are drained rather than recoloured. The six status colours
    // already carry meaning and a seventh grey would compete with Former
    // Vendor's; washing the whole card out says "do not rely on this" without
    // claiming anything about what the relationship is.
    <div
      className={`rounded-lg border overflow-hidden transition-colors ${
        isStale ? 'border-gray-200 border-dashed bg-gray-50/70' : 'border-gray-200'
      }`}
      // Inline, because the colour is a signal's and signals are data. A
      // Tailwind class per signal would be a second place they are declared.
      style={highlight ? { borderColor: highlight, backgroundColor: `${highlight}14` } : undefined}
    >
      {/* A div, with the chevron carrying its own button.
          The whole header stays clickable — four surfaces already use it that
          way — but a header that IS a button cannot contain one, and the
          competitive grid puts a paged pill row in here and anchors its
          connectors on this element. The chevron is the accessible control: it
          names the company and reports the state, so a screen reader gets one
          labelled toggle rather than the whole card read out as a button. */}
      <div
        data-card-header
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-start gap-2">
          <div className={`min-w-0 flex-1 ${isStale ? 'opacity-60' : ''}`}>
            {/* Wrapped to two lines where a caller supplied the name, truncated
                where it did not. Four columns inside the modal leave about 155px
                for a title, and the longest real company names need nearer 200 —
                so at that width truncating is not an edge case, it is most of a
                senior-living book. Two lines costs about 18px on the cards that
                need it and hides nothing; an ellipsis hides the half of
                "Belmont Village Senior Living" that tells you which Belmont. */}
            <div className="flex items-start gap-1.5 min-w-0">
              <p
                className={`font-semibold text-gray-800 ${
                  title ? 'text-xs line-clamp-2 leading-snug' : 'text-sm truncate'}`}
                title={heading}
              >
                {heading}
              </p>
              {titleBadges && (
                <span className="flex items-center gap-1 flex-shrink-0">{titleBadges}</span>
              )}
            </div>
            {/* Second row: why this card is here, then what this relationship
                is, then what the company is. Signals lead because they are the
                reason the grid drew the card at all. */}
            {badgeRow(
              <>
                {isStale && <StalePill />}
                {shownStatuses.map(s => (
                  <StatusPill key={s} value={s} colorMaps={colorMaps} sizeClass={badgeSize} />
                ))}
                {shownTypes.map(t => (
                  <span key={t} className={`${getBadgeClass(t, colorMaps.company_type || {}, badgeSize)} whitespace-nowrap`}>
                    {t}
                  </span>
                ))}
              </>,
            )}
          </div>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${heading}`}
            className="flex-shrink-0 ml-1 -mr-1 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        /* Uncapped unless the caller asked for a cap, so the four surfaces that
           were here first gain no max-height, no inner scroll and no new
           overflow context. scrollbar-thin rather than scrollbar-desktop-thin:
           the latter hides the bar below 1024px, and this view renders from
           640px up, so a capped body would clip silently in that band. */
        <div
          className={`border-t border-gray-100 px-3 py-2.5 space-y-2${
            bodyMaxHeight ? ' overflow-y-auto scrollbar-thin' : ''}`}
          style={bodyMaxHeight ? { maxHeight: bodyMaxHeight } : undefined}
        >
          <div className="flex items-center gap-2">
            {/* flex-1 min-w-0: ScrollRow's scroller is w-0 flex-1 inside, so
                without a width to claim here it collapses to just a chevron. */}
            <ScrollRow className="flex-1 min-w-0" gapClass="gap-1.5">
              {shown.strength && (
                <span className={`${getBadgeClass(shown.strength, colorMaps.rep_relationship_type || {})} flex-shrink-0 whitespace-nowrap`}>
                  {shown.strength}
                </span>
              )}
              {shown.vendor_type.map(v => (
                <span key={v} className={`${getBadgeClass(v, colorMaps.vendor_type || {})} flex-shrink-0 whitespace-nowrap`}>{v}</span>
              ))}
              {!shown.strength && shown.vendor_type.length === 0 && (
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
            {!inbound && (onEdit || onDelete) && (
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

          {shown.notes && (
            <div>
              {stamp && (
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{stamp}</p>
              )}
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{shown.notes}</p>
            </div>
          )}

          {updating && (
            <RelationshipUpdateForm
              rel={shown}
              onClose={() => setUpdating(false)}
              onSaved={result => { setSaved(result); onUpdated?.(); }}
              // Again after a switch is recorded: that writes to relationships
              // this card is not showing, and the optimistic copy above cannot
              // stand in for them.
              onRefresh={onUpdated}
            />
          )}

          <RelationshipThread updates={shown.updates ?? []} />

          {/* Where an inbound row came from, and what it says at its own end.
              A Customer pill on a page whose row reads Current Vendor is
              correct but surprising, and saying so is the difference between
              trusting the card and reporting it as a bug. */}
          {inbound && (
            <p className="text-[11px] text-gray-500">
              Logged on{' '}
              <a
                href={`/companies/${shown.logged_on_company_id}`}
                className="font-medium text-brand-secondary hover:underline"
              >
                {shown.related_company_name}
              </a>
              {shown.as_written && shown.as_written.length > 0 && (
                <> as &ldquo;{shown.as_written.join(', ')}&rdquo;</>
              )}
              .
            </p>
          )}

          {/* Both companies recorded this pair. Saying only the near side
              would hide that the far side disagrees. */}
          {shown.counterpart && (
            <p className={`text-[11px] ${shown.conflict ? 'text-amber-700' : 'text-gray-500'}`}>
              {shown.related_company_name} also recorded this
              {/* "Describe it differently" rather than "do not match": each end
                  calling the other its vendor is a mutual arrangement as often
                  as it is a mistake, and the card is not in a position to say
                  which. It points; the rep decides. */}
              {shown.conflict
                ? <> as <span className="font-semibold">{shown.counterpart.statuses.join(', ')}</span> — the two ends describe it differently.</>
                : <>, and the two agree.</>}
            </p>
          )}

          {/* The confirmation line and the way to move it, on one row.
              Separated from the notes above by a rule because it is about the
              record rather than about the relationship. */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
            <span className={`text-[11px] ${
              freshness === 'fresh' ? 'text-gray-400' : 'text-gray-500 font-medium'
            }`}>
              {confirmationLabel(shown)}
            </span>
            {!readOnly && !inbound && (
              <button
                type="button"
                onClick={() => setUpdating(true)}
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
