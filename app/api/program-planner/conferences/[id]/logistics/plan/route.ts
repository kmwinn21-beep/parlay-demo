import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Maps camelCase body keys to their conference_plans column, and whether the value
// is a boolean (stored as 0/1) or passed through as-is (text/date).
const COLUMN_MAP: Record<string, { column: string; boolean?: boolean }> = {
  boothNumber: { column: 'booth_number' },
  boothSize: { column: 'booth_size' },
  boothType: { column: 'booth_type' },
  boothContractSigned: { column: 'booth_contract_signed' },
  sponsorshipTier: { column: 'sponsorship_tier' },
  sponsorshipContractSigned: { column: 'sponsorship_contract_signed' },
  sponsorshipDeliverablesDue: { column: 'sponsorship_deliverables_due' },
  logoSubmitted: { column: 'logo_submitted', boolean: true },
  preferredHotel: { column: 'preferred_hotel' },
  hotelBlockCutoff: { column: 'hotel_block_cutoff' },
  advanceWarehouseAddress: { column: 'advance_warehouse_address' },
  shipDate: { column: 'ship_date' },
  trackingNumber: { column: 'tracking_number' },
  logisticsNotes: { column: 'logistics_notes' },
  registrationDeadline: { column: 'registration_deadline' },
  earlyBirdDeadline: { column: 'early_bird_deadline' },
  registrationConfirmation: { column: 'registration_confirmation' },
};

export async function PATCH(
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

  const body = await request.json();
  const entries = Object.entries(body).filter(([key]) => key in COLUMN_MAP);
  if (entries.length === 0) return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });

  const setClauses: string[] = [];
  const setArgs: (string | number | null)[] = [];
  for (const [key, value] of entries) {
    const { column, boolean } = COLUMN_MAP[key];
    setClauses.push(`${column} = ?`);
    setArgs.push(boolean ? (value ? 1 : 0) : ((value ?? null) as string | number | null));
  }

  try {
    // Upsert: ensure a row exists for this (conference_id, plan_year), then apply
    // only the provided columns — never touches columns not present in the body.
    await db.execute({
      sql: `INSERT INTO conference_plans (conference_id, plan_year, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(conference_id, plan_year) DO NOTHING`,
      args: [confId, year],
    });
    await db.execute({
      sql: `UPDATE conference_plans SET ${setClauses.join(', ')}, updated_at = datetime('now')
            WHERE conference_id = ? AND plan_year = ?`,
      args: [...setArgs, confId, year],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/program-planner/conferences/[id]/logistics/plan error:', error);
    return NextResponse.json({ error: 'Failed to update logistics' }, { status: 500 });
  }
}
