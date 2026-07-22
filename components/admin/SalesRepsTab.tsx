'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { TerritoryMap, ABBR_TO_NAME, type Territory } from './TerritoryMap';
import { getRepInitials } from '@/lib/useUserOptions';

interface RepOption {
  id: number;
  value: string;
}

// Deterministic background color from a name — no shared avatar-color utility
// exists in the codebase yet, so this mirrors the same small local hash used
// in RepAssignmentPopover.tsx and components/logistics/types.ts.
const AVATAR_PALETTE = [
  '#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#D97706',
  '#059669', '#0891B2', '#4F46E5', '#C026D3', '#65A30D',
];
function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function AvatarCircle({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: colorForName(name), fontSize: size * 0.36, fontWeight: 500 }}
      title={name}
    >
      {getRepInitials(name)}
    </div>
  );
}

const TERRITORY_COLORS = ['#1D9E75', '#7F77DD', '#D85A30', '#185FA5', '#EF9F27', '#D4537E'];

function pickNextColor(existing: Territory[]): string {
  const used = existing.map(t => t.color);
  return TERRITORY_COLORS.find(c => !used.includes(c)) ?? TERRITORY_COLORS[0];
}

export function SalesRepsTab() {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [reps, setReps] = useState<RepOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set());
  const [territoryName, setTerritoryName] = useState('');
  const [selectedRepIds, setSelectedRepIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [territoriesRes, repsRes] = await Promise.all([
        fetch('/api/admin/territories'),
        fetch('/api/config?category=user'),
      ]);
      if (territoriesRes.ok) {
        const data = await territoriesRes.json() as { territories: Territory[] };
        setTerritories(data.territories);
      }
      if (repsRes.ok) {
        const rows = await repsRes.json() as Array<{ id: number; value: string }>;
        setReps(rows.map(r => ({ id: r.id, value: r.value })));
      }
    } catch {
      toast.error('Failed to load territories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  function resetForm() {
    setSelectedStates(new Set());
    setTerritoryName('');
    setSelectedRepIds(new Set());
    setEditingId(null);
    setConflictWarning(null);
  }

  function handleStateClick(abbr: string) {
    const owner = territories.find(t => t.id !== editingId && t.stateCodes.includes(abbr));
    if (owner) {
      setConflictWarning(`${ABBR_TO_NAME[abbr]} is already in "${owner.name}". Remove it from that territory first.`);
      setTimeout(() => setConflictWarning(null), 4000);
      return;
    }
    setSelectedStates(prev => {
      const next = new Set(prev);
      if (next.has(abbr)) next.delete(abbr);
      else next.add(abbr);
      return next;
    });
    setConflictWarning(null);
  }

  function toggleRep(id: number) {
    setSelectedRepIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleEdit(t: Territory) {
    setEditingId(t.id);
    setSelectedStates(new Set(t.stateCodes));
    setTerritoryName(t.name);
    setSelectedRepIds(new Set(t.assignedUserIds));
    setConflictWarning(null);
  }

  async function handleSave() {
    if (!territoryName.trim()) return;
    if (selectedStates.size === 0) return;

    setSaving(true);
    const url = editingId ? `/api/admin/territories/${editingId}` : '/api/admin/territories';
    const method = editingId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: territoryName.trim(),
          stateCodes: Array.from(selectedStates),
          assignedUserIds: Array.from(selectedRepIds),
          color: editingId ? territories.find(t => t.id === editingId)?.color : pickNextColor(territories),
        }),
      });

      if (res.status === 409) {
        const data = await res.json() as { conflicts: Array<{ stateCode: string; territoryName: string }> };
        const conflicted = data.conflicts.map(c => `${c.stateCode} (${c.territoryName})`).join(', ');
        setConflictWarning(`Some states are already assigned: ${conflicted}`);
        return;
      }
      if (!res.ok) throw new Error();

      const data = await res.json() as { territory: Territory };
      if (editingId) {
        setTerritories(prev => prev.map(t => t.id === editingId ? data.territory : t));
      } else {
        setTerritories(prev => [...prev, data.territory]);
      }
      resetForm();
    } catch {
      toast.error('Failed to save territory.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/admin/territories/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setTerritories(prev => prev.filter(t => t.id !== id));
      if (editingId === id) resetForm();
    } catch {
      toast.error('Failed to delete territory.');
    } finally {
      setConfirmDeleteId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Left: map + territories list */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-3">
            <TerritoryMap
              territories={territories}
              selectedStates={selectedStates}
              onStateClick={handleStateClick}
              editingTerritoryId={editingId}
            />
          </div>

          {/* Legend */}
          {territories.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-gray-100 bg-gray-50/50">
              {territories.map(t => (
                <span key={t.id} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: t.color }} />
                  {t.name}
                </span>
              ))}
            </div>
          )}

          {conflictWarning && (
            <div
              style={{
                padding: '6px 12px', background: 'var(--bg-warning, #FFFBEB)', borderTop: '0.5px solid var(--border-warning, #FDE68A)',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
              }}
            >
              <svg className="flex-shrink-0" style={{ width: 13, height: 13, color: 'var(--text-warning, #B45309)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span style={{ color: 'var(--text-warning, #B45309)' }}>{conflictWarning}</span>
            </div>
          )}

          {/* Selected states pill bar */}
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-gray-100">
            {selectedStates.size === 0 ? (
              <span className="text-xs text-gray-400 italic">Click states on the map to build a territory.</span>
            ) : (
              Array.from(selectedStates).sort().map(abbr => (
                <button
                  key={abbr}
                  type="button"
                  onClick={() => handleStateClick(abbr)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                  title="Remove from selection"
                >
                  {abbr}
                  <span className="text-blue-400">×</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Existing territories */}
        <div className="border border-gray-200 rounded-xl">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Territories</p>
          </div>
          {territories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <svg style={{ width: 32, height: 32, color: 'var(--text-muted, #9CA3AF)', display: 'block', margin: '0 auto 8px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p style={{ fontSize: 13, color: 'var(--text-secondary, #6B7280)', margin: '0 0 4px' }}>No territories defined yet</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted, #9CA3AF)', margin: 0 }}>Select states on the map above to create your first territory.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {territories.map(t => {
                const visibleStates = t.stateCodes.slice(0, 8);
                const overflow = t.stateCodes.length - visibleStates.length;
                return (
                  <div key={t.id} className="px-4 py-3 flex items-start gap-3">
                    <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0 mt-0.5" style={{ backgroundColor: t.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">{t.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {visibleStates.map(abbr => (
                          <span key={abbr} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">{abbr}</span>
                        ))}
                        {overflow > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400">+{overflow} more</span>
                        )}
                      </div>
                      {t.assignedUsers.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {t.assignedUsers.map(u => (
                            <span
                              key={u.userId}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: colorForName(u.displayName) }}
                            >
                              {u.displayName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button type="button" onClick={() => handleEdit(t)} className="text-xs text-brand-secondary hover:text-brand-primary font-medium">Edit</button>
                      {confirmDeleteId === t.id ? (
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className="text-red-600">Remove?</span>
                          <button type="button" onClick={() => handleDelete(t.id)} className="text-red-600 font-medium">Confirm</button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-gray-400">Cancel</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirmDeleteId(t.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: new/edit territory form */}
      <div className="w-full lg:w-60 flex-shrink-0 space-y-3">
        <div className="border border-gray-200 rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">{editingId ? 'Edit territory' : 'New territory'}</p>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Name</label>
            <input
              type="text"
              value={territoryName}
              onChange={e => setTerritoryName(e.target.value)}
              placeholder="e.g. Midwest"
              className="input-field text-sm w-full"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Assigned reps</label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {reps.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No reps configured yet.</p>
              ) : reps.map(rep => (
                <label key={rep.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRepIds.has(rep.id)}
                    onChange={() => toggleRep(rep.id)}
                    className="accent-brand-secondary w-3.5 h-3.5 flex-shrink-0"
                  />
                  <AvatarCircle name={rep.value} size={20} />
                  <span className="truncate">{rep.value}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !territoryName.trim() || selectedStates.size === 0}
            className="btn-primary text-sm w-full disabled:opacity-50"
          >
            {saving ? 'Saving…' : editingId ? 'Update territory' : 'Save territory'}
          </button>
        </div>
      </div>
    </div>
  );
}
