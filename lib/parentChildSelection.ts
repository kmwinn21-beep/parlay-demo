/**
 * The two rules behind the Create Parent/Child Relationship modal.
 *
 * Here rather than inside the component because neither is visible in a
 * screenshot of the result: which of the selected companies become children
 * depends on where the parent came from, and whether a name is a duplicate
 * depends on everything else currently on screen. Both are decided once and
 * checked by running them.
 */

/**
 * The companies that become children, given the chosen parent.
 *
 * The parent is either one of the selected companies or one found by searching
 * — or one just added from the modal, which is the same case. A parent from
 * outside the selection makes children of ALL of them; a parent from inside
 * makes children of the rest.
 *
 * With one company selected and that company named as the parent this is
 * empty, which is the dead end the modal has to say out loud: the route
 * rejects an empty child list, so without the check the reader gets a server
 * error for a choice that was visibly empty.
 */
export function childrenOf<T extends { id: number }>(items: T[], parentId: number | null): T[] {
  if (parentId == null) return [];
  const parentIsSelected = items.some(i => i.id === parentId);
  return parentIsSelected ? items.filter(i => i.id !== parentId) : items;
}

/**
 * A company already on screen with this name, or null.
 *
 * Case and surrounding space are ignored, because "maple ridge living" and
 * "Maple Ridge Living" are the same typing mistake.
 *
 * Reported, never enforced. Two records genuinely sharing a name is why the
 * options in this modal carry a detail card at all, so refusing the second
 * would be the modal deciding something only the reader knows. An empty name
 * matches nothing rather than matching the first blank.
 */
/**
 * What the "Other (not in list)" form collects.
 *
 * The name is the only one that has to be filled in. The rest are here because
 * the reader adding a parent company usually knows them, and a record created
 * with nothing but a name is one somebody has to go back and finish.
 */
export interface NewCompanyFields {
  name: string;
  assigned_user: string;
  company_type: string;
  website: string;
  /** companies.wse, under whatever the account calls units. Kept as typed. */
  wse: string;
  services: string[];
}

export const EMPTY_NEW_COMPANY: NewCompanyFields = {
  name: '', assigned_user: '', company_type: '', website: '', wse: '', services: [],
};

/**
 * The POST body for a new company, with the fields nobody filled in left out.
 *
 * Omitted rather than sent empty, because POST /api/companies reads a missing
 * company_type as "work it out from the name" and an empty string the same
 * way — but `wse: ''` and `services: []` are not the same as absent to every
 * column they touch, and a record created here should be indistinguishable
 * from one typed on the companies page.
 *
 * Returns null when there is no name, which is the one thing required.
 */
export function newCompanyPayload(fields: NewCompanyFields): Record<string, unknown> | null {
  const name = fields.name.trim();
  if (!name) return null;

  const body: Record<string, unknown> = { name };
  const text = (value: string) => value.trim();
  if (text(fields.assigned_user)) body.assigned_user = text(fields.assigned_user);
  if (text(fields.company_type)) body.company_type = text(fields.company_type);
  if (text(fields.website)) body.website = text(fields.website);
  // A number, or nothing. "abc" in a number field is not a unit count, and
  // sending it would store null under a value the reader believes they typed.
  const wse = Number(text(fields.wse));
  if (text(fields.wse) && Number.isFinite(wse)) body.wse = wse;
  if (fields.services.length > 0) body.services = fields.services;
  return body;
}

export function clashingName(name: string, existing: string[]): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  return existing.find(n => n.trim().toLowerCase() === wanted) ?? null;
}
