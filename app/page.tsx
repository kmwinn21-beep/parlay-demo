import { Suspense } from 'react';
import type { Client } from '@libsql/client';
import Link from 'next/link';
import { dbReady } from '@/lib/db';
import { getDb } from '@/lib/getDb';
import { QuickNotesSection } from '@/components/QuickNotesSection';
import { DashboardRightColumn } from '@/components/DashboardRightColumn';
import { getServerSessionUser } from '@/lib/auth';
import { DashboardConferenceBanner } from '@/components/DashboardConferenceBanner';
import type { DashboardConference } from '@/components/RecentSection';
import { DashboardTargetsSection } from '@/components/DashboardTargetsSection';
import { DashboardActionCard } from '@/components/DashboardActionCard';
import { UpgradeSuccessBanner } from '@/components/UpgradeSuccessBanner';
export const dynamic = 'force-dynamic';

async function getAllConferences(tenantDb: Client): Promise<DashboardConference[]> {
  await dbReady;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await tenantDb.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.location, c.internal_attendees,
            (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.conference_id = c.id) as attendee_count
          FROM conferences c
          WHERE (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.conference_id = c.id) > 0
          ORDER BY c.start_date DESC`,
    args: [],
  });
    return result.rows.map((r) => {
    const startDate = String(r.start_date ?? '');
    const endDate = String(r.end_date ?? '');
    const status: 'in_progress' | 'upcoming' | 'past' =
      startDate <= today && endDate >= today ? 'in_progress' :
      endDate >= today ? 'upcoming' : 'past';
    return {
      id: Number(r.id),
      name: String(r.name ?? ''),
      start_date: startDate,
      end_date: endDate,
      location: String(r.location ?? ''),
      internal_attendees: r.internal_attendees ? String(r.internal_attendees).split(',').map(s => s.trim()).filter(Boolean) : [],
      attendee_count: Number(r.attendee_count ?? 0),
      status,
    };
    });
  } catch {
    return [];
  }
}

/* ---------- Skeleton components for Suspense fallbacks ---------- */

function StatsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2 rounded-2xl bg-gray-300 h-36" />
        <div className="card">
          <div className="h-4 w-28 bg-gray-200 rounded mb-4" />
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-5 w-10 bg-gray-200 rounded" />
                  <div className="h-3 w-16 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TargetsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-24 bg-gray-200 rounded" />
          <div className="h-9 w-48 bg-gray-200 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Async section components for Suspense ---------- */

async function StatsSection() {
  const sessionUser = await getServerSessionUser();
  const tenantDb = await getDb(sessionUser?.accountId);
  return (
    // Three columns, banner over two and the action panel over one. Stretched
    // rather than top-aligned so the two cards share a height instead of the
    // banner floating short beside a taller panel.
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
      <div className="lg:col-span-2">
        <DashboardConferenceBanner />
      </div>
      <div className="h-full">
        <DashboardActionCard />
      </div>
    </div>
  );
}

/**
 * Targets, as one cell of the shared grid below.
 *
 * It no longer owns a grid of its own. The Feed spans both rows, and a CSS
 * row-span cannot cross two sibling grids — so the two rows became one, and
 * this kept only the async data fetch it actually needs. Still inside its own
 * Suspense boundary, so a slow conference query does not block the Feed or
 * Floor Notes from painting.
 */
async function TargetsSection() {
  const sessionUser = await getServerSessionUser();
  const tenantDb = await getDb(sessionUser?.accountId);
  const allConferences = await getAllConferences(tenantDb);

  return (
    <div className="card">
      <DashboardTargetsSection allConferences={allConferences} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Post-checkout success/cancel banner — useSearchParams requires Suspense */}
      <Suspense fallback={null}>
        <UpgradeSuccessBanner />
      </Suspense>

      {/* Overview stats + Conference Tracking banner */}
      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>

      {/* ── Floor Notes + Targets on the left, the Feed and the queue spanning
             both rows on the right ────────────────────────────────────────
          ONE grid, not two. The right column occupies both rows, and a CSS
          row-span cannot cross two sibling grids — the previous layout had
          these as separate containers, one of them inside its own Suspense
          boundary.

          Five columns split 3/2, not three split 2/1. Measured at the app's
          own max-w-6xl: the right column goes from 368px to 446px, about 21%
          wider, and the left from 760px to 682px, about 10% narrower. The
          right column is where the work is now — a queue is acted on, where a
          target list is scanned — and at 368px the company names in it were
          close to truncating against their count bubbles.

          Targets keeps its Suspense boundary as a grid CHILD rather than a grid
          owner, so it still streams in without blocking the other two cells and
          without needing to become synchronous.

          Below lg everything stacks in source order: Floor Notes, Targets,
          Feed. The Feed last is deliberate — on a phone the two cards you act
          on come first, and the feed is something you scroll to. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 lg:grid-rows-[auto_auto] gap-6 items-stretch">
        {/* Floor Notes. It used to take its height from the Touchpoints card
            beside it; with that gone it needs an explicit one on DESKTOP,
            chosen to match what it rendered at before.
            Desktop only, deliberately. On a phone the card collapses to its
            header — the body unmounts — and a fixed height held the container
            open at 489px around nothing, which read as a broken empty box. The
            mobile cap is a max-height, so an expanded card still scrolls inside
            the same bound while a collapsed one shrinks to fit. */}
        <div className="lg:col-span-3 lg:row-start-1 max-h-[489px] lg:max-h-none lg:h-[489px] flex flex-col min-h-0 lg:block lg:relative">
          <QuickNotesSection className="lg:absolute lg:inset-0" />
        </div>

        <Suspense fallback={<div className="lg:col-span-3 lg:row-start-2"><TargetsSkeleton /></div>}>
          <div className="lg:col-span-3 lg:row-start-2">
            <TargetsSection />
          </div>
        </Suspense>

        {/* The full-height right-hand column.
            Taken out of flow on desktop, exactly as Floor Notes is: a card that
            sizes to its content would drive the row height, and a feed of forty
            items would stretch the grid to 1500px instead of scrolling inside
            the space the other two cards define. */}
        {/* No height on a phone, so the card can fold to its header like the
            two above it. The cap lives on the CARD rather than this wrapper,
            because the stream inside is a flex child that needs a bounded
            parent to scroll against — a max-height on an auto-height wrapper
            would not give it one. */}
        <div className="lg:row-span-2 lg:row-start-1 lg:col-start-4 lg:col-span-2 lg:h-auto lg:relative">
          <DashboardRightColumn />
        </div>
      </div>
    </div>
  );
}
