import type { Client } from '@libsql/client';

/**
 * Falls back to the two labels the debrief used to hardcode, so an account that
 * hasn't set any priorities keeps the behaviour it had.
 */
const DEFAULT_SENIOR_LABELS = ['C-Suite', 'VP/SVP'];

/**
 * Which seniority levels count as senior, from the ICP Parameters seniority
 * priorities in admin settings.
 *
 * The debrief used to hardcode ['C-Suite', 'VP/SVP'], which quietly excluded
 * every other label an account might use — a board member or executive
 * director didn't count as senior no matter how the account had set things up.
 */
export async function getSeniorSeniorityLabels(db: Client): Promise<Set<string>> {
  const res = await db.execute({
    sql: `SELECT value FROM site_settings WHERE key = 'icp_seniority_priority'`,
    args: [],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  let raw: Record<string, string> = {};
  try {
    const parsed = JSON.parse(String(res.rows[0]?.value ?? '{}'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, string>;
  } catch { /* fall through to the default */ }

  // "High" is the priority an account marks its decision-makers with; anything
  // lower is not what a senior-executive count is asking about.
  const high = Object.entries(raw)
    .filter(([, v]) => String(v).toLowerCase() === 'high')
    .map(([k]) => k.trim().toLowerCase())
    .filter(Boolean);

  const labels = high.length > 0 ? high : DEFAULT_SENIOR_LABELS.map(l => l.toLowerCase());
  return new Set(labels);
}

export function isSeniorSeniority(seniority: string | null | undefined, senior: Set<string>): boolean {
  const s = String(seniority ?? '').trim().toLowerCase();
  return s.length > 0 && senior.has(s);
}
