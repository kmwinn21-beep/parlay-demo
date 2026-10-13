/**
 * Finding — and filling in — the copies a note never got.
 *
 * One note is stored three times: against the attendee, the company and the
 * conference. That is what lets it be read from any of them, and every path
 * that writes a note does it. One could not: the notes popover on a row is
 * handed an attendee id and a conference name and has no company at all, so
 * its notes landed on the attendee and nowhere else.
 *
 * The write path is fixed. This is for the ones already in the database.
 *
 * ── Two things it must get right ────────────────────────────────────────────
 *
 * It has to agree with lib/notes/copies about what makes two rows the same
 * note — same text, same author, same rep, within COPY_WINDOW_SECONDS, on a
 * different entity type. Nothing links the rows, so "already has a copy" is
 * inferred, and inferring it differently here would mean writing a second copy
 * beside one that was already there.
 *
 * And a copy it writes has to carry the SOURCE's created_at, not now. The
 * window is ten seconds, so a copy stamped with today's date would sit outside
 * it: the feed would stop collapsing the pair into one card, "delete all
 * copies" would not reach it, and running this twice would write it again.
 * Stamping it with the original's time makes all three true at once.
 */

import type { Client } from '@libsql/client';
import { withinCopyWindow } from './copies';

/** A copy that should exist and does not. */
export interface MissingCopy {
  /** The attendee note it should be a copy of. */
  sourceId: number;
  entityType: 'company' | 'conference';
  entityId: number;
  /** For the report — when the original was written. */
  createdAt: string;
}

export interface FindOptions {
  /** Only notes written on or after this, as 'YYYY-MM-DD'. */
  since?: string | null;
  /** Stop after this many, for a first look at a large account. */
  limit?: number | null;
}

/*
 * The attendee notes, with the two records each should also have been written
 * against. The conference comes from the note's own id where it has one and
 * from its name otherwise — conference_id was added to this table later, so
 * older rows carry only the text.
 */
const SOURCE = `
  SELECT n.id, n.content, n.author_user_id, n.rep, n.created_at,
         n.conference_name, n.tagged_users, n.note_type, n.meeting_id,
         n.insight_counts, n.status, n.touchpoint_type,
         n.attendee_name, n.company_name,
         n.entity_id AS attendee_id,
         a.first_name, a.last_name,
         a.company_id AS company_id,
         co.name AS company_name_resolved,
         COALESCE(n.conference_id, cf.id) AS conference_id
  FROM entity_notes n
  JOIN attendees a ON a.id = n.entity_id
  LEFT JOIN companies co ON co.id = a.company_id
  LEFT JOIN conferences cf ON LOWER(TRIM(cf.name)) = LOWER(TRIM(n.conference_name))
  WHERE n.entity_type = 'attendee'`;

/** The same-note test from lib/notes/copies, as a NOT EXISTS against one target. */
function missingClause(targetType: 'company' | 'conference', targetCol: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM entity_notes c
    WHERE c.entity_type = '${targetType}'
      AND c.entity_id = s.${targetCol}
      AND c.content = s.content
      AND COALESCE(c.author_user_id, -1) = COALESCE(s.author_user_id, -1)
      AND COALESCE(TRIM(c.rep), '') = COALESCE(TRIM(s.rep), '')
      AND ${withinCopyWindow('c.created_at', 's.created_at')}
  )`;
}

/**
 * Every copy that is missing, newest note first.
 *
 * Reports only. Nothing here writes, so it is safe to run against anything.
 */
export async function findMissingNoteCopies(db: Client, opts: FindOptions = {}): Promise<MissingCopy[]> {
  /*
   * The CTE appears once in the text, so `since` binds once however many
   * branches of the union read from it. The limit, when there is one, binds
   * last because it is last in the statement.
   */
  const sql = `
    WITH s AS (${SOURCE}${opts.since ? ' AND n.created_at >= ?' : ''})
    SELECT s.id AS source_id, 'company' AS entity_type, s.company_id AS entity_id, s.created_at
      FROM s WHERE s.company_id IS NOT NULL AND ${missingClause('company', 'company_id')}
    UNION ALL
    SELECT s.id AS source_id, 'conference' AS entity_type, s.conference_id AS entity_id, s.created_at
      FROM s WHERE s.conference_id IS NOT NULL AND ${missingClause('conference', 'conference_id')}
    ORDER BY created_at DESC, source_id, entity_type
    ${opts.limit ? 'LIMIT ?' : ''}`;

  const args: (string | number)[] = [];
  if (opts.since) args.push(opts.since);
  if (opts.limit) args.push(opts.limit);

  const res = await db.execute({ sql, args });
  return res.rows.map(r => ({
    sourceId: Number(r.source_id),
    entityType: String(r.entity_type) as 'company' | 'conference',
    entityId: Number(r.entity_id),
    createdAt: String(r.created_at ?? ''),
  }));
}

/**
 * Write them.
 *
 * Each copy carries the original's timestamp, author, rep and type — see the
 * note at the top for why the timestamp in particular. The attendee and
 * company NAMES are filled in from the records where the original had none,
 * since the card that wrote these sent neither, and without them a note draws
 * in the conference's list with nothing saying who it is about.
 *
 * Returns how many rows it wrote.
 */
export async function writeMissingNoteCopies(db: Client, missing: MissingCopy[]): Promise<number> {
  if (missing.length === 0) return 0;
  let written = 0;

  // In chunks: an account with thousands of these should not be one statement.
  const CHUNK = 200;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const slice = missing.slice(i, i + CHUNK);
    await db.batch(slice.map(m => ({
      sql: `INSERT INTO entity_notes
              (entity_type, entity_id, content, conference_name, conference_id, rep,
               attendee_name, company_name, tagged_users, author_user_id,
               note_type, meeting_id, insight_counts, status, touchpoint_type, created_at)
            SELECT ?, ?, s.content, s.conference_name, s.conference_id, s.rep,
                   COALESCE(NULLIF(TRIM(s.attendee_name), ''),
                            NULLIF(TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')), '')),
                   COALESCE(NULLIF(TRIM(s.company_name), ''), NULLIF(TRIM(s.company_name_resolved), '')),
                   s.tagged_users, s.author_user_id,
                   s.note_type, s.meeting_id, s.insight_counts, s.status, s.touchpoint_type,
                   s.created_at
            FROM (${SOURCE} AND n.id = ?) s`,
      args: [m.entityType, m.entityId, m.sourceId],
    })), 'write');
    written += slice.length;
  }
  return written;
}
