'use client';

import { type LogisticsPlan, type LogisticsDeadline, type PlanNote, type PlanNoteSection } from './types';
import { AutoSaveField, ChecklistSection, TwoColFieldGrid } from './shared';
import { PlanSectionNotes } from './PlanSectionNotes';

export function LogisticsRegistrationTab({ conferenceId, planYear, plan, deadlines, onDeadlinesChange, notes, onNoteCreated, onShowAllNotes }: {
  conferenceId: number;
  planYear: number;
  plan: LogisticsPlan;
  deadlines: LogisticsDeadline[];
  onDeadlinesChange: (deadlines: LogisticsDeadline[]) => void;
  notes: PlanNote[];
  onNoteCreated: (note: PlanNote) => void;
  onShowAllNotes: (section: PlanNoteSection) => void;
}) {
  return (
    <div className="space-y-4">
      <TwoColFieldGrid>
        <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="registrationDeadline" label="Registration deadline" type="date" initialValue={plan.registrationDeadline ?? ''} />
        <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="earlyBirdDeadline" label="Early bird deadline" type="date" initialValue={plan.earlyBirdDeadline ?? ''} />
        <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="registrationConfirmation" label="Registration confirmation number" initialValue={plan.registrationConfirmation ?? ''} placeholder="e.g., CONF-12345" />
      </TwoColFieldGrid>

      <ChecklistSection
        conferenceId={conferenceId} planYear={planYear} category="registration"
        deadlines={deadlines} onDeadlinesChange={onDeadlinesChange}
      />

      <PlanSectionNotes conferenceId={conferenceId} planYear={planYear} section="registration" notes={notes} onNoteCreated={onNoteCreated} onShowAll={onShowAllNotes} />
    </div>
  );
}
