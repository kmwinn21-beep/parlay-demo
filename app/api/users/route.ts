import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  // Ordered/named after the Types tab's config_options 'user' list (the same
  // rep roster used everywhere else in the app — rep pills, assignment
  // dropdowns, etc.) rather than the raw users table, so this list stays
  // consistent with the rest of the app even if a rep's Types-tab entry has
  // been renamed since their account was created.
  const [configRes, usersRes] = await Promise.all([
    db.execute({
      sql: `SELECT co.id as config_id, co.value as display_value, u.id as user_id
            FROM config_options co
            LEFT JOIN users u ON u.config_id = co.id
            WHERE co.category = 'user'
            ORDER BY co.sort_order, co.value`,
      args: [],
    }),
    db.execute({
      sql: `SELECT id, display_name, first_name, last_name FROM users ORDER BY COALESCE(display_name, first_name, '')`,
      args: [],
    }),
  ]);

  const options: { id: number; value: string }[] = [];
  for (const r of configRes.rows) {
    // Types-tab entries with no linked login account have no user id to
    // assign outreach/notifications to, so they're not assignable here.
    if (r.user_id == null) continue;
    options.push({ id: Number(r.user_id), value: String(r.display_value) });
  }

  // Real accounts that predate the config_id linkage (or otherwise have no
  // matching Types-tab entry) still need to be assignable — append them,
  // using their own name, after the Types-tab-ordered list above.
  for (const r of usersRes.rows) {
    const userId = Number(r.id);
    if (options.some(o => o.id === userId)) continue;
    const name = r.display_name
      ? String(r.display_name)
      : [r.first_name, r.last_name].filter(Boolean).join(' ') || `User ${userId}`;
    options.push({ id: userId, value: name });
  }

  return NextResponse.json(options);
}
