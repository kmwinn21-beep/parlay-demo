/**
 * Comparing two guest lists.
 *
 * The social events table keeps an optimistic copy of a guest list so the
 * drawer shows a save straight away rather than after a round trip. That copy
 * has to be dropped once the server's own list says the same thing — otherwise
 * a change somebody else made is masked by a local copy that nothing ever
 * clears.
 *
 * "The same thing" is set equality, not array equality: the route appends to a
 * comma-separated column, so the order the ids come back in is not the order
 * they were sent in, and duplicates are possible in a column that is just text.
 */

export function sameIdSet(a: readonly number[], b: readonly number[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  // Array.from rather than iterating the Set: this project's tsconfig target
  // predates downlevelIteration, so `for (const x of set)` does not compile.
  return Array.from(left).every(id => right.has(id));
}
