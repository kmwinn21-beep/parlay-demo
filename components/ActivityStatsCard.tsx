'use client';

import { useEffect, useState } from 'react';

const ACTION_LABELS = [
  'Meeting Scheduled',
  'Meeting Held',
  'Social Conversation',
  'Meeting No-Show',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(String);
const MONTHS = [
  { value: '', label: 'All Months' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export function ActivityStatsCard() {
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (year) params.set('year', year);
    if (month) params.set('month', month);
    setIsLoading(true);
    fetch(`/api/activity-stats?${params.toString()}`)
      .then((r) => r.json())
      .then(setCounts)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [year, month]);

  return (
    <div className="card border-l-4 border-procare-bright-blue">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Meeting Activity</h2>
      </div>

      <div className="flex gap-2 mb-5">
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="input-field w-auto text-sm"
        >
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="input-field w-auto text-sm"
        >
          {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin w-5 h-5 border-2 border-procare-bright-blue border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-3">
          {ACTION_LABELS.map((label) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{label}</span>
              <span className="text-2xl font-bold text-procare-dark-blue font-serif">
                {counts[label] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
