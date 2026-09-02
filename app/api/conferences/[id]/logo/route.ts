import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

/**
 * Conference logo. Deliberately the same shape as the attendee photo route:
 * the image arrives already cropped and downscaled from the browser, so this
 * only has to persist it — to R2 when object storage is configured (the same
 * bucket the branding logos and attendee photos use), otherwise inline as a
 * data URL so the feature works without that configuration.
 */

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function r2Configured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_PUBLIC_URL);
}

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const { id } = await params;
    const conferenceId = Number(id);
    if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const exists = await db.execute({ sql: 'SELECT id FROM conferences WHERE id = ?', args: [conferenceId] });
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) return NextResponse.json({ error: 'Use a PNG, JPEG or WebP image.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image exceeds the 5 MB limit.' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    let url: string;

    if (r2Configured()) {
      const key = `conference-logos/${conferenceId}-${randomBytes(6).toString('hex')}.${ext}`;
      await r2Client().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      url = `${process.env.R2_PUBLIC_URL}/${key}`;
    } else {
      url = `data:${file.type};base64,${buffer.toString('base64')}`;
    }

    await db.execute({
      sql: 'UPDATE conferences SET logo_url = ? WHERE id = ?',
      args: [url, conferenceId],
    });

    return NextResponse.json({ logo_url: url });
  } catch (error) {
    console.error('POST /api/conferences/[id]/logo error:', error);
    return NextResponse.json({ error: 'Failed to save logo' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const { id } = await params;
    // The stored object is left in place — it is immutable and cheap, and
    // other records may reference the same URL after a copy.
    await db.execute({
      sql: 'UPDATE conferences SET logo_url = NULL WHERE id = ?',
      args: [Number(id)],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conferences/[id]/logo error:', error);
    return NextResponse.json({ error: 'Failed to remove logo' }, { status: 500 });
  }
}
