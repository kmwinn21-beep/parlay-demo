import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { resolveUserDisplayName } from '@/lib/initials';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// Mirrors the R2 setup in app/api/conference-forms/[id]/upload-image/route.ts —
// same client construction, same env vars, same bucket.
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
  { params }: { params: Promise<{ id: string }> }
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
    const year = parseInt(String(formData.get('year') ?? ''), 10);
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (isNaN(year)) return NextResponse.json({ error: 'year is required' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 25 MB limit' }, { status: 400 });

    const key = `conference-plans/${confId}/${year}/${crypto.randomUUID()}-${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await r2Client().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type || 'application/octet-stream',
    }));

    const [result, userRes] = await Promise.all([
      db.execute({
        sql: `INSERT INTO conference_plan_files
                (conference_id, plan_year, file_name, file_size, file_type, storage_key, uploaded_by_user_id)
              VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at`,
        args: [confId, year, file.name, file.size, file.type || null, key, authResult.id],
      }),
      db.execute({ sql: `SELECT display_name, first_name, last_name FROM users WHERE id = ?`, args: [authResult.id] }),
    ]);

    return NextResponse.json({
      id: Number(result.rows[0].id),
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || null,
      storageKey: key,
      uploadedByName: userRes.rows[0] ? resolveUserDisplayName(userRes.rows[0]) : null,
      createdAt: String(result.rows[0].created_at),
    }, { status: 201 });
  } catch (error) {
    console.error('POST .../logistics/files error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
