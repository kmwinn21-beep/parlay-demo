import type { Vertical, CompanyRole } from './company-pools';
import { companyPools } from './company-pools';

// ── Word banks for synthetic name generation ──────────────────────────────────

const GEO_PREFIXES = [
  'North', 'South', 'East', 'West', 'Central', 'Greater', 'Upper', 'Lower',
  'Metro', 'Regional', 'Valley', 'Mountain', 'Coastal', 'Lakeside', 'Riverside',
  'Heartland', 'Midland', 'Highland', 'Prairie', 'Summit', 'Tri-State', 'Bay Area',
  'Pacific', 'Atlantic', 'Gulf Coast', 'Great Plains', 'New England', 'Midwest',
  'Northwest', 'Southwest', 'Northeast', 'Southeast',
];

const HEALTHCARE_PROSPECT_SUFFIXES = [
  'Health System', 'Healthcare', 'Medical Center', 'Health Network', 'Health Alliance',
  'Medicine', 'Health', 'Hospital System', 'Health Group', 'Care System',
  'Medical Group', 'Health Sciences', 'Health Services', 'Regional Medical',
  'Community Health', 'University Health',
];

const HEALTHCARE_PARTNER_WORDS = [
  'Advisory', 'Consulting Group', 'Health Advisors', 'Healthcare Consulting',
  'Health Partners', 'Management Group', 'Strategy Group', 'Health Solutions',
  'Clinical Consulting', 'Healthcare Advisory', 'Health Management',
];

const HEALTHCARE_VENDOR_WORDS = [
  'Health IT', 'Healthcare Technologies', 'Clinical Systems', 'Health Informatics',
  'Care Technologies', 'Health Software', 'Medical Systems', 'Health Analytics',
  'Care Solutions', 'Clinical Technologies', 'Digital Health', 'Health Platform',
];

const SL_PROSPECT_SUFFIXES = [
  'Senior Living', 'Retirement', 'Senior Care', 'Memory Care', 'Senior Communities',
  'Retirement Living', 'Senior Housing', 'Care Communities', 'Senior Services',
  'Living Communities', 'Retirement Services', 'Senior Management',
];

const SL_PARTNER_WORDS = [
  'Senior Housing Advisors', 'Retirement Consulting', 'Senior Care Partners',
  'Housing Advisory', 'Senior Living Advisors', 'Care Management Group',
  'Senior Housing Group', 'Retirement Advisors', 'Senior Capital',
];

const SL_VENDOR_WORDS = [
  'Senior Care Technologies', 'Elder Care Systems', 'Care Technology',
  'Senior Living Software', 'Resident Care Systems', 'Care Analytics',
  'Senior Living Platform', 'Care Management Software', 'Elder Technologies',
];

const B2B_ADJECTIVES = [
  'Apex', 'Crest', 'Vantage', 'Summit', 'Pinnacle', 'Horizon', 'Keystone', 'Cascade',
  'Ridgeline', 'Ironwood', 'Clearwater', 'Stonehurst', 'Edgewood', 'Belmont', 'Bayshore',
  'Hillcrest', 'Westbrook', 'Riverstone', 'Greenfield', 'Fairfield', 'Broadstone',
  'Foxwood', 'Glenwood', 'Highgate', 'Maplecrest', 'Northgate', 'Oakwood', 'Pineridge',
  'Ridgewood', 'Sherwood', 'Timberline', 'Underhill', 'Ardmore', 'Blackstone', 'Cobalt',
  'Daxton', 'Elden', 'Falcon', 'Greystone', 'Harwick', 'Invent', 'Jasper', 'Knox',
  'Linden', 'Mercer', 'Novus', 'Orbit', 'Prestige', 'Quorum', 'Radiant', 'Sterling',
];

const B2B_NOUNS = [
  'Systems', 'Solutions', 'Group', 'Partners', 'Holdings', 'Ventures', 'Industries',
  'Associates', 'Dynamics', 'Advisors', 'Capital', 'Technologies', 'Analytics',
  'Consulting', 'Services', 'Enterprises', 'Resources', 'Networks', 'Platforms',
  'Intelligence', 'Global', 'Strategic', 'Digital', 'Data', 'Cloud',
];

const CITY_PREFIXES = [
  'Ashford', 'Barrington', 'Carlisle', 'Donovan', 'Elsworth', 'Fenwick', 'Grayson',
  'Hartford', 'Iverton', 'Jarvis', 'Kingston', 'Langley', 'Merritt', 'Norwood',
  'Overton', 'Paxton', 'Quincy', 'Ravensworth', 'Stanton', 'Thornton',
  'Ullman', 'Vickers', 'Weston', 'Xavier', 'York', 'Zenith', 'Alderton', 'Bexley',
  'Cheswick', 'Dalton', 'Elmore', 'Forbes', 'Granby', 'Hadley', 'Irwin', 'Jasper',
];

// ── Seeded deterministic pseudo-random to avoid collisions ───────────────────

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pickAt<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

// ── Generate a unique company name beyond the real pool ──────────────────────

export function generateSyntheticCompanyName(
  vertical: Vertical,
  role: CompanyRole,
  index: number,
  usedNames: Set<string>,
  keywords?: string[],
): string {
  // Each index gets its own seeded generator so output is deterministic
  const rand = seededRand(index * 2654435761 + role.length * 6364136223 + vertical.length);

  let attempts = 0;
  while (attempts < 500) {
    let name: string;
    const r2 = seededRand(index * 1234567 + attempts * 987654321);

    if (keywords && keywords.length > 0) {
      // Keyword-driven: merge both prefix pools to maximize unique combinations
      const keyword = pickAt(keywords, r2);
      const prefixPool = [...GEO_PREFIXES, ...CITY_PREFIXES];
      name = `${pickAt(prefixPool, r2)} ${keyword}`;
    } else if (vertical === 'healthcare') {
      if (role === 'prospects' || role === 'competitors') {
        name = `${pickAt(GEO_PREFIXES, r2)} ${pickAt(HEALTHCARE_PROSPECT_SUFFIXES, r2)}`;
      } else if (role === 'partners') {
        name = `${pickAt(CITY_PREFIXES, r2)} ${pickAt(HEALTHCARE_PARTNER_WORDS, r2)}`;
      } else {
        name = `${pickAt(CITY_PREFIXES, r2)} ${pickAt(HEALTHCARE_VENDOR_WORDS, r2)}`;
      }
    } else if (vertical === 'senior_living') {
      if (role === 'prospects' || role === 'competitors') {
        name = `${pickAt(GEO_PREFIXES, r2)} ${pickAt(SL_PROSPECT_SUFFIXES, r2)}`;
      } else if (role === 'partners') {
        name = `${pickAt(CITY_PREFIXES, r2)} ${pickAt(SL_PARTNER_WORDS, r2)}`;
      } else {
        name = `${pickAt(CITY_PREFIXES, r2)} ${pickAt(SL_VENDOR_WORDS, r2)}`;
      }
    } else {
      // generic_b2b
      const style = Math.floor(r2() * 3);
      if (style === 0) {
        name = `${pickAt(B2B_ADJECTIVES, r2)} ${pickAt(B2B_NOUNS, r2)}`;
      } else if (style === 1) {
        name = `${pickAt(CITY_PREFIXES, r2)} ${pickAt(B2B_NOUNS, r2)}`;
      } else {
        name = `${pickAt(B2B_ADJECTIVES, r2)} ${pickAt(CITY_PREFIXES, r2)} ${pickAt(B2B_NOUNS, r2)}`;
      }
    }

    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
    attempts++;
  }

  // Ultimate fallback: append index
  let fallback: string;
  if (keywords && keywords.length > 0) {
    fallback = `${keywords[index % keywords.length]} ${index + 1}`;
  } else {
    const roleLabel = role === 'prospects' || role === 'competitors' ? 'Group' : role === 'partners' ? 'Partners' : 'Technologies';
    const verticalLabel = vertical === 'generic_b2b' ? 'Axiom' : vertical === 'healthcare' ? 'Regional' : 'Heritage';
    fallback = `${verticalLabel} ${roleLabel} ${index}`;
  }
  usedNames.add(fallback);
  return fallback;
}

/** Build a list of N unique company names: real names first, then synthetic */
export function buildCompanyList(
  vertical: Vertical,
  role: CompanyRole,
  count: number,
  shuffleFn: <T>(arr: T[]) => T[],
  keywords?: string[],
): string[] {
  // Competitors share the prospects real name pool (same type of org)
  const poolRole = role === 'competitors' ? 'prospects' : role;
  const realPool = shuffleFn([...companyPools[vertical][poolRole]]);
  const usedNames = new Set(realPool);
  const result: string[] = realPool.slice(0, Math.min(count, realPool.length));

  let syntheticIdx = 0;
  while (result.length < count) {
    result.push(generateSyntheticCompanyName(vertical, role, syntheticIdx++, usedNames, keywords));
  }

  return result;
}
