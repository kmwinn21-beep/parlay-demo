import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';

// Maps a video/* MIME subtype (or a bare file extension) to the extension/content-type
// pair actually stored — covers every common video format browsers hand us, since
// the reported MIME type varies a lot by OS/browser/codec for the same container.
const MIME_TO_EXT: Record<string, string> = {
  mp4: 'mp4',
  webm: 'webm',
  quicktime: 'mov',
  'x-msvideo': 'avi',
  avi: 'avi',
  'x-matroska': 'mkv',
  matroska: 'mkv',
  mpeg: 'mpg',
  mpg: 'mpg',
  '3gpp': '3gp',
  '3gpp2': '3g2',
  'x-ms-wmv': 'wmv',
  wmv: 'wmv',
  ogg: 'ogv',
  'x-m4v': 'm4v',
  m4v: 'm4v',
  mp2t: 'ts',
};

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mpg: 'video/mpeg',
  mpeg: 'video/mpeg',
  '3gp': 'video/3gpp',
  '3g2': 'video/3gpp2',
  wmv: 'video/x-ms-wmv',
  ogv: 'video/ogg',
  m4v: 'video/x-m4v',
  ts: 'video/mp2t',
};

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB — the file itself is streamed straight to R2, not through this function

function resolveExt(filename: string, mimeType: string): string | null {
  const subtype = mimeType.split('/')[1]?.toLowerCase();
  if (subtype && MIME_TO_EXT[subtype]) return MIME_TO_EXT[subtype];
  // Some browsers report an empty/unrecognized MIME type for less common containers —
  // fall back to the file's own extension.
  const nameExt = filename.split('.').pop()?.toLowerCase();
  if (nameExt && EXT_TO_CONTENT_TYPE[nameExt]) return nameExt;
  return null;
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

// Returns a presigned R2 PUT URL — the browser uploads the video bytes directly to R2
// instead of routing them through this serverless function, which avoids Vercel's ~4.5MB
// request body limit on Serverless Functions entirely (that limit was causing the 413s).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
  }

  try {
    const { filename, contentType, size } = await request.json() as { filename?: string; contentType?: string; size?: number };
    if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });

    const mimeType = contentType || '';
    if (mimeType && !mimeType.startsWith('video/')) {
      return NextResponse.json({ error: 'Unsupported file type — please choose a video file' }, { status: 400 });
    }
    const ext = resolveExt(filename, mimeType);
    if (!ext) {
      return NextResponse.json({ error: 'Unrecognized video format — try MP4, MOV, WebM, AVI, MKV, or WMV' }, { status: 400 });
    }
    if (size != null && size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 500 MB limit' }, { status: 400 });
    }

    const key = `forms/${params.id}/${randomBytes(8).toString('hex')}.${ext}`;
    const resolvedContentType = EXT_TO_CONTENT_TYPE[ext] || mimeType || 'video/mp4';

    const uploadUrl = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: resolvedContentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
      { expiresIn: 300 },
    );

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    return NextResponse.json({ uploadUrl, publicUrl, contentType: resolvedContentType });
  } catch (error) {
    console.error('POST /api/conference-forms/[id]/upload-video error:', error);
    return NextResponse.json({ error: 'Failed to prepare upload' }, { status: 500 });
  }
}
