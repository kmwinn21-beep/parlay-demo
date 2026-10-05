import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';
import { requireAuth } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { isFloorPlanType, floorPlanYear } from '@/lib/floorPlan';

/**
 * The conference's floor plan.
 *
 * One call that both stores the file and marks it as the plan, because the
 * two halves are the same act and doing them as two requests means a window
 * where an upload has happened and nothing points at it.
 *
 * The file is written to conference_plan_files — the same table the Logistics
 * drawer's Files tab reads — so the plan is one of the conference's files
 * rather than something kept beside them. That is the whole reason it turns
 * up there without the Files tab being told about this route.
 *
 * requireAuth rather than the program-planner capability the logistics upload
 * carries: this is reached from the conference's own edit form, and somebody
 * allowed to edit a conference is allowed to say what its floor plan is.
 */

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB, as the logistics upload allows.

/** Mirrors the R2 setup in the logistics files route — same client, same env. */
function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
  }

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 25 MB limit' }, { status: 400 });
    if (!isFloorPlanType(file.type, file.name)) {
      return NextResponse.json({ error: 'Upload an image or a PDF' }, { status: 400 });
    }

    /* The plan year the Files tab files things under. Taken from the
       conference's own start date rather than from the caller, so the plan
       lands in the same year's files as everything else for this show. */
    const confRes = await db.execute({
      sql: 'SELECT start_date FROM conferences WHERE id = ?',
      args: [confId],
    });
    if (confRes.rows.length === 0) return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    const year = floorPlanYear(confRes.rows[0].start_date ? String(confRes.rows[0].start_date) : null);

    const key = `conference-plans/${confId}/${year}/${crypto.randomUUID()}-${file.name}`;
    await r2Client().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type || 'application/octet-stream',
    }));

    const inserted = await db.execute({
      sql: `INSERT INTO conference_plan_files
              (conference_id, plan_year, file_name, file_size, file_type, storage_key, uploaded_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at`,
      args: [confId, year, file.name, file.size, file.type || null, key, authResult.id],
    });
    const fileId = Number(inserted.rows[0].id);

    // Only now does the conference point at it: a row that exists but is not
    // yet the floor plan is a file in the Files tab, which is harmless. The
    // reverse — a conference naming a file that was never written — is not.
    await db.execute({
      sql: `UPDATE conferences SET floor_plan_file_id = ? WHERE id = ?`,
      args: [fileId, confId],
    });

    return NextResponse.json({
      file_id: fileId,
      floor_plan_name: file.name,
      floor_plan_url: `${process.env.R2_PUBLIC_URL ?? ''}/${key}`,
      created_at: String(inserted.rows[0].created_at),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conferences/[id]/floor-plan error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

/**
 * Stop treating the current file as the floor plan.
 *
 * The file itself is left in the Files tab. It was uploaded to the conference
 * and removing it from one place because somebody unset it in another is more
 * than was asked for — the Files tab has its own delete.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    await db.execute({
      sql: `UPDATE conferences SET floor_plan_file_id = NULL WHERE id = ?`,
      args: [confId],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conferences/[id]/floor-plan error:', error);
    return NextResponse.json({ error: 'Failed to clear the floor plan' }, { status: 500 });
  }
}
