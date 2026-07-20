'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { type LogisticsRepTravel, type TravelStatus, type LogisticsPlan, type LogisticsDeadline } from './types';
import { AvatarCircle, AutoSaveField, ChecklistSection } from './shared';

const STATUS_OPTIONS: { value: TravelStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'pending', label: 'Pending' },
  { value: 'booked', label: 'Booked' },
];

interface Props {
  conferenceId: number;
  planYear: number;
  repTravel: LogisticsRepTravel[];
  plan: LogisticsPlan;
  deadlines: LogisticsDeadline[];
  onChange: (repTravel: LogisticsRepTravel[]) => void;
  onDeadlinesChange: (deadlines: LogisticsDeadline[]) => void;
}

function TravelRow({ conferenceId, planYear, rep, onUpdate }: {
  conferenceId: number; planYear: number; rep: LogisticsRepTravel; onUpdate: (patch: Partial<LogisticsRepTravel>) => void;
}) {
  const [flightConfirmation, setFlightConfirmation] = useState(rep.flightConfirmation ?? '');
  const [hotelConfirmation, setHotelConfirmation] = useState(rep.hotelConfirmation ?? '');
  const [notes, setNotes] = useState(rep.notes ?? '');

  const patch = async (body: Partial<{ flightStatus: TravelStatus; hotelStatus: TravelStatus; flightConfirmation: string | null; hotelConfirmation: string | null; notes: string | null }>) => {
    const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/travel/${rep.userId}?year=${planYear}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null);
    if (!res || !res.ok) toast.error('Failed to update travel status.');
  };

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AvatarCircle name={rep.displayName} initials={rep.initials} size={26} />
        <p className="text-xs font-medium text-gray-800 truncate">{rep.displayName}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Flight</label>
          <select
            value={rep.flightStatus}
            onChange={e => { const v = e.target.value as TravelStatus; onUpdate({ flightStatus: v }); patch({ flightStatus: v }); }}
            className="input-field text-xs"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Hotel</label>
          <select
            value={rep.hotelStatus}
            onChange={e => { const v = e.target.value as TravelStatus; onUpdate({ hotelStatus: v }); patch({ hotelStatus: v }); }}
            className="input-field text-xs"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      {rep.flightStatus === 'booked' && (
        <div>
          <label className="label">Flight confirmation</label>
          <input
            value={flightConfirmation} onChange={e => setFlightConfirmation(e.target.value)}
            onBlur={() => { onUpdate({ flightConfirmation }); patch({ flightConfirmation: flightConfirmation || null }); }}
            className="input-field text-xs"
          />
        </div>
      )}
      {rep.hotelStatus === 'booked' && (
        <div>
          <label className="label">Hotel confirmation</label>
          <input
            value={hotelConfirmation} onChange={e => setHotelConfirmation(e.target.value)}
            onBlur={() => { onUpdate({ hotelConfirmation }); patch({ hotelConfirmation: hotelConfirmation || null }); }}
            className="input-field text-xs"
          />
        </div>
      )}
      <div>
        <label className="label">Notes</label>
        <input
          value={notes} onChange={e => setNotes(e.target.value)}
          onBlur={() => { onUpdate({ notes }); patch({ notes: notes || null }); }}
          className="input-field text-xs"
        />
      </div>
    </div>
  );
}

export function LogisticsTravelTab({ conferenceId, planYear, repTravel, plan, deadlines, onChange, onDeadlinesChange }: Props) {
  return (
    <div className="space-y-4">
      {repTravel.length === 0 ? (
        <p className="text-xs text-gray-400 italic text-center py-8">No reps assigned yet — assign reps from the Plan table to track their travel here.</p>
      ) : (
        <div className="space-y-2.5">
          {repTravel.map(rep => (
            <TravelRow
              key={rep.userId}
              conferenceId={conferenceId}
              planYear={planYear}
              rep={rep}
              onUpdate={patch => onChange(repTravel.map(r => r.userId === rep.userId ? { ...r, ...patch } : r))}
            />
          ))}
        </div>
      )}

      <div className="pt-4 border-t border-gray-100 space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hotel block</p>
        <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="preferredHotel" label="Preferred hotel" initialValue={plan.preferredHotel ?? ''} />
        <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="hotelBlockCutoff" label="Block cutoff date" type="date" initialValue={plan.hotelBlockCutoff ?? ''} />
      </div>

      <ChecklistSection conferenceId={conferenceId} planYear={planYear} category="travel" deadlines={deadlines} onDeadlinesChange={onDeadlinesChange} />
    </div>
  );
}
