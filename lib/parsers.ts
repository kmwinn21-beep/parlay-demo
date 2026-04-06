import * as XLSX from 'xlsx';
import { ParsedAttendee } from './db';
import companyTypeLookup from './company-type-lookup.json';

export async function parseFile(
  buffer: Buffer,
  filename: string
): Promise<ParsedAttendee[]> {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcel(buffer);
  } else if (ext === 'csv') {
    return parseCsv(buffer);
  } else {
    throw new Error(`Unsupported file type: ${ext}. Please upload Excel (.xlsx, .xls) or CSV files.`);
  }
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function findColumn(headers: string[], ...aliases: string[]): string | null {
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    const found = headers.find((h) => normalizeHeader(h) === normalized);
    if (found) return found;
  }
  // Partial match
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    const found = headers.find((h) => normalizeHeader(h).includes(normalized));
    if (found) return found;
  }
  return null;
}

function parseRows(rows: Record<string, unknown>[]): ParsedAttendee[] {
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);

  // Try to find relevant columns
  const firstNameCol = findColumn(headers, 'first_name', 'firstname', 'first name', 'fname', 'given_name', 'given name');
  const lastNameCol = findColumn(headers, 'last_name', 'lastname', 'last name', 'lname', 'surname', 'family_name', 'family name');
  const fullNameCol = findColumn(headers, 'full_name', 'fullname', 'full name', 'name', 'attendee_name', 'attendee name', 'contact_name', 'contact name');
  const titleCol = findColumn(headers, 'title', 'job_title', 'job title', 'position', 'role', 'designation');
  const companyCol = findColumn(headers, 'company', 'company_name', 'company name', 'organization', 'org', 'employer', 'firm');
  const emailCol = findColumn(headers, 'email', 'email_address', 'email address', 'e_mail', 'e-mail');
  const websiteCol = findColumn(headers, 'website', 'web', 'url', 'site', 'web_site', 'web site', 'homepage', 'home_page', 'company_website', 'company website');
  const companyTypeCol = findColumn(headers, 'company_type', 'company type', 'registration_type', 'registration type', 'reg_type', 'reg type', 'attendee_type', 'attendee type', 'type');
  const assignedUserCol = findColumn(headers, 'assigned_user', 'assigned user', 'salesforce_owner', 'salesforce owner', 'sf_owner', 'sf owner', 'account_owner', 'account owner', 'owner', 'rep', 'sales_rep', 'sales rep', 'account_rep', 'account rep', 'sales_representative', 'sales representative', 'account_manager', 'account manager');

  const attendees: ParsedAttendee[] = [];

  for (const row of rows) {
    let firstName = '';
    let lastName = '';

    if (firstNameCol && lastNameCol) {
      firstName = String(row[firstNameCol] || '').trim();
      lastName = String(row[lastNameCol] || '').trim();
    } else if (fullNameCol) {
      const fullName = String(row[fullNameCol] || '').trim();
      if (fullName) {
        const parts = fullName.split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }
    } else {
      // Try the first string column as name
      for (const header of headers) {
        const val = String(row[header] || '').trim();
        if (val && val.includes(' ')) {
          const parts = val.split(/\s+/);
          firstName = parts[0];
          lastName = parts.slice(1).join(' ');
          break;
        }
      }
    }

    if (!firstName && !lastName) continue;

    const attendee: ParsedAttendee = {
      first_name: firstName,
      last_name: lastName,
    };

    if (titleCol && row[titleCol]) {
      attendee.title = String(row[titleCol]).trim();
    }
    if (companyCol && row[companyCol]) {
      attendee.company = String(row[companyCol]).trim();
    }
    if (emailCol && row[emailCol]) {
      attendee.email = String(row[emailCol]).trim();
    }
    if (websiteCol && row[websiteCol]) {
      attendee.website = String(row[websiteCol]).trim();
    }
    if (companyTypeCol && row[companyTypeCol]) {
      attendee.company_type = String(row[companyTypeCol]).trim();
    }
    if (assignedUserCol && row[assignedUserCol]) {
      attendee.assigned_user = String(row[assignedUserCol]).trim();
    }

    attendees.push(attendee);
  }

  return attendees;
}

function parseExcel(buffer: Buffer): ParsedAttendee[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  return parseRows(rows);
}

function parseCsv(buffer: Buffer): ParsedAttendee[] {
  const content = buffer.toString('utf-8');
  const workbook = XLSX.read(content, { type: 'string' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  return parseRows(rows);
}

export function classifySeniority(title?: string): string {
  if (!title) return 'Other';

  const t = title.toLowerCase();

  // --- C-Suite (highest priority) ---
  // Full phrases – checked first so "co-founder & chairman" → C-Suite
  if (/\b(chief|president|founder|co-founder|cofounder|co founder|owner|co-owner|principal|principle|prinicipal)\b/.test(t)) return 'C-Suite';
  // Common C-Suite acronyms (word-boundary to avoid false positives)
  if (/\b(ceo|cfo|coo|cto|cpo|cmo|chro|cdo|cgo|cio|clo|cno|cro|cso|creo)\b/.test(t)) return 'C-Suite';

  // --- BOD (Board of Directors) ---
  if (/\b(board|chairman|chairwoman|executive\s+chairman)\b/.test(t)) return 'BOD';
  // "Chair" only when clearly a board role (e.g. "Chair - Healthcare")
  if (/\bchair\b/.test(t) && !/\bchair(man|woman|person)\b/.test(t)) return 'BOD';

  // --- Executive Director (before general Director check) ---
  if (/\bexecutive\s+director\b/.test(t)) return 'ED';

  // --- VP / SVP ---
  if (/\b(vice\s+president|svp|evp|avp)\b/.test(t)) return 'VP/SVP';
  if (/\bvp\b/.test(t)) return 'VP/SVP';
  if (/\bcontroller\b/.test(t)) return 'VP/SVP';

  // --- Director ---
  if (/\bdirector\b/.test(t)) return 'Director';
  if (/\bdon\b/.test(t)) return 'Director';

  // --- Manager ---
  if (/\bmanager\b/.test(t)) return 'Manager';

  // --- Associate (standalone role, not "Associate Director" which is caught above) ---
  if (/\bassociate\b/.test(t)) return 'Associate';

  // --- Admin ---
  if (/\bassistant\s+administrator\b/.test(t)) return 'Admin';

  return 'Other';
}

/** Returns the stored seniority override if set, otherwise falls back to title-based classification */
export function effectiveSeniority(storedSeniority?: string, title?: string): string {
  return storedSeniority || classifySeniority(title);
}

/**
 * Auto-detect company type based on company name.
 * Uses a known-company lookup (from training data) first, then falls back to keyword heuristics.
 */
export function classifyCompanyType(companyName?: string): string | null {
  if (!companyName) return null;

  const name = companyName.trim();
  const key = name.toLowerCase();

  // --- Phase 1: Exact lookup from known companies ---
  const lookup = companyTypeLookup as Record<string, string>;
  if (lookup[key]) return lookup[key];

  // --- Phase 2: Normalized lookup (strip common suffixes like LLC, Inc, etc.) ---
  const normalized = key
    .replace(/[,.]*/g, '')
    .replace(/\b(inc|llc|llp|lp|ltd|corp|corporation|company|co|group|pllc)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [lookupKey, lookupType] of Object.entries(lookup)) {
    const lookupNorm = lookupKey
      .replace(/[,.]*/g, '')
      .replace(/\b(inc|llc|llp|lp|ltd|corp|corporation|company|co|group|pllc)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalized === lookupNorm && lookupNorm.length > 2) return lookupType;
  }

  // --- Phase 3: Keyword-based heuristics ---
  const n = ` ${key} `;

  // Capital indicators (banks, REITs, investment firms, lenders)
  const capitalPatterns = [
    /\bbank\b/, /\bbanking\b/, /\bcapital\b/, /\breit\b/, /\binvestment[s]?\b/,
    /\binvestor[s]?\b/, /\bfinancial\b/, /\bfunding\b/, /\blending\b/, /\blender[s]?\b/,
    /\bmortgage\b/, /\bcredit\s+union\b/, /\basset\s+management\b/, /\bprivate\s+equity\b/,
    /\bventure\b/, /\bequity\b/, /\bfund\b/, /\bfunds\b/, /\bwealth\b/,
    /\brealty\b/, /\breal\s+estate\s+(partners|capital|investment|advisors)\b/,
  ];

  // Operator indicators (senior living operators, care providers)
  const operatorPatterns = [
    /\bsenior\s+living\b/, /\bassisted\s+living\b/, /\bmemory\s+care\b/,
    /\bretirement\b/, /\bcommunities\b/, /\bresidences\b/,
    /\bcontinuing\s+care\b/, /\bccrc\b/, /\bnursing\b/,
    /\bhealthcare\s+(management|partners|group)\b/, /\bcare\s+(community|communities|home|center)\b/,
    /\bsenior\s+(community|communities|residence|residences|services|housing)\b/,
    /\b(aged|elder)\s+care\b/, /\blife\s*plan\b/,
    /\bliving\s+(community|communities|group|services)\b/,
  ];

  // Vendor indicators (technology, consulting, construction, associations, staffing)
  const vendorPatterns = [
    /\bsoftware\b/, /\btechnology\b/, /\btech\b/, /\bsolutions\b/,
    /\bconstruction\b/, /\barchitects?\b/, /\bdesign\b/,
    /\buniversity\b/, /\bcollege\b/, /\bschool\b/,
    /\bassociation\b/, /\bleadingage\b/, /\bargentum\b/,
    /\bstaffing\b/, /\brecruiting\b/, /\bhireology\b/,
    /\btherapies\b/, /\bpharmac/,
    /\binsurance\s+services\b/,
  ];

  const capitalScore = capitalPatterns.reduce((s, p) => s + (p.test(n) ? 1 : 0), 0);
  const operatorScore = operatorPatterns.reduce((s, p) => s + (p.test(n) ? 1 : 0), 0);
  const vendorScore = vendorPatterns.reduce((s, p) => s + (p.test(n) ? 1 : 0), 0);

  const maxScore = Math.max(capitalScore, operatorScore, vendorScore);
  if (maxScore === 0) return null;

  // If there's a clear winner, return it
  if (capitalScore > operatorScore && capitalScore > vendorScore) return 'Capital';
  if (operatorScore > capitalScore && operatorScore > vendorScore) return 'Operator';
  if (vendorScore > capitalScore && vendorScore > operatorScore) return 'Vendor';

  // Tie-breaking: prioritize Operator > Capital > Vendor
  if (operatorScore === maxScore) return 'Operator';
  if (capitalScore === maxScore) return 'Capital';
  return 'Vendor';
}
