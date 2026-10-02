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
export function clashingName(name: string, existing: string[]): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  return existing.find(n => n.trim().toLowerCase() === wanted) ?? null;
}
