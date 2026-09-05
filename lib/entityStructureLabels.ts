/**
 * What this account calls a parent and a child.
 *
 * The two live in the Entity Structure config category, so an account that
 * calls them "Holding Co" and "Subsidiary" gets its own words wherever the
 * relationship is named.
 *
 * A company's place in a family is derived from the links rather than chosen —
 * it is the child one if it has a parent, the parent one if it has children —
 * so there is no stored value to look the label up by. Position decides
 * instead: the first option is what a parent is called here, the second what a
 * child is called, and admin says so on the rows and lets them be dragged.
 *
 * Deliberately nothing clever about the names. Preferring an exact match on
 * "Parent"/"Child" would read well until someone renamed the first option to
 * "Child", at which point the two roles would silently swap behind a screen
 * that said they hadn't. One rule, stated where it is edited, is worth more
 * than a rule that is usually right.
 */
export function resolveEntityDesignation(
  options: string[] | undefined, canonical: 'Parent' | 'Child',
): string {
  const list = options ?? [];
  return list[canonical === 'Parent' ? 0 : 1] ?? canonical;
}
