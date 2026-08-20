/**
 * Builds the batch a rep pastes into their CRM's AI agent after a conference.
 *
 * The preamble is fixed text the user authored — it must go over verbatim, so
 * it lives here as a single constant rather than being assembled. Only the
 * three sections below it are generated: the meetings they ran, the follow-ups
 * still outstanding, and the conference notes held against each company.
 */

export interface CrmPromptContact {
  name: string;
  email: string | null;
  title: string | null;
}

export interface CrmPromptMeeting {
  attendeeName: string;
  contacts: CrmPromptContact[];
  companyName: string | null;
  companyDomain: string | null;
  /** Already mapped: a still-Scheduled meeting reads as Cancelled. */
  status: string;
  /** 'Sep 23, 2026' */
  date: string;
  /** '9:30 AM', or 12:00 PM for a booth-hours meeting. */
  startTime: string;
  /** 'Aug 14, 2026 3:12 PM - the note', blank line between each. */
  notes: string;
  assignedRep: string | null;
}

export interface CrmPromptTask {
  /**
   * The Follow Up Action's short name, which titles the task — never the
   * Source, which is a different field describing where the follow-up came
   * from. Empty when no action has been chosen yet.
   */
  action: string;
  /** The Source the follow-up came from, which opens the task notes. */
  source: string;
  attendeeName: string;
  contacts: CrmPromptContact[];
  companyName: string | null;
  companyDomain: string | null;
  assignedRep: string | null;
  /** Same lines as a meeting's notes, but single-spaced. */
  notes: string;
}

export interface CrmPromptNote {
  companyName: string | null;
  companyDomain: string | null;
  contacts: CrmPromptContact[];
  notes: string;
}

export interface CrmPromptInput {
  conferenceName: string;
  /** 'Sep 24, 2026' — the conference's last day. */
  conferenceEndDate: string;
  /** 'Sep 29, 2026' — three business days after the conference ends. */
  taskDueDate: string;
  meetings: CrmPromptMeeting[];
  tasks: CrmPromptTask[];
  notes: CrmPromptNote[];
}

export const CRM_PROMPT_PREAMBLE = `Act as my CRM data-entry assistant.

I will provide a batch of notes and activities from meetings, calls, emails, and account visits. Your job is to accurately organize and log each activity against the correct existing CRM contact and company/account. Associate a deal only when I explicitly identify one or when there is exactly one unambiguous matching deal.

Follow these rules:

1. Do not guess, merge, or silently omit anything.
2. Resolve companies/accounts using the company domain first, then the exact company name. Use location, phone, or other details only as supporting evidence.
3. Resolve contacts using their work email first. If no email is provided, use full name plus company/domain, title, phone, or LinkedIn URL.
4. Treat the contact and company as separate matching decisions.
5. Use existing CRM records only. Do not create a new contact or company unless I explicitly authorize it.
6. If there are multiple possible contacts or companies, or no confident match, pause that item and show me the possible matches. Do not log it.
7. If an activity is missing a date, time, timezone, activity type, or important association, flag it and ask me for the missing information.
8. Preserve the facts and wording of my notes. Do not invent outcomes, attendees, commitments, sentiment, or next steps.
9. Do not describe something as an email, call, or meeting unless I explicitly identify it that way. If I only provide a summary about an email, log it as a note unless I clarify otherwise.
10. If multiple contacts attended the same meeting or call, associate the activity with every explicitly identified attendee and the correct company.
11. Associate the activity with both the contact and company whenever both are known.
12. Associate a deal only if I provide the deal name or there is one clearly identifiable matching deal. Otherwise, ask me.
13. Use America/New_York for timestamps without a timezone unless I specify another timezone.
14. Use me as the activity owner/assignee unless I specify someone else.
15. Check for likely duplicate activities using the activity type, date/time, subject, and participants. Flag possible duplicates before logging them.
16. Keep each activity separate. Do not combine multiple meetings, calls, notes, or follow-ups into one record.
17. Before creating anything, give me a review table with:

* Item number
* Activity type
* Date and time
* Contact
* Company/account
* Deal, if applicable
* Subject or title
* Summary
* Outcome
* Follow-up or task
* Any ambiguity, missing information, or possible duplicate


Wait for my confirmation using the word LOG. Do not write anything to HubSpot before I confirm.

After I confirm LOG:

* Create or log each approved activity.
* Apply the correct contact, company, and deal associations.
* Report which items were successfully logged, which were skipped, and why.
* Include links to the created CRM records whenever available.


Here is my batch:`;

function contactLines(contacts: CrmPromptContact[]): string {
  return contacts.map(c => `* ${c.name} - ${c.email ?? ''} - ${c.title ?? ''}`).join('\n');
}

/** One meeting block, numbered; its task carries the same number. */
function renderMeeting(m: CrmPromptMeeting, n: number, conferenceName: string, taskDueDate: string): string {
  return `===== BEGIN MEETING ${n} =====

* Activity Type: Meeting
* Title: ${conferenceName} - ${m.attendeeName} Meeting
* Status: ${m.status}
* Date: ${m.date}
* Start time: ${m.startTime}
* Duration: 30 minutes
* Timezone: America/New_York
* Company/account name: ${m.companyName ?? ''}
* Company domain: ${m.companyDomain ?? ''}


Contacts:

${contactLines(m.contacts)}


* Notes: ${m.notes}


Follow-up Task:

--- BEGIN TASK FOR CONTACT ${n} ---

* Create task: Yes
* Task title: Meeting Follow Up with ${m.attendeeName} - ${conferenceName}
* Assigned to: ${m.assignedRep ?? ''}
* Due date: ${taskDueDate}
* Due time: 8:00 PM
* Timezone: America/New_York
* Priority: High


Contacts:

${contactLines(m.contacts)}


* Task notes: ${m.notes}
* Associate with: ${m.companyName ?? ''} and the listed attendees in Meeting ${n}

--- END TASK FOR CONTACT ${n} ---

===== END MEETING ${n}=====`;
}

/** A follow-up that isn't tied to a meeting write-up, as a standalone task. */
function renderTask(t: CrmPromptTask, n: number, conferenceName: string, taskDueDate: string): string {
  // With no action chosen the title would open on a stray separator, so the
  // attendee leads instead. The Source is never substituted here.
  const title = t.action ? `${t.action} - ${t.attendeeName}` : t.attendeeName;
  return `=====BEGIN TASK FOR CONTACT ${n} =====

* Create task: Yes
* Task title: ${title} - ${conferenceName}
* Assigned to: ${t.assignedRep ?? ''}
* Due date: ${taskDueDate}
* Due time: 8:00 PM
* Timezone: America/New_York
* Priority: High
* Task notes: Follow up from ${t.source} ${t.notes}


Company/account:

* Name: ${t.companyName ?? ''}
* Domain: ${t.companyDomain ?? ''}


Contacts:

${contactLines(t.contacts)}


* Associate with: ${t.companyName ?? ''} and the listed contacts in Task for Contact ${n}

--- END TASK FOR CONTACT ${n} ---`;
}

/** Everything written against one company at this conference, as a note. */
function renderNote(note: CrmPromptNote, n: number, conferenceName: string, conferenceEndDate: string): string {
  return `--- BEGIN NOTE ${n} ---

* Activity Type: Note
* Note title: ${conferenceName} - Notes
* Date: ${conferenceEndDate}
* Time: 8:00 PM
* Timezone: America/New_York


Company/account:

* Name: ${note.companyName ?? ''}
* Domain: ${note.companyDomain ?? ''}


Contacts:

${contactLines(note.contacts)}


Note:
${note.notes}

* Associate with: ${note.companyName ?? ''} and the listed contacts in Note ${n}

--- END NOTE ${n} ---`;
}

export function buildCrmPrompt(input: CrmPromptInput): string {
  const parts: string[] = [CRM_PROMPT_PREAMBLE];

  const meetings = (input.meetings ?? []).map((m, i) =>
    renderMeeting(m, i + 1, input.conferenceName, input.taskDueDate),
  );
  if (meetings.length > 0) parts.push(meetings.join('\n\n'));

  const tasks = (input.tasks ?? []).map((t, i) =>
    renderTask(t, i + 1, input.conferenceName, input.taskDueDate),
  );
  if (tasks.length > 0) parts.push(`Tasks Only:\n\n${tasks.join('\n\n')}`);

  const notes = (input.notes ?? []).map((note, i) =>
    renderNote(note, i + 1, input.conferenceName, input.conferenceEndDate),
  );
  if (notes.length > 0) parts.push(`Notes Only:\n\n${notes.join('\n\n')}`);

  return `${parts.join('\n\n')}\n`;
}
