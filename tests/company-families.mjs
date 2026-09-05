/**
 * Rules for gathering a conference's companies into families.
 *
 *   node --experimental-strip-types tests/company-families.mjs
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import {
  buildCompanyFamilies,
  compareCompanies,
  entriesToCompanies,
  applyGroupingToHierarchyFilter,
} from '../lib/companyFamilies.ts';
import { resolveEntityDesignation } from '../lib/entityStructureLabels.ts';

const parseRepIds = v => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean).map(Number);
const C = (id, name, o = {}) => ({ id, name, attendee_count: 1, conference_count: 1, ...o });
const build = (list, sortKey = 'name', sortDir = 'asc') =>
  buildCompanyFamilies(list, { sortKey, sortDir, parseRepIds });

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

console.log('\n— family formation —');
{
  const r = build([C(2, 'MorningStar'), C(1, 'Charter', { parent_company_id: 2, parent_company_name: 'MorningStar' })]);
  eq('parent + one child = 1 family', [r.familyCount, r.entries.length], [1, 1]);
  eq('  parent is the parent, not a member', [r.entries[0].parent.id, r.entries[0].members.map(m => m.id)], [2, [1]]);
  eq('  all = parent first', r.entries[0].all.map(c => c.id), [2, 1]);
}
{
  const r = build([
    C(1, 'Charter', { parent_company_id: 9, parent_company_name: 'Absent Co' }),
    C(3, 'Twenty20', { parent_company_id: 9, parent_company_name: 'Absent Co' }),
  ]);
  eq('two siblings, absent parent = 1 family', r.familyCount, 1);
  eq('  parent null, name taken from the children', [r.entries[0].parent, r.entries[0].parentName], [null, 'Absent Co']);
  eq('  both are members', r.entries[0].members.map(c => c.id), [1, 3]);
}
{
  const r = build([C(1, 'Charter', { parent_company_id: 9, parent_company_name: 'Absent Co' }), C(4, 'Belmont')]);
  eq('lone orphan child stays loose', [r.familyCount, r.entries.map(e => e.kind)], [0, ['loose', 'loose']]);
}
{
  const r = build([C(2, 'MorningStar'), C(4, 'Belmont')]);
  eq('childless parent stays loose', [r.familyCount, r.entries.length], [0, 2]);
}

console.log('\n— depth flattening —');
{
  const r = build([
    C(10, 'Top'),
    C(11, 'Mid', { parent_company_id: 10, parent_company_name: 'Top' }),
    C(12, 'Leaf', { parent_company_id: 11, parent_company_name: 'Mid' }),
  ]);
  eq('3-level chain flattens to topmost', [r.familyCount, r.entries[0].key, r.entries[0].all.map(c => c.id)], [1, 10, [10, 11, 12]]);
}
{
  const r = build([C(20, 'A', { parent_company_id: 21 }), C(21, 'B', { parent_company_id: 20 })]);
  eq('a cycle terminates', r.entries.length >= 1, true);
}

console.log('\n— roll-ups —');
{
  const r = build([
    C(2, 'MorningStar', { wse: 100, relationship_count: 1, assigned_user: '5,6', attendee_count: 3 }),
    C(1, 'Charter', { parent_company_id: 2, wse: 50, relationship_count: 2, assigned_user: '6', attendee_count: 4 }),
    C(3, 'Twenty20', { parent_company_id: 2, wse: null, relationship_count: 0, assigned_user: '7', attendee_count: 5 }),
  ]);
  const f = r.entries[0];
  eq('attendees summed', f.rollup.attendees, 12);
  eq('units summed, nulls skipped', f.rollup.units, 150);
  eq('relationships summed', f.rollup.relationships, 3);
  eq('reps distinct, first-seen order', f.rollup.repIds, [5, 6, 7]);
  eq('memberCount counts the parent too', f.rollup.memberCount, 3);
}
{
  const r = build([C(2, 'P', { wse: null }), C(1, 'C', { parent_company_id: 2, wse: null })]);
  eq('units null when every member is null', r.entries[0].rollup.units, null);
}
{
  // The attendee sum split by who they came from — one figure cannot say
  // whether anyone from the parent came at all.
  const r = build([
    C(2, 'Parent Co', { attendee_count: 4 }),
    C(1, 'Child A', { parent_company_id: 2, attendee_count: 3 }),
    C(3, 'Child B', { parent_company_id: 2, attendee_count: 2 }),
  ]);
  const f = r.entries[0].rollup;
  eq('parent attendees are the parent\'s own', f.parentAttendees, 4);
  eq('child attendees exclude the parent', f.childAttendees, 5);
  eq('  and the two still add up to the total', f.parentAttendees + f.childAttendees, f.attendees);
}
{
  // Parent not at the conference: nobody came from it, and saying so is the
  // point of splitting the figure.
  const r = build([
    C(1, 'Child A', { parent_company_id: 9, parent_company_name: 'Away', attendee_count: 3 }),
    C(3, 'Child B', { parent_company_id: 9, parent_company_name: 'Away', attendee_count: 2 }),
  ]);
  const f = r.entries[0].rollup;
  eq('absent parent contributes no attendees', [f.parentAttendees, f.childAttendees, f.attendees], [0, 5, 5]);
}

console.log('\n— ordering —');
{
  const r = build([
    C(4, 'AAA Belmont'),
    C(2, 'ZZZ MorningStar'),
    C(1, 'ZZZ Charter', { parent_company_id: 2, parent_company_name: 'ZZZ MorningStar' }),
  ]);
  eq('families lead, leftovers trail', r.entries.map(e => e.kind), ['family', 'loose']);
  eq('  even though the loose one sorts first by name', r.entries[1].company.name, 'AAA Belmont');
}
{
  const r = build([
    C(2, 'Small parent', { attendee_count: 1 }),
    C(1, 'Small child', { parent_company_id: 2, attendee_count: 1 }),
    C(5, 'Big parent', { attendee_count: 2 }),
    C(6, 'Big child', { parent_company_id: 5, attendee_count: 20 }),
  ], 'attendee_count', 'desc');
  eq('families sort by their roll-up, not the parent\'s own count', r.entries.map(e => e.rollup.attendees), [22, 2]);
}
{
  const rows = () => [
    C(2, 'Present parent', { company_type: 'Operator' }),
    C(1, 'Child A', { parent_company_id: 2 }),
    C(7, 'Orphan A', { parent_company_id: 99, parent_company_name: 'Gone' }),
    C(8, 'Orphan B', { parent_company_id: 99, parent_company_name: 'Gone' }),
  ];
  eq('parentless family sorts last (asc)', build(rows(), 'company_type', 'asc').entries.map(e => e.parentName), ['Present parent', 'Gone']);
  eq('parentless family sorts last (desc too)', build(rows(), 'company_type', 'desc').entries.map(e => e.parentName), ['Present parent', 'Gone']);
}
{
  const r = build([C(2, 'P'), C(30, 'zeta', { parent_company_id: 2 }), C(31, 'alpha', { parent_company_id: 2 })]);
  eq('member order preserved from input (the table\'s sort)', r.entries[0].members.map(c => c.name), ['zeta', 'alpha']);
}

console.log('\n— comparator parity with the sort this replaced —');
{
  const old = (a, b, sortKey, sortDir) => {
    let aVal, bVal;
    if (sortKey === 'status') { aVal = (a.status || '').toLowerCase(); bVal = (b.status || '').toLowerCase(); }
    else { aVal = a[sortKey] ?? ''; bVal = b[sortKey] ?? ''; if (typeof aVal === 'string') aVal = aVal.toLowerCase(); if (typeof bVal === 'string') bVal = bVal.toLowerCase(); }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  };
  const rows = [
    C(1, 'Beta', { company_type: 'Operator', status: 'x', attendee_count: 2, conference_count: 3 }),
    C(2, 'alpha', { company_type: undefined, status: '', attendee_count: 9, conference_count: 1 }),
    C(3, 'Gamma', { company_type: 'Customer', status: 'A,B', attendee_count: 0, conference_count: 3 }),
  ];
  let same = true;
  for (const k of ['name', 'company_type', 'status', 'attendee_count', 'conference_count'])
    for (const d of ['asc', 'desc'])
      for (const a of rows) for (const b of rows)
        if (Math.sign(old(a, b, k, d)) !== Math.sign(compareCompanies(a, b, k, d))) same = false;
  eq('matches on every pair x key x direction', same, true);
}

console.log('\n— pagination unit —');
{
  const list = [C(2, 'P'), C(1, 'C1', { parent_company_id: 2 }), C(3, 'C2', { parent_company_id: 2 }), C(4, 'Solo')];
  const r = build(list);
  eq('4 companies -> 2 top-level entries', r.entries.length, 2);
  eq('flattening a page restores every company', entriesToCompanies(r.entries).map(c => c.id).sort(), [1, 2, 3, 4]);
  eq('groupedCompanyCount', r.groupedCompanyCount, 3);
}

console.log('\n— what the account calls a parent and a child —');
{
  eq('seeded names resolve to themselves', [
    resolveEntityDesignation(['Parent', 'Child'], 'Parent'),
    resolveEntityDesignation(['Parent', 'Child'], 'Child'),
  ], ['Parent', 'Child']);
  eq('renamed options are used', [
    resolveEntityDesignation(['Holding Co', 'Subsidiary'], 'Parent'),
    resolveEntityDesignation(['Holding Co', 'Subsidiary'], 'Child'),
  ], ['Holding Co', 'Subsidiary']);
  eq('reordering does not swap the seeded names', [
    resolveEntityDesignation(['Child', 'Parent'], 'Parent'),
    resolveEntityDesignation(['Child', 'Parent'], 'Child'),
  ], ['Parent', 'Child']);
  eq('nothing configured falls back to the canonical words', [
    resolveEntityDesignation(undefined, 'Parent'),
    resolveEntityDesignation([], 'Child'),
  ], ['Parent', 'Child']);
}

console.log('\n— Parent/Child filter, stashed and handed back —');
{
  const off = { filterHierarchy: 'child', stashedHierarchy: null };
  const on = applyGroupingToHierarchyFilter(true, off);
  eq('grouping on clears the filter', on.filterHierarchy, '');
  eq('  and stashes what it was', on.stashedHierarchy, 'child');
  const back = applyGroupingToHierarchyFilter(false, on);
  eq('grouping off restores it', back.filterHierarchy, 'child');
  eq('  and empties the stash', back.stashedHierarchy, null);
}
{
  const on = applyGroupingToHierarchyFilter(true, { filterHierarchy: '', stashedHierarchy: null });
  eq('nothing set stashes nothing', [on.filterHierarchy, on.stashedHierarchy], ['', null]);
  const back = applyGroupingToHierarchyFilter(false, on);
  eq('  and comes back to nothing', [back.filterHierarchy, back.stashedHierarchy], ['', null]);
}
{
  // Switching on twice must not overwrite the stash with the blank the first
  // switch left behind.
  const once = applyGroupingToHierarchyFilter(true, { filterHierarchy: 'parent', stashedHierarchy: null });
  const twice = applyGroupingToHierarchyFilter(true, once);
  eq('switching on twice keeps the original stash', twice.stashedHierarchy, 'parent');
  eq('  so it still comes back', applyGroupingToHierarchyFilter(false, twice).filterHierarchy, 'parent');
}
{
  // The reader changed the filter while grouped (not reachable today, since the
  // control is hidden — but the transition must not lose their newer choice).
  const on = applyGroupingToHierarchyFilter(true, { filterHierarchy: 'child', stashedHierarchy: null });
  const back = applyGroupingToHierarchyFilter(false, { ...on, filterHierarchy: 'parent' });
  eq('the stash wins over a value set while grouped', back.filterHierarchy, 'child');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
