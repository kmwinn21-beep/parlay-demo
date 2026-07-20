import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { fileId } = await params;
  const id = parseInt(fileId, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const fileRes = await db.execute({ sql: `SELECT storage_key FROM conference_plan_files WHERE id = ?`, args: [id] });
    const storageKey = fileRes.rows[0]?.storage_key ? String(fileRes.rows[0].storage_key) : null;

    if (storageKey && process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME) {
      await r2Client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: storageKey })).catch(() => {});
    }

    await db.execute({ sql: `DELETE FROM conference_plan_files WHERE id = ?`, args: [id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE .../logistics/files/[fileId] error:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
