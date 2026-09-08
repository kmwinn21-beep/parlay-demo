/**
 * Filtering a guest pick-list down to somebody's accounts.
 *
 * ── The column ───────────────────────────────────────────────────────────────
 *
 * `companies.assigned_user` is TEXT holding a comma-separated list of
 * `config_options.id` where category = 'user' — the same rep vocabulary
 * meetings and touchpoints use. A company can be assigned to more than one rep.
 *
 * Rows written before ids were stored hold plain NAMES in the same column, in
 * the same comma-separated shape. `resolveRepNames` in lib/useUserOptions.ts
 * already degrades that way, and so does this: a numeric part is matched by id,
 * anything else by name. Matching only ids would quietly return an empty list
 * for an account whose assignment predates the change, which reads as "you have
 * no accounts" rather than as a lookup that did not understand the data.
 *
 * ── Never throws ─────────────────────────────────────────────────────────────
 *
 * A malformed value contributes nothing rather than failing the filter. The
 * cost of a bad row here is one company missing from a filtered list; the cost
 * of throwing is a modal that will not open.
 */

/** The parts of `companies.assigned_user` that this module needs. */
export interface AssignableCompany {
  id: number;
  assigned_user?: string | null;
}

/** A rep, as `config_options` stores them. */
export interface RepRef {
  id: number;
  value: string;
}

/** The parts of an attendee this module needs. */
export interface CompanyLinked {
  company_id?: number | null;
}

/**
 * The company ids assigned to any of `reps`.
 *
 * An empty rep list returns an empty set, NOT every company: a helper that
 * silently meant "everything" would make an unticked filter look applied.
 * That falls out of the matching below — with nothing wanted, nothing matches
 * — rather than from the early return, which is only a shortcut past the loop.
 * Callers still decide "no filter selected" means "do not filter" themselves,
 * because the two are different questions.
 */
export function companiesAssignedTo(
  companies: ReadonlyArray<AssignableCompany>,
  reps: ReadonlyArray<RepRef>,
): Set<number> {
  const out = new Set<number>();
  if (reps.length === 0) return out;

  const wantedIds = new Set<number>();
  const wantedNames = new Set<string>();
  for (const rep of reps) {
    if (Number.isFinite(rep.id) && rep.id > 0) wantedIds.add(rep.id);
    // A rep with no name contributes no name. Belt and braces — every stored
    // part compared below is non-empty already, so an empty entry here could
    // not match anything even if it were added.
    const name = String(rep.value ?? '').trim().toLowerCase();
    if (name) wantedNames.add(name);
  }

  for (const company of companies) {
    const stored = String(company.assigned_user ?? '');
    if (!stored.trim()) continue;
    for (const raw of stored.split(',')) {
      const part = raw.trim();
      if (!part) continue;
      const asId = Number(part);
      const hit = Number.isInteger(asId) && asId > 0
        ? wantedIds.has(asId)
        : wantedNames.has(part.toLowerCase());
      if (hit) { out.add(company.id); break; }
    }
  }
  return out;
}

/**
 * Keep only the attendees whose company is in `companyIds`.
 *
 * An attendee with no company is dropped: the filter asks "whose account is
 * this person at", and the honest answer for a person at no company is that
 * they are at nobody's.
 */
export function attendeesAtCompanies<T extends CompanyLinked>(
  attendees: ReadonlyArray<T>,
  companyIds: ReadonlySet<number>,
): T[] {
  return attendees.filter(a => a.company_id != null && companyIds.has(a.company_id));
}
