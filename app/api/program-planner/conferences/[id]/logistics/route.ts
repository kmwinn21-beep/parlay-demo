import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getInitials, resolveUserDisplayName } from '@/lib/initials';

function daysUntil(dueDate: string): number {
  return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? '', 10);
  if (isNaN(year)) return NextResponse.json({ error: 'year is required' }, { status: 400 });

  try {
    const [planRes, deadlinesRes, speakingRes, filesRes, hostedEventsRes] = await Promise.all([
      db.execute({
        sql: `SELECT booth_number, booth_size, booth_type, booth_contract_signed,
                     sponsorship_tier, sponsorship_contract_signed, sponsorship_deliverables_due,
                     logo_submitted, preferred_hotel, hotel_block_cutoff,
                     advance_warehouse_address, ship_date, tracking_number, logistics_notes,
                     registration_deadline, early_bird_deadline, registration_confirmation,
                     assigned_rep_ids
              FROM conference_plans WHERE conference_id = ? AND plan_year = ?`,
        args: [confId, year],
      }),
      db.execute({
        sql: `SELECT id, label, due_date, completed, category FROM conference_plan_deadlines
              WHERE conference_id = ? AND plan_year = ? ORDER BY due_date ASC`,
        args: [confId, year],
      }),
      db.execute({
        sql: `SELECT s.id, s.speaker_user_id, s.speaker_name, s.session_title, s.session_type,
                     s.session_date, s.session_time, s.room_stage, s.slides_submitted, s.bio_submitted, s.notes,
                     u.display_name, u.first_name, u.last_name
              FROM conference_plan_speaking_slots s
              LEFT JOIN users u ON u.id = s.speaker_user_id
              WHERE s.conference_id = ? AND s.plan_year = ?
              ORDER BY s.session_date ASC, s.id ASC`,
        args: [confId, year],
      }),
      db.execute({
        sql: `SELECT f.id, f.file_name, f.file_size, f.file_type, f.storage_key, f.created_at,
                     u.display_name, u.first_name, u.last_name
              FROM conference_plan_files f
              LEFT JOIN users u ON u.id = f.uploaded_by_user_id
              WHERE f.conference_id = ? AND f.plan_year = ?
              ORDER BY f.created_at DESC`,
        args: [confId, year],
      }),
      db.execute({
        sql: `SELECT id, event_type, venue_name, event_date, event_time, guest_cap,
                     catering_confirmed, invitations_sent_date, rsvp_deadline, notes
              FROM conference_plan_hosted_events WHERE conference_id = ? AND plan_year = ?
              ORDER BY event_date ASC, id ASC`,
        args: [confId, year],
      }),
    ]);

    const planRow = planRes.rows[0];
    const plan = {
      boothNumber: planRow?.booth_number ? String(planRow.booth_number) : null,
      boothSize: planRow?.booth_size ? String(planRow.booth_size) : null,
      boothType: planRow?.booth_type ? String(planRow.booth_type) : null,
      boothContractSigned: planRow?.booth_contract_signed ? String(planRow.booth_contract_signed) : null,
      sponsorshipTier: planRow?.sponsorship_tier ? String(planRow.sponsorship_tier) : null,
      sponsorshipContractSigned: planRow?.sponsorship_contract_signed ? String(planRow.sponsorship_contract_signed) : null,
      sponsorshipDeliverablesDue: planRow?.sponsorship_deliverables_due ? String(planRow.sponsorship_deliverables_due) : null,
      logoSubmitted: Boolean(Number(planRow?.logo_submitted ?? 0)),
      preferredHotel: planRow?.preferred_hotel ? String(planRow.preferred_hotel) : null,
      hotelBlockCutoff: planRow?.hotel_block_cutoff ? String(planRow.hotel_block_cutoff) : null,
      advanceWarehouseAddress: planRow?.advance_warehouse_address ? String(planRow.advance_warehouse_address) : null,
      shipDate: planRow?.ship_date ? String(planRow.ship_date) : null,
      trackingNumber: planRow?.tracking_number ? String(planRow.tracking_number) : null,
      logisticsNotes: planRow?.logistics_notes ? String(planRow.logistics_notes) : null,
      registrationDeadline: planRow?.registration_deadline ? String(planRow.registration_deadline) : null,
      earlyBirdDeadline: planRow?.early_bird_deadline ? String(planRow.early_bird_deadline) : null,
      registrationConfirmation: planRow?.registration_confirmation ? String(planRow.registration_confirmation) : null,
    };

    const deadlines = deadlinesRes.rows.map(r => ({
      id: Number(r.id),
      label: String(r.label),
      dueDate: String(r.due_date),
      completed: Boolean(Number(r.completed)),
      category: r.category ? String(r.category) : null,
      daysUntil: daysUntil(String(r.due_date)),
    }));

    const speakingSlots = speakingRes.rows.map(r => ({
      id: Number(r.id),
      speakerUserId: r.speaker_user_id != null ? Number(r.speaker_user_id) : null,
      speakerName: r.speaker_name ? String(r.speaker_name) : null,
      speakerDisplayName: r.speaker_user_id != null ? resolveUserDisplayName(r) : null,
      sessionTitle: r.session_title ? String(r.session_title) : null,
      sessionType: r.session_type ? String(r.session_type) : null,
      sessionDate: r.session_date ? String(r.session_date) : null,
      sessionTime: r.session_time ? String(r.session_time) : null,
      roomStage: r.room_stage ? String(r.room_stage) : null,
      slidesSubmitted: Boolean(Number(r.slides_submitted)),
      bioSubmitted: Boolean(Number(r.bio_submitted)),
      notes: r.notes ? String(r.notes) : null,
    }));

    const files = filesRes.rows.map(r => ({
      id: Number(r.id),
      fileName: String(r.file_name),
      fileSize: r.file_size != null ? Number(r.file_size) : null,
      fileType: r.file_type ? String(r.file_type) : null,
      storageKey: String(r.storage_key),
      fileUrl: `${process.env.R2_PUBLIC_URL ?? ''}/${String(r.storage_key)}`,
      uploadedByName: r.display_name || r.first_name ? resolveUserDisplayName(r) : null,
      createdAt: String(r.created_at),
    }));

    const hostedEvents = hostedEventsRes.rows.map(r => ({
      id: Number(r.id),
      eventType: r.event_type ? String(r.event_type) : null,
      venueName: r.venue_name ? String(r.venue_name) : null,
      eventDate: r.event_date ? String(r.event_date) : null,
      eventTime: r.event_time ? String(r.event_time) : null,
      guestCap: r.guest_cap != null ? Number(r.guest_cap) : null,
      cateringConfirmed: Boolean(Number(r.catering_confirmed)),
      invitationsSentDate: r.invitations_sent_date ? String(r.invitations_sent_date) : null,
      rsvpDeadline: r.rsvp_deadline ? String(r.rsvp_deadline) : null,
      notes: r.notes ? String(r.notes) : null,
    }));

    // Resolve assigned reps' travel status
    let assignedRepIds: number[] = [];
    try {
      const parsed = JSON.parse(String(planRow?.assigned_rep_ids ?? '[]'));
      if (Array.isArray(parsed)) assignedRepIds = parsed.map(Number).filter(n => !isNaN(n));
    } catch { /* ignore */ }

    let repTravel: Array<{
      userId: number; displayName: string; initials: string;
      flightStatus: string; hotelStatus: string;
      hotelConfirmation: string | null; flightConfirmation: string | null; notes: string | null;
    }> = [];

    if (assignedRepIds.length > 0) {
      const ph = assignedRepIds.map(() => '?').join(',');
      const [usersRes, travelRes] = await Promise.all([
        db.execute({
          sql: `SELECT id, display_name, first_name, last_name, email FROM users WHERE id IN (${ph})`,
          args: assignedRepIds,
        }),
        db.execute({
          sql: `SELECT user_id, flight_status, hotel_status, hotel_confirmation, flight_confirmation, notes
                FROM conference_plan_rep_travel WHERE conference_id = ? AND plan_year = ? AND user_id IN (${ph})`,
          args: [confId, year, ...assignedRepIds],
        }),
      ]);

      const travelMap = new Map<number, { flight_status: string; hotel_status: string; hotel_confirmation: string | null; flight_confirmation: string | null; notes: string | null }>();
      for (const r of travelRes.rows) {
        travelMap.set(Number(r.user_id), {
          flight_status: String(r.flight_status ?? 'not_started'),
          hotel_status: String(r.hotel_status ?? 'not_started'),
          hotel_confirmation: r.hotel_confirmation ? String(r.hotel_confirmation) : null,
          flight_confirmation: r.flight_confirmation ? String(r.flight_confirmation) : null,
          notes: r.notes ? String(r.notes) : null,
        });
      }

      repTravel = usersRes.rows.map(r => {
        const userId = Number(r.id);
        const displayName = resolveUserDisplayName(r);
        const travel = travelMap.get(userId);
        return {
          userId,
          displayName,
          initials: getInitials(displayName),
          flightStatus: travel?.flight_status ?? 'not_started',
          hotelStatus: travel?.hotel_status ?? 'not_started',
          hotelConfirmation: travel?.hotel_confirmation ?? null,
          flightConfirmation: travel?.flight_confirmation ?? null,
          notes: travel?.notes ?? null,
        };
      });
    }

    return NextResponse.json({ plan, deadlines, speakingSlots, repTravel, files, hostedEvents });
  } catch (error) {
    console.error('GET /api/program-planner/conferences/[id]/logistics error:', error);
    return NextResponse.json({ error: 'Failed to fetch logistics data' }, { status: 500 });
  }
}
