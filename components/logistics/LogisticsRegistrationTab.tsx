'use client';

import { type LogisticsPlan } from './types';
import { AutoSaveField } from './shared';

export function LogisticsRegistrationTab({ conferenceId, planYear, plan }: {
  conferenceId: number; planYear: number; plan: LogisticsPlan;
}) {
  return (
    <div className="space-y-4">
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="registrationDeadline" label="Registration deadline" type="date" initialValue={plan.registrationDeadline ?? ''} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="earlyBirdDeadline" label="Early bird deadline" type="date" initialValue={plan.earlyBirdDeadline ?? ''} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="registrationConfirmation" label="Registration confirmation number" initialValue={plan.registrationConfirmation ?? ''} placeholder="e.g., CONF-12345" />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="logisticsNotes" label="Notes" type="textarea" initialValue={plan.logisticsNotes ?? ''} />
    </div>
  );
}
