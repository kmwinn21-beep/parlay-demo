'use client';

/**
 * The company record, at its own URL.
 *
 * The view itself lives in components/records so the quick-view drawers can
 * render it INLINE instead of loading this page into an iframe — a page
 * component may not take extra props, which is why the body moved rather than
 * growing a couple of optional ones. This file is the route; the component is
 * the record.
 */
import { CompanyDetailView } from '@/components/records/CompanyDetailView';

export default function CompanyDetailPage() {
  return <CompanyDetailView />;
}
