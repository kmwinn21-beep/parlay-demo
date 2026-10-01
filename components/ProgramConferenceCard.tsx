'use client';

import Link from 'next/link';
import { ConferenceStageBadge } from './ConferenceStageBadge';
import { ConferenceAvatar } from './ConferenceAvatar';
import { RepAssignmentPopover, type AssignedRep } from './RepAssignmentPopover';
import { QuickViewIcon, type QuickViewTarget } from './QuickViewDrawer';
import { postConferenceDaysRemaining, type ConferenceStage } from '@/lib/conference-stage';
import { closesInLabel, conferenceDayLabel, startsInLabel } from '@/lib/conferenceCardBar';

export interface ProgramCardRep {
  userId: number;
  displayName: string;
  initials: string;
}

export interface ProgramCardTerritory {
  id: number;
  name: string;
  color: string;
}

export interface ProgramCardConference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  location_city?: string | null;
  location_state?: string | null;
  logo_url?: string | null;
  stage: ConferenceStage | null;
  post_conference_days?: number | null;
  assignedReps: ProgramCardRep[];
  outreachProgress: { assigned: number; total: number } | null;
  attendeeCount: number;
  hasAttendeeList: boolean;
  territoryScope: string | null;
  territoryIds: number[];
  // Not yet on the enriched API response (see the ?enriched=1 route) — closed
  // cards fall back to '—' for these until a future pass adds them.
  pipelineInfluenced?: number | null;
  meetingCount?: number | null;
  companiesEngaged?: number | null;
}

// Same city/state-only convention used on the conference details page and
// dashboard banner — falls back to the raw location string when city/state
// aren't set.
function cityStateLabel(conference: Pick<ProgramCardConference, 'location' | 'location_city' | 'location_state'>): string {
  if (conference.location_city && conference.location_state) return `${conference.location_city}, ${conference.location_state}`;
  return conference.location;
}

// Deterministic background color from a name — kept local per this build's
// convention (no shared avatar-color utility exists in this codebase; every
// other avatar component — RepAssignmentPopover, SalesRepsTab — duplicates
// its own copy of the same small hash-into-a-palette function).
const AVATAR_PALETTE = [
  '#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#D97706',
  '#059669', '#0891B2', '#4F46E5', '#C026D3', '#65A30D',
];
function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// Green (full-color border, lighter fill) when a list has been uploaded, red
// in the same style otherwise — shared between the card and the list-view
// table so both stay in sync.
export function ListStatusPill({ hasAttendeeList, attendeeCount }: { hasAttendeeList: boolean; attendeeCount: number }) {
  const color = hasAttendeeList ? '#059669' : '#DC2626';
  return (
    <span
      title={hasAttendeeList ? `${attendeeCount?.toLocaleString()} attendees` : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
        border: `1px solid ${color}`, background: `${color}18`, color,
      }}
    >
      {hasAttendeeList && <i className="ti ti-check" style={{ fontSize: 11 }} aria-hidden="true" />}
      {hasAttendeeList ? 'List uploaded' : 'List not uploaded'}
    </span>
  );
}

// Green (full-color border, lighter fill) when at least one company has been
// assigned for outreach, red otherwise — same visual convention as
// ListStatusPill, shared between the card and the list-view table.
export function OutreachStatusPill({
  outreachProgress,
  showPrefix = true,
}: {
  outreachProgress: { assigned: number; total: number } | null;
  /** Card view spells out "Outreach Assigned/Not Assigned"; the table's own
   * "Outreach" column header already says that, so it just needs "Assigned". */
  showPrefix?: boolean;
}) {
  const isAssigned = !!outreachProgress && outreachProgress.assigned > 0;
  const color = isAssigned ? '#059669' : '#DC2626';
  const label = showPrefix
    ? (isAssigned ? 'Outreach Assigned' : 'Outreach Not Assigned')
    : (isAssigned ? 'Assigned' : 'Not Assigned');
  return (
    <span
      title={outreachProgress ? `${outreachProgress.assigned} / ${outreachProgress.total} companies assigned` : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
        border: `1px solid ${color}`, background: `${color}18`, color,
      }}
    >
      {label}
    </span>
  );
}

/**
 * The way into a conference when the card itself is not a link.
 *
 * On the Program tab the whole card is the link, which is right for a page
 * whose job is to get you into one. In the dashboard banner the cards sit in
 * a scrolling row inside a panel that opens over the page, and a card-sized
 * click target there is easy to hit while swiping the row or reaching for the
 * chevron — so the navigation is a button you aim at.
 */
function GoToButton({ conferenceId }: { conferenceId: number }) {
  return (
    <Link
      href={`/conferences/${conferenceId}`}
      // Pushed to the end of its row rather than placed after a spacer, so it
      // lands on the right edge whether it follows one pill or three.
      style={{ marginLeft: 'auto' }}
      className="inline-flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium text-brand-secondary border border-brand-secondary/40 hover:bg-brand-secondary hover:text-white hover:border-brand-secondary transition-colors"
    >
      Go to
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
    </Link>
  );
}

function formatDate(d: string): string {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonthYear(d: string): string {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface TopBarStyle { bg: string; border: string; textColor: string; label: string }

/*
 * The bar says where the conference is in its own life; the badge beside it
 * says which stage that is. So the bar no longer repeats the stage's own word
 * back at it — "Post-conference · 10 days remaining" next to a badge reading
 * Post-Conference said it twice and buried the number.
 */
function topBarFor(conference: ProgramCardConference, daysUntil: number): TopBarStyle {
  const stage = conference.stage;
  if (stage === 'planning') {
    const label = startsInLabel(daysUntil);
    if (daysUntil <= 30) {
      return { bg: 'var(--bg-warning, #FFFBEB)', border: 'var(--border-warning, #FDE68A)', textColor: 'var(--text-warning, #B45309)', label };
    }
    return { bg: 'var(--surface-1, #F9FAFB)', border: 'var(--border, #E5E7EB)', textColor: 'var(--text-muted, #9CA3AF)', label };
  }
  if (stage === 'in_progress') {
    // Which morning of the show it is. "Happening now" was true of every live
    // conference at once and told a rep nothing about where they were in it.
    return { bg: 'var(--bg-success, #ECFDF5)', border: 'var(--border-success, #A7F3D0)', textColor: 'var(--text-success, #047857)', label: conferenceDayLabel(conference.start_date, conference.end_date) };
  }
  if (stage === 'post_conference') {
    const daysRemaining = postConferenceDaysRemaining({ end_date: conference.end_date, post_conference_days: conference.post_conference_days ?? null });
    return { bg: 'var(--bg-warning, #FFFBEB)', border: 'var(--border-warning, #FDE68A)', textColor: 'var(--text-warning, #B45309)', label: closesInLabel(daysRemaining) };
  }
  // closed (or null, shouldn't render for null since Program tab excludes historical)
  return { bg: 'var(--surface-1, #F9FAFB)', border: 'var(--border, #E5E7EB)', textColor: 'var(--text-muted, #9CA3AF)', label: `Completed · ${formatMonthYear(conference.end_date)}` };
}

export function RepAvatarStack({ reps }: { reps: ProgramCardRep[] }) {
  if (reps.length === 0) {
    return <span style={{ fontSize: 11, color: 'var(--text-muted, #9CA3AF)' }}>No reps assigned</span>;
  }
  const visible = reps.slice(0, 3);
  const overflow = reps.length - visible.length;
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {visible.map((rep, i) => (
        <div
          key={rep.userId}
          title={rep.displayName}
          style={{
            width: 22, height: 22, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: colorForName(rep.displayName), color: '#fff',
            fontSize: 9, fontWeight: 500,
            border: '1.5px solid var(--surface-2, #fff)',
            marginLeft: i === 0 ? 0 : -6,
            zIndex: visible.length - i,
            flexShrink: 0,
          }}
        >
          {rep.initials}
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{
            width: 22, height: 22, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface-1, #F3F4F6)', color: 'var(--text-secondary, #6B7280)',
            fontSize: 9, fontWeight: 500,
            border: '1.5px solid var(--surface-2, #fff)',
            marginLeft: -6, flexShrink: 0,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

// Small colored pill showing the conference's Market Coverage — "National" in
// brand-primary, or the resolved territory name(s) in that territory's own
// color, matching the same convention the Plan tab's Territory column uses.
export function TerritoryPill({ conference, territories }: { conference: ProgramCardConference; territories: ProgramCardTerritory[] }) {
  if (conference.territoryScope === 'national') {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', flexShrink: 0,
          padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600,
          border: '1px solid rgb(var(--brand-primary-rgb))',
          background: 'rgb(var(--brand-primary-rgb) / 0.1)',
          color: 'rgb(var(--brand-primary-rgb))',
        }}
      >
        National
      </span>
    );
  }
  if (conference.territoryScope === 'regional' && conference.territoryIds.length > 0) {
    const matched = territories.filter(t => conference.territoryIds.includes(t.id));
    if (matched.length === 0) return null;
    return (
      <>
        {matched.map(t => (
          <span
            key={t.id}
            style={{
              display: 'inline-flex', alignItems: 'center', flexShrink: 0,
              padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600,
              border: `1px solid ${t.color}`, background: `${t.color}18`, color: t.color,
            }}
          >
            {t.name}
          </span>
        ))}
      </>
    );
  }
  return null;
}

export function ProgramConferenceCard({ conference, territories, planYear, allConferences, onRepsUpdated, onQuickView, showOutreach = true, linkMode = 'card' }: {
  conference: ProgramCardConference;
  territories: ProgramCardTerritory[];
  planYear: number;
  allConferences: Array<{ conferenceId: number; name: string; startDate: string; assignedReps: AssignedRep[] }>;
  onRepsUpdated: (conferenceId: number, reps: AssignedRep[]) => void;
  onQuickView: (target: QuickViewTarget) => void;
  /**
   * Whether the outreach pill sits beside the list one.
   *
   * On by default, which is the Program tab: that page is where outreach gets
   * assigned, so whether it has been is one of the things it is for. The
   * dashboard banner turns it off — the card is narrower there and the two
   * pills wrapped onto separate lines, and a rep glancing at the dashboard is
   * asking whether the list is in, not how far the assignment has got.
   */
  showOutreach?: boolean;
  /**
   * Where the link into the conference lives.
   *
   * `card` — the whole card, which is the Program tab and how this has always
   * worked. `button` — a "Go to" button in the card's bottom row and nothing
   * else, which is the dashboard banner: its cards sit in a scrolling row
   * inside a panel that opens over the page, and a card-sized click target
   * there fires while swiping the row or reaching past it.
   *
   * One prop rather than two, because these are one decision. Splitting it
   * would allow a card that is a link AND carries a button, or one that is
   * neither and cannot be opened at all.
   */
  linkMode?: 'card' | 'button';
}) {
  const daysUntil = Math.max(0, Math.ceil((new Date(conference.start_date + 'T00:00:00').getTime() - Date.now()) / 86_400_000));
  const bar = topBarFor(conference, daysUntil);
  const isClosed = conference.stage === 'closed';
  // Direct rep assignment from the card is only offered for conferences still
  // being planned — once a conference is underway or done, reassigning reps
  // from the Program tab's overview isn't the right place for that edit.
  const canAssignReps = conference.stage === 'planning';

  const asLink = linkMode === 'card';
  // The hover lift only where the card itself goes somewhere. Left on a card
  // that no longer does, it keeps promising a click that does nothing.
  const shell = `card p-0 overflow-hidden flex flex-col border border-transparent${
    asLink ? ' hover:shadow-md transition-all hover:border-brand-secondary' : ''
  }`;

  const body = (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', background: bar.bg, borderBottom: `1px solid ${bar.border}`,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 500, color: bar.textColor }}>{bar.label}</span>
        {conference.stage && <ConferenceStageBadge stage={conference.stage} />}
      </div>

      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* The logo leads the name and the date/location line together, so the
            two read as one block beside it rather than as separate rows. */}
        <div className="flex items-start gap-2.5">
          <ConferenceAvatar name={conference.name} logoUrl={conference.logo_url} size={32} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1.5">
              <div className="flex items-start gap-2 min-w-0">
                <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: 'var(--text-primary, #111827)' }} className="line-clamp-2">
                  {conference.name}
                </p>
                <QuickViewIcon onClick={() => onQuickView({ type: 'conference', id: conference.id, name: conference.name })} />
              </div>
              <TerritoryPill conference={conference} territories={territories} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary, #6B7280)', margin: '2px 0 0' }} className="truncate">
              {formatDate(conference.start_date)}
              {conference.end_date && conference.end_date !== conference.start_date ? ` – ${formatDate(conference.end_date)}` : ''}
              {conference.location ? ` · ${cityStateLabel(conference)}` : ''}
            </p>
          </div>
        </div>

        <div style={{ marginTop: 8 }} onClick={e => { if (canAssignReps) { e.preventDefault(); e.stopPropagation(); } }}>
          {canAssignReps ? (
            <RepAssignmentPopover
              conferenceId={conference.id}
              planYear={planYear}
              assignedReps={conference.assignedReps}
              allConferences={allConferences}
              onUpdate={reps => onRepsUpdated(conference.id, reps)}
            />
          ) : (
            <RepAvatarStack reps={conference.assignedReps} />
          )}
        </div>

        {isClosed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, marginTop: 8, borderTop: '0.5px solid var(--border, #E5E7EB)' }}>
            {[
              { label: 'Pipeline', value: conference.pipelineInfluenced ? `$${(conference.pipelineInfluenced / 1000).toFixed(0)}K` : '—' },
              { label: 'Meetings', value: conference.meetingCount ?? '—' },
              { label: 'Companies', value: conference.companiesEngaged ?? '—' },
            ].map((stat, i) => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <div style={{ width: '0.5px', height: 24, background: 'var(--border, #E5E7EB)', flexShrink: 0 }} />}
                <div>
                  <p style={{ fontSize: 10, color: 'var(--text-muted, #9CA3AF)', margin: 0 }}>{stat.label}</p>
                  <p style={{ fontSize: 12, fontWeight: 500, margin: 0, color: 'var(--text-primary, #111827)' }}>{stat.value}</p>
                </div>
              </div>
            ))}
            {/* A closed conference has no pill row to sit in, so the button
                joins the stats. Without it these cards would be the only ones
                in the banner with no way into them at all. */}
            {!asLink && <GoToButton conferenceId={conference.id} />}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderTop: '0.5px solid var(--border, #E5E7EB)', paddingTop: 8, marginTop: 8 }}>
            {showOutreach && <OutreachStatusPill outreachProgress={conference.outreachProgress} />}
            <ListStatusPill hasAttendeeList={conference.hasAttendeeList} attendeeCount={conference.attendeeCount} />
            {!asLink && <GoToButton conferenceId={conference.id} />}
          </div>
        )}
      </div>
    </>
  );

  /*
   * A link or a div, written out rather than chosen into one element.
   *
   * Nesting the Go-to link inside a card-wide one would be invalid HTML, so
   * these are genuinely two shapes; a polymorphic root would only have hidden
   * that behind a type the compiler cannot check.
   */
  return asLink
    ? <Link href={`/conferences/${conference.id}`} className={shell}>{body}</Link>
    : <div className={shell}>{body}</div>;
}
