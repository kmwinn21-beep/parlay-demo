'use client';

import { createPortal } from 'react-dom';
import { useState, useCallback } from 'react';
import { useDrawerResize } from '@/lib/useDrawerResize';
import toast from 'react-hot-toast';
import type { AttendeeRef, CompanyCommittee } from '@/app/api/conferences/[id]/buying-committee-coverage/route';

interface CommitteeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  mode: 'full' | 'partial';
  companies: CompanyCommittee[];
  configuredRoles: ('decision_maker' | 'influencer' | 'target_title')[];
  conferenceId: number;
  onTargeted?: (attendeeId: number) => void;
}

const ROLE_LABELS: Record<string, string> = {
  decision_maker: 'Decision Maker',
  influencer: 'Influencer',
  target_title: 'Target Title',
};

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function AttendeeCell({
  attendee,
  conferenceId,
  onTargeted,
}: {
  attendee: AttendeeRef;
  conferenceId: number;
  onTargeted?: (id: number) => void;
}) {
  const [targeted, setTargeted] = useState(attendee.isTargeted);
  const [loading, setLoading] = useState(false);

  const handleTarget = useCallback(async () => {
    if (targeted || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendee.attendeeId }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      if (data.action === 'added' || data.action === 'removed') {
        setTargeted(data.action === 'added');
        onTargeted?.(attendee.attendeeId);
      }
    } catch {
      toast.error('Failed to update target');
    } finally {
      setLoading(false);
    }
  }, [attendee.attendeeId, conferenceId, loading, onTargeted, targeted]);

  return (
    <div className="flex items-center gap-2 py-1">
      <div
        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
        style={{ background: '#E6F1FB', color: '#0C447C' }}
      >
        {initials(attendee.firstName, attendee.lastName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-gray-800 truncate">
          {attendee.firstName} {attendee.lastName}
        </p>
        {attendee.title && (
          <p className="text-[11px] text-gray-400 truncate">{attendee.title}</p>
        )}
      </div>
      <button
        type="button"
        onClick={handleTarget}
        disabled={loading}
        title={targeted ? 'Already targeted' : 'Add to targets'}
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors"
        style={{ color: targeted ? '#0F6E56' : '#9CA3AF' }}
      >
        {loading ? (
          <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
        ) : targeted ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v8m-4-4h8" />
          </svg>
        )}
      </button>
    </div>
  );
}

export function CommitteeDrawer({
  isOpen,
  onClose,
  productName,
  mode,
  companies,
  configuredRoles,
  conferenceId,
  onTargeted,
}: CommitteeDrawerProps) {
  const { panelStyle, handleResizeStart } = useDrawerResize(900, 300, 900);
  const [targeting, setTargeting] = useState<Set<number>>(new Set());
  const [targetedCompanies, setTargetedCompanies] = useState<Set<number>>(new Set());

  const handleTargetAll = useCallback(async (company: CompanyCommittee) => {
    if (company.companyId != null && targetedCompanies.has(company.companyId)) return;

    const all: number[] = configuredRoles.flatMap(r => company.roles[r].map(a => a.attendeeId));
    if (all.length === 0) return;

    const key = company.companyId ?? -1;
    setTargeting(prev => new Set(prev).add(key));
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/targets/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeIds: all }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast.success(`Targeted ${data.added + data.alreadyTargeted} attendees from ${company.companyName}`);
      all.forEach(id => onTargeted?.(id));
      if (company.companyId != null) {
        setTargetedCompanies(prev => new Set(prev).add(company.companyId!));
      }
    } catch {
      toast.error('Failed to bulk target');
    } finally {
      setTargeting(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [conferenceId, configuredRoles, onTargeted, targetedCompanies]);

  if (!isOpen) return null;

  const modeLabel = mode === 'full' ? 'Full' : 'Partial';

  const content = (
    <>
      <style>{`
        @keyframes committeeSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes committeeSlideUp  { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .committee-drawer-panel {
          position: fixed; bottom: 0; left: 0; right: 0;
          height: 90vh; border-radius: 1rem 1rem 0 0;
          animation: committeeSlideUp 0.25s ease-out;
        }
        @media (min-width: 640px) {
          .committee-drawer-panel {
            top: 0; right: 0; bottom: auto; left: auto;
            height: 100vh; border-radius: 1rem 0 0 1rem;
            width: calc((100vw - 16rem) / 2);
            animation: committeeSlideIn 0.25s ease-out;
          }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[55]"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="committee-drawer-panel relative bg-white border-t sm:border-t-0 sm:border-l border-gray-200 shadow-2xl z-[60] flex flex-col overflow-hidden"
        style={panelStyle}
      >
        {/* Left-edge resize handle */}
        <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={handleResizeStart}>
          <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
        </div>
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{productName}</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {modeLabel} committee · {companies.length} {companies.length === 1 ? 'company' : 'companies'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1 mt-0.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 180 }} />
              {configuredRoles.map(r => (
                <col key={r} />
              ))}
            </colgroup>
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-100">
                <th className="text-left font-semibold text-gray-500 px-4 py-2.5">Company</th>
                {configuredRoles.map(r => (
                  <th key={r} className="text-left font-semibold text-gray-500 px-3 py-2.5">
                    {ROLE_LABELS[r] ?? r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map((company, idx) => {
                const rowKey = company.companyId ?? `unk-${idx}`;
                const isOdd = idx % 2 === 1;
                const isTargetingThis = targeting.has(company.companyId ?? -1);
                const isDoneTargeting = company.companyId != null && targetedCompanies.has(company.companyId);
                const allAttendees = configuredRoles.flatMap(r => company.roles[r]);

                return (
                  <tr
                    key={rowKey}
                    className="border-b border-gray-200 align-top"
                    style={{ background: isOdd ? '#EFEFEF' : '#FFFFFF' }}
                  >
                    {/* Company cell */}
                    <td className="px-4 py-2.5" style={{ width: 180 }}>
                      <p className="font-medium text-gray-800 text-[12px] leading-tight truncate">
                        {company.companyName}
                      </p>
                      {allAttendees.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleTargetAll(company)}
                          disabled={isTargetingThis || isDoneTargeting}
                          className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-50"
                          style={isDoneTargeting
                            ? { background: '#EAF3DE', color: '#0F6E56', borderColor: '#0F6E5666' }
                            : { background: '#F3F4F6', color: '#6B7280', borderColor: '#D1D5DB' }
                          }
                        >
                          {isTargetingThis ? (
                            <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                          ) : isDoneTargeting ? (
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
                              <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
                              <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
                            </svg>
                          )}
                          {isTargetingThis ? 'Targeting…' : isDoneTargeting ? 'Targeted' : 'Target all'}
                        </button>
                      )}
                    </td>

                    {/* Role columns */}
                    {configuredRoles.map(role => {
                      const attendees = company.roles[role];
                      return (
                        <td key={role} className="px-3 py-2.5 align-top">
                          {attendees.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {attendees.map(a => (
                                <AttendeeCell
                                  key={a.attendeeId}
                                  attendee={a}
                                  conferenceId={conferenceId}
                                  onTargeted={onTargeted}
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-400 italic">Not present</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <p className="text-[11px] text-gray-400">
            Showing {companies.length} {companies.length === 1 ? 'company' : 'companies'} · {modeLabel.toLowerCase()} buying committee for {productName}
          </p>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
