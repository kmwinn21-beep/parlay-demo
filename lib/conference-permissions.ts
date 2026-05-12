import type { ConferenceStage } from '@/lib/conference-stage';

export interface ConferencePermissions {
  canLogMeeting: boolean;
  canEditMeeting: boolean;
  canDeleteMeeting: boolean;
  canLogTouchpoint: boolean;
  canDeleteTouchpoint: boolean;
  canDeleteFollowUp: boolean;
  canRsvpSocialEvent: boolean;
  canSubmitForm: boolean;
  canEditBudget: boolean;
  canAddAttendee: boolean;
  canChangeStage: boolean;
}

export function getConferencePermissions(stage: ConferenceStage, isAdmin: boolean): ConferencePermissions {
  if (isAdmin) {
    return {
      canLogMeeting: true,
      canEditMeeting: true,
      canDeleteMeeting: true,
      canLogTouchpoint: true,
      canDeleteTouchpoint: true,
      canDeleteFollowUp: true,
      canRsvpSocialEvent: true,
      canSubmitForm: true,
      canEditBudget: true,
      canAddAttendee: true,
      canChangeStage: true,
    };
  }

  const isClosed = stage === 'closed';
  return {
    canLogMeeting: !isClosed,
    canEditMeeting: !isClosed,
    canDeleteMeeting: !isClosed,
    canLogTouchpoint: !isClosed,
    canDeleteTouchpoint: !isClosed,
    canDeleteFollowUp: !isClosed,
    canRsvpSocialEvent: !isClosed,
    canSubmitForm: !isClosed,
    canEditBudget: !isClosed,
    canAddAttendee: !isClosed,
    canChangeStage: false,
  };
}
