import type { Client } from '@libsql/client';

/** The literal every account is seeded with, and the fallback when the key is gone. */
const DEFAULT_HELD_VALUE = 'Held';

/**
 * How an account spells "this meeting happened".
 *
 * Resolved from the config option carrying action_key = 'meeting_held', which
 * is the stable identifier and survives a rename. That key is only ever set by
 * a migration matching the literal 'Held' or 'Meeting Held', and action options
 * aren't marked is_system — so they can be deleted or renamed and leave nothing
 * carrying it, at which point every "meetings held" metric reads zero forever.
 * Falling back to the seeded literal keeps those accounts counting.
 */
export interface MeetingHeld {
  /** The outcome value to compare against, lowercased. */
  value: string;
  /** True when a config option actually carries the key. */
  fromActionKey: boolean;
}

export async function getMeetingHeld(db: Client): Promise<MeetingHeld> {
  const res = await db.execute({
    sql: `SELECT value FROM config_options
          WHERE category = 'action' AND action_key = 'meeting_held'
          ORDER BY id LIMIT 1`,
    args: [],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  const value = res.rows[0]?.value ? String(res.rows[0].value).trim() : '';
  return value
    ? { value: value.toLowerCase(), fromActionKey: true }
    : { value: DEFAULT_HELD_VALUE.toLowerCase(), fromActionKey: false };
}

/** Case-insensitive, so an outcome stored as "held" counts the same as "Held". */
export function isMeetingHeld(outcome: string | null | undefined, held: MeetingHeld): boolean {
  return String(outcome ?? '').trim().toLowerCase() === held.value;
}
