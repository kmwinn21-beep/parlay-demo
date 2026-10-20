'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DURATION_OPTIONS, DEFAULT_DURATION, calendarDays, conferencePeople, type CalendarMeeting,
} from '@/lib/meetingCalendar';
import {
  DEFAULT_WINDOW, WINDOW_OPTIONS, bookedCount, freeSlots,
  minutesToLabel, slotLabel, slotsByDay, slotsOf,
  type AvailabilitySlot,
} from '@/lib/availability';
import { formatCardDate } from '@/lib/meetingTime';
import { useIsPhone } from '@/lib/useIsPhone';

/**
 * Where there is room, for everybody on this conference at once.
 *
 * The calendar shows what is booked; this shows the other half — a column per
 * internal attendee holding the half hours they are free in. Picking one is
 * not an answer, it is the start of a booking: the slot carries its day, its
 * time, its length and whose gap it was into the meeting form.
 *
 * The arithmetic is in lib/availability. This draws it.
 */

export interface AvailabilityPick {
  personId: number;
  personName: string;
  day: string;
  /** 'HH:MM'. */
  time: string;
  durationMinutes: number;
}

export function AvailabilityModal({
  meetings, conferenceName, conferenceStart, conferenceEnd, internalAttendees,
  userOptions, onPick, onClose,
}: {
  meetings: CalendarMeeting[];
  conferenceName: string;
  conferenceStart: string | null;
  conferenceEnd: string | null;
  /** The conference's own internal attendees, as it stores them: names, comma-separated. */
  internalAttendees: string | null;
  userOptions: Array<{ id: number; value: string }>;
  /** A slot was chosen — the caller opens the meeting form with it. */
  onPick: (pick: AvailabilityPick) => void;
  onClose: () => void;
}) {
  const isPhone = useIsPhone();
  const [mounted, setMounted] = useState(false);
  const [duration, setDuration] = useState<number>(DEFAULT_DURATION);
  const [startMinutes, setStartMinutes] = useState(DEFAULT_WINDOW.startMinutes);
  const [endMinutes, setEndMinutes] = useState(DEFAULT_WINDOW.endMinutes);
  const [day, setDay] = useState<string | null>(null);
  /**
   * The day sections that are open, across every column at once.
   *
   * Shared rather than per person on purpose: the board exists to compare one
   * day across the team, and a Tuesday open in one column and shut in the next
   * is four columns that cannot be read against each other.
   */
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  /**
   * The people whose section is open — a phone only, where the columns are
   * stacked. From sm every column is open, because they are side by side and
   * there is nothing a shut one would make room for.
   */
  const [openPeople, setOpenPeople] = useState<Set<number>>(new Set());

  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allDays = useMemo(
    () => calendarDays(conferenceStart, conferenceEnd, meetings),
    [conferenceStart, conferenceEnd, meetings],
  );
  const days = useMemo(() => (day ? allDays.filter(d => d === day) : allDays), [allDays, day]);
  const people = useMemo(
    () => conferencePeople(internalAttendees, meetings, userOptions),
    [internalAttendees, meetings, userOptions],
  );
  const slots = useMemo(
    () => freeSlots({ meetings, people, days, startMinutes, endMinutes, duration }),
    [meetings, people, days, startMinutes, endMinutes, duration],
  );

  /*
   * Shut to start with, because the question the board answers first is which
   * day has room rather than at what time — four people over four days is
   * eighty cards, and a wall of them has to be scrolled before it can be read.
   * Collapsed, a column is four lines with a count on each.
   *
   * Except where there is only one day in play: the picker above has already
   * chosen it, and a board that answers a direct question with one shut
   * drawer is a click asking to be made. Changing the picker re-seeds rather
   * than remembering, so going back to All days closes everything again.
   */
  const daysKey = days.join();
  useEffect(() => {
    setOpenDays(days.length === 1 ? new Set(days) : new Set());
    // daysKey IS the days, as a value that can be compared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey]);

  const togglePerson = (id: number) => setOpenPeople(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleDay = (value: string) => setOpenDays(prev => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });

  if (!mounted) return null;

  /** Half hours a shorter meeting would find, for a column that has none. */
  const shorterThan = (personId: number): number | null => {
    for (const shorter of DURATION_OPTIONS.filter(d => d < duration).reverse()) {
      const found = freeSlots({ meetings, people: people.filter(p => p.id === personId), days, startMinutes, endMinutes, duration: shorter });
      if (found.length > 0) return shorter;
    }
    return null;
  };

  const windowValid = endMinutes > startMinutes;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      {/* A phone gets a sheet that starts at the header's bottom edge and runs
          to the bottom of the screen — sheet-below-header, the same measure
          every other phone drawer in the app uses, so they all stop in the
          same place whatever the status-bar inset turns out to be. From sm it
          is a centred dialog again. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Availability"
        className="drawer-mobile-responsive sheet-below-header relative w-full max-w-6xl bg-white rounded-t-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden sm:h-[88vh] sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-brand-primary font-serif">Availability</h2>
            <p className="mt-0.5 text-xs text-gray-500 truncate">
              {conferenceName}
              {people.length > 0 && ` · ${people.length} internal attendee${people.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* How long, which day, and between when.

            A phone stacks them, each on a full-width line of its own: the day
            buttons used to wrap into whatever the first two left over, which
            at 390px was a narrow column pinned to the right edge with half of
            the dates off screen and no way to reach them. Order matters in the
            stack — length, then day, then the window, which is how the
            question is actually asked — so the three carry order classes that
            the sm+ row ignores. */}
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex-shrink-0 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="order-1 w-full sm:w-auto">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Meeting length</p>
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
              {DURATION_OPTIONS.map((mins, i) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDuration(mins)}
                  aria-pressed={duration === mins}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-gray-300' : ''} ${
                    duration === mins ? 'bg-brand-secondary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {mins} min
                </button>
              ))}
            </div>
          </div>

          <div className="order-3 w-full sm:order-2 sm:w-auto">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Between</p>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="availability-from">From</label>
              <select
                id="availability-from"
                value={startMinutes}
                onChange={e => setStartMinutes(Number(e.target.value))}
                className="input-field text-xs py-1.5 w-28"
              >
                {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span className="text-xs text-gray-400">and</span>
              <label className="sr-only" htmlFor="availability-to">To</label>
              <select
                id="availability-to"
                value={endMinutes}
                onChange={e => setEndMinutes(Number(e.target.value))}
                className="input-field text-xs py-1.5 w-28"
              >
                {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="order-2 w-full min-w-0 sm:order-3 sm:flex-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Day</p>
            {/* One line that scrolls, rather than a block that wraps: a week
                of dates is wider than a phone however they are arranged, and
                a row you can push sideways beats a column you cannot reach. */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide sm:flex-wrap sm:overflow-visible">
              <button
                type="button"
                onClick={() => setDay(null)}
                aria-pressed={day === null}
                className={`flex-shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  day === null ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                All days
              </button>
              {allDays.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(prev => (prev === d ? null : d))}
                  aria-pressed={day === d}
                  className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                    day === d ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                >
                  {formatCardDate(d)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* The board.

            From sm: a column per person, side by side, each scrolling on its
            own — a week of half hours is eighty cards, and a page that grows
            to hold the longest column leaves the others short and the controls
            off screen.

            On a phone there is no room for columns side by side, so the people
            stack: each one a section that is shut until it is asked for, and
            opens onto their days, themselves shut. Two taps to a time, and
            four people fit on one screen instead of a quarter of one. */}
        <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-x-auto sm:overflow-y-hidden bg-gray-50 p-3 sm:p-4">
          {!windowValid ? (
            <p className="text-center text-xs text-gray-500 py-10">
              The day has to end after it starts — {minutesToLabel(startMinutes)} is not before {minutesToLabel(endMinutes)}.
            </p>
          ) : people.length === 0 ? (
            <p className="text-center text-xs text-gray-500 py-10">
              No internal attendees on this conference yet — add them to the conference to see when they are free.
            </p>
          ) : (
            <div
              className="flex flex-col gap-2 sm:grid sm:gap-3 sm:min-w-0 sm:h-full"
              /* Ignored while the box is a column of sections; it is what the
                 sm: grid lays its columns out with. */
              style={{ gridTemplateColumns: `repeat(${Math.max(people.length, 1)}, minmax(220px, 1fr))` }}
            >
              {people.map(person => {
                const mine = slotsOf(slots, person.id);
                const groups = slotsByDay(mine);
                const booked = bookedCount(meetings, person.id);
                const fallback = mine.length === 0 ? shorterThan(person.id) : null;
                const personOpen = !isPhone || openPeople.has(person.id);
                /* Written once, worn by a button on a phone and by a plain
                   heading everywhere else — a button that cannot be pressed
                   is still in the tab order, and a column head that is always
                   open has nothing to announce. */
                const personHead = (
                  <>
                    <span className="w-6 h-6 rounded-full bg-brand-secondary/10 text-brand-primary text-[9px] font-semibold flex items-center justify-center flex-shrink-0">
                      {person.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-brand-primary truncate">{person.name}</p>
                      <p className="text-[10px] text-gray-500">
                        {booked} booked · {mine.length} open
                      </p>
                    </div>
                  </>
                );
                const body = (
                  <div className="p-2.5 flex flex-col gap-1.5">
                      {mine.length === 0 && (
                        <div className="py-6 px-2 text-center">
                          <p className="text-[11px] text-gray-500 leading-relaxed">
                            No {duration}-minute gap{day ? ` on ${formatCardDate(day)}` : ''} between{' '}
                            {minutesToLabel(startMinutes)} and {minutesToLabel(endMinutes)}.
                          </p>
                          {fallback && (
                            <button
                              type="button"
                              onClick={() => setDuration(fallback)}
                              className="mt-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-[11px] font-medium text-brand-secondary hover:bg-gray-50 transition-colors"
                            >
                              Show {fallback} min instead
                            </button>
                          )}
                        </div>
                      )}

                      {groups.map(group => {
                        const open = openDays.has(group.day);
                        return (
                        <div key={group.day} className="flex flex-col gap-1.5">
                          {/* The day, what it holds, and the way into it. */}
                          <button
                            type="button"
                            onClick={() => toggleDay(group.day)}
                            aria-expanded={open}
                            data-availability-day={group.day}
                            title={`${formatCardDate(group.day)} — ${group.slots.length} open slot${group.slots.length === 1 ? '' : 's'}`}
                            className="flex items-center gap-2 pt-1 text-left group/day"
                          >
                            <svg
                              className={`w-3 h-3 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap group-hover/day:text-brand-primary transition-colors">
                              {formatCardDate(group.day)}
                            </p>
                            <span className="flex-1 h-px bg-gray-200" />
                            {/* Green, like the slots it is counting. */}
                            <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[1.25rem] rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                              {group.slots.length}
                            </span>
                          </button>
                          {/* Rows of 0fr to 1fr: the drawer slides without
                              anything having to measure how tall its contents
                              are, which a list that changes with the length
                              and the window would have to do on every change.
                              The slots stay mounted and are clipped, since a
                              height cannot animate from nothing. */}
                          <div
                            className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                              open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                          >
                            <div className="overflow-hidden">
                              {/* Shut means out of reach as well as out of sight: a clipped
                                  slot is still a tab stop without this. */}
                              <div className="flex flex-col gap-1.5 pt-1.5" inert={!open}>
                                {group.slots.map(slot => (
                                  <SlotButton
                                    key={`${slot.day}-${slot.startMinutes}`}
                                    slot={slot}
                                    onPick={() => onPick({
                                      personId: person.id,
                                      personName: person.name,
                                      day: slot.day,
                                      time: `${String(Math.floor(slot.startMinutes / 60)).padStart(2, '0')}:${String(slot.startMinutes % 60).padStart(2, '0')}`,
                                      durationMinutes: duration,
                                    })}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                  </div>
                );

                return (
                  <div
                    key={person.id}
                    data-availability-person={person.id}
                    className="min-w-0 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden sm:min-h-0"
                  >
                    {isPhone ? (
                      <button
                        type="button"
                        onClick={() => togglePerson(person.id)}
                        aria-expanded={personOpen}
                        data-availability-person-toggle={person.id}
                        className="w-full px-3 py-2.5 flex items-center gap-2 text-left"
                      >
                        <svg
                          className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 transition-transform ${personOpen ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                        {personHead}
                        <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[1.5rem] rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[11px] font-semibold text-green-700">
                          {mine.length}
                        </span>
                      </button>
                    ) : (
                      <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
                        {personHead}
                      </div>
                    )}

                    {isPhone ? (
                      <div
                        className={`grid border-t border-gray-100 transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                          personOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] border-transparent'}`}
                      >
                        <div className="overflow-hidden">{body}</div>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 overflow-y-auto">{body}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-gray-100 flex-shrink-0 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[11px] text-gray-500">
            Every half hour inside the window with no meeting in it. Booth hours and TBD do not block a slot — they are not on the clock.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One free slot: the day, the time, and a booking waiting to happen. */
function SlotButton({ slot, onPick }: { slot: AvailabilitySlot; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      data-availability-slot={`${slot.day}-${slot.startMinutes}`}
      title={`${formatCardDate(slot.day)} · ${slotLabel(slot.startMinutes, slot.endMinutes)}`}
      className="w-full text-left rounded-lg border border-green-200 bg-green-50 px-2.5 py-2 hover:border-green-500 hover:bg-green-100 transition-colors"
    >
      {/* The time alone. The date used to lead the card, from when the slots
          were one flat list per person; the day's own heading sits directly
          above it now, and saying Wednesday nine times under a line that says
          Wednesday is the sort of thing a reader stops seeing. */}
      <span className="block text-xs font-semibold text-green-900">
        {slotLabel(slot.startMinutes, slot.endMinutes)}
      </span>
    </button>
  );
}
