/**
 * The relationship map's data: who is on it, and what connects them.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/relationship-graph.mjs
 *
 * The map answers "who is connected to this company" for a whole conference at
 * once. Every edge depends on relationships being read from both ends — a
 * vendor node showing none of its operators is exactly the shape the old
 * one-directional read produced.
 *
 * Classification and graph assembly are BEHAVIOUR and are run here. The
 * endpoint's shape is structure, read off the file, because an edge counted
 * twice draws a map that looks right and is wrong.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const { classifyCompany, buildGraph, pruneIsolated, VENDOR_TYPES, OPERATOR_TYPES } =
  await import('@/lib/relationshipGraph');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n— which side of the market a company is on —');
{
  // company_type is the field that exists for this, so it decides.
  for (const t of VENDOR_TYPES) eq(`${t} is a vendor`, classifyCompany(t, false), 'vendor');
  for (const t of OPERATOR_TYPES) eq(`${t} is an operator`, classifyCompany(t, false), 'operator');

  // The type beats the fallback, in both directions — a company typed Vendor
  // that has never been recorded as sold from is still a vendor, and a
  // Customer that somebody buys from is still a customer.
  eq('a typed vendor stays one with no relationships', classifyCompany('Vendor', false), 'vendor');
  eq('  and a typed customer stays one even when sold from',
    classifyCompany('Customer', true), 'operator');

  // The type is blank far more often than not: it is guessed from the name on
  // import and a badge scan leaves it empty.
  eq('an untyped company that is bought from is a vendor',
    classifyCompany(null, true), 'vendor');
  eq('  and one that is not is an operator', classifyCompany(null, false), 'operator');
  eq('  blank string counts as untyped', classifyCompany('', true), 'vendor');
  eq('  as does whitespace', classifyCompany('   ', true), 'vendor');
  eq('  and undefined', classifyCompany(undefined, false), 'operator');

  // An account's own company_type value is not in either list. Operator is the
  // safer default: the map is built around the operators a rep sells to.
  eq('an unrecognised type falls back to the relationship',
    classifyCompany('Reseller', true), 'vendor');
  eq('  and to operator without one', classifyCompany('Reseller', false), 'operator');
}

console.log('\n— the graph —');
{
  const co = (id, name, type = null, units = null) => ({ id, name, company_type: type, units });
  const edge = (id, from, to, statuses = ['Current Vendor'], implies = true) => ({
    id, from, to, relationship_status: statuses, strength: null, vendor_type: [],
    stale: false, implies_vendor: implies,
  });

  // Deliberately not in alphabetical order: given in order, the sort below
  // would be satisfied by doing nothing at all.
  const companies = [
    co(3, 'Yardi', 'Vendor'),
    co(2, 'Meridian Senior Care', 'Customer', 1240),
    co(1, 'Havenbrook Communities', 'Customer', 2100),
  ];
  const edges = [edge(10, 1, 3), edge(11, 2, 3)];
  const g = buildGraph(companies, edges, new Map([[1, 2], [2, 4]]));

  eq('every company is a node', g.nodes.length, 3);
  eq('  sorted by name, because the picker is a list not a ranking',
    g.nodes.map(n => n.name), ['Havenbrook Communities', 'Meridian Senior Care', 'Yardi']);
  eq('the shared vendor is a vendor', g.nodes.find(n => n.id === 3).kind, 'vendor');
  eq('  and the operators are operators',
    g.nodes.filter(n => n.id !== 3).map(n => n.kind), ['operator', 'operator']);

  // The count under a node in the mock-up. Both ends of an edge count it, or
  // a vendor would read as having no relationships at all.
  eq('the vendor counts both its operators', g.nodes.find(n => n.id === 3).relationshipCount, 2);
  eq('  and each operator counts its one', g.nodes.find(n => n.id === 1).relationshipCount, 1);
  eq('a company with no edges counts none',
    buildGraph([co(9, 'Alone')], [], new Map()).nodes[0].relationshipCount, 0);

  // "2,100 units · 2 attendees · 3 relationships", and "not at this show"
  // when nobody came.
  eq('attendees at this conference are carried', g.nodes.find(n => n.id === 2).attendeeCount, 4);
  eq('  and a company that sent nobody reads as zero',
    g.nodes.find(n => n.id === 3).attendeeCount, 0);
  eq('units come through', g.nodes.find(n => n.id === 1).units, 2100);
  eq('  and stay null when never recorded', g.nodes.find(n => n.id === 3).units, null);

  eq('edges are passed through untouched', g.edges, edges);

  // Caught against a real database, not reasoned about: two operators can be
  // Preferred Partners, and whichever logged it puts the other on the
  // related_company_id end without either one selling anything. Meridian —
  // 1,240 units, somebody at the show — was filed as a vendor because
  // Havenbrook had recorded it as a partner.
  const partnered = buildGraph(
    [co(1, 'Havenbrook', 'Customer', 2100), co(2, 'Meridian', null, 1240)],
    [edge(12, 1, 2, ['Preferred Partner'], false)],
    new Map([[2, 1]]),
  );
  eq('a partner is not made a vendor by being the far end',
    partnered.nodes.find(n => n.id === 2).kind, 'operator');
  // The same shape with a purchase status does make them one, or the fallback
  // would stop working at all.
  const bought = buildGraph(
    [co(1, 'Havenbrook', 'Customer', 2100), co(2, 'Meridian', null, 1240)],
    [edge(12, 1, 2, ['Current Vendor'], true)],
    new Map(),
  );
  eq('  but a purchase still does', bought.nodes.find(n => n.id === 2).kind, 'vendor');
}

console.log('\n— what is not worth drawing —');
{
  const co = (id, name) => ({ id, name, company_type: null, units: null });
  const edge = (id, from, to) => ({
    id, from, to, relationship_status: [], strength: null, vendor_type: [],
    stale: false, implies_vendor: true,
  });

  // The all-accounts scope would otherwise carry every company on the books,
  // most of them isolated dots.
  const g = buildGraph([co(1, 'A'), co(2, 'B'), co(3, 'Lonely')], [edge(10, 1, 2)], new Map());
  const pruned = pruneIsolated(g, new Set());
  eq('a company nothing connects to is dropped', pruned.nodes.map(n => n.id), [1, 2]);

  // Unless it is at the conference, where being here is the point.
  eq('  but not when it is at the conference',
    pruneIsolated(g, new Set([3])).nodes.map(n => n.id), [1, 2, 3]);
  eq('  and the edges are untouched either way', pruned.edges.length, 1);
}

console.log('\n— the endpoint —');
{
  const api = strip('app/api/conferences/[id]/relationship-map/route.ts');

  // vendorRelsQuery returns each row once per end it was asked for, so a
  // relationship between two conference companies arrives twice with the same
  // id. Drawing both would double every edge on the densest part of the map.
  eq('each stored relationship becomes one edge',
    /if \(edgeById\.has\(id\)\) continue;/.test(api), true);
  // And both halves have to agree on which end is the vendor, or the same
  // relationship points two ways depending on which company was read first.
  eq('  always recorded in the stored direction',
    /from: outbound \? subject : other,\s*\n\s*to: outbound \? other : subject,/.test(api), true);

  // The hop is the point: a vendor nobody sent to the show is still what
  // several operators here have in common.
  eq('companies reached through a relationship are nodes too',
    /for \(const e of edges\) \{ nodeIds\.add\(e\.from\); nodeIds\.add\(e\.to\); \}/.test(api), true);

  // One query for the attendee counts rather than one per company.
  eq('attendee counts are one grouped query',
    /GROUP BY a\.company_id/.test(api), true);

  // Both scopes, and a ceiling on the unbounded one.
  eq('the scope toggle is honoured',
    /scope=.*'all' \? 'all' : 'conference'|=== 'all' \? 'all' : 'conference'/.test(api), true);
  eq('  with the all-accounts scope bounded', /LIMIT \?/.test(api) && /MAX_COMPANIES/.test(api), true);
  // SQLite has a bound-parameter ceiling that the all scope plus its hop can
  // pass.
  eq('  and the company lookup chunked', /i \+= CHUNK/.test(api), true);

  // wse arrived after companies did.
  eq('a tenant without units still gets a map',
    /NULL AS wse/.test(api), true);

  // Whether an edge is a purchase comes from the inverse config, so the rule
  // lives in one place rather than as a second list of statuses here.
  eq('a purchase is told from a partnership by the inverse config',
    /implies_vendor: statuses\.some\(st => isInverted\(st, inverses\)\)/.test(api), true);

  // An empty conference is an empty map, not a query with an empty IN list.
  eq('a conference with nobody at it returns early',
    /if \(seedIds\.length === 0\)/.test(api), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
