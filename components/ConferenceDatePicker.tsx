'use client';

import { useMemo, useState } from 'react';

/**
 * Date field that offers one button per conference day, with an escape hatch
 * to a plain date input. Shared by the new-meeting modal and the social event
 * form so both pick conference dates the same way.
 */

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Every YYYY-MM-DD from start to end inclusive, capped at 14 days. */
export function getConferenceDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const startMs = new Date(start + 'T00:00:00').getTime();
  const endMs = new Date(end + 'T00:00:00').getTime();
  if (isNaN(startMs) || isNaN(endMs)) return dates;
  let cur = startMs;
  while (cur <= endMs && dates.length < 14) {
    const d = new Date(cur);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    cur += 86400000;
  }
  return dates;
}

export function formatChipDate(ymd: string): { short: string; full: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const short = `${DAY_ABBR[date.getDay()]} ${MONTH_ABBR[m - 1]} ${d}`;
  const full = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return { short, full };
}

export function ConferenceDatePicker({
  value, onChange, startDate, endDate, inputClassName, required,
}: {
  value: string;
  onChange: (ymd: string) => void;
  startDate: string | null;
  endDate: string | null;
  inputClassName?: string;
  required?: boolean;
}) {
  const dates = useMemo(
    () => (startDate && endDate ? getConferenceDateRange(startDate, endDate) : []),
    [startDate, endDate],
  );
  // A value outside the conference window (an existing event being edited)
  // opens straight into the calendar rather than showing nothing selected.
  const [showCalendar, setShowCalendar] = useState(() => !!value && dates.length > 0 && !dates.includes(value));

  const inputCls = inputClassName ?? 'input-field w-full text-sm';

  if (dates.length === 0 || showCalendar) {
    return (
      <div>
        <input
          type="date"
          className={inputCls}
          value={value}
          min={startDate ?? undefined}
          onChange={e => onChange(e.target.value)}
          required={required}
        />
        {dates.length > 0 && (
          <button
            type="button"
            onClick={() => { setShowCalendar(false); onChange(''); }}
            className="mt-1.5 text-xs text-brand-secondary hover:text-brand-primary transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to conference dates
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {dates.map(ymd => {
          const { short, full } = formatChipDate(ymd);
          const selected = value === ymd;
          return (
            <button
              key={ymd}
              type="button"
              title={full}
              onClick={() => onChange(ymd)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                selected
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-brand-primary hover:text-brand-primary'
              }`}
            >{short}</button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => { setShowCalendar(true); onChange(''); }}
        className="text-xs text-brand-secondary hover:text-brand-primary transition-colors flex items-center gap-1"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Pick another date
      </button>
    </div>
  );
}
