import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

/**
 * Attendee headshot. The cropped square arrives already downscaled from the
 * browser, so this only has to persist it: to R2 when object storage is
 * configured (same bucket the branding logos use), otherwise inline as a data
 * URL so the feature still works without that configuration.
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

/**
 * What actually went wrong, in words the person can act on.
 *
 * Both halves of this route can fail, and for a long time both came back as
 * "Failed to save photo" with the reason in a server log nobody was reading.
 * An afternoon was spent on a 500 that turned out to be object storage being
 * switched off at the provider — which the toast could have said outright.
 *
 * The provider's own error name is included because it is the diagnostic bit
 * and it is not sensitive: NoSuchBucket, AccessDenied and NetworkingError
 * each name a different thing to go and fix.
 */
function storageFailure(err: unknown): string {
  const name = err instanceof Error && err.name && err.name !== 'Error' ? err.name : null;
  return `Image storage rejected the upload${name ? ` (${name})` : ''}. The photo was not saved.`;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const attendeeId = Number(params.id);
    const exists = await db.execute({ sql: 'SELECT id FROM attendees WHERE id = ?', args: [attendeeId] });
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
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
      try {
        const key = `attendee-photos/${attendeeId}-${randomBytes(6).toString('hex')}.${ext}`;
        await r2Client().send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: file.type,
          CacheControl: 'public, max-age=31536000, immutable',
        }));
        url = `${process.env.R2_PUBLIC_URL}/${key}`;
      } catch (err) {
        console.error('[attendee-photo] R2 upload failed:', err);
        return NextResponse.json({ error: storageFailure(err) }, { status: 502 });
      }
    } else {
      url = `data:${file.type};base64,${buffer.toString('base64')}`;
    }

    try {
      await db.execute({
        sql: 'UPDATE attendees SET photo_url = ? WHERE id = ?',
        args: [url, attendeeId],
      });
    } catch (err) {
      console.error('[attendee-photo] database write failed:', err);
      return NextResponse.json(
        { error: 'The photo was uploaded but could not be recorded. Try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ photo_url: url });
  } catch (error) {
    console.error('POST /api/attendees/[id]/photo error:', error);
    return NextResponse.json({ error: 'Failed to save photo' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    // The stored object is left in place — it is immutable and cheap, and
    // other records may reference the same URL after a copy.
    await db.execute({
      sql: 'UPDATE attendees SET photo_url = NULL WHERE id = ?',
      args: [Number(params.id)],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/attendees/[id]/photo error:', error);
    return NextResponse.json({ error: 'Failed to remove photo' }, { status: 500 });
  }
}
