'use client';

import { useEffect, useMemo, useState } from 'react';
import { AttendeeInitialsAvatar } from '@/components/AttendeePhoto';
import type { UserOption } from '@/lib/useUserOptions';
import type { IcpConfig } from '@/lib/icpRulesEval';

interface PickerAttendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string | null;
  company_id?: number | null;
  company_name?: string | null;
  company_type?: string | null;
  photo_url?: string | null;
}

interface Group {
  key: string;
  label: string;
  attendees: PickerAttendee[];
  /** Internal team members render as their own kind of row. */
  users?: UserOption[];
  /** The primary's own company leads and stays open; the rest start closed. */
  defaultOpen: boolean;
}

function fullName(a: PickerAttendee) {
  return `${a.first_name} ${a.last_name}`.trim();
}

/** Company name, then last name — the order these lists are read in. */
function byCompanyThenName(a: PickerAttendee, b: PickerAttendee) {
  const ca = (a.company_name ?? '').toLowerCase();
  const cb = (b.company_name ?? '').toLowerCase();
  if (ca !== cb) return ca < cb ? -1 : 1;
  return fullName(a).toLowerCase() < fullName(b).toLowerCase() ? -1 : 1;
}

/**
 * Picking additional attendees out of a dropdown wedged into a table row meant
 * scrolling a flat list of everyone at the conference. This is the same job
 * given room: a modal on desktop, a sheet rising from the bottom edge on a
 * phone like the site's other mobile drawers.
 *
 * The list is ordered the way a rep thinks about the room — the primary
 * attendee's own colleagues first, then the internal team, then one section per
 * company type named in the ICP parameters, then everyone else.
 */
export function AdditionalAttendeesModal({
  conferenceId,
  primaryAttendeeId,
  primaryCompanyId,
  userOptions,
  attendeeIds,
  onAttendeeIdsChange,
  internalIds,
  onInternalIdsChange,
  freeText,
  onFreeTextChange,
  onClose,
}: {
  conferenceId: number | null | undefined;
  primaryAttendeeId?: number | null;
  primaryCompanyId?: number | null;
  userOptions: UserOption[];
  attendeeIds: number[];
  onAttendeeIdsChange: (ids: number[]) => void;
  internalIds: number[];
  onInternalIdsChange: (ids: number[]) => void;
  /** Names typed in previously that match no attendee record. */
  freeText: string;
  onFreeTextChange: (v: string) => void;
  onClose: () => void;
}) {
  const [attendees, setAttendees] = useState<PickerAttendee[]>([]);
  const [icpTypes, setIcpTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      conferenceId
        ? fetch(`/api/conferences/${conferenceId}`).then(r => (r.ok ? r.json() : { attendees: [] })).catch(() => ({ attendees: [] }))
        : Promise.resolve({ attendees: [] }),
      // The company types the ICP parameters name, in the order they're configured.
      fetch('/api/admin/icp-rules').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([conf, icp]: [{ attendees?: PickerAttendee[] }, IcpConfig | null]) => {
      if (cancelled) return;
      setAttendees(conf.attendees ?? []);
      const types = (icp?.rules ?? [])
        .filter(r => r.category === 'company_type')
        .flatMap(r => r.conditions.map(c => c.option_value))
        .filter(Boolean);
      setIcpTypes(Array.from(new Set(types)));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [conferenceId]);

  const freeTextNames = freeText.split(',').map(n => n.trim()).filter(Boolean);

  const groups = useMemo<Group[]>(() => {
    const pool = attendees.filter(a => a.id !== primaryAttendeeId);
    const taken = new Set<number>();
    const out: Group[] = [];

    const sameCompany = primaryCompanyId != null
      ? pool.filter(a => a.company_id === primaryCompanyId)
      : [];
    sameCompany.forEach(a => taken.add(a.id));
    if (sameCompany.length > 0) {
      out.push({
        key: 'same-company',
        label: sameCompany[0].company_name || 'Same company',
        attendees: [...sameCompany].sort(byCompanyThenName),
        defaultOpen: true,
      });
    }

    out.push({ key: 'internal', label: 'Internal Attendees', attendees: [], users: userOptions, defaultOpen: false });

    for (const type of icpTypes) {
      const members = pool.filter(a => !taken.has(a.id) && (a.company_type ?? '') === type);
      members.forEach(a => taken.add(a.id));
      if (members.length > 0) {
        out.push({ key: `icp-${type}`, label: type, attendees: [...members].sort(byCompanyThenName), defaultOpen: false });
      }
    }

    const rest = pool.filter(a => !taken.has(a.id));
    if (rest.length > 0) {
      out.push({ key: 'other', label: 'Other', attendees: [...rest].sort(byCompanyThenName), defaultOpen: false });
    }
    return out;
  }, [attendees, icpTypes, primaryAttendeeId, primaryCompanyId, userOptions]);

  const q = search.trim().toLowerCase();
  const matchAttendee = (a: PickerAttendee) =>
    !q || fullName(a).toLowerCase().includes(q) || (a.company_name ?? '').toLowerCase().includes(q) || (a.title ?? '').toLowerCase().includes(q);
  const matchUser = (u: UserOption) => !q || u.value.toLowerCase().includes(q);

  const visibleGroups = groups
    .map(g => ({
      ...g,
      attendees: g.attendees.filter(matchAttendee),
      users: (g.users ?? []).filter(matchUser),
    }))
    .filter(g => g.attendees.length > 0 || (g.users?.length ?? 0) > 0);

  // A search reveals its hits wherever they live; otherwise the group's own
  // default applies until the reader toggles it.
  const isOpen = (g: Group) => (q ? true : collapsed.has(g.key) ? !g.defaultOpen : g.defaultOpen);
  const toggleGroup = (key: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const toggleAttendee = (id: number) =>
    onAttendeeIdsChange(attendeeIds.includes(id) ? attendeeIds.filter(x => x !== id) : [...attendeeIds, id]);
  const toggleInternal = (id: number) =>
    onInternalIdsChange(internalIds.includes(id) ? internalIds.filter(x => x !== id) : [...internalIds, id]);

  const selectedCount = attendeeIds.length + internalIds.length + freeTextNames.length;

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...internalIds.map(id => ({
      key: `u-${id}`,
      label: userOptions.find(u => u.id === id)?.value ?? `User ${id}`,
      remove: () => toggleInternal(id),
    })),
    ...attendeeIds.map(id => {
      const a = attendees.find(x => x.id === id);
      return { key: `a-${id}`, label: a ? fullName(a) : `Attendee ${id}`, remove: () => toggleAttendee(id) };
    }),
    ...freeTextNames.map(n => ({
      key: `n-${n}`,
      label: n,
      remove: () => onFreeTextChange(freeTextNames.filter(x => x !== n).join(', ')),
    })),
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="modal-sheet-mobile bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl h-[85vh] sm:h-auto sm:max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-brand-primary font-serif">Additional Attendees</h3>
            <p className="text-xs text-gray-500 mt-0.5">{selectedCount} selected</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search attendees, companies, or team…"
            /* Deliberately not autoFocused: focusing it opens the phone
               keyboard over the list people came here to pick from. */
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-secondary"
          />
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {chips.map(chip => (
                <span key={chip.key} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-brand-secondary/10 text-brand-secondary text-xs font-medium">
                  {chip.label}
                  <button type="button" onClick={chip.remove} className="p-0.5 rounded-full hover:bg-brand-secondary/20" aria-label={`Remove ${chip.label}`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && <p className="text-xs text-gray-400 text-center py-8">Loading attendees…</p>}
          {!loading && visibleGroups.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">No matches.</p>
          )}
          {!loading && visibleGroups.map(g => {
            const open = isOpen(g);
            const count = g.attendees.length + (g.users?.length ?? 0);
            return (
              <div key={g.key} className="border-b border-gray-50 last:border-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.key)}
                  className="w-full flex items-center gap-2 px-5 py-2 bg-gray-50/70 hover:bg-gray-100 transition-colors text-left"
                >
                  <svg
                    className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide flex-1 truncate">{g.label}</span>
                  <span className="text-[10px] text-gray-400">{count}</span>
                </button>

                {open && (g.users ?? []).map(u => (
                  <label key={`u-${u.id}`} className="flex items-center gap-3 px-5 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={internalIds.includes(u.id)}
                      onChange={() => toggleInternal(u.id)}
                      className="accent-brand-secondary flex-shrink-0"
                    />
                    <AttendeeInitialsAvatar name={u.value} className="w-7 h-7 text-[10px]" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{u.value}</p>
                      <p className="text-[10px] text-gray-400">Team member</p>
                    </div>
                  </label>
                ))}

                {open && g.attendees.map(a => (
                  <label key={a.id} className="flex items-center gap-3 px-5 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attendeeIds.includes(a.id)}
                      onChange={() => toggleAttendee(a.id)}
                      className="accent-brand-secondary flex-shrink-0"
                    />
                    <AttendeeInitialsAvatar
                      name={fullName(a)}
                      photoUrl={a.photo_url}
                      title={a.title}
                      companyName={a.company_name}
                      className="w-7 h-7 text-[10px]"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{fullName(a)}</p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {[a.title, a.company_name].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm font-medium bg-brand-secondary text-white hover:opacity-90">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** The field's stand-in: opens the picker and reports what's chosen. */
export function AdditionalAttendeesButton({ count, onClick, className = '' }: {
  count: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Choose additional attendees"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs font-medium text-brand-secondary hover:border-brand-secondary hover:bg-brand-secondary/5 transition-colors ${className}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Attendees
      {count > 0 && (
        <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-secondary text-white text-[10px] font-bold flex items-center justify-center leading-none">
          {count}
        </span>
      )}
    </button>
  );
}
