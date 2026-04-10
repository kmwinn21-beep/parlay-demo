export interface BreadcrumbItem {
  label: string;
  href: string;
}

export function parseBreadcrumbs(trail: string | null): BreadcrumbItem[] {
  if (!trail) return [];
  try {
    const parsed = JSON.parse(trail);
    if (Array.isArray(parsed)) return parsed as BreadcrumbItem[];
  } catch { /* ignore */ }
  return [];
}

export function withTrail(href: string, trail: BreadcrumbItem[]): string {
  if (trail.length === 0) return href;
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}trail=${encodeURIComponent(JSON.stringify(trail))}`;
}
