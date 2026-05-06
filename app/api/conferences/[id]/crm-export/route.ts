import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (s === 'null' || s === 'undefined' || s === 'NaN') return '';
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function csvRow(fields: unknown[]): string { return fields.map(csvEscape).join(','); }
function csvFile(headers: string[], rows: unknown[][]): string {
  return [csvRow(headers), ...rows.map(csvRow)].join('\r\n') + '\r\n';
}

// ─── Field helpers ────────────────────────────────────────────────────────────

const EM_DASH = ' — ';

function rootDomain(url: unknown): string {
  const s = url == null ? '' : String(url).trim();
  if (!s) return '';
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    return u.hostname.replace(/^www\./, '');
  } catch { return s; }
}

function toISO(dateStr: unknown, timeStr?: unknown): string {
  const d = dateStr == null ? '' : String(dateStr).trim();
  const t = timeStr == null ? '' : String(timeStr).trim();
  if (!d) return '';
  if (t && /^\d{2}:\d{2}/.test(t)) return `${d}T${t.slice(0, 5)}:00Z`;
  return `${d}T00:00:00Z`;
}

function addMinutesToISO(isoStr: string, mins: number): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    d.setMinutes(d.getMinutes() + mins);
    return d.toISOString().replace('.000Z', 'Z');
  } catch { return ''; }
}

function addDaysToDate(isoOrDate: unknown, days: number): string {
  const s = isoOrDate == null ? '' : String(isoOrDate).trim();
  if (!s) return '';
  try {
    const d = new Date(s.includes('T') ? s : `${s}T00:00:00Z`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  } catch { return ''; }
}

function addDaysToISO(isoOrDate: unknown, days: number): string {
  const dateOnly = addDaysToDate(isoOrDate, days);
  return dateOnly ? `${dateOnly}T00:00:00Z` : '';
}

function meetingTitle(meetingType: unknown, conferenceName: string): string {
  const t = meetingType == null ? '' : String(meetingType).trim();
  return `${t || 'Meeting'}${EM_DASH}${conferenceName}`;
}

const HS_OUTCOME: Record<string, string> = {
  'Meeting Held': 'COMPLETED',
  'Meeting Scheduled': 'SCHEDULED',
  'Rescheduled': 'RESCHEDULED',
  'Cancelled': 'CANCELED',
  'Meeting No-Show': 'NO_SHOW',
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ─── Company type filter ──────────────────────────────────────────────────────

function buildFilterSet(companyTypeFilter: unknown): Set<string> | null {
  if (!Array.isArray(companyTypeFilter) || companyTypeFilter.length === 0) return null;
  return new Set((companyTypeFilter as unknown[]).map(t => String(t ?? '').trim().toLowerCase()).filter(Boolean));
}

function passesCompanyTypeFilter(
  filterSet: Set<string> | null,
  companyId: unknown,
  companyType: unknown
): boolean {
  if (!filterSet) return true;
  if (companyId == null) return false;
  const t = String(companyType ?? '').trim().toLowerCase();
  return filterSet.has(t);
}

// ─── README templates ─────────────────────────────────────────────────────────

function hubspotReadme(conferenceName: string, campaignName: string, timestamp: string): string {
  return `HUBSPOT IMPORT INSTRUCTIONS
Conference: ${conferenceName}
Campaign Name used: ${campaignName}
Generated: ${timestamp}

BEFORE YOU IMPORT
─────────────────
1. Create a Campaign in HubSpot named exactly: ${campaignName}
   (Marketing > Campaigns > Create campaign)
   If the name doesn't match exactly, campaign attribution will not work.
2. Ensure all team members listed as owners in the files exist as HubSpot users.
   The "Company owner" and assigned rep columns must match HubSpot user email addresses.

IMPORT ORDER — follow this sequence exactly
────────────────────────────────────────────
Step 1: Import 1_companies.csv
  → Go to Contacts > Companies > Import
  → Select "Companies" as the object type
  → Deduplication key: Company Domain Name

Step 2: Import 2_contacts.csv
  → Go to Contacts > Contacts > Import
  → Select "Contacts and Companies" to associate in one pass
  → Deduplication key: Email
  → After import: bulk-enroll imported contacts into the "${campaignName}" campaign

Step 3: Import 3_meetings.csv
  → Go to Contacts > Contacts > Import
  → Select "Contacts and Meetings" as the object type
  → Deduplication key: Email (associates meeting to existing contact)

Step 4: Import 4_tasks.csv
  → Go to Contacts > Contacts > Import
  → Select "Contacts and Tasks"
  → Deduplication key: Email

Step 5: Import 5_notes.csv
  → Go to Contacts > Contacts > Import
  → Select "Contacts and Notes"
  → Deduplication key: Email

NOTES
─────
- Lead Source is hardcoded as "Conference" (the channel). Campaign Name is "${campaignName}" (the specific event).
- Do not put the conference name in Lead Source — use Campaign Name for event-level attribution.
- Blank cells are safe — HubSpot ignores them and will not overwrite existing data.
- If a contact already exists (matched by Email), HubSpot will update the record rather than create a duplicate.
`;
}

function salesforceReadme(conferenceName: string, campaignName: string, timestamp: string): string {
  return `SALESFORCE IMPORT INSTRUCTIONS
Conference: ${conferenceName}
Campaign Name used: ${campaignName}
Generated: ${timestamp}

BEFORE YOU IMPORT
─────────────────
1. Create a Campaign in Salesforce named exactly: ${campaignName}
   (Campaigns tab > New)
   The Data Import Wizard matches on this exact name to create CampaignMember records.
   If the name doesn't match, campaign attribution will silently fail.
2. Ensure all team members listed as owners exist as Salesforce users.
   The "Account Owner" and "Assigned To" columns must match Salesforce usernames or Full Names.

IMPORT ORDER — follow this sequence exactly
────────────────────────────────────────────
Step 1: Import 1_accounts.csv
  → Setup > Data Import Wizard > Standard Objects > Accounts
  → Action: "Add new and update existing records"
  → Matching: Account Name

Step 2: Import 2_contacts.csv
  → Setup > Data Import Wizard > Standard Objects > Contacts
  → Action: "Add new and update existing records"
  → Matching: Email
  → The wizard will automatically create CampaignMember records for "${campaignName}"

Step 3: Import 3_events.csv
  → Setup > Data Import Wizard > Standard Objects > Events (or use Data Loader)
  → Match contact via Contact Email column

Step 4: Import 4_tasks.csv
  → Setup > Data Import Wizard > Standard Objects > Tasks
  → Match contact via Contact Email column

Step 5: Import 5_notes.csv (requires Data Loader)
  → Notes import as ContentNote objects — not supported in Data Import Wizard
  → Use Salesforce Data Loader: Object = ContentNote
  → After ContentNote import, create ContentDocumentLink records to associate notes to contacts
  → LinkedEntityId = Contact.Id (look up via Email), ContentDocumentId = ContentNote.Id, ShareType = 'V'

NOTES
─────
- Lead Source is hardcoded as "Conference" (the channel). Campaign Name is "${campaignName}" (the specific event).
- Do not put the conference name in Lead Source — this will pollute your picklist.
- Date format: YYYY-MM-DD. DateTime format: YYYY-MM-DDTHH:MM:SSZ (UTC).
- Blank cells are safe — Salesforce leaves existing field values unchanged.
- The Data Import Wizard accepts up to 50,000 records per file. For larger lists use Data Loader.
`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  await dbReady;

  const conferenceId = Number(params.id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });

  const body = await request.json() as { provider?: string; campaignName?: string; companyTypeFilter?: unknown };
  const provider = body.provider as 'hubspot' | 'salesforce' | undefined;
  const campaignName = body.campaignName?.trim() ?? '';
  const filterSet = buildFilterSet(body.companyTypeFilter);

  if (!provider || !['hubspot', 'salesforce'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }
  if (!campaignName) {
    return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
  }

  // Fetch conference
  const confRow = await db.execute({
    sql: `SELECT id, name FROM conferences WHERE id = ?`,
    args: [conferenceId],
  });
  if (!confRow.rows[0]) return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
  const conferenceName = String(confRow.rows[0].name ?? '');

  // Fetch all data in parallel
  const [contactRows, companyRows, meetingRows, followUpRows, noteRows] = await Promise.all([
    // Contacts (includes company_type for filtering)
    db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.email, a.title, a.phone, a.status,
                   c.id as company_id, c.name as company_name, c.website as company_website,
                   c.company_type
            FROM conference_attendees ca
            JOIN attendees a ON a.id = ca.attendee_id
            LEFT JOIN companies c ON c.id = a.company_id
            WHERE ca.conference_id = ?`,
      args: [conferenceId],
    }),
    // Companies (distinct, with owner resolution)
    db.execute({
      sql: `SELECT DISTINCT c.id, c.name, c.website, c.company_type, c.notes as company_notes,
                   u.email as owner_email, COALESCE(u.display_name, u.email) as owner_name
            FROM conference_attendees ca
            JOIN attendees a ON a.id = ca.attendee_id
            JOIN companies c ON c.id = a.company_id
            LEFT JOIN users u ON u.config_id = CAST(c.assigned_user AS INTEGER)
            WHERE ca.conference_id = ?`,
      args: [conferenceId],
    }),
    // Meetings (includes first_name, last_name, company_type for filtering)
    db.execute({
      sql: `SELECT m.id, m.meeting_type, m.meeting_date, m.meeting_time, m.location,
                   m.outcome, m.scheduled_by,
                   a.email as attendee_email, a.first_name, a.last_name,
                   c.id as company_id, c.company_type
            FROM meetings m
            JOIN attendees a ON a.id = m.attendee_id
            LEFT JOIN companies c ON c.id = a.company_id
            WHERE m.conference_id = ?`,
      args: [conferenceId],
    }),
    // Follow-ups / tasks (includes first_name, last_name, company_type for filtering)
    db.execute({
      sql: `SELECT fu.id, fu.next_steps, fu.next_steps_notes, fu.completed, fu.created_at,
                   a.email as attendee_email, a.first_name, a.last_name,
                   c.id as company_id, c.company_type
            FROM follow_ups fu
            JOIN attendees a ON a.id = fu.attendee_id
            LEFT JOIN companies c ON c.id = a.company_id
            WHERE fu.conference_id = ?`,
      args: [conferenceId],
    }),
    // Notes (includes first_name, last_name, company_type for filtering)
    db.execute({
      sql: `SELECT en.id, en.content, en.rep, en.created_at,
                   a.email as attendee_email, a.first_name, a.last_name,
                   c.id as company_id, c.company_type
            FROM entity_notes en
            JOIN attendees a ON a.id = en.entity_id AND en.entity_type = 'attendee'
            JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
            LEFT JOIN companies c ON c.id = a.company_id
            WHERE en.entity_type = 'attendee'`,
      args: [conferenceId],
    }),
  ]);

  // Apply company type filter
  const companies = companyRows.rows.filter(r =>
    passesCompanyTypeFilter(filterSet, r.id, r.company_type)
  );
  const contacts = contactRows.rows.filter(r =>
    passesCompanyTypeFilter(filterSet, r.company_id, r.company_type)
  );
  const meetings = meetingRows.rows.filter(r =>
    passesCompanyTypeFilter(filterSet, r.company_id, r.company_type)
  );
  const followUps = followUpRows.rows.filter(r =>
    passesCompanyTypeFilter(filterSet, r.company_id, r.company_type)
  );
  const notes = noteRows.rows.filter(r =>
    passesCompanyTypeFilter(filterSet, r.company_id, r.company_type)
  );

  const timestamp = new Date().toISOString().replace('.000Z', 'Z');
  const slug = slugify(conferenceName);
  const folder = provider === 'hubspot' ? `hubspot-import-${slug}` : `salesforce-import-${slug}`;

  const zip = new JSZip();

  if (provider === 'hubspot') {
    // FILE 1 — Companies
    zip.file(`${folder}/1_companies.csv`, csvFile(
      ['Company name', 'Company Domain Name', 'Website URL', 'Company Type', 'Description', 'Company owner', 'Campaign Name'],
      companies.map(r => [
        r.name ?? '', rootDomain(r.website), r.website ?? '', r.company_type ?? '',
        r.company_notes ?? '', r.owner_email ?? '', campaignName,
      ])
    ));

    // FILE 2 — Contacts
    zip.file(`${folder}/2_contacts.csv`, csvFile(
      ['First Name', 'Last Name', 'Email', 'Job Title', 'Phone Number', 'Company Name', 'Website URL', 'Lead Status', 'Lead Source', 'Campaign Name'],
      contacts.map(r => [
        r.first_name ?? '', r.last_name ?? '', r.email ?? '', r.title ?? '', r.phone ?? '',
        r.company_name ?? '', r.company_website ?? '',
        r.status ? 'OPEN' : 'NEW',
        'Conference', campaignName,
      ])
    ));

    // FILE 3 — Meetings
    zip.file(`${folder}/3_meetings.csv`, csvFile(
      ['Email', 'First Name', 'Last Name', 'Meeting Title', 'Meeting Start Time', 'Meeting End Time', 'Meeting Location', 'Meeting Outcome', 'Meeting Body', 'Campaign Name'],
      meetings.map(r => {
        const startISO = toISO(r.meeting_date, r.meeting_time);
        const endISO = addMinutesToISO(startISO, 60);
        const outcome = String(r.outcome ?? '');
        return [
          r.attendee_email ?? '', r.first_name ?? '', r.last_name ?? '',
          meetingTitle(r.meeting_type, conferenceName),
          startISO, endISO, r.location ?? '',
          HS_OUTCOME[outcome] ?? 'SCHEDULED',
          outcome, campaignName,
        ];
      })
    ));

    // FILE 4 — Tasks
    zip.file(`${folder}/4_tasks.csv`, csvFile(
      ['Email', 'First Name', 'Last Name', 'Task Title', 'Task Notes', 'Due Date', 'Task Status', 'Task Priority', 'Campaign Name'],
      followUps.map(r => [
        r.attendee_email ?? '', r.first_name ?? '', r.last_name ?? '',
        r.next_steps ?? '', r.next_steps_notes ?? '',
        addDaysToISO(r.created_at, 7),
        r.completed ? 'COMPLETED' : 'NOT_STARTED',
        'MEDIUM', campaignName,
      ])
    ));

    // FILE 5 — Notes
    zip.file(`${folder}/5_notes.csv`, csvFile(
      ['Email', 'First Name', 'Last Name', 'Note Body', 'Note Timestamp', 'Campaign Name'],
      notes.map(r => {
        const body = `[Conference: ${conferenceName}] [Rep: ${r.rep ?? ''}] ${r.content ?? ''}`;
        const createdAt = String(r.created_at ?? '');
        const tsISO = createdAt ? (createdAt.includes('T') ? createdAt : `${createdAt}T00:00:00Z`) : '';
        return [r.attendee_email ?? '', r.first_name ?? '', r.last_name ?? '', body, tsISO, campaignName];
      })
    ));

    zip.file(`${folder}/HubSpot Import Instructions - READ ME.txt`, hubspotReadme(conferenceName, campaignName, timestamp));

  } else {
    // Salesforce

    // FILE 1 — Accounts
    zip.file(`${folder}/1_accounts.csv`, csvFile(
      ['Account Name', 'Website', 'Type', 'Description', 'Account Owner', 'Campaign Name'],
      companies.map(r => [
        r.name ?? '', r.website ?? '', r.company_type ?? '', r.company_notes ?? '', r.owner_name ?? '', campaignName,
      ])
    ));

    // FILE 2 — Contacts
    zip.file(`${folder}/2_contacts.csv`, csvFile(
      ['First Name', 'Last Name', 'Email', 'Title', 'Phone', 'Account Name', 'Website', 'Lead Source', 'Campaign Name'],
      contacts.map(r => [
        r.first_name ?? '', r.last_name ?? '', r.email ?? '', r.title ?? '', r.phone ?? '',
        r.company_name ?? '', r.company_website ?? '', 'Conference', campaignName,
      ])
    ));

    // FILE 3 — Events
    zip.file(`${folder}/3_events.csv`, csvFile(
      ['Contact Email', 'First Name', 'Last Name', 'Subject', 'Start Date Time', 'End Date Time', 'Location', 'Description', 'Assigned To', 'Campaign Name'],
      meetings.map(r => {
        const startISO = toISO(r.meeting_date, r.meeting_time);
        const endISO = addMinutesToISO(startISO, 60);
        return [
          r.attendee_email ?? '', r.first_name ?? '', r.last_name ?? '',
          meetingTitle(r.meeting_type, conferenceName),
          startISO, endISO, r.location ?? '', r.outcome ?? '',
          r.scheduled_by ?? '', campaignName,
        ];
      })
    ));

    // FILE 4 — Tasks
    zip.file(`${folder}/4_tasks.csv`, csvFile(
      ['Contact Email', 'First Name', 'Last Name', 'Subject', 'Comments', 'Due Date', 'Status', 'Priority', 'Campaign Name'],
      followUps.map(r => [
        r.attendee_email ?? '', r.first_name ?? '', r.last_name ?? '',
        r.next_steps ?? '', r.next_steps_notes ?? '',
        addDaysToDate(r.created_at, 7),
        r.completed ? 'Completed' : 'Not Started',
        'Normal', campaignName,
      ])
    ));

    // FILE 5 — Notes
    zip.file(`${folder}/5_notes.csv`, csvFile(
      ['Contact Email', 'First Name', 'Last Name', 'Title', 'Content', 'Campaign Name'],
      notes.map(r => {
        const body = `[Conference: ${conferenceName}] [Rep: ${r.rep ?? ''}] ${r.content ?? ''}`;
        const title = body.slice(0, 255);
        const content = Buffer.from(body).toString('base64');
        return [r.attendee_email ?? '', r.first_name ?? '', r.last_name ?? '', title, content, campaignName];
      })
    ));

    zip.file(`${folder}/Salesforce Import Instructions - READ ME.txt`, salesforceReadme(conferenceName, campaignName, timestamp));
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const zipBytes = new Uint8Array(zipBuffer);

  const filename = `${folder}.zip`;
  return new NextResponse(zipBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(zipBytes.length),
    },
  });
}
