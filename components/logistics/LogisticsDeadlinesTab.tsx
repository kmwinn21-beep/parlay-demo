'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { type LogisticsDeadline, type LogisticsSpeakingSlot, type LogisticsFile, type AssignedRepOption } from './types';
import { FileRow, FileUploadZone, DeadlineStatusPill, TrashIcon } from './shared';

const CATEGORY_LABELS: Record<string, string> = {
  registration: 'Registration',
  booth: 'Booth',
  sponsorship: 'Sponsorship',
  speaking: 'Speaking',
  travel: 'Travel',
  shipping: 'Shipping',
  marketing: 'Marketing',
  budget: 'Budget',
  post_show: 'Post-show',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  registration: 'bg-blue-100 text-blue-700',
  booth: 'bg-purple-100 text-purple-700',
  sponsorship: 'bg-amber-100 text-amber-700',
  speaking: 'bg-pink-100 text-pink-700',
  travel: 'bg-cyan-100 text-cyan-700',
  shipping: 'bg-orange-100 text-orange-700',
  marketing: 'bg-teal-100 text-teal-700',
  budget: 'bg-green-100 text-green-700',
  post_show: 'bg-indigo-100 text-indigo-700',
  other: 'bg-gray-100 text-gray-600',
};

function CategoryPill({ category }: { category: string | null }) {
  if (!category) return <span className="w-[74px] flex-shrink-0" />;
  const label = CATEGORY_LABELS[category] ?? category;
  const color = CATEGORY_COLORS[category] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap w-[74px] flex-shrink-0 text-center ${color}`}>
      {label}
    </span>
  );
}

interface Props {
  conferenceId: number;
  planYear: number;
  deadlines: LogisticsDeadline[];
  speakingSlots: LogisticsSpeakingSlot[];
  files: LogisticsFile[];
  assignedReps: AssignedRepOption[];
  onDeadlinesChange: (deadlines: LogisticsDeadline[]) => void;
  onSpeakingSlotsChange: (slots: LogisticsSpeakingSlot[]) => void;
  onFilesChange: (files: LogisticsFile[]) => void;
}

function sortDeadlines(deadlines: LogisticsDeadline[]): LogisticsDeadline[] {
  return [...deadlines].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.completed && !b.completed) {
      const aOverdue = a.daysUntil < 0, bOverdue = b.daysUntil < 0;
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return a.daysUntil - b.daysUntil;
    }
    return 0;
  });
}

export function LogisticsDeadlinesTab({
  conferenceId, planYear, deadlines, speakingSlots, files, assignedReps,
  onDeadlinesChange, onSpeakingSlotsChange, onFilesChange,
}: Props) {
  const [newLabel, setNewLabel] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [adding, setAdding] = useState(false);
  const [addingSlot, setAddingSlot] = useState(false);
  const [slotTitle, setSlotTitle] = useState('');

  const overdueCount = deadlines.filter(d => d.daysUntil < 0 && !d.completed).length;
  const sorted = sortDeadlines(deadlines);

  const toggleComplete = async (d: LogisticsDeadline) => {
    const prev = deadlines;
    onDeadlinesChange(deadlines.map(x => x.id === d.id ? { ...x, completed: !x.completed } : x));
    const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: !d.completed }),
    }).catch(() => null);
    if (!res || !res.ok) { onDeadlinesChange(prev); toast.error('Failed to update deadline.'); }
  };

  const saveLabel = async (d: LogisticsDeadline, label: string) => {
    if (!label.trim() || label === d.label) return;
    onDeadlinesChange(deadlines.map(x => x.id === d.id ? { ...x, label } : x));
    const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }),
    }).catch(() => null);
    if (!res || !res.ok) toast.error('Failed to update deadline.');
  };

  const saveDueDate = async (d: LogisticsDeadline, dueDate: string) => {
    if (!dueDate || dueDate === d.dueDate) return;
    const daysUntil = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
    onDeadlinesChange(deadlines.map(x => x.id === d.id ? { ...x, dueDate, daysUntil } : x));
    const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dueDate }),
    }).catch(() => null);
    if (!res || !res.ok) toast.error('Failed to update deadline.');
  };

  const deleteDeadline = async (id: number) => {
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      onDeadlinesChange(deadlines.filter(x => x.id !== id));
    } catch {
      toast.error('Failed to delete deadline.');
    }
  };

  const addDeadline = async () => {
    if (!newLabel.trim() || !newDueDate) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines?year=${planYear}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim(), dueDate: newDueDate }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as LogisticsDeadline;
      onDeadlinesChange([...deadlines, created]);
      setNewLabel(''); setNewDueDate('');
    } catch {
      toast.error('Failed to add deadline.');
    } finally {
      setAdding(false);
    }
  };

  const addQuickSlot = async () => {
    if (!slotTitle.trim()) return;
    setAddingSlot(true);
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/speaking?year=${planYear}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionTitle: slotTitle.trim() }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as LogisticsSpeakingSlot;
      onSpeakingSlotsChange([...speakingSlots, created]);
      setSlotTitle('');
    } catch {
      toast.error('Failed to add speaking slot.');
    } finally {
      setAddingSlot(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 mb-3">
            <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-xs font-medium text-red-700">{overdueCount} deadline{overdueCount !== 1 ? 's' : ''} overdue</p>
          </div>
        )}

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deadlines</p>
        {sorted.length === 0 ? (
          <p className="text-xs text-gray-400 italic mb-2">No deadlines yet.</p>
        ) : (
          <div className="space-y-1 mb-3">
            {sorted.map(d => (
              <div
                key={d.id}
                className="flex items-center gap-1.5 py-1 px-1.5 rounded-md border border-dashed border-transparent focus-within:border-gray-400"
              >
                <button type="button" onClick={() => deleteDeadline(d.id)} className="text-red-500 hover:text-red-600 flex-shrink-0" title="Delete deadline">
                  <TrashIcon />
                </button>
                <input
                  type="checkbox"
                  checked={d.completed}
                  onChange={() => toggleComplete(d)}
                  className="accent-brand-secondary w-3.5 h-3.5 flex-shrink-0"
                />
                <input
                  defaultValue={d.label}
                  onBlur={e => saveLabel(d, e.target.value)}
                  className={`flex-1 min-w-0 text-xs bg-transparent border-0 focus:ring-0 focus:outline-none px-0 ${d.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                />
                <input
                  type="date"
                  defaultValue={d.dueDate}
                  onBlur={e => saveDueDate(d, e.target.value)}
                  className="text-[10px] text-gray-400 bg-transparent border-0 focus:ring-0 focus:outline-none w-[92px] flex-shrink-0"
                />
                <CategoryPill category={d.category} />
                <div className="flex-shrink-0"><DeadlineStatusPill deadline={d} /></div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Deadline label" className="input-field text-xs flex-1" />
          <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className="input-field text-xs w-32" />
          <button type="button" onClick={addDeadline} disabled={adding || !newLabel.trim() || !newDueDate} className="btn-primary text-xs px-2.5 py-1.5 disabled:opacity-50 flex-shrink-0">
            Add
          </button>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Speaking</p>
        {speakingSlots.length === 0 ? (
          <p className="text-xs text-gray-400 italic mb-2">No speaking slots yet.</p>
        ) : (
          <div className="space-y-1.5 mb-2">
            {speakingSlots.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50">
                <span className="text-xs text-gray-700 truncate">{s.sessionTitle || 'Untitled session'}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                  s.slidesSubmitted && s.bioSubmitted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {s.slidesSubmitted && s.bioSubmitted ? 'Confirmed' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <input value={slotTitle} onChange={e => setSlotTitle(e.target.value)} placeholder="Session title" className="input-field text-xs flex-1" />
          <button type="button" onClick={addQuickSlot} disabled={addingSlot || !slotTitle.trim()} className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-50 flex-shrink-0">
            + Add speaking slot
          </button>
        </div>
        {assignedReps.length === 0 && <p className="text-[10px] text-gray-400 mt-1">Assign reps in the Plan table for a speaker picker.</p>}
      </div>

      <div className="pt-4 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Files</p>
        {files.length > 0 && (
          <div className="mb-2">
            {files.map(f => <FileRow key={f.id} conferenceId={conferenceId} file={f} onDeleted={id => onFilesChange(files.filter(x => x.id !== id))} />)}
          </div>
        )}
        <FileUploadZone conferenceId={conferenceId} planYear={planYear} onUploaded={f => onFilesChange([f, ...files])} />
      </div>
    </div>
  );
}
