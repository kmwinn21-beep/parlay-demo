'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface AddToConferenceModalProps {
  entityType: 'attendee' | 'company';
  selectedIds: Set<number>;
  onClose: () => void;
  onSuccess: () => void;
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AddToConferenceModal({ entityType, selectedIds, onClose, onSuccess }: AddToConferenceModalProps) {
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [selectedConfIds, setSelectedConfIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/conferences?nav=1')
      .then(r => r.json())
      .then((data: Conference[]) => setConferences(data))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const toggleConf = (id: number) => {
    setSelectedConfIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedConfIds.size === 0) {
      toast.error('Select at least one conference.');
      return;
    }
    setIsSubmitting(true);
    try {
      const body = entityType === 'attendee'
        ? { conference_ids: Array.from(selectedConfIds), attendee_ids: Array.from(selectedIds) }
        : { conference_ids: Array.from(selectedConfIds), company_ids: Array.from(selectedIds) };

      const res = await fetch('/api/conference-attendees/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Added to ${selectedConfIds.size} conference${selectedConfIds.size !== 1 ? 's' : ''}.`);
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to add to conferences.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const count = selectedIds.size;
  const entityLabel = entityType === 'company'
    ? `${count} compan${count !== 1 ? 'ies' : 'y'}`
    : `${count} attendee${count !== 1 ? 's' : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-brand-highlight w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-brand-primary font-serif">Add to Conference</h2>
            <p className="text-xs text-gray-500 mt-0.5">{entityLabel} selected</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Conference list */}
        <div className="overflow-y-auto flex-1 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-4 border-brand-secondary border-t-transparent rounded-full" />
            </div>
          ) : conferences.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No conferences found.</p>
          ) : (
            <div className="space-y-2">
              {conferences.map(conf => (
                <label
                  key={conf.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedConfIds.has(conf.id)
                      ? 'border-brand-secondary bg-blue-50'
                      : 'border-gray-200 hover:border-brand-secondary hover:bg-blue-50/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedConfIds.has(conf.id)}
                    onChange={() => toggleConf(conf.id)}
                    className="mt-0.5 w-4 h-4 accent-brand-secondary flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-brand-primary leading-snug">{conf.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(conf.start_date)} – {formatDate(conf.end_date)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || selectedConfIds.size === 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {isSubmitting
              ? 'Adding...'
              : selectedConfIds.size > 0
                ? `Add to Conference${selectedConfIds.size !== 1 ? 's' : ''} (${selectedConfIds.size})`
                : 'Add to Conference(s)'}
          </button>
        </div>
      </div>
    </div>
  );
}
