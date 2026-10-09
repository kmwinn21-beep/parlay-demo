'use client';

import dynamic from 'next/dynamic';
import { useIsPhone } from '@/lib/useIsPhone';

/**
 * A record, rendered inside the drawer that opened it.
 *
 * Every quick-view drawer used to be `<iframe src="/companies/9156?embed=true">`,
 * which boots a SECOND copy of the application: its own document, its own
 * JavaScript context, its own provider tree. Measured from a phone's logs,
 * one drawer open cost about thirty requests — /api/auth/me,
 * /api/onboarding/progress, /api/suggestions twice, /api/config eight times,
 * and the record's own data — and every one of them again on the next open,
 * because a fresh iframe is a cold cache.
 *
 * That is also why the request deduplication in lib/configCache did nothing
 * for it: those caches live in a JavaScript context, and an iframe is a
 * different one.
 *
 * Rendering the same component inline fixes all of it at once. The provider
 * tree is the host page's, already mounted, so none of it is fetched twice;
 * the caches are the host's, so /api/config is fetched once per session
 * instead of eight times per open; and there is no second document.
 *
 * It is the SAME component the route renders, so the drawer looks exactly as
 * it did — not a summary built to resemble it.
 *
 * ── Only on a phone, and that is not a preference ──────────────────────────
 *
 * The record views lay themselves out with VIEWPORT breakpoints —
 * sm:grid-cols-2, md:grid-cols-4, lg:grid-cols-3. An iframe has its own
 * viewport, and the drawer's 480px meant none of them applied: the record
 * stacked into one column, which is what fits a drawer.
 *
 * Rendered inline, those breakpoints resolve against the HOST's viewport. On a
 * 1440px screen all of them apply, and a four-column grid is crushed into a
 * 480px drawer — columns a few characters wide, every word wrapped down the
 * page. Reported, and plainly wrong.
 *
 * So inline is correct exactly when the drawer is as wide as the viewport,
 * which is below `sm`. Above it the iframe stays, because its separate
 * viewport is the thing making the layout right. That also means the saving
 * lands where the cost was: a phone is where a quick view is how a record is
 * read at all.
 *
 * Making this work at every width means the views laying out by CONTAINER
 * rather than by viewport — container queries, across two files of a couple
 * of thousand lines each. Worth doing, not worth doing reactively.
 */

/*
 * Loaded on demand, because these views are a couple of thousand lines each
 * and the pages that open a drawer should not carry them until one is opened.
 * The chunk is fetched once and cached for the session — unlike the iframe's
 * document, which was fetched again every single time.
 */
const CompanyDetailView = dynamic(
  () => import('@/components/records/CompanyDetailView').then(m => m.CompanyDetailView),
  { ssr: false, loading: () => <RecordLoading /> },
);
const AttendeeDetailView = dynamic(
  () => import('@/components/records/AttendeeDetailView').then(m => m.AttendeeDetailView),
  { ssr: false, loading: () => <RecordLoading /> },
);

function RecordLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export type RecordQuickViewType = 'attendee' | 'company' | 'conference';

const BASE_PATH: Record<RecordQuickViewType, string> = {
  attendee: '/attendees',
  company: '/companies',
  conference: '/conferences',
};

/**
 * Has this record type an inline view at all?
 *
 * A conference has not, so it is framed at every width. Width decides the
 * rest — see the note at the top.
 */
export function canRenderInline(type: RecordQuickViewType): boolean {
  return type === 'attendee' || type === 'company';
}

export function RecordQuickViewBody({ type, id, parentOf, onClose }: {
  type: RecordQuickViewType;
  id: number;
  /** Only meaningful for a company opened as another row's parent. */
  parentOf?: string | null;
  /**
   * Closes the drawer. The view calls it where a page would have navigated
   * away — after a delete, or when the record cannot be loaded — because
   * inline that navigation would take the HOST page with it.
   */
  onClose?: () => void;
}) {
  const isPhone = useIsPhone();

  /*
   * Above sm the iframe stays, and its own viewport is the point: it is what
   * keeps the record in one column inside a 480px drawer. useIsPhone starts
   * false and corrects after mount, so this begins as the frame and becomes
   * the inline view on a phone — the safe way round, since the frame is
   * correct at every width and the inline view only at one.
   */
  if (!isPhone || !canRenderInline(type)) {
    const query = type === 'company' && parentOf
      ? `?embed=true&parent_of=${encodeURIComponent(parentOf)}`
      : '?embed=true';
    return (
      <iframe
        src={`${BASE_PATH[type]}/${id}${query}`}
        className="flex-1 w-full border-0"
        title="Record"
      />
    );
  }

  return (
    /*
     * The wrapper the iframe's own page carried — see EmbedChecker in
     * AppShell, which wraps embedded content in exactly this padding and
     * background. `flex-1 min-h-0` rather than the page's `h-screen`, because
     * the box this fills is the drawer's, not the viewport's: an iframe's
     * viewport WAS the drawer, and inline it is not.
     */
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 lg:p-6 bg-gray-50">
      {type === 'company'
        ? <CompanyDetailView embedId={String(id)} embedParentOf={parentOf ?? null} onEmbeddedLeave={onClose} />
        : <AttendeeDetailView embedId={String(id)} embedded onEmbeddedLeave={onClose} />}
    </div>
  );
}
