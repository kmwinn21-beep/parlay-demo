'use client';

import { createPortal } from 'react-dom';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { effectiveSeniority } from '@/lib/parsers';
import { useConfigColors } from '@/lib/useConfigColors';
import { getBadgeClass, getPillClass, getPreset } from '@/lib/colors';
import { useUserOptions, parseRepIds, getRepInitials } from '@/lib/useUserOptions';

export interface CompanyAttendeeLite {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  seniority?: string;
  function?: string;
  company_type?: string;
  company_name?: string;
  company_id?: number;
  company_assigned_user?: string;
  email?: string;
  linkedin_url?: string;
}

interface Props {
  companyName: string;
  attendees: CompanyAttendeeLite[];
  onClose: () => void;
}

function AttendeeMiniCard({ attendee }: { attendee: CompanyAttendeeLite }) {
  const colorMaps = useConfigColors();
  const userOptionsFull = useUserOptions();
  const seniority = effectiveSeniority(attendee.seniority, attendee.title);
  const initials = `${attendee.first_name?.[0] ?? ''}${attendee.last_name?.[0] ?? ''}`.toUpperCase();
  const repUsers = parseRepIds(attendee.company_assigned_user ?? '').map(id => userOptionsFull.find(u => u.id === id)).filter(Boolean);

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-brand-primary flex items-center justify-center text-white text-sm font-bold font-serif flex-shrink-0">
          {initials || '?'}
        </div>
        <div className="min-w-0">
          <Link href={`/attendees/${attendee.id}`} className="text-sm font-bold text-brand-primary hover:text-brand-secondary hover:underline">
            {attendee.first_name} {attendee.last_name}
          </Link>
          {attendee.title && <p className="text-xs text-gray-600 mt-0.5 truncate">{attendee.title}</p>}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {attendee.title && <span className={`badge ${getPillClass(seniority, colorMaps.seniority || {})}`}>{seniority}</span>}
            {attendee.function && <span className={`badge ${getPillClass(attendee.function, colorMaps.function || {})}`}>{attendee.function}</span>}
            {attendee.company_type && <span className={getBadgeClass(attendee.company_type, colorMaps.company_type || {})}>{attendee.company_type}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Company</p>
          {attendee.company_name ? (
            attendee.company_id ? (
              <Link href={`/companies/${attendee.company_id}`} className="text-sm font-medium text-gray-800 hover:text-brand-secondary hover:underline">{attendee.company_name}</Link>
            ) : <p className="text-sm font-medium text-gray-800">{attendee.company_name}</p>
          ) : <p className="text-sm text-gray-400">—</p>}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Assigned Rep(s)</p>
          <div className="flex flex-wrap gap-1">
            {repUsers.length > 0 ? repUsers.map((user, i) => (
              <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getPreset(colorMaps.user?.[user!.value]).badgeClass}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                  <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                </svg>
                {getRepInitials(user!.value)}
              </span>
            )) : <p className="text-sm text-gray-400">—</p>}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Email</p>
          {attendee.email ? (
            <div className="flex items-center gap-2">
              <a href={`mailto:${attendee.email}`} className="text-sm text-brand-secondary hover:underline truncate" title={attendee.email}>
                {attendee.email}
              </a>
              <button
                type="button"
                title="Copy email"
                onClick={() => {
                  navigator.clipboard.writeText(attendee.email!)
                    .then(() => toast.success('Email copied to clipboard.'))
                    .catch(() => toast.error('Failed to copy email.'));
                }}
                className="flex-shrink-0 text-gray-400 hover:text-brand-secondary transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          ) : <p className="text-sm text-gray-400">—</p>}
        </div>
      </div>
    </div>
  );
}

export function CompanyAttendeesDrawer({ companyName, attendees, onClose }: Props) {
  const content = (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-start">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer — slides up from the bottom on mobile, in from the left on desktop */}
      <div className="drawer-mobile-responsive-left relative flex flex-col w-full max-h-[85vh] sm:max-h-full sm:max-w-[480px] sm:h-full bg-white shadow-2xl overflow-hidden rounded-t-2xl sm:rounded-t-none sm:rounded-tr-2xl">
        <div
          className="flex-shrink-0 px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'rgb(var(--brand-primary-rgb))' }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-0.5">{attendees.length} Attendee{attendees.length === 1 ? '' : 's'}</p>
            <h2 className="text-base font-bold text-white leading-snug truncate" title={companyName}>{companyName}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex-shrink-0 text-white/70 hover:text-white transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {attendees.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No attendees at this conference.</p>
          ) : attendees.map(a => <AttendeeMiniCard key={a.id} attendee={a} />)}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
