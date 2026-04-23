'use client';

import { useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AttendeeInfo {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  status: string | null;
  seniority: string | null;
  company_name: string | null;
  company_type: string | null;
  icp: string | null;
  wse: number | null;
}

interface ConferenceRef {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
}

interface MeetingRow {
  id: number;
  meeting_date: string;
  meeting_time: string;
  location: string | null;
  scheduled_by: string | null;
  outcome: string | null;
  meeting_type: string | null;
}

interface NoteRow {
  id: number;
  content: string;
  created_at: string;
  conference_name: string | null;
  rep: string | null;
}

interface FollowUpRow {
  id: number;
  conference_id: number;
  next_steps: string | null;
  assigned_rep: string | null;
  completed: number | null;
  created_at: string;
}

interface SocialEventRow {
  social_event_id: number;
  rsvp_status: string;
  conference_id: number;
  event_type: string | null;
  event_name: string | null;
  event_date: string | null;
}

interface Touchpoint {
  conference: ConferenceRef;
  details: {
    action: string | null;
    notes: string | null;
    next_steps: string | null;
    assigned_rep: string | null;
    completed: number | null;
  } | null;
  meetings: MeetingRow[];
  notes: NoteRow[];
  followUps: FollowUpRow[];
  socialEvents: SocialEventRow[];
  depthScore: number;
}

interface TimelineData {
  attendee: AttendeeInfo;
  touchpoints: Touchpoint[];
  healthScore: number;
  daysSinceLastTouch: number | null;
  totalTouchpoints: number;
  followUpCompletionRate: number | null;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 75) return '#34D399';
  if (s >= 50) return '#f59e0b';
  if (s >= 25) return '#f97316';
  return '#ef4444';
}

function scoreTier(s: number): string {
  if (s >= 75) return 'Strong';
  if (s >= 50) return 'Warm';
  if (s >= 25) return 'Cooling';
  return 'Cold';
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

function initials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

// ── Health Ring SVG ────────────────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const color = scoreColor(score);
  const r = 38;
  const cx = 48;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={96} height={96} viewBox="0 0 96 96">
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke="rgba(34,58,94,0.08)" strokeWidth={6} />
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`} />
        <text x={cx} y={cx - 4} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: 'var(--font-dm-serif, serif)', fontSize: 18, fill: '#223A5E', fontWeight: 700 }}>
          {score}
        </text>
        <text x={cx} y={cx + 14} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9, fill: '#475569', letterSpacing: 1 }}>
          HEALTH
        </text>
      </svg>
      <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, fontWeight: 700, color }}>
        {scoreTier(score)}
      </span>
    </div>
  );
}

// ── Depth Arc SVG (per timeline node) ─────────────────────────────────────────

function DepthArc({ score, color }: { score: number; color: string }) {
  const r = 18;
  const cx = 23;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <svg width={46} height={46} viewBox="0 0 46 46" className="absolute inset-0 pointer-events-none">
      <circle cx={cx} cy={cx} r={r} fill="none"
        stroke={color} strokeWidth={3} strokeOpacity={0.6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`} />
    </svg>
  );
}

// ── TimelineRail ───────────────────────────────────────────────────────────────

function TimelineRail({ touchpoints, selectedIdx, onSelect }: {
  touchpoints: Touchpoint[];
  selectedIdx: number | null;
  onSelect: (i: number) => void;
}) {
  if (touchpoints.length === 0) return (
    <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 12, color: 'rgba(71,85,105,0.35)' }}>
      No conference history found.
    </div>
  );

  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, minWidth: 'max-content', padding: '8px 4px 16px' }}>
        {touchpoints.map((tp, i) => {
          const isActive = selectedIdx === i;
          const dColor = scoreColor(tp.depthScore);
          const hasMeeting = tp.meetings.length > 0;
          const hasSocial = tp.socialEvents.some(e => e.rsvp_status === 'attending');

          const nodeStyle: React.CSSProperties = {
            position: 'relative',
            width: 46, height: 46, borderRadius: '50%', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            background: isActive ? `${dColor}14` : '#F1F5F9',
            border: `2px solid ${isActive ? dColor : 'rgba(34,58,94,0.15)'}`,
            boxShadow: isActive
              ? `0 0 16px ${dColor}66, 0 1px 4px rgba(34,58,94,0.08)`
              : '0 1px 4px rgba(34,58,94,0.08)',
            transition: 'all 0.15s ease',
          };

          const confName = String(tp.conference.name ?? '');
          const truncated = confName.length > 16 ? confName.slice(0, 14) + '…' : confName;
          const dateStr = fmtDate(tp.conference.start_date).split(',')[0];

          return (
            <div key={tp.conference.id} style={{ display: 'flex', alignItems: 'center' }}>
              {/* Connector line before */}
              {i > 0 && (
                <div style={{ width: 32, height: 1, background: 'rgba(34,58,94,0.12)', flexShrink: 0 }} />
              )}

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                {/* Node */}
                <div style={nodeStyle} onClick={() => onSelect(i)}>
                  <DepthArc score={tp.depthScore} color={dColor} />
                  <span style={{
                    fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 11, fontWeight: 700,
                    color: isActive ? dColor : '#3A506B', position: 'relative', zIndex: 1,
                  }}>
                    {tp.depthScore}
                  </span>
                  {/* Meeting dot */}
                  {hasMeeting && (
                    <div style={{
                      position: 'absolute', top: 1, right: 1, width: 8, height: 8,
                      borderRadius: '50%', background: '#223A5E',
                      border: '1.5px solid white',
                    }} />
                  )}
                  {/* Social dot */}
                  {hasSocial && (
                    <div style={{
                      position: 'absolute', bottom: 1, right: 1, width: 8, height: 8,
                      borderRadius: '50%', background: '#34D399',
                      border: '1.5px solid white',
                    }} />
                  )}
                </div>

                {/* Label */}
                <div style={{ textAlign: 'center', maxWidth: 72 }}>
                  <div style={{
                    fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10,
                    color: isActive ? '#223A5E' : 'rgba(71,85,105,0.55)',
                    fontWeight: isActive ? 600 : 400,
                    whiteSpace: 'nowrap',
                  }}>
                    {truncated}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9,
                    color: 'rgba(71,85,105,0.35)',
                  }}>
                    {dateStr}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── LegendRow ──────────────────────────────────────────────────────────────────

function LegendRow() {
  const items: Array<{ color: string; label: string }> = [
    { color: '#223A5E', label: 'Meeting' },
    { color: '#34D399', label: 'Social Event' },
    { color: '#34D399', label: 'Strong 75+' },
    { color: '#f59e0b', label: 'Warm 50–74' },
    { color: '#f97316', label: 'Cooling 25–49' },
    { color: '#ef4444', label: 'Cold <25' },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginBottom: 20 }}>
      {items.map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'rgba(71,85,105,0.55)' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── ContactHeader ──────────────────────────────────────────────────────────────

function ContactHeader({ attendee, healthScore, hColor }: {
  attendee: AttendeeInfo;
  healthScore: number;
  hColor: string;
}) {
  const pillBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 8px', borderRadius: 20,
    fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10,
    background: 'rgba(34,58,94,0.07)', border: '1px solid rgba(34,58,94,0.12)',
    color: '#3A506B', marginRight: 4, marginBottom: 4,
  };
  const icpPill: React.CSSProperties = {
    ...pillBase,
    background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)',
    color: '#059669',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1, minWidth: 0 }}>
        {/* Avatar */}
        <div style={{
          width: 54, height: 54, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${hColor}22`, border: `1.5px solid ${hColor}40`,
          fontFamily: 'var(--font-dm-serif, serif)', fontSize: 20, fontWeight: 700,
          color: hColor,
        }}>
          {initials(attendee.first_name, attendee.last_name)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name */}
          <div style={{ fontFamily: 'var(--font-dm-serif, serif)', fontSize: 22, fontWeight: 700, color: '#223A5E', lineHeight: 1.2 }}>
            {attendee.first_name} {attendee.last_name}
          </div>
          {/* Title · Company */}
          <div style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 13, color: 'rgba(71,85,105,0.7)', marginTop: 2, marginBottom: 8 }}>
            {[attendee.title, attendee.company_name].filter(Boolean).join(' · ')}
          </div>
          {/* Pill tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {attendee.company_type && <span style={pillBase}>{attendee.company_type}</span>}
            {attendee.seniority && <span style={pillBase}>{attendee.seniority}</span>}
            {attendee.status && <span style={pillBase}>{attendee.status}</span>}
            {attendee.icp === 'Yes' && <span style={icpPill}>ICP</span>}
          </div>
        </div>
      </div>

      {/* Health ring */}
      <div style={{ flexShrink: 0 }}>
        <HealthRing score={healthScore} />
      </div>
    </div>
  );
}

// ── StatRow ────────────────────────────────────────────────────────────────────

function StatRow({ total, days, completion }: {
  total: number;
  days: number | null;
  completion: number | null;
}) {
  const stale = days !== null && days > 180;
  const boxBase: React.CSSProperties = {
    flex: 1, padding: '12px 14px', borderRadius: 11,
    background: '#F1F5F9', border: '1px solid rgba(34,58,94,0.08)',
    textAlign: 'center',
  };
  const staleBox: React.CSSProperties = {
    ...boxBase,
    background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.25)',
  };
  const label: React.CSSProperties = {
    fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9,
    color: 'rgba(71,85,105,0.6)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
  };
  const number: React.CSSProperties = {
    fontFamily: 'var(--font-dm-serif, serif)', fontSize: 24,
    fontWeight: 700, color: '#223A5E', lineHeight: 1,
  };
  const sub: React.CSSProperties = {
    fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10,
    color: 'rgba(71,85,105,0.45)', marginTop: 2,
  };

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
      <div style={boxBase}>
        <div style={label}>Conferences</div>
        <div style={number}>{total}</div>
        <div style={sub}>touchpoints</div>
      </div>
      <div style={stale ? staleBox : boxBase}>
        <div style={label}>Last Touch</div>
        <div style={{ ...number, color: stale ? '#ef4444' : '#223A5E' }}>
          {days !== null ? days : '—'}
        </div>
        <div style={sub}>{days !== null ? 'days ago' : 'no data'}</div>
      </div>
      <div style={boxBase}>
        <div style={label}>Follow-ups</div>
        <div style={number}>{completion !== null ? `${completion}%` : '—'}</div>
        <div style={sub}>completion</div>
      </div>
    </div>
  );
}

// ── DetailPanel ────────────────────────────────────────────────────────────────

function DetailPanel({ tp }: { tp: Touchpoint }) {
  const dColor = scoreColor(tp.depthScore);
  const attending = tp.socialEvents.filter(e => e.rsvp_status === 'attending');

  const innerCard: React.CSSProperties = {
    background: '#ffffff', border: '1px solid rgba(34,58,94,0.09)',
    borderRadius: 9, padding: '10px 12px', marginBottom: 8,
  };
  const sectionLabel: React.CSSProperties = {
    fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9,
    color: 'rgba(71,85,105,0.5)', textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 6, marginTop: 14,
  };

  return (
    <div style={{
      background: '#F1F5F9', border: '1px solid rgba(34,58,94,0.09)',
      borderRadius: 13, padding: '16px 18px',
      animation: 'fadeUp 0.18s ease',
    }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-dm-serif, serif)', fontSize: 16, color: '#223A5E', fontWeight: 700 }}>
            {tp.conference.name}
          </div>
          <div style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 11, color: 'rgba(71,85,105,0.55)', marginTop: 2 }}>
            {tp.conference.location} · {fmtDate(tp.conference.start_date)}
            {tp.conference.end_date && tp.conference.end_date !== tp.conference.start_date
              ? ` – ${fmtDate(tp.conference.end_date)}` : ''}
          </div>
        </div>
        <div style={{
          fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 11, fontWeight: 700,
          color: dColor, background: `${dColor}18`, border: `1px solid ${dColor}40`,
          borderRadius: 20, padding: '3px 10px', flexShrink: 0,
        }}>
          {tp.depthScore} depth
        </div>
      </div>

      {/* Conference activity detail card */}
      {tp.details && (tp.details.action || tp.details.notes || tp.details.next_steps) && (
        <div style={innerCard}>
          <div style={sectionLabel}>CONFERENCE ACTIVITY</div>
          {tp.details.action && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9, color: 'rgba(71,85,105,0.5)', textTransform: 'uppercase' }}>Action </span>
              <span style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 12, color: '#223A5E', fontWeight: 500 }}>{tp.details.action}</span>
            </div>
          )}
          {tp.details.next_steps && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9, color: 'rgba(71,85,105,0.5)', textTransform: 'uppercase' }}>Next Steps </span>
              <span style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 12, color: '#223A5E', fontWeight: 500 }}>{tp.details.next_steps}</span>
            </div>
          )}
          {tp.details.assigned_rep && (
            <div>
              <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9, color: 'rgba(71,85,105,0.5)', textTransform: 'uppercase' }}>Rep </span>
              <span style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 12, color: '#223A5E', fontWeight: 500 }}>{tp.details.assigned_rep}</span>
            </div>
          )}
        </div>
      )}

      {/* Meetings */}
      {tp.meetings.length > 0 && (
        <>
          <div style={sectionLabel}>MEETINGS</div>
          {tp.meetings.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: 'rgba(34,58,94,0.04)', border: '1px solid rgba(34,58,94,0.10)',
              borderRadius: 8, padding: '8px 10px', marginBottom: 6,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#223A5E', flexShrink: 0, marginTop: 4 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 12, color: '#223A5E', fontWeight: 500 }}>
                  {m.meeting_type || 'Meeting'}
                </div>
                {m.outcome && (
                  <div style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 11, color: 'rgba(71,85,105,0.6)' }}>
                    {m.outcome}
                  </div>
                )}
              </div>
              <div style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'rgba(71,85,105,0.4)', flexShrink: 0 }}>
                {fmtDate(m.meeting_date)}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Social events */}
      {attending.length > 0 && (
        <>
          <div style={sectionLabel}>EVENTS ATTENDED</div>
          {attending.map(e => (
            <div key={e.social_event_id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.18)',
              borderRadius: 8, padding: '8px 10px', marginBottom: 6,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 12, color: '#223A5E', fontWeight: 500 }}>
                  {e.event_name || e.event_type || 'Social Event'}
                </span>
              </div>
              <span style={{
                fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, fontWeight: 700,
                color: '#059669', background: 'rgba(52,211,153,0.15)',
                borderRadius: 20, padding: '2px 8px',
              }}>
                {e.rsvp_status}
              </span>
            </div>
          ))}
        </>
      )}

      {/* Notes */}
      {tp.notes.length > 0 && (
        <>
          <div style={sectionLabel}>NOTES</div>
          {tp.notes.map(n => (
            <div key={n.id} style={{ ...innerCard, marginBottom: 6 }}>
              <div style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 12, color: '#3A506B', lineHeight: 1.55 }}>
                {n.content}
              </div>
              {n.rep && (
                <div style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'rgba(71,85,105,0.4)', marginTop: 4 }}>
                  {n.rep}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Follow-ups */}
      {tp.followUps.length > 0 && (
        <>
          <div style={sectionLabel}>FOLLOW-UPS</div>
          {tp.followUps.map(f => {
            const done = Boolean(f.completed);
            return (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#ffffff', border: '1px solid rgba(34,58,94,0.09)',
                borderRadius: 8, padding: '8px 10px', marginBottom: 6,
              }}>
                {/* Checkbox */}
                <div style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  background: done ? 'rgba(52,211,153,0.15)' : '#F1F5F9',
                  border: `1.5px solid ${done ? '#34D399' : 'rgba(34,58,94,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {done && (
                    <svg width={9} height={9} viewBox="0 0 9 9" fill="none">
                      <path d="M1.5 4.5l2 2 4-4" stroke="#059669" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 12,
                    color: done ? 'rgba(71,85,105,0.4)' : '#223A5E',
                    fontWeight: done ? 400 : 500,
                    textDecoration: done ? 'line-through' : 'none',
                  }}>
                    {f.next_steps || '—'}
                  </div>
                  {f.assigned_rep && (
                    <div style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'rgba(71,85,105,0.4)' }}>
                      {f.assigned_rep}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function RelationshipTimeline({ attendeeId }: { attendeeId: number }) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Inject DM fonts
  useEffect(() => {
    const id = 'dm-fonts-link';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&family=DM+Mono:wght@400;500&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/attendees/${attendeeId}/timeline`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load timeline');
        return r.json();
      })
      .then((d: TimelineData) => {
        setData(d);
        setSelectedIdx(d.touchpoints.length > 0 ? d.touchpoints.length - 1 : null);
      })
      .catch(() => setError('Failed to load timeline data.'))
      .finally(() => setLoading(false));
  }, [attendeeId]);

  if (loading) return (
    <div className="flex items-center justify-center py-20"
      style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 12, color: 'rgba(71,85,105,0.5)' }}>
      Loading timeline…
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center py-20"
      style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 12, color: '#ef4444' }}>
      {error}
    </div>
  );

  if (!data) return null;

  const { attendee, touchpoints, healthScore, daysSinceLastTouch, totalTouchpoints, followUpCompletionRate } = data;
  const hColor = scoreColor(healthScore);
  const selectedTp = selectedIdx !== null ? touchpoints[selectedIdx] ?? null : null;

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', color: '#223A5E' }}>
      <ContactHeader attendee={attendee} healthScore={healthScore} hColor={hColor} />
      <StatRow total={totalTouchpoints} days={daysSinceLastTouch} completion={followUpCompletionRate} />
      <TimelineRail touchpoints={touchpoints} selectedIdx={selectedIdx} onSelect={setSelectedIdx} />
      <LegendRow />
      {selectedTp && <DetailPanel tp={selectedTp} />}
    </div>
  );
}
