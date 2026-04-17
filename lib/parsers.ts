import * as XLSX from 'xlsx';
import { ParsedAttendee } from './db';
import companyTypeLookup from './company-type-lookup.json';
import { type ColumnMapping, type SystemFieldKey, SYSTEM_FIELD_LABELS, FIELD_ORDER } from './columnMapping';

export { SYSTEM_FIELD_LABELS, FIELD_ORDER };
export type { ColumnMapping, SystemFieldKey };

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

/** Extract raw rows from an Excel or CSV buffer without mapping to ParsedAttendee. */
export function extractRawRows(buffer: Buffer, filename: string): Record<string, unknown>[] {
  const ext = filename.toLowerCase().split('.').pop();
  let workbook;
  if (ext === 'csv') {
    workbook = XLSX.read(buffer.toString('utf-8'), { type: 'string' });
  } else if (ext === 'xlsx' || ext === 'xls') {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } else {
    return [];
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
}

/** Return auto-suggested column mapping based on file headers. */
export function suggestMapping(headers: string[]): ColumnMapping {
  return {
    first_name:    findColumn(headers, 'first_name', 'firstname', 'first name', 'fname', 'given_name', 'given name'),
    last_name:     findColumn(headers, 'last_name', 'lastname', 'last name', 'lname', 'surname', 'family_name', 'family name'),
    full_name:     findColumn(headers, 'full_name', 'fullname', 'full name', 'name', 'attendee_name', 'attendee name', 'contact_name', 'contact name'),
    title:         findColumn(headers, 'title', 'job_title', 'job title', 'position', 'role', 'designation'),
    company:       findColumn(headers, 'company', 'company_name', 'company name', 'organization', 'org', 'employer', 'firm'),
    email:         findColumn(headers, 'email', 'email_address', 'email address', 'e_mail', 'e-mail'),
    website:       findColumn(headers, 'website', 'web', 'url', 'site', 'web_site', 'web site', 'homepage', 'home_page', 'company_website', 'company website'),
    company_type:  findColumn(headers, 'company_type', 'company type', 'registration_type', 'registration type', 'reg_type', 'reg type', 'attendee_type', 'attendee type', 'type'),
    assigned_user: findColumn(headers, 'assigned_user', 'assigned user', 'salesforce_owner', 'salesforce owner', 'sf_owner', 'sf owner', 'account_owner', 'account owner', 'owner', 'rep', 'sales_rep', 'sales rep', 'account_rep', 'account rep', 'sales_representative', 'sales representative', 'account_manager', 'account manager'),
    wse:           findColumn(headers, 'wse', 'wses', 'fte', 'ftes', 'employee_count', 'employee count', 'number_of_employees', 'number of employees', '# of employees', 'num_employees', 'num employees', 'employees', 'headcount', 'head_count', 'head count', 'staff_count', 'staff count', 'workforce', 'workforce_size', 'workforce size', 'worksite_employees', 'worksite employees', 'worksite_employee_count', 'worksite employee count', 'total_employees', 'total employees', 'employee_size', 'employee size', 'company_size', 'company size', 'ee_count', 'ee count', 'no_of_employees', 'no of employees', 'number_employees', 'number employees'),
    services:      findColumn(headers, 'services', 'care_settings', 'care settings', 'care_types', 'care types', 'services_provided', 'services provided', 'community_type', 'community type', 'service_type', 'service type', 'service_types', 'service types', 'care_type', 'care type', 'level_of_care', 'level of care', 'levels_of_care', 'levels of care', 'care_level', 'care level', 'care_levels', 'care levels', 'service_offering', 'service offering', 'service_offerings', 'service offerings', 'setting', 'settings', 'care_setting', 'care setting'),
    icp:           findColumn(headers, 'icp', 'ideal_customer_profile', 'ideal customer profile', 'is_icp', 'is icp'),
  };
}

/** Parse a file using an explicit column mapping. */
export async function parseFileWithMapping(
  buffer: Buffer,
  filename: string,
  mapping: ColumnMapping
): Promise<ParsedAttendee[]> {
  const rows = extractRawRows(buffer, filename);
  return parseRowsWithMapping(rows, mapping);
}

function parseRowsWithMapping(rows: Record<string, unknown>[], mapping: ColumnMapping): ParsedAttendee[] {
  if (rows.length === 0) return [];
  const attendees: ParsedAttendee[] = [];

  for (const row of rows) {
    let firstName = '';
    let lastName = '';

    if (mapping.first_name || mapping.last_name) {
      firstName = mapping.first_name ? String(row[mapping.first_name] || '').trim() : '';
      lastName  = mapping.last_name  ? String(row[mapping.last_name]  || '').trim() : '';
    } else if (mapping.full_name) {
      const full = String(row[mapping.full_name] || '').trim();
      if (full) {
        const parts = full.split(/\s+/);
        firstName = parts[0] || '';
        lastName  = parts.slice(1).join(' ') || '';
      }
    }

    if (!firstName && !lastName) continue;

    const attendee: ParsedAttendee = { first_name: firstName, last_name: lastName };

    if (mapping.title         && row[mapping.title])         attendee.title         = String(row[mapping.title]).trim();
    if (mapping.company       && row[mapping.company])       attendee.company        = String(row[mapping.company]).trim();
    if (mapping.email         && row[mapping.email])         attendee.email          = String(row[mapping.email]).trim();
    if (mapping.website       && row[mapping.website])       attendee.website        = String(row[mapping.website]).trim();
    if (mapping.company_type  && row[mapping.company_type])  attendee.company_type   = String(row[mapping.company_type]).trim();
    if (mapping.assigned_user && row[mapping.assigned_user]) attendee.assigned_user  = String(row[mapping.assigned_user]).trim();
    if (mapping.wse && row[mapping.wse]) {
      const rawWse = String(row[mapping.wse]).trim().replace(/[^0-9]/g, '');
      if (rawWse) attendee.wse = rawWse;
    }
    if (mapping.services && row[mapping.services]) {
      const raw = String(row[mapping.services]).trim();
      if (raw) attendee.services = parseServicesValue(raw);
    }
    if (mapping.icp && row[mapping.icp]) attendee.icp = String(row[mapping.icp]).trim();

    attendees.push(attendee);
  }

  return attendees;
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
  const wseCol = findColumn(headers, 'wse', 'wses', 'fte', 'ftes', 'employee_count', 'employee count', 'number_of_employees', 'number of employees', '# of employees', 'num_employees', 'num employees', 'employees', 'headcount', 'head_count', 'head count', 'staff_count', 'staff count', 'workforce', 'workforce_size', 'workforce size', 'worksite_employees', 'worksite employees', 'worksite_employee_count', 'worksite employee count', 'total_employees', 'total employees', 'employee_size', 'employee size', 'company_size', 'company size', 'ee_count', 'ee count', 'no_of_employees', 'no of employees', 'number_employees', 'number employees');
  const servicesCol = findColumn(headers, 'services', 'care_settings', 'care settings', 'care_types', 'care types', 'services_provided', 'services provided', 'community_type', 'community type', 'service_type', 'service type', 'service_types', 'service types', 'care_type', 'care type', 'level_of_care', 'level of care', 'levels_of_care', 'levels of care', 'care_level', 'care level', 'care_levels', 'care levels', 'service_offering', 'service offering', 'service_offerings', 'service offerings', 'setting', 'settings', 'care_setting', 'care setting');
  const icpCol = findColumn(headers, 'icp', 'ideal_customer_profile', 'ideal customer profile', 'is_icp', 'is icp');

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
    if (wseCol && row[wseCol]) {
      const rawWse = String(row[wseCol]).trim().replace(/[^0-9]/g, '');
      if (rawWse) {
        attendee.wse = rawWse;
      }
    }
    if (servicesCol && row[servicesCol]) {
      const rawServices = String(row[servicesCol]).trim();
      if (rawServices) {
        attendee.services = parseServicesValue(rawServices);
      }
    }
    if (icpCol && row[icpCol]) {
      const rawIcp = String(row[icpCol]).trim();
      if (rawIcp) {
        attendee.icp = rawIcp;
      }
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
 * Pass validOptions (from getConfigOptionValues('company_type')) to ensure the returned value
 * exists in the admin-configured list; if it doesn't, null is returned instead of a stale value.
 */
export function classifyCompanyType(companyName?: string, validOptions?: string[]): string | null {
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
  let classified: string | null = null;
  if (capitalScore > operatorScore && capitalScore > vendorScore) classified = 'Capital';
  else if (operatorScore > capitalScore && operatorScore > vendorScore) classified = 'Operator';
  else if (vendorScore > capitalScore && vendorScore > operatorScore) classified = 'Vendor';
  // Tie-breaking: prioritize Operator > Capital > Vendor
  else if (operatorScore === maxScore) classified = 'Operator';
  else if (capitalScore === maxScore) classified = 'Capital';
  else classified = 'Vendor';

  // Validate against live admin options if provided — prevents writing stale values
  if (validOptions && validOptions.length > 0 && classified && !validOptions.includes(classified)) {
    return null;
  }
  return classified;
}

/**
 * Parse a raw services string from a CSV/Excel cell into a comma-separated
 * string of canonical service codes (IL, AL, MC, SNF, CCRC, Other).
 *
 * Values may be separated by semicolons, commas, colons, dashes, slashes,
 * pipes, or other delimiters. Each token is matched against known variations.
 */
export function parseServicesValue(raw: string): string {
  // Split on common delimiters: ; , : / \ | and also whitespace-padded -
  const tokens = raw.split(/[;,:\\/|]+|\s+-\s+/).map((t) => t.trim().toLowerCase()).filter(Boolean);

  const matched = new Set<string>();

  for (const token of tokens) {
    // Exact abbreviation matches
    if (token === 'il') { matched.add('IL'); continue; }
    if (token === 'al') { matched.add('AL'); continue; }
    if (token === 'mc') { matched.add('MC'); continue; }
    if (token === 'snf') { matched.add('SNF'); continue; }
    if (token === 'ccrc') { matched.add('CCRC'); continue; }

    // Full-text / variation matches
    if (/\bindependent\s*living\b/.test(token)) { matched.add('IL'); continue; }
    if (/\bassisted\s*living\b/.test(token)) { matched.add('AL'); continue; }
    if (/\bmemory\s*care\b/.test(token)) { matched.add('MC'); continue; }
    if (/\bskilled\s*nursing\b/.test(token)) { matched.add('SNF'); continue; }
    if (/\bnursing\s*home\b/.test(token)) { matched.add('SNF'); continue; }
    if (/\bcontinuing\s*care\s*retirement\s*communit/.test(token)) { matched.add('CCRC'); continue; }
    if (/\blife\s*plan\s*communit/.test(token)) { matched.add('CCRC'); continue; }
  }

  if (matched.size === 0) return '';
  return Array.from(matched).join(',');
}

/**
 * Determine if a company meets the Ideal Customer Profile (ICP) criteria.
 * Requirements:
 *   - WSE between 250 and 6,000 (inclusive)
 *   - Company Type matches one of the operator-type values
 *   - Services include at least one of: AL, MC, SNF, CCRC
 *
 * @param icpOptions  Live ICP option values from admin panel (index 0 = "true" value, index 1 = "false" value).
 *                    Defaults to ['Yes', 'No'] when no options are configured.
 * @param operatorTypeValues  Set of company_type values that represent operators.
 *                            Defaults to a Set containing 'Operator'.
 */
export function classifyICP(
  wse: number | null | undefined,
  companyType: string | null | undefined,
  services: string | null | undefined,
  icpOptions: string[] = ['Yes', 'No'],
  operatorTypeValues: Set<string> = new Set(['Operator'])
): string {
  const trueValue = icpOptions[0] ?? 'Yes';
  const falseValue = icpOptions[1] ?? 'No';

  if (!wse || wse < 250 || wse > 6000) return falseValue;
  if (!companyType || !operatorTypeValues.has(companyType)) return falseValue;
  if (!services) return falseValue;

  const serviceList = services.split(',').map((s) => s.trim());
  const icpServices = ['AL', 'MC', 'SNF', 'CCRC'];
  const hasIcpService = serviceList.some((s) => icpServices.includes(s));
  return hasIcpService ? trueValue : falseValue;
}
