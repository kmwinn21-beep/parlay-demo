/**
 * Builds the batch a rep pastes into their CRM's AI agent after a conference.
 *
 * The preamble is fixed text the user authored — it must go over verbatim, so
 * it lives here as a single constant rather than being assembled. Only the
 * meeting blocks below it are generated.
 */

export interface CrmPromptMeeting {
  meetingId: number;
  attendeeName: string;
  attendeeEmail: string | null;
  attendeeTitle: string | null;
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

export interface CrmPromptInput {
  conferenceName: string;
  /** 'Sep 29, 2026' — three business days after the conference ends. */
  taskDueDate: string;
  meetings: CrmPromptMeeting[];
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

/** One meeting block, numbered; its task carries the same number. */
function renderMeeting(m: CrmPromptMeeting, index: number, conferenceName: string, taskDueDate: string): string {
  const n = index + 1;
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

Attendees:

* ${m.attendeeName} - ${m.attendeeEmail ?? ''} - ${m.attendeeTitle ?? ''}
* Notes: ${m.notes}

Follow-up Task:
--- BEGIN TASK FOR CONTACT ${n} ---

* Create task: Yes
* Task title: Follow Up with ${m.attendeeName} - ${conferenceName}
* Assigned to: ${m.assignedRep ?? ''}
* Due date: ${taskDueDate}
* Due time: 8:00 PM
* Timezone: America/New_York
* Priority: High
* Task notes: ${m.notes}
* Associate with: ${m.companyName ?? ''} and the listed attendees in Meeting ${n}

--- END TASK FOR CONTACT ${n} ---

===== END MEETING ${n} =====`;
}

export function buildCrmPrompt(input: CrmPromptInput): string {
  const blocks = input.meetings.map((m, i) =>
    renderMeeting(m, i, input.conferenceName, input.taskDueDate),
  );
  return `${CRM_PROMPT_PREAMBLE}\n\n${blocks.join('\n\n')}\n`;
}
