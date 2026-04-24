'use client';

import Link from 'next/link';
import type { ContactRow, PostConferenceData } from '../PostConferenceReview';

type Contacts = PostConferenceData['contacts'];

function HealthDelta({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
      {up ? `↑ +${delta}` : `↓ ${delta}`} pts
    </span>
  );
}

function Pill({ label, color }: { label: string; color?: string }) {
  if (color) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
        style={{ backgroundColor: `${color}18`, borderColor: `${color}40`, color }}>
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
      {label}
    </span>
  );
}

function ContactCard({ c }: { c: ContactRow }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-all bg-white space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/attendees/${c.attendee_id}`} className="text-sm font-semibold text-brand-primary hover:text-brand-secondary transition-colors block truncate">
            {c.first_name} {c.last_name}
          </Link>
          {c.title && <p className="text-xs text-gray-500 truncate">{c.title}</p>}
          {c.company_name && (
            <Link href={c.company_id ? `/companies/${c.company_id}` : '#'} className="text-xs text-gray-400 hover:text-brand-secondary truncate block">
              {c.company_name}
            </Link>
          )}
        </div>
        <HealthDelta delta={c.healthDelta} />
      </div>
      <div className="flex flex-wrap gap-1">
        {c.icp === 'Yes' && <span className="badge-green text-xs px-2 py-0.5">ICP</span>}
        {c.seniority && <Pill label={c.seniority} />}
        {c.company_type && <Pill label={c.company_type.split(',')[0].trim()} />}
        {c.lastEngagementType && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-brand-secondary border border-blue-200">
            {c.lastEngagementType}
          </span>
        )}
      </div>
      {c.assigned_user_names.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.assigned_user_names.map((u, i) => (
            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{ background: 'rgba(34,58,94,0.06)', color: '#223A5E', borderColor: 'rgba(34,58,94,0.15)' }}>
              {u}
            </span>
          ))}
        </div>
      )}
      {c.firstSeenConference && (
        <p className="text-xs text-gray-400">First seen at {c.firstSeenConference}</p>
      )}
    </div>
  );
}

function GhostCard({ c }: { c: ContactRow }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 bg-white space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/attendees/${c.attendee_id}`} className="text-sm font-semibold text-brand-primary hover:text-brand-secondary block truncate">
            {c.first_name} {c.last_name}
          </Link>
          {c.company_name && <p className="text-xs text-gray-400 truncate">{c.company_name}</p>}
        </div>
        <HealthDelta delta={c.healthDelta} />
      </div>
      <div className="flex flex-wrap gap-1">
        {c.icp === 'Yes' && <span className="badge-green text-xs px-2 py-0.5">ICP</span>}
        {c.company_type && <Pill label={c.company_type.split(',')[0].trim()} />}
        {c.priorConferenceCount >= 2 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            Ghost penalty
          </span>
        )}
      </div>
      {c.assigned_user_names.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.assigned_user_names.map((u, i) => (
            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{ background: 'rgba(34,58,94,0.06)', color: '#223A5E', borderColor: 'rgba(34,58,94,0.15)' }}>
              {u}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400">{c.priorConferenceCount} prior conferences, zero engagement this conference</p>
    </div>
  );
}

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{label} ({count})</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

export function ContactsCapturedTab({ contacts }: { contacts: Contacts }) {
  const total = contacts.newlyEngaged.length + contacts.reEngagements.length + contacts.stillUnengaged.length;
  const icpTotal = [...contacts.newlyEngaged, ...contacts.reEngagements, ...contacts.stillUnengaged].filter(c => c.icp === 'Yes').length;
  const maxBar = Math.max(1, contacts.newlyEngaged.length, contacts.reEngagements.length, contacts.stillUnengaged.length);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {[
          { label: 'Total Captured', value: contacts.newlyEngaged.length + contacts.reEngagements.length, color: '#223A5E' },
          { label: 'Newly Engaged', value: contacts.newlyEngaged.length, color: '#059669' },
          { label: 'Re-engagements', value: contacts.reEngagements.length, color: '#0f766e' },
          { label: 'Still Unengaged', value: contacts.stillUnengaged.length, color: '#d97706' },
          { label: 'ICP Contacts', value: icpTotal, color: '#059669' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-gray-100 p-4 bg-white">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs font-semibold text-gray-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Definition callout */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-gray-600 space-y-1.5">
        <p><span className="font-semibold text-emerald-700">Newly Engaged</span> — attendees seen at prior conferences but never previously engaged; first meaningful interaction was at this conference.</p>
        <p><span className="font-semibold text-teal-700">Re-engagement</span> — attendees with a history of engagement who engaged again at this conference. Health delta shows the change in relationship score.</p>
        <p><span className="font-semibold text-amber-700">Still Unengaged</span> — attended this conference with no engagement records logged. Ghost penalty applies for repeat appearances without engagement.</p>
      </div>

      {/* Breakdown bars */}
      <div className="rounded-xl border border-gray-200 p-4 bg-white space-y-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Engagement Breakdown</h4>
        {[
          { label: 'Newly Engaged', count: contacts.newlyEngaged.length, icp: contacts.newlyEngaged.filter(c => c.icp === 'Yes').length, color: '#059669' },
          { label: 'Re-engagements', count: contacts.reEngagements.length, icp: contacts.reEngagements.filter(c => c.icp === 'Yes').length, color: '#0f766e' },
          { label: 'Still Unengaged', count: contacts.stillUnengaged.length, icp: contacts.stillUnengaged.filter(c => c.icp === 'Yes').length, color: '#d97706' },
        ].map(b => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-28 flex-shrink-0">{b.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-3 relative overflow-hidden">
              <div className="h-3 rounded-full absolute left-0 top-0" style={{ width: `${Math.round((b.count / maxBar) * 100)}%`, backgroundColor: b.color }} />
              <div className="h-3 rounded-full absolute left-0 top-0 opacity-50" style={{ width: `${Math.round((b.icp / maxBar) * 100)}%`, backgroundColor: b.color, filter: 'brightness(1.3)' }} />
            </div>
            <span className="text-xs text-gray-600 flex-shrink-0">{b.count} <span className="text-gray-400">({b.icp} ICP)</span></span>
          </div>
        ))}
        <p className="text-xs text-gray-400">Lighter section within each bar represents ICP contacts</p>
      </div>

      {/* Newly engaged */}
      {contacts.newlyEngaged.length > 0 && (
        <div>
          <SectionDivider label="Newly Engaged" count={contacts.newlyEngaged.length} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {contacts.newlyEngaged.map(c => <ContactCard key={c.attendee_id} c={c} />)}
          </div>
        </div>
      )}

      {/* Re-engagements */}
      {contacts.reEngagements.length > 0 && (
        <div>
          <SectionDivider label="Re-Engagements" count={contacts.reEngagements.length} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {contacts.reEngagements.map(c => (
              <div key={c.attendee_id} className="rounded-xl border border-gray-200 p-4 bg-white space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/attendees/${c.attendee_id}`} className="text-sm font-semibold text-brand-primary hover:text-brand-secondary block truncate">
                      {c.first_name} {c.last_name}
                    </Link>
                    {c.company_name && <p className="text-xs text-gray-400 truncate">{c.company_name}</p>}
                  </div>
                  <HealthDelta delta={c.healthDelta} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.icp === 'Yes' && <span className="badge-green text-xs px-2 py-0.5">ICP</span>}
                  {c.seniority && <Pill label={c.seniority} />}
                  {c.lastEngagementType && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-brand-secondary border border-blue-200">
                      {c.lastEngagementType}
                    </span>
                  )}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.healthDelta > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : c.healthDelta < 0 ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                    {c.healthDelta > 0 ? 'Strengthened' : c.healthDelta < 0 ? 'Declined' : 'Held'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{c.priorConferenceCount} prior conference{c.priorConferenceCount !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Still unengaged */}
      {contacts.stillUnengaged.length > 0 && (
        <div>
          <SectionDivider label="Still Unengaged" count={contacts.stillUnengaged.length} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {contacts.stillUnengaged.map(c => <GhostCard key={c.attendee_id} c={c} />)}
          </div>
        </div>
      )}

      {total === 0 && (
        <p className="text-sm text-gray-400 text-center py-16">No contact data available.</p>
      )}
    </div>
  );
}
