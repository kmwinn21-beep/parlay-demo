'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { KebabMenu } from '@/components/KebabMenu';
import { NewNoteModal } from '@/components/NewNoteModal';
import { NewMeetingModal } from '@/components/NewMeetingModal';
import { AssignFollowUpModal } from '@/components/AssignFollowUpModal';
import { TouchpointQuickModal } from '@/components/DashboardActionCard';
import { InternalRelationshipModal } from '@/components/InternalRelationshipsSection';
import { OutreachAssignModal } from '@/components/OutreachAssignModal';
import { BulkVendorRelationshipModal } from '@/components/BulkVendorRelationshipModal';
import { useClosedDealDraft } from '@/lib/ClosedDealDraftContext';
import { useSectionConfig } from '@/lib/useSectionConfig';
import { useUserOptions } from '@/lib/useUserOptions';
import { useUser } from '@/components/UserContext';

/**
 * The per-row "+ something about this record" menu, shared by the attendee and
 * company tables on a conference.
 *
 * Every action here already has a form somewhere in the app, and every one of
 * those forms already takes prefill props — so this owns no form of its own. It
 * decides which one to open and hands it the row's attendee/company plus the
 * conference being viewed, which is the whole point: reaching these from a row
 * should mean not re-entering what the row already says.
 */
export function RowActionsKebab({
  entityType,
  conferenceId,
  attendeeId,
  attendeeName,
  companyId,
  companyName,
  onDone,
  onOpenChange,
  className = '',
}: {
  entityType: 'attendee' | 'company';
  conferenceId: number;
  attendeeId?: number;
  attendeeName?: string;
  companyId?: number | null;
  companyName?: string | null;
  /** Something was created — let the table refresh its counts. */
  onDone?: () => void;
  /** Menu opened/closed, so the table can recede the rows around it. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const { openDeal } = useClosedDealDraft();
  const { getLabel: getCompanySectionLabel } = useSectionConfig('company');
  const userOptions = useUserOptions();
  const { user: currentUser } = useUser();

  const [action, setAction] = useState<
    null | 'outreach' | 'note' | 'relationship' | 'meeting' | 'followup' | 'touchpoint' | 'vendor-relationship'
  >(null);
  // Company rows can add either kind of relationship, so they get a chooser
  // rather than a menu row that silently picks one.
  const [relationshipChoice, setRelationshipChoice] = useState(false);

  const vendorLabel = getCompanySectionLabel('operator_capital');
  const close = () => setAction(null);
  const finish = () => { close(); onDone?.(); };

  // The menu button lives in a table cell that is `position: sticky` with a
  // z-index, which makes that cell a stacking context — a fixed overlay
  // rendered inside it is trapped there, and the next row's sticky cell paints
  // straight over the top of it. These are full-screen dialogs and have no
  // business being scoped to one cell, so they go to the body instead.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const items = [
    {
      label: '+ Outreach',
      onClick: () => setAction('outreach'),
      disabled: companyId == null,
      title: companyId == null ? 'Outreach needs the record to have a company' : undefined,
    },
    { label: '+ Note', onClick: () => setAction('note') },
    {
      label: '+ Relationship',
      onClick: () => (entityType === 'company' ? setRelationshipChoice(true) : setAction('relationship')),
    },
    { label: '+ Meeting', onClick: () => setAction('meeting') },
    ...(entityType === 'company'
      ? [{
          label: '+ Closed / Won Deal',
          onClick: () => { if (companyId != null) openDeal(companyId); },
          disabled: companyId == null,
        }]
      : []),
    { label: '+ Follow Up', onClick: () => setAction('followup') },
    { label: '+ Touchpoint', onClick: () => setAction('touchpoint') },
  ];

  return (
    <>
      <KebabMenu
        items={items}
        title={entityType === 'attendee' ? 'Attendee actions' : 'Company actions'}
        className={className}
        onOpenChange={onOpenChange}
      />

      {mounted && createPortal(
        <>
      {action === 'outreach' && companyId != null && (
        <OutreachAssignModal
          conferenceId={conferenceId}
          companyId={companyId}
          companyName={companyName ?? undefined}
          attendeeId={entityType === 'attendee' ? attendeeId : undefined}
          onClose={close}
          onAssigned={() => onDone?.()}
        />
      )}

      <NewNoteModal
        isOpen={action === 'note'}
        onClose={finish}
        defaultConferenceId={conferenceId}
        defaultCompanyId={companyId ?? null}
        defaultAttendeeId={entityType === 'attendee' ? attendeeId ?? null : null}
      />

      <NewMeetingModal
        isOpen={action === 'meeting'}
        onClose={close}
        defaultConferenceId={conferenceId}
        prefillCompanyId={companyId ?? undefined}
        prefillAttendeeId={entityType === 'attendee' ? attendeeId : undefined}
        onSuccess={finish}
      />

      <AssignFollowUpModal
        isOpen={action === 'followup'}
        onClose={close}
        onSuccess={finish}
        defaultConferenceId={conferenceId}
        defaultCompanyId={companyId ?? undefined}
        defaultAttendeeId={entityType === 'attendee' ? attendeeId : undefined}
      />

      {action === 'touchpoint' && (
        <TouchpointQuickModal
          onClose={finish}
          defaultConferenceId={conferenceId}
          defaultCompanyId={companyId ?? null}
          defaultAttendeeId={entityType === 'attendee' ? attendeeId ?? null : null}
        />
      )}

      {/* The internal-relationship modal is built around a selection, so a
          single row is just a selection of one. */}
      <InternalRelationshipModal
        isOpen={action === 'relationship'}
        onClose={close}
        onSuccess={finish}
        entityType={entityType}
        entityIds={entityType === 'attendee' ? (attendeeId != null ? [attendeeId] : []) : (companyId != null ? [companyId] : [])}
        entityNames={new Map(
          entityType === 'attendee'
            ? (attendeeId != null ? [[attendeeId, attendeeName ?? '']] as [number, string][] : [])
            : (companyId != null ? [[companyId, companyName ?? '']] as [number, string][] : [])
        )}
      />

      {action === 'vendor-relationship' && companyId != null && (
        <BulkVendorRelationshipModal
          isOpen
          onClose={close}
          onSuccess={finish}
          companyIds={[companyId]}
          title={vendorLabel}
          userOptions={userOptions}
          currentUserConfigId={currentUser?.configId ?? null}
        />
      )}

      {relationshipChoice && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setRelationshipChoice(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-brand-primary font-serif">Add a relationship</h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{companyName}</p>
            </div>
            <div className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => { setRelationshipChoice(false); setAction('relationship'); }}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-brand-secondary hover:bg-brand-secondary/5 transition-colors"
              >
                Internal Relationship
              </button>
              <button
                type="button"
                onClick={() => { setRelationshipChoice(false); setAction('vendor-relationship'); }}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-brand-secondary hover:bg-brand-secondary/5 transition-colors"
              >
                {vendorLabel}
              </button>
            </div>
          </div>
        </div>
      )}
        </>,
        document.body
      )}
    </>
  );
}
