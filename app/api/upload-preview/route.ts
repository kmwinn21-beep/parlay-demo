import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { extractRawRows, suggestMapping } from '@/lib/parsers';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const ext = file.name.toLowerCase().split('.').pop();
  if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
    return NextResponse.json({ error: 'Unsupported file type. Use .xlsx, .xls, or .csv.' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = extractRawRows(buffer, file.name);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data found in file.' }, { status: 400 });
    }

    const headers = Object.keys(rows[0]);
    const suggestions = suggestMapping(headers);
    const sampleRows = rows.slice(0, 3).map(r =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')]))
    );

    return NextResponse.json({ headers, suggestions, sampleRows, totalRows: rows.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse file.' },
      { status: 400 }
    );
  }
}
