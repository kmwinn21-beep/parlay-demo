/**
 * What this account calls a parent and a child.
 *
 * The two live in the Entity Structure config category, so an account that
 * calls them "Holding Co" and "Subsidiary" gets its own words wherever the
 * relationship is named.
 *
 * A company's place in a family is derived from the links rather than chosen —
 * it is the child one if it has a parent, the parent one if it has children —
 * so there is no stored value to look the label up by, and the two options are
 * resolved positionally: the first is what a parent is called here, the second
 * what a child is called. An exact match on the seeded names wins where they
 * are still in use, so reordering the list doesn't silently swap the two.
 */
export function resolveEntityDesignation(
  options: string[] | undefined, canonical: 'Parent' | 'Child',
): string {
  const list = options ?? [];
  const exact = list.find(o => o.trim().toLowerCase() === canonical.toLowerCase());
  if (exact) return exact;
  return list[canonical === 'Parent' ? 0 : 1] ?? canonical;
}
