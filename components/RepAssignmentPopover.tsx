'use client';

import { useEffect, useRef, useState } from 'react';
import { useUserOptions, getRepInitials, type UserOption } from '@/lib/useUserOptions';

export interface AssignedRep {
  userId: number;
  displayName: string;
  initials: string;
}

interface RepAssignmentPopoverProps {
  conferenceId: number;
  planYear: number;
  assignedReps: AssignedRep[];
  allConferences: Array<{
    conferenceId: number;
    name: string;
    startDate: string;
    assignedReps: Array<{ userId: number }>;
  }>;
  onUpdate: (updatedReps: AssignedRep[]) => void;
}

type PopoverPos = { top: number; left: number };

// Deterministic background color from a name — no shared avatar-color utility
// exists in the codebase yet, so this is a small local hash into a fixed palette.
const AVATAR_PALETTE = [
  '#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#D97706',
  '#059669', '#0891B2', '#4F46E5', '#C026D3', '#65A30D',
];
function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function AvatarCircle({ rep, size = 22, style }: { rep: AssignedRep; size?: number; style?: React.CSSProperties }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white flex-shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: colorForName(rep.displayName),
        border: '1.5px solid var(--surface-2, #fff)',
        fontSize: 9,
        fontWeight: 500,
        ...style,
      }}
      title={rep.displayName}
    >
      {rep.initials}
    </div>
  );
}

function getConflicts(
  userId: number,
  currentConferenceId: number,
  currentStartDate: string,
  planYear: number,
  allConferences: RepAssignmentPopoverProps['allConferences']
): string[] {
  const currentMonth = new Date(currentStartDate + 'T00:00:00').getMonth();
  return allConferences
    .filter(c =>
      c.conferenceId !== currentConferenceId &&
      new Date(c.startDate + 'T00:00:00').getFullYear() === planYear &&
      new Date(c.startDate + 'T00:00:00').getMonth() === currentMonth &&
      c.assignedReps.some(r => r.userId === userId)
    )
    .map(c => c.name);
}

export function RepAssignmentPopover({ conferenceId, planYear, assignedReps, allConferences, onUpdate }: RepAssignmentPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const users = useUserOptions();

  const currentConf = allConferences.find(c => c.conferenceId === conferenceId);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const panel = document.querySelector('[data-rep-assignment-popover]');
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !(panel && panel.contains(target))
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const openPopover = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setSearch('');
    setOpen(true);
  };

  const toggleUser = (user: UserOption) => {
    const isAssigned = assignedReps.some(r => r.userId === user.id);
    const newReps: AssignedRep[] = isAssigned
      ? assignedReps.filter(r => r.userId !== user.id)
      : [...assignedReps, { userId: user.id, displayName: user.value, initials: getRepInitials(user.value) }];

    const previousReps = assignedReps;
    onUpdate(newReps);

    fetch(`/api/program-planner/conferences/${conferenceId}/reps?year=${planYear}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repIds: newReps.map(r => r.userId) }),
    })
      .then(res => { if (!res.ok) throw new Error('PATCH failed'); })
      .catch(() => { onUpdate(previousReps); });
  };

  const filteredUsers = users.filter(u => u.value.toLowerCase().includes(search.toLowerCase()));
  const visibleReps = assignedReps.slice(0, 3);
  const overflowCount = assignedReps.length - visibleReps.length;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button ref={triggerRef} type="button" onClick={openPopover} className="flex items-center">
        {assignedReps.length === 0 ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-500 transition-colors">
            <i className="ti ti-user-plus text-[12px]" aria-hidden="true" />
            Assign reps
          </span>
        ) : (
          <div className="flex items-center">
            {visibleReps.map((rep, i) => (
              <AvatarCircle key={rep.userId} rep={rep} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: visibleReps.length - i }} />
            ))}
            {overflowCount > 0 && (
              <div
                className="rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  width: 22, height: 22, marginLeft: -6,
                  background: 'var(--surface-1, #F3F4F6)', color: 'var(--text-secondary, #6B7280)',
                  border: '1.5px solid var(--surface-2, #fff)', fontSize: 9, fontWeight: 500,
                }}
              >
                +{overflowCount}
              </div>
            )}
          </div>
        )}
      </button>

      {open && pos && (
        <div
          data-rep-assignment-popover
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: 220, zIndex: 50,
            background: 'var(--surface-2, #fff)', border: '0.5px solid var(--border, #E5E7EB)',
            borderRadius: 12, overflow: 'hidden',
          }}
          className="shadow-xl"
        >
          <div style={{ padding: '8px 10px', borderBottom: '0.5px solid var(--border, #E5E7EB)' }}>
            <p style={{ fontSize: 12, fontWeight: 500, margin: 0 }}>Assign reps</p>
          </div>
          <div style={{ padding: '6px 10px', borderBottom: '0.5px solid var(--border, #E5E7EB)' }}>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', fontSize: 12, border: 'none', outline: 'none', background: 'transparent' }}
              autoFocus
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filteredUsers.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">No users found</div>
            )}
            {filteredUsers.map(user => {
              const checked = assignedReps.some(r => r.userId === user.id);
              const conflicts = currentConf
                ? getConflicts(user.id, conferenceId, currentConf.startDate, planYear, allConferences)
                : [];
              const rep: AssignedRep = { userId: user.id, displayName: user.value, initials: getRepInitials(user.value) };
              return (
                <div
                  key={user.id}
                  onClick={() => toggleUser(user)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-1, #F9FAFB)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="relative flex-shrink-0">
                    <AvatarCircle rep={rep} />
                    {conflicts.length > 0 && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 border border-white"
                        title={`Also assigned to ${conflicts[0]}${conflicts.length > 1 ? ` +${conflicts.length - 1} more` : ''} in ${new Date(currentConf!.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long' })}`}
                      />
                    )}
                  </div>
                  <span className="flex-1 text-xs text-gray-800 truncate">{user.value}</span>
                  <input type="checkbox" checked={checked} readOnly className="accent-brand-secondary flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
