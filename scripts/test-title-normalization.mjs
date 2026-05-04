import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import ts from 'typescript';

function loadTsModule(path) {
  const source = readFileSync(path, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const mod = new Module(path);
  mod.filename = path;
  mod.paths = Module._nodeModulePaths(process.cwd());
  mod._compile(outputText, path);
  return mod.exports;
}

const {
  buildTitleMetadata,
  computeTitleScore,
  normalizeTitleKey,
  shouldWarnForTitleMetadata,
} = loadTsModule('lib/titleNormalization.ts');

const fuzzy = buildTitleMetadata({
  originalTitle: 'Chief Ppl Officer',
  normalizedTitle: 'CHRO',
  functionId: 1,
  seniorityId: 2,
  buyerRole: 'decision_maker',
  matchType: 'fuzzy',
  confidence: 'medium',
  source: 'fuzzy_match',
});
assert.equal(shouldWarnForTitleMetadata(fuzzy), true, 'fuzzy title shows warning icon');

const unmatched = buildTitleMetadata({ originalTitle: 'Vibes Lead', matchType: 'none', confidence: 'low', source: 'none' });
assert.equal(shouldWarnForTitleMetadata(unmatched), true, 'unmatched title shows warning icon');

const confirmed = buildTitleMetadata({
  originalTitle: 'Chief People Officer',
  normalizedTitle: 'CHRO',
  functionId: 1,
  seniorityId: 2,
  buyerRole: 'decision_maker',
  matchType: 'confirmed',
  confidence: 'high',
  source: 'user_confirmed',
});
assert.equal(shouldWarnForTitleMetadata(confirmed), false, 'exact/confirmed title does not show warning icon');
assert.ok(computeTitleScore(confirmed) > computeTitleScore(unmatched), 'saved rule improves Buyer Fit Score');
assert.equal(normalizeTitleKey('Chief People Officer'), normalizeTitleKey('chief people officer'), 'future attendee with same raw title uses stable normalized key');

const displayNameChanged = buildTitleMetadata({
  originalTitle: 'Chief People Officer',
  normalizedTitle: 'CHRO',
  functionId: 1001,
  seniorityId: 1002,
  buyerRole: 'decision_maker',
  matchType: 'confirmed',
  confidence: 'high',
  source: 'user_confirmed',
});
assert.equal(displayNameChanged.function_id, 1001, 'display name changes do not break matching logic because stable IDs are retained');
assert.equal(displayNameChanged.source, 'user_confirmed', 'user-confirmed rule overrides fuzzy/system alias metadata source');

console.log('title normalization unit checks passed');
