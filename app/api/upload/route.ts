import { NextRequest, NextResponse } from 'next/server';
import { parseFile } from '@/lib/parsers';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const attendees = await parseFile(buffer, file.name);

    return NextResponse.json({ attendees, count: attendees.length });
  } catch (error) {
    console.error('POST /api/upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse file' },
      { status: 500 }
    );
  }
}
