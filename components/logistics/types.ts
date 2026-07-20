export interface LogisticsPlan {
  boothNumber: string | null;
  boothSize: string | null;
  boothType: string | null;
  boothContractSigned: string | null;
  sponsorshipTier: string | null;
  sponsorshipContractSigned: string | null;
  sponsorshipDeliverablesDue: string | null;
  logoSubmitted: boolean;
  preferredHotel: string | null;
  hotelBlockCutoff: string | null;
  advanceWarehouseAddress: string | null;
  shipDate: string | null;
  trackingNumber: string | null;
  logisticsNotes: string | null;
  registrationDeadline: string | null;
  earlyBirdDeadline: string | null;
  registrationConfirmation: string | null;
}

export interface LogisticsDeadline {
  id: number;
  label: string;
  dueDate: string;
  completed: boolean;
  category: string | null;
  daysUntil: number;
}

export interface LogisticsSpeakingSlot {
  id: number;
  speakerUserId: number | null;
  speakerName: string | null;
  speakerDisplayName: string | null;
  sessionTitle: string | null;
  sessionType: string | null;
  sessionDate: string | null;
  sessionTime: string | null;
  roomStage: string | null;
  slidesSubmitted: boolean;
  bioSubmitted: boolean;
  notes: string | null;
}

export type TravelStatus = 'not_started' | 'booked' | 'pending';

export interface LogisticsRepTravel {
  userId: number;
  displayName: string;
  initials: string;
  flightStatus: TravelStatus;
  hotelStatus: TravelStatus;
  hotelConfirmation: string | null;
  flightConfirmation: string | null;
  notes: string | null;
}

export interface LogisticsFile {
  id: number;
  fileName: string;
  fileSize: number | null;
  fileType: string | null;
  storageKey: string;
  fileUrl: string;
  uploadedByName: string | null;
  createdAt: string;
}

export interface LogisticsHostedEvent {
  id: number;
  eventType: string | null;
  venueName: string | null;
  eventDate: string | null;
  eventTime: string | null;
  guestCap: number | null;
  cateringConfirmed: boolean;
  invitationsSentDate: string | null;
  rsvpDeadline: string | null;
  notes: string | null;
}

export interface LogisticsResponse {
  plan: LogisticsPlan;
  deadlines: LogisticsDeadline[];
  speakingSlots: LogisticsSpeakingSlot[];
  repTravel: LogisticsRepTravel[];
  files: LogisticsFile[];
  hostedEvents: LogisticsHostedEvent[];
}

export interface AssignedRepOption {
  userId: number;
  displayName: string;
  initials: string;
}

// Shared by every tab that talks to the API.
export interface TabApiContext {
  conferenceId: number;
  planYear: number;
}

const AVATAR_PALETTE = [
  '#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#D97706',
  '#059669', '#0891B2', '#4F46E5', '#C026D3', '#65A30D',
];
export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function fmtFileSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

export function addDays(dateStr: string | null, days: number): string {
  const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  if (isNaN(base.getTime())) return new Date().toISOString().slice(0, 10);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}
