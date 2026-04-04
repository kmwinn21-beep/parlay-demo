import * as XLSX from 'xlsx';
import { ParsedAttendee } from './db';

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

  const cSuiteTerms = ['ceo', 'cfo', 'coo', 'cto', 'cpo', 'cmo', 'chro', 'chief', 'president', 'founder', 'owner'];
  if (cSuiteTerms.some((term) => t.includes(term))) return 'C-Suite';

  const vpTerms = ['vice president', 'vp', 'evp', 'svp', 'avp'];
  if (vpTerms.some((term) => t.includes(term))) return 'VP Level';

  if (t.includes('director')) return 'Director';
  if (t.includes('manager')) return 'Manager';

  return 'Other';
}

/** Returns the stored seniority override if set, otherwise falls back to title-based classification */
export function effectiveSeniority(storedSeniority?: string, title?: string): string {
  return storedSeniority || classifySeniority(title);
}
