'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { FollowUpNotesPopover } from '@/components/FollowUpNotesPopover';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import {
  type UserOption,
  parseRepIds,
  resolveRepInitials,
  useConfigWithIds,
  resolveConfigValue,
  getRepInitials,
} from '@/lib/useUserOptions';

export interface FollowUp {
  id: number;
  attendee_id: number;
  conference_id: number;
  next_steps: string;
  next_steps_notes: string | null;
  completed: boolean;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
  conference_name: string;
  start_date: string;
  entity_notes_count: number;
  assigned_rep: string | null;
}

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Render initials pills for a stored assigned_rep value (CSV of IDs or legacy name) */
function RepPills({
  assignedRep,
  userOptions,
  size = 'sm',
}: {
  assignedRep: string | null;
  userOptions: UserOption[];
  size?: 'sm' | 'xs';
}) {
  const colorMaps = useConfigColors();
  const users = parseRepIds(assignedRep).map(id => userOptions.find(u => u.id === id)).filter(Boolean);
  if (users.length === 0) return null;

  const baseClass =
    size === 'xs'
      ? 'inline-flex items-center justify-center gap-1 px-1.5 py-0.5 min-w-[48px] whitespace-nowrap rounded text-[10px] font-medium'
      : 'inline-flex items-center justify-center gap-1 px-1.5 py-0.5 min-w-[48px] whitespace-nowrap rounded text-xs font-medium';

  return (
    <span className="inline-flex flex-wrap gap-1">
      {users.map((user, i) => (
        <span key={i} className={`${baseClass} ${getPreset(colorMaps.user?.[user!.value]).badgeClass}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 flex-shrink-0">
            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
          </svg>
          {getRepInitials(user!.value)}
        </span>
      ))}
    </span>
  );
}

export function FollowUpsTable({
  followUps,
  onToggle,
  onDelete,
  userOptions = [],
  onRepChange,
}: {
  followUps: FollowUp[];
  onToggle: (id: number, completed: boolean) => void;
  onDelete?: (id: number) => void;
  userOptions?: UserOption[];
  onRepChange?: (id: number, rep: string | null) => void;
}) {
  const nextStepsOpts = useConfigWithIds('next_steps');
  const [editingRepKey, setEditingRepKey] = useState<number | null>(null);
  const [editingRepIds, setEditingRepIds] = useState<number[]>([]);

  const canEditRep = !!onRepChange && userOptions.length > 0;

  const startEditRep = (fu: FollowUp) => {
    setEditingRepKey(fu.id);
    setEditingRepIds(parseRepIds(fu.assigned_rep));
  };

  const finishEditRep = (followUpId: number, ids: number[]) => {
    const rep = ids.length > 0 ? ids.join(',') : null;
    onRepChange!(followUpId, rep);
    setEditingRepKey(null);
    setEditingRepIds([]);
  };

  if (followUps.length === 0) {
    return (
      <div className="text-center py-8">
        <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <p className="text-gray-400 text-xs">No follow-ups yet.</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile card layout */}
      <div className="block lg:hidden divide-y divide-gray-100">
        {followUps.map((fu) => {
          const isEditingRep = editingRepKey === fu.id;

          return (
            <div key={fu.id} className={`p-4 ${fu.completed ? 'bg-green-50' : 'bg-white'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/attendees/${fu.attendee_id}`}
                      className="text-sm font-semibold text-procare-bright-blue hover:underline"
                    >
                      {fu.first_name} {fu.last_name}
                    </Link>

                    {/* Rep section */}
                    {canEditRep ? (
                      isEditingRep ? (
                        <div className="w-40">
                          <RepMultiSelect
                            options={userOptions}
                            selectedIds={editingRepIds}
                            onChange={setEditingRepIds}
                            onClose={(ids) => finishEditRep(fu.id, ids)}
                            placeholder="Select reps..."
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditRep(fu)}
                          title={fu.assigned_rep ? 'Click to change reps' : 'Click to assign rep'}
                        >
                          {fu.assigned_rep ? (
                            <RepPills assignedRep={fu.assigned_rep} userOptions={userOptions} size="xs" />
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-300 border border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-400 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5">
                                <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                              </svg>
                              —
                            </span>
                          )}
                        </button>
                      )
                    ) : fu.assigned_rep ? (
                      <RepPills assignedRep={fu.assigned_rep} userOptions={userOptions} size="xs" />
                    ) : null}
                  </div>
                  {fu.title && <p className="text-xs text-gray-500 mt-0.5">{fu.title}</p>}
                  {fu.company_name && <p className="text-xs text-gray-500">{fu.company_name}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggle(fu.id, !fu.completed)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                      fu.completed
                        ? 'bg-green-500 text-white border-green-600'
                        : 'bg-white text-gray-500 border-gray-300'
                    }`}
                  >
                    {fu.completed ? (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Done
                      </>
                    ) : 'Done'}
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(fu.id)}
                      className="text-red-400 hover:text-red-600 p-1 rounded transition-colors"
                      title="Delete follow-up"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${fu.completed ? 'bg-green-100 text-green-700' : 'bg-procare-dark-blue text-white'}`}>
                  {resolveConfigValue(fu.next_steps, nextStepsOpts)}
                </span>
                {fu.next_steps_notes && (
                  <span className="text-xs text-gray-500">{fu.next_steps_notes}</span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Link href={`/conferences/${fu.conference_id}`} className="text-xs text-procare-bright-blue hover:underline">
                  {fu.conference_name}
                </Link>
                <span className="text-xs text-gray-400">· {formatDate(fu.start_date)}</span>
                <FollowUpNotesPopover
                  attendeeId={fu.attendee_id}
                  notesCount={Number(fu.entity_notes_count)}
                  conferenceName={fu.conference_name}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table layout */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full" style={{ fontSize: '0.7rem' }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Title</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Company</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Next Step</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Conference</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Rep</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              {onDelete && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {followUps.map((fu) => {
              const isEditingRep = editingRepKey === fu.id;

              return (
                <tr
                  key={fu.id}
                  className={`transition-colors align-top ${fu.completed ? 'bg-green-50 hover:bg-green-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-3 py-2 font-medium text-gray-800 overflow-hidden" style={{ maxWidth: 220 }}>
                    <Link href={`/attendees/${fu.attendee_id}`} className="text-procare-bright-blue hover:underline leading-snug block truncate" title={`${fu.first_name} ${fu.last_name}`}>
                      {fu.first_name} {fu.last_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600 leading-snug">
                    {fu.title || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600 leading-snug">
                    <span className="text-xs break-words whitespace-normal leading-snug">
                      {fu.company_name || <span className="text-gray-300">—</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full font-medium leading-snug ${fu.completed ? 'bg-green-100 text-green-700' : 'bg-procare-dark-blue text-white'}`}>
                      {resolveConfigValue(fu.next_steps, nextStepsOpts)}
                    </span>
                    {fu.next_steps_notes && (
                      <p className="text-gray-500 mt-0.5 leading-snug">{fu.next_steps_notes}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 leading-snug">
                    <Link href={`/conferences/${fu.conference_id}`} className="text-procare-bright-blue hover:underline">
                      {fu.conference_name}
                    </Link>
                    <p className="text-gray-400">{formatDate(fu.start_date)}</p>
                  </td>
                  <td className="px-3 py-2">
                    {canEditRep && isEditingRep ? (
                      <div className="w-36">
                        <RepMultiSelect
                          options={userOptions}
                          selectedIds={editingRepIds}
                          onChange={setEditingRepIds}
                          onClose={(ids) => finishEditRep(fu.id, ids)}
                          placeholder="Select reps..."
                        />
                      </div>
                    ) : canEditRep ? (
                      <button
                        type="button"
                        onClick={() => startEditRep(fu)}
                        className="group inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                        title={fu.assigned_rep ? 'Click to change reps' : 'Click to assign rep'}
                      >
                        {fu.assigned_rep ? (
                          <RepPills assignedRep={fu.assigned_rep} userOptions={userOptions} />
                        ) : (
                          <span className="text-gray-300 group-hover:text-blue-400 transition-colors">—</span>
                        )}
                      </button>
                    ) : (
                      fu.assigned_rep ? (
                        <RepPills assignedRep={fu.assigned_rep} userOptions={userOptions} />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <FollowUpNotesPopover
                      attendeeId={fu.attendee_id}
                      notesCount={Number(fu.entity_notes_count)}
                      conferenceName={fu.conference_name}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onToggle(fu.id, !fu.completed)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium border-2 transition-all whitespace-nowrap ${
                        fu.completed
                          ? 'bg-green-500 text-white border-green-600 hover:bg-green-600'
                          : 'bg-white text-gray-500 border-gray-300 hover:border-green-400 hover:text-green-600'
                      }`}
                    >
                      {fu.completed ? (
                        <>
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Done
                        </>
                      ) : 'Done'}
                    </button>
                  </td>
                  {onDelete && (
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onDelete(fu.id)}
                        className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
