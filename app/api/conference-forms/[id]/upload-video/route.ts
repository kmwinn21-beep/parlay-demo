import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

// Maps a video/* MIME subtype (or a bare file extension) to the extension/content-type
// pair actually stored — covers every common video format browsers hand us, since
// `file.type` varies a lot by OS/browser/codec for the same container.
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

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

function resolveExt(file: File): string | null {
  const subtype = file.type.split('/')[1]?.toLowerCase();
  if (subtype && MIME_TO_EXT[subtype]) return MIME_TO_EXT[subtype];
  // Some browsers report an empty/unrecognized MIME type for less common containers —
  // fall back to the file's own extension.
  const nameExt = file.name.split('.').pop()?.toLowerCase();
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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    if (file.type && !file.type.startsWith('video/')) {
      return NextResponse.json({ error: 'Unsupported file type — please choose a video file' }, { status: 400 });
    }
    const ext = resolveExt(file);
    if (!ext) {
      return NextResponse.json({ error: 'Unrecognized video format — try MP4, MOV, WebM, AVI, MKV, or WMV' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 100 MB limit' }, { status: 400 });

    const key = `forms/${params.id}/${randomBytes(8).toString('hex')}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = EXT_TO_CONTENT_TYPE[ext] || file.type || 'video/mp4';

    await r2Client().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;
    return NextResponse.json({ url });
  } catch (error) {
    console.error('POST /api/conference-forms/[id]/upload-video error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
