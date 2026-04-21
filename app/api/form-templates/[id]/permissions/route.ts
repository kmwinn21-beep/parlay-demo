import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const result = await db.execute({
      sql: `SELECT ftp.user_config_id, co.value as display_name
            FROM form_template_permissions ftp
            JOIN config_options co ON ftp.user_config_id = co.id
            WHERE ftp.template_id = ?`,
      args: [params.id],
    });
    return NextResponse.json(result.rows.map(r => ({
      user_config_id: Number(r.user_config_id),
      display_name: String(r.display_name),
    })));
  } catch (error) {
    console.error('GET /api/form-templates/[id]/permissions error:', error);
    return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { user_config_id } = await request.json();
    if (!user_config_id) return NextResponse.json({ error: 'user_config_id required' }, { status: 400 });
    await db.execute({
      sql: `INSERT OR IGNORE INTO form_template_permissions (template_id, user_config_id) VALUES (?, ?)`,
      args: [params.id, user_config_id],
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/form-templates/[id]/permissions error:', error);
    return NextResponse.json({ error: 'Failed to add permission' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { user_config_id } = await request.json();
    await db.execute({
      sql: `DELETE FROM form_template_permissions WHERE template_id = ? AND user_config_id = ?`,
      args: [params.id, user_config_id],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/form-templates/[id]/permissions error:', error);
    return NextResponse.json({ error: 'Failed to remove permission' }, { status: 500 });
  }
}
