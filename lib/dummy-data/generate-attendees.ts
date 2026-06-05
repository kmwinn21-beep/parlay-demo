import { companyPools, type Vertical, type CompanyRole } from './company-pools';
import { buildCompanyList } from './company-name-generator';
import { generateUniqueName } from './name-pools';
import { functions, pickTitle, type Seniority } from './title-pools';
import type { Client } from '@libsql/client';

export interface CustomColumnDef {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'email' | 'phone' | 'url' | 'picklist';
  options?: string[];
  smartGenerate: boolean;
}

export interface GeneratorParams {
  conferenceName: string;
  vertical: Vertical;
  prospects: { companyCount: number; attendeesPerCompany: 2 | 3 | 4 };
  partners: { companyCount: number; attendeesPerCompany: number };
  vendors: { companyCount: number; attendeesPerCompany: number };
  competitors?: { companyCount: number; attendeesPerCompany: number };
  keywords?: string[];
  reps: string[];
  customColumns: CustomColumnDef[];
  overlap?: {
    enabled: boolean;
    sourceConferenceIds: number[];
    prospectOverlapPct: number;
    partnerOverlapPct: number;
    vendorOverlapPct: number;
  };
}

export interface GeneratorResult {
  rows: Record<string, unknown>[];
  stats: {
    totalRows: number;
    prospectRows: number;
    partnerRows: number;
    vendorRows: number;
    competitorRows: number;
    returningAttendees: number;
    newAttendees: number;
  };
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Distribute total items across count buckets with natural variation */
function distributeWeighted(total: number, count: number): number[] {
  if (count === 0 || total === 0) return [];
  const weights = Array.from({ length: count }, () => Math.random() + 0.3);
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const floored = weights.map(w => Math.floor((w / weightSum) * total));
  let remainder = total - floored.reduce((s, v) => s + v, 0);
  const indices = shuffle(Array.from({ length: count }, (_, i) => i));
  for (let i = 0; i < remainder; i++) floored[indices[i % count]]++;
  return floored;
}

function domainFromCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 30)
    + '.com';
}

function generateEmail(firstName: string, lastName: string, domain: string, usedEmails: Set<string>): string {
  const base = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`.replace(/[^a-z.]/g, '');
  let email = `${base}@${domain}`;
  let suffix = 1;
  while (usedEmails.has(email)) {
    email = `${base}${suffix}@${domain}`;
    suffix++;
  }
  usedEmails.add(email);
  return email;
}

function generatePhone(): string {
  const area = randInt(200, 999);
  const prefix = randInt(200, 999);
  const line = randInt(1000, 9999);
  return `(${area}) ${prefix}-${line}`;
}

function randomDateNextYear(): string {
  const now = new Date();
  const future = new Date(now.getTime() + Math.random() * 365 * 24 * 60 * 60 * 1000);
  return future.toISOString().slice(0, 10);
}

const EHR_SYSTEMS = ['Epic', 'Oracle Cerner', 'Meditech', 'Allscripts', 'athenahealth', 'eClinicalWorks'];
const CRM_SYSTEMS = ['Salesforce', 'HubSpot', 'Microsoft Dynamics', 'Zoho CRM', 'Pipedrive'];
const ERPS = ['SAP', 'Oracle ERP', 'Microsoft Dynamics 365', 'NetSuite', 'Workday'];

function generateCustomValue(col: CustomColumnDef, companyName: string, companyDomain: string): unknown {
  const nameLower = col.name.toLowerCase();
  if (col.smartGenerate) {
    if (nameLower.includes('npi')) return String(1000000000 + randInt(0, 999999999));
    if (nameLower.includes('annual revenue') || nameLower.includes('revenue')) {
      return `$${(randInt(10, 500) * 1_000_000).toLocaleString()}`;
    }
    if (nameLower.includes('ehr')) return pick(EHR_SYSTEMS);
    if (nameLower.includes('crm')) return pick(CRM_SYSTEMS);
    if (nameLower.includes('erp')) return pick(ERPS);
    if (nameLower.includes('bed') || nameLower.includes('unit')) return randInt(50, 800);
    if (nameLower.includes('employee') || nameLower.includes('staff') || nameLower.includes('fte')) {
      return randInt(100, 10000);
    }
    if (nameLower.includes('budget')) return `$${(randInt(1, 50) * 100_000).toLocaleString()}`;
    if (nameLower.includes('website') || nameLower.includes('url')) return `https://www.${companyDomain}`;
  }

  switch (col.type) {
    case 'text': return '';
    case 'number': return randInt(1, 1000);
    case 'date': return randomDateNextYear();
    case 'boolean': return Math.random() > 0.5 ? 'Yes' : 'No';
    case 'email': return `info@${companyDomain}`;
    case 'phone': return generatePhone();
    case 'url': return `https://www.${companyDomain}`;
    case 'picklist': {
      if (!col.options || col.options.length === 0) return '';
      // Weight slightly toward first option
      const r = Math.random();
      if (r < 0.4) return col.options[0];
      return pick(col.options);
    }
    default: return '';
  }
}

function makeRow(
  firstName: string,
  lastName: string,
  title: string,
  email: string,
  companyName: string,
  companyDomain: string,
  fn: string,
  seniority: Seniority,
  assignedRep: string,
  companyType: string,
  conferenceName: string,
  units: number | string,
  customColumns: CustomColumnDef[],
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    'Full Name': `${firstName} ${lastName}`,
    'Job Title': title,
    'Email Address': email,
    'Company Name': companyName,
    'Website': `https://www.${companyDomain}`,
    'Function': fn,
    'Assigned Rep': assignedRep,
    'Services': '',
    'Conference': conferenceName,
    'Company Type': companyType,
    'Units': units,
  };
  for (const col of customColumns) {
    row[col.name] = generateCustomValue(col, companyName, companyDomain);
  }
  return row;
}

/** Pull returning attendees from prior conferences in the tenant DB */
async function fetchReturningAttendees(
  db: Client,
  conferenceIds: number[],
  companyType: string,
): Promise<Record<string, unknown>[]> {
  if (conferenceIds.length === 0) return [];
  const placeholders = conferenceIds.map(() => '?').join(',');
  const typeCondition = companyType ? `AND co.company_type = ?` : '';
  const args: (string | number)[] = [...conferenceIds];
  if (companyType) args.push(companyType);

  const res = await db.execute({
    sql: `SELECT DISTINCT
            a.first_name, a.last_name, a.title, a.email,
            co.name AS company_name, co.website, co.company_type,
            a."function", a.assigned_rep
          FROM attendees a
          JOIN conference_attendees ca ON ca.attendee_id = a.id
          LEFT JOIN companies co ON co.id = a.company_id
          WHERE ca.conference_id IN (${placeholders}) ${typeCondition}`,
    args,
  }).catch(() => ({ rows: [] }));

  return res.rows.map(r => ({
    _isReturning: true,
    first_name: String(r.first_name ?? ''),
    last_name: String(r.last_name ?? ''),
    full_name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
    title: r.title ? String(r.title) : '',
    email: r.email ? String(r.email) : '',
    company_name: r.company_name ? String(r.company_name) : '',
    website: r.website ? String(r.website) : '',
    company_type: r.company_type ? String(r.company_type) : companyType,
    function: r.function ? String(r.function) : '',
    assigned_rep: r.assigned_rep ? String(r.assigned_rep) : '',
  }));
}

function returningToRow(
  r: Record<string, unknown>,
  conferenceName: string,
  customColumns: CustomColumnDef[],
): Record<string, unknown> {
  const companyDomain = domainFromCompany(String(r.company_name || ''));
  const row: Record<string, unknown> = {
    'Full Name': r.full_name,
    'Job Title': r.title,
    'Email Address': r.email,
    'Company Name': r.company_name,
    'Website': r.website || `https://www.${companyDomain}`,
    'Function': r.function,
    'Assigned Rep': r.assigned_rep,
    'Services': '',
    'Conference': conferenceName,
    'Company Type': r.company_type,
    'Units': '',
  };
  for (const col of customColumns) {
    row[col.name] = generateCustomValue(col, String(r.company_name ?? ''), companyDomain);
  }
  return row;
}

export async function generateDummyData(
  params: GeneratorParams,
  db?: Client,
): Promise<GeneratorResult> {
  const {
    conferenceName, vertical, prospects, partners, vendors, competitors,
    keywords, reps, customColumns, overlap,
  } = params;

  const usedEmails = new Set<string>();
  const usedNames = new Set<string>();
  const allRows: Record<string, unknown>[] = [];
  let returningCount = 0;

  const repList = reps.length > 0 ? reps : ['Unassigned'];

  // ── Overlap: fetch returning attendees ─────────────────────────────────────
  let returningProspects: Record<string, unknown>[] = [];
  let returningPartners: Record<string, unknown>[] = [];
  let returningVendors: Record<string, unknown>[] = [];

  if (overlap?.enabled && db && overlap.sourceConferenceIds.length > 0) {
    const [rp, rpa, rv] = await Promise.all([
      fetchReturningAttendees(db, overlap.sourceConferenceIds, 'Prospect'),
      fetchReturningAttendees(db, overlap.sourceConferenceIds, 'Partner'),
      fetchReturningAttendees(db, overlap.sourceConferenceIds, 'Vendor'),
    ]);

    const samplePct = (arr: Record<string, unknown>[], pct: number) => {
      const n = Math.min(Math.round(arr.length * (pct / 100)), arr.length);
      return shuffle(arr).slice(0, n);
    };

    returningProspects = samplePct(rp, overlap.prospectOverlapPct);
    returningPartners = samplePct(rpa, overlap.partnerOverlapPct);
    returningVendors = samplePct(rv, overlap.vendorOverlapPct);
    returningCount = returningProspects.length + returningPartners.length + returningVendors.length;

    // Mark emails as used
    for (const r of [...returningProspects, ...returningPartners, ...returningVendors]) {
      if (r.email) usedEmails.add(String(r.email));
      if (r.full_name) usedNames.add(String(r.full_name));
    }
  }

  // ── Helper: generate one company's attendees ───────────────────────────────
  function generateCompanyAttendees(
    companyName: string,
    companyType: 'Prospect' | 'Partner' | 'Vendor' | 'Competitor',
    attendeesPerCompany: number,
    repName: string,
    fnOverride?: string,
  ) {
    const domain = domainFromCompany(companyName);
    const units = companyType === 'Prospect' ? randInt(100, 5000) : '';
    const primaryFn = fnOverride ?? pick(functions as unknown as string[]);
    const secondaryFn = pick(functions.filter(f => f !== primaryFn) as unknown as string[]);

    const seniorities: Seniority[] =
      companyType === 'Prospect'
        ? (attendeesPerCompany === 2
          ? ['csuite', 'vp']
          : attendeesPerCompany === 3
          ? ['csuite', 'vp', 'director']
          : ['csuite', 'vp', 'director', 'manager'])
        : shuffle(['vp', 'director', 'manager', 'director'] as Seniority[]).slice(0, attendeesPerCompany);


    const fnAssignments =
      companyType === 'Prospect'
        ? seniorities.map((s, i) => {
            if (i === 0) return primaryFn;
            if (i === 1) return primaryFn;
            if (i === 2) return secondaryFn;
            return pick(functions as unknown as string[]);
          })
        : seniorities.map(() => pick(functions as unknown as string[]));

    for (let i = 0; i < seniorities.length; i++) {
      const seniority = seniorities[i];
      const fn = fnAssignments[i];
      const title = pickTitle(seniority, fn);
      const { firstName, lastName } = generateUniqueName(usedNames);
      const email = generateEmail(firstName, lastName, domain, usedEmails);
      allRows.push(makeRow(
        firstName, lastName, title, email, companyName, domain,
        fn, seniority, repName, companyType, conferenceName, units, customColumns,
      ));
    }
  }

  // ── Prospects ───────────────────────────────────────────────────────────────
  const returningProspectCount = returningProspects.length;
  const newProspectCompanies = Math.ceil(prospects.companyCount * (1 - (overlap?.prospectOverlapPct ?? 0) / 100));
  const prospectCompanies = buildCompanyList(vertical, 'prospects', newProspectCompanies, shuffle, keywords);
  const prospectRepDist = distributeWeighted(prospectCompanies.length, repList.length);

  let repIdx = 0;
  let companyIdx = 0;
  for (const companyName of prospectCompanies) {
    while (repIdx < prospectRepDist.length - 1 && companyIdx >= prospectRepDist.slice(0, repIdx + 1).reduce((s, v) => s + v, 0)) {
      repIdx++;
    }
    generateCompanyAttendees(companyName, 'Prospect', prospects.attendeesPerCompany, repList[repIdx % repList.length]);
    companyIdx++;
  }

  // Add returning prospects
  for (const r of returningProspects) {
    allRows.push(returningToRow(r, conferenceName, customColumns));
  }

  const prospectRows = allRows.length;

  // ── Partners ────────────────────────────────────────────────────────────────
  const newPartnerCompanies = Math.ceil(partners.companyCount * (1 - (overlap?.partnerOverlapPct ?? 0) / 100));
  const partnerCompanies = buildCompanyList(vertical, 'partners', newPartnerCompanies, shuffle, keywords);
  const partnerRepDist = distributeWeighted(partnerCompanies.length, repList.length);

  repIdx = 0; companyIdx = 0;
  for (const companyName of partnerCompanies) {
    while (repIdx < partnerRepDist.length - 1 && companyIdx >= partnerRepDist.slice(0, repIdx + 1).reduce((s, v) => s + v, 0)) {
      repIdx++;
    }
    generateCompanyAttendees(companyName, 'Partner', partners.attendeesPerCompany, repList[repIdx % repList.length]);
    companyIdx++;
  }

  for (const r of returningPartners) {
    allRows.push(returningToRow(r, conferenceName, customColumns));
  }

  const partnerRows = allRows.length - prospectRows;

  // ── Vendors ─────────────────────────────────────────────────────────────────
  const newVendorCompanies = Math.ceil(vendors.companyCount * (1 - (overlap?.vendorOverlapPct ?? 0) / 100));
  const vendorCompanies = buildCompanyList(vertical, 'vendors', newVendorCompanies, shuffle, keywords);
  const vendorRepDist = distributeWeighted(vendorCompanies.length, repList.length);

  repIdx = 0; companyIdx = 0;
  for (const companyName of vendorCompanies) {
    while (repIdx < vendorRepDist.length - 1 && companyIdx >= vendorRepDist.slice(0, repIdx + 1).reduce((s, v) => s + v, 0)) {
      repIdx++;
    }
    generateCompanyAttendees(companyName, 'Vendor', vendors.attendeesPerCompany, repList[repIdx % repList.length]);
    companyIdx++;
  }

  for (const r of returningVendors) {
    allRows.push(returningToRow(r, conferenceName, customColumns));
  }

  const vendorRows = allRows.length - prospectRows - partnerRows;

  // ── Competitors ──────────────────────────────────────────────────────────────
  if (competitors && competitors.companyCount > 0) {
    const competitorCompanies = buildCompanyList(vertical, 'competitors', competitors.companyCount, shuffle, keywords);
    const competitorRepDist = distributeWeighted(competitorCompanies.length, repList.length);

    repIdx = 0; companyIdx = 0;
    for (const companyName of competitorCompanies) {
      while (repIdx < competitorRepDist.length - 1 && companyIdx >= competitorRepDist.slice(0, repIdx + 1).reduce((s, v) => s + v, 0)) {
        repIdx++;
      }
      generateCompanyAttendees(companyName, 'Competitor', competitors.attendeesPerCompany, repList[repIdx % repList.length]);
      companyIdx++;
    }
  }

  const competitorRows = allRows.length - prospectRows - partnerRows - vendorRows;

  return {
    rows: allRows,
    stats: {
      totalRows: allRows.length,
      prospectRows,
      partnerRows,
      vendorRows,
      competitorRows,
      returningAttendees: returningCount,
      newAttendees: allRows.length - returningCount,
    },
  };
}
