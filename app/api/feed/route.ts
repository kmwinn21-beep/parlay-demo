import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';
import { getSessionUser } from '@/lib/auth';
import { fetchFeed } from '@/lib/feed/query';
import type { FeedScope } from '@/lib/feed/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/feed — the conference activity stream.
 *
 * TEAM-WIDE by design. Every user on the account sees the same items, and
 * notification preferences are not consulted: this is a shared view of what the
 * team is doing, not a per-person delivery. Someone who has muted note mentions
 * still sees notes here, because they are looking at the feed on purpose.
 *
 * Any authenticated member may read it. The account comes from the session, so
 * there is no parameter that could point this at another tenant.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const scope: FeedScope = searchParams.get('scope') === 'all' ? 'all' : 'in_progress';
  const limitParam = Number(searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 30;
  const before = searchParams.get('before');

  try {
    const db = await getDb(user.accountId);
    const result = await fetchFeed(db, { scope, limit, before });
    return NextResponse.json({
      items: result.items,
      hasMore: result.hasMore,
      // The empty state has to tell "no show is running" apart from "a show is
      // running and nobody did anything", and those read very differently.
      inProgressCount: result.inProgressConferenceIds.length,
    });
  } catch (err) {
    // fetchFeed does not throw; this catches a database that is unreachable.
    // The dashboard renders around an empty feed rather than failing.
    console.error('GET /api/feed error:', err);
    return NextResponse.json({ error: 'Failed to load the feed.' }, { status: 500 });
  }
}
