'use client';

import { getCached, getConfigCategory } from '@/lib/configCache';

/**
 * The lists the assign-note form needs, fetched once for a whole run.
 *
 * Filing a floor note means choosing a conference, a company and an attendee,
 * so the form loads every conference, every company and every attendee — about
 * seven thousand rows across three requests, plus the chosen conference's own
 * attendee list and the company-type options. Five requests to open one form.
 *
 * That was fine while the form was opened one note at a time. Working through
 * a queue of twelve it is sixty requests, and a burst that size is what gets a
 * client challenged by the host's bot protection — the same fan-out that was
 * tracked down earlier in the Floor Notes drawers.
 *
 * So the lists live out here instead. The form remounts for each note, which
 * is what makes a new note a genuinely new form, and the data it mounts with
 * is already in hand.
 *
 * ── Records the form itself creates ────────────────────────────────────────
 *
 * Assigning a note can create a company and an attendee, and the next note in
 * the run may be about the very same new company — two leads at one account in
 * one thread is ordinary. A cache that only knew what the server knew when the
 * run began would offer to create it a second time.
 *
 * Rather than throwing the cache away on every create (which in a queue where
 * every lead is a new account is no cache at all), what was created is kept
 * beside what was fetched and merged on read. Once the fetch expires and
 * refreshes, the server's copy wins on id and the local one falls away.
 */

export interface CachedConference { id: number; name: string }
export interface CachedCompany { id: number; name: string; company_type: string | null }
export interface CachedAttendee {
  id: number;
  first_name: string;
  last_name: string;
  company_id: number | null;
  company_name: string | null;
}

export interface AssignLists {
  conferences: CachedConference[];
  companies: CachedCompany[];
  attendees: CachedAttendee[];
}

/**
 * Long enough to cover a run, short enough that a form opened later in the
 * session sees what someone else has added since.
 */
const TTL = 5 * 60_000;

const CONFERENCES = 'assign:conferences';
const COMPANIES = 'assign:companies';
const ATTENDEES = 'assign:attendees';
const confAttendeesKey = (id: number) => `assign:conference-attendees:${id}`;

/** Created by this browser since the lists were fetched. */
const createdCompanies: CachedCompany[] = [];
const createdAttendees: CachedAttendee[] = [];
/** Which conference each newly created attendee was added to. */
const createdAttendeeConference = new Map<number, number>();

/** Server rows first; anything created here that the server has not got yet, after. */
function mergeById<T extends { id: number }>(fetched: T[], local: T[]): T[] {
  if (local.length === 0) return fetched;
  const known = new Set(fetched.map(r => r.id));
  const extra = local.filter(r => !known.has(r.id));
  return extra.length === 0 ? fetched : [...fetched, ...extra];
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
}

function toConference(r: Record<string, unknown>): CachedConference {
  return { id: Number(r.id), name: String(r.name ?? '') };
}

function toCompany(r: Record<string, unknown>): CachedCompany {
  return {
    id: Number(r.id),
    name: String(r.name ?? ''),
    // The company dropdown groups on this, so it has to survive the mapping.
    company_type: r.company_type != null ? String(r.company_type) : null,
  };
}

function toAttendee(r: Record<string, unknown>): CachedAttendee {
  return {
    id: Number(r.id),
    first_name: String(r.first_name ?? ''),
    last_name: String(r.last_name ?? ''),
    company_id: r.company_id != null ? Number(r.company_id) : null,
    company_name: r.company_name != null ? String(r.company_name) : null,
  };
}

const json = (url: string) => fetch(url).then(r => (r.ok ? r.json() : []));

/**
 * Every conference, company and attendee, in one call.
 *
 * Three requests the first time and none after, however many notes a run gets
 * through. Concurrent callers share one promise — see getCached.
 */
export async function getAssignLists(): Promise<AssignLists> {
  const [conferences, companies, attendees] = await Promise.all([
    getCached(CONFERENCES, () => json('/api/conferences?nav=1'), TTL),
    getCached(COMPANIES, () => json('/api/companies?limit=2000'), TTL),
    getCached(ATTENDEES, () => json('/api/attendees?limit=5000'), TTL),
  ]);
  return {
    conferences: asArray(conferences).map(toConference),
    companies: mergeById(asArray(companies).map(toCompany), createdCompanies),
    attendees: mergeById(asArray(attendees).map(toAttendee), createdAttendees),
  };
}

/** The attendees of one conference, which is what the form narrows to. */
export async function getConferenceAttendees(conferenceId: number): Promise<CachedAttendee[]> {
  const data = await getCached(
    confAttendeesKey(conferenceId),
    () => fetch(`/api/conferences/${conferenceId}`).then(r => (r.ok ? r.json() : { attendees: [] })),
    TTL,
  ) as { attendees?: unknown };
  const fetched = asArray(data?.attendees).map(toAttendee);
  const mine = createdAttendees.filter(a => createdAttendeeConference.get(a.id) === conferenceId);
  return mergeById(fetched, mine);
}

/** The company types the "not in list" form offers, from the shared config cache. */
export async function getCompanyTypeOptions(): Promise<string[]> {
  const rows = await getConfigCategory('company_type').catch(() => [] as unknown[]);
  return asArray(rows).map(r => String(r.value ?? '')).filter(Boolean);
}

/**
 * A company this browser just created.
 *
 * So the next note in the run matches it instead of offering to create it
 * again — which is what a thread with two leads at one account would do.
 */
export function rememberCreatedCompany(company: CachedCompany): void {
  if (!Number.isFinite(company.id)) return;
  if (createdCompanies.some(c => c.id === company.id)) return;
  createdCompanies.push(company);
}

/** An attendee this browser just created, and the conference it was added to. */
export function rememberCreatedAttendee(attendee: CachedAttendee, conferenceId: number | null): void {
  if (!Number.isFinite(attendee.id)) return;
  if (!createdAttendees.some(a => a.id === attendee.id)) createdAttendees.push(attendee);
  if (conferenceId != null) createdAttendeeConference.set(attendee.id, conferenceId);
}
