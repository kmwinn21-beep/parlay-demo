'use client';

import Link from 'next/link';
import { ConferenceStageBadge } from './ConferenceStageBadge';
import { postConferenceDaysRemaining, type ConferenceStage } from '@/lib/conference-stage';

export interface ProgramCardRep {
  userId: number;
  displayName: string;
  initials: string;
}

export interface ProgramCardConference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  stage: ConferenceStage | null;
  post_conference_days?: number | null;
  assignedReps: ProgramCardRep[];
  outreachProgress: { assigned: number; total: number } | null;
  attendeeCount: number;
  hasAttendeeList: boolean;
  // Not yet on the enriched API response (see the ?enriched=1 route) — closed
  // cards fall back to '—' for these until a future pass adds them.
  pipelineInfluenced?: number | null;
  meetingCount?: number | null;
  companiesEngaged?: number | null;
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

function formatDate(d: string): string {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonthYear(d: string): string {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface TopBarStyle { bg: string; border: string; textColor: string; label: string }

function topBarFor(conference: ProgramCardConference, daysUntil: number): TopBarStyle {
  const stage = conference.stage;
  if (stage === 'planning') {
    if (daysUntil <= 30) {
      return { bg: 'var(--bg-warning, #FFFBEB)', border: 'var(--border-warning, #FDE68A)', textColor: 'var(--text-warning, #B45309)', label: `in ${daysUntil} days` };
    }
    return { bg: 'var(--surface-1, #F9FAFB)', border: 'var(--border, #E5E7EB)', textColor: 'var(--text-muted, #9CA3AF)', label: `in ${daysUntil} days` };
  }
  if (stage === 'in_progress') {
    return { bg: 'var(--bg-success, #ECFDF5)', border: 'var(--border-success, #A7F3D0)', textColor: 'var(--text-success, #047857)', label: 'Happening now' };
  }
  if (stage === 'post_conference') {
    const daysRemaining = postConferenceDaysRemaining({ end_date: conference.end_date, post_conference_days: conference.post_conference_days ?? null });
    return { bg: 'var(--bg-warning, #FFFBEB)', border: 'var(--border-warning, #FDE68A)', textColor: 'var(--text-warning, #B45309)', label: `Post-conference · ${daysRemaining} days remaining` };
  }
  // closed (or null, shouldn't render for null since Program tab excludes historical)
  return { bg: 'var(--surface-1, #F9FAFB)', border: 'var(--border, #E5E7EB)', textColor: 'var(--text-muted, #9CA3AF)', label: `Completed · ${formatMonthYear(conference.end_date)}` };
}

function RepAvatarStack({ reps }: { reps: ProgramCardRep[] }) {
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

export function ProgramConferenceCard({ conference }: { conference: ProgramCardConference }) {
  const daysUntil = Math.max(0, Math.ceil((new Date(conference.start_date + 'T00:00:00').getTime() - Date.now()) / 86_400_000));
  const bar = topBarFor(conference, daysUntil);
  const isClosed = conference.stage === 'closed';

  return (
    <Link
      href={`/conferences/${conference.id}`}
      className="card p-0 overflow-hidden flex flex-col hover:shadow-md transition-all hover:border-brand-secondary border border-transparent"
    >
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
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: 'var(--text-primary, #111827)' }} className="line-clamp-2">
          {conference.name}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-secondary, #6B7280)', margin: '2px 0 0' }} className="truncate">
          {formatDate(conference.start_date)}
          {conference.end_date && conference.end_date !== conference.start_date ? ` – ${formatDate(conference.end_date)}` : ''}
          {conference.location ? ` · ${conference.location}` : ''}
        </p>

        <div style={{ marginTop: 8 }}>
          <RepAvatarStack reps={conference.assignedReps} />
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
          </div>
        ) : (
          <>
            {conference.outreachProgress !== null && (
              <div style={{ borderTop: '0.5px solid var(--border, #E5E7EB)', paddingTop: 8, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary, #6B7280)' }}>Outreach</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary, #111827)' }}>
                    {conference.outreachProgress.assigned} / {conference.outreachProgress.total}
                  </span>
                </div>
                <div style={{ height: 4, background: 'var(--border, #E5E7EB)', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.round(conference.outreachProgress.assigned / Math.max(conference.outreachProgress.total, 1) * 100)}%`,
                      background: 'var(--fill-accent, rgb(var(--brand-secondary-rgb, 27 118 188)))',
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
              {conference.hasAttendeeList ? (
                <>
                  <i className="ti ti-check" style={{ fontSize: 12, color: 'var(--text-success, #047857)' }} aria-hidden="true" />
                  <span style={{ fontSize: 11, color: 'var(--text-success, #047857)' }}>
                    List uploaded · {conference.attendeeCount?.toLocaleString()} attendees
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--text-muted, #9CA3AF)' }}>List not uploaded</span>
              )}
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
