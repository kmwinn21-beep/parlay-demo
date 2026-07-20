'use client';

import { type LogisticsPlan } from './types';
import { AutoSaveField, AutoSaveCheckbox } from './shared';

export function LogisticsSponsorshipTab({ conferenceId, planYear, plan }: {
  conferenceId: number; planYear: number; plan: LogisticsPlan;
}) {
  return (
    <div className="space-y-4">
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="sponsorshipTier" label="Sponsorship tier" initialValue={plan.sponsorshipTier ?? ''} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="sponsorshipContractSigned" label="Contract signed date" type="date" initialValue={plan.sponsorshipContractSigned ?? ''} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="sponsorshipDeliverablesDue" label="Deliverables due date" type="date" initialValue={plan.sponsorshipDeliverablesDue ?? ''} />
      <AutoSaveCheckbox conferenceId={conferenceId} planYear={planYear} field="logoSubmitted" label="Logo submitted" initialChecked={plan.logoSubmitted} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="logisticsNotes" label="Notes" type="textarea" initialValue={plan.logisticsNotes ?? ''} placeholder="Sponsorship: ..." />
    </div>
  );
}
