/**
 * The company header's website button, and what it does without a website.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/company-website-button.mjs
 *
 * A record added from a badge scan or a spreadsheet usually has a name and
 * nothing else, and the button simply vanished — which taught nobody anything
 * and left the obvious next step (search for them) to be done by hand. It is a
 * magnifying glass pointed at a search for the name now.
 *
 * The URL building is BEHAVIOUR and is run here. Where the button sits is
 * structure, read off the page, because the header renders it twice and the
 * two copies are the thing most likely to drift apart.
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

const { companySearchUrl, companyWebsiteUrl } = await import('@/lib/companySearchUrl');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n— searching for a company by name —');
{
  // The example given, verbatim.
  eq('Lifespace Communities searches for Lifespace Communities',
    companySearchUrl('Lifespace Communities'),
    'https://www.google.com/search?q=Lifespace+Communities');
  // A space is a `+`, not a %20 — the same page either way, but only one of
  // them is what a person sees when they copy a search out of the address bar.
  eq('  a space is a plus, not an escape',
    companySearchUrl('Mission Health').includes('%20'), false);
  eq('  and the rest is escaped properly',
    companySearchUrl('Smith & Jones'),
    'https://www.google.com/search?q=Smith+%26+Jones');
  eq('  including a slash', companySearchUrl('A/B Care').endsWith('q=A%2FB+Care'), true);

  // Nothing to search for is no button, not an empty results page.
  eq('an empty name searches for nothing', companySearchUrl(''), null);
  eq('  and neither does whitespace', companySearchUrl('   '), null);
  eq('  nor a missing one', companySearchUrl(undefined), null);
  eq('  and the name is trimmed', companySearchUrl('  Teton  '), 'https://www.google.com/search?q=Teton');
}

console.log('\n— a stored website that actually resolves —');
{
  // The column holds whatever was typed or imported. Without a scheme the
  // browser reads it as a path relative to the page it is on.
  eq('a bare domain gets a scheme', companyWebsiteUrl('lifespace.com'), 'https://lifespace.com');
  eq('  one that has a scheme keeps it', companyWebsiteUrl('http://lifespace.com'), 'http://lifespace.com');
  eq('  https too', companyWebsiteUrl('https://lifespace.com'), 'https://lifespace.com');
  eq('  whatever the case', companyWebsiteUrl('HTTPS://lifespace.com'), 'HTTPS://lifespace.com');
  // "httpsomething.com" starts with "http" but is not a scheme. startsWith
  // said it was; the anchored pattern does not.
  eq('  and a domain that merely begins with http is not a scheme',
    companyWebsiteUrl('httpsolutions.com'), 'https://httpsolutions.com');

  eq('no website is no url', companyWebsiteUrl(''), null);
  eq('  including null', companyWebsiteUrl(null), null);
  eq('  and whitespace', companyWebsiteUrl('   '), null);
}

console.log('\n— which of the two the button shows —');
{
  const btn = strip('components/CompanyWebsiteButton.tsx');
  eq('the website wins when there is one', /const site = companyWebsiteUrl\(website\);/.test(btn), true);
  eq('  and the search is only reached without one',
    /const search = site \? null : companySearchUrl\(name\);/.test(btn), true);
  eq('  with the website preferred', /const href = site \?\? search;/.test(btn), true);
  eq('neither is no button at all', /if \(!href\) return null;/.test(btn), true);

  // The icon and the colour both say which one this is: a recorded link, or a
  // guess at where the site might be.
  eq('the globe is the recorded link', /d="M12 21a9\.004 9\.004 0 008\.716-6\.747/.test(btn), true);
  eq('  and the magnifier the search', /d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/.test(btn), true);
  eq('  blue for the one somebody recorded',
    /site \? 'bg-blue-50 hover:bg-blue-100' : 'bg-gray-100 hover:bg-gray-200'/.test(btn), true);
  eq('  and the title says which it is',
    /title=\{site \? 'View website' : `Search the web for \$\{name\}`\}/.test(btn), true);

  eq('both sizes come from one component', /size \?: 'sm' \| 'md'|size = 'sm'/.test(btn), true);
  eq('  md is the wide header\'s 32px', /size === 'md' \? 'w-8 h-8' : 'w-7 h-7'/.test(btn), true);
  eq('  with the icon scaled to match', /size === 'md' \? 'w-5 h-5' : 'w-4 h-4'/.test(btn), true);
  eq('it opens away from the record', /target="_blank"/.test(btn) && /rel="noopener noreferrer"/.test(btn), true);
}

console.log('\n— the header renders it twice, and only through the component —');
{
  const page = strip('app/companies/[id]/page.tsx');
  eq('both headers use it',
    (page.match(/<CompanyWebsiteButton website=\{company\.website\} name=\{company\.name\}/g) ?? []).length, 2);
  eq('  the wide one at md', /<CompanyWebsiteButton website=\{company\.website\} name=\{company\.name\} size="md" \/>/.test(page), true);
  eq('  and the narrow one at the default', /<CompanyWebsiteButton website=\{company\.website\} name=\{company\.name\} \/>/.test(page), true);
  // The copies were near-identical before a branch was added to each. Neither
  // should still be building its own link.
  eq('no hand-built website link is left in the page',
    /title="View website"/.test(page), false);
  eq('  nor a copy of the scheme fix-up on the website field',
    /company\.website\.startsWith\('http'\)/.test(page), false);
  // The button no longer hides itself, so the guard around it has to be gone
  // too or a company with no website still shows nothing.
  eq('and it is no longer behind a website check',
    /\{company\.website && \(\s*<CompanyWebsiteButton/.test(page), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
